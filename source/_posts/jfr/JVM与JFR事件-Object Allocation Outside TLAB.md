---
title: JVM与JFR事件-Java Application/Object Allocation Outside TLAB
abbrlink: 19346
date: 2025-02-20 14:25:52
tags: [JVM, JFR, 监控, 对象分配, TLAB]
categories: [JFR]
---

### 使用
- Type(JVM,JDK内部唯一标识，用于jfr配置): jdk.ObjectAllocationOutsideTLAB
- Label(Event Type，用于显示): Object Allocation Outside TLAB
- Category(用于分类显示): Java Application
- 事件从哪个版本引入？
  - Java11：即一开始就存在
- 事件类型
  - `埋点事件：即满足某些条件会触发的采集事件`
  - `JVM内部事件`
- default.jfc 配置
  ```xml
    <event name="jdk.ObjectAllocationOutsideTLAB">
        <setting name="enabled" control="gc-enabled-high">false</setting>
        <setting name="stackTrace">true</setting>
    </event>
  ```
- Profiling.jfc 配置
  ```xml
    <event name="jdk.ObjectAllocationOutsideTLAB">
        <setting name="enabled" control="gc-enabled-high">false</setting>
        <setting name="stackTrace">true</setting>
    </event>
  ```
- 此事件对应 `Java 对象分配过程` 中的路径三
- 事件字段
  - Event Thread：发生路径三分配的线程的名称
  - Allocation Size：触发路径三分配的对象大小（实际占用，考虑了对象对其）
  - Object Class：触发路径三分配的对象类型
  - 线程栈：发生路径三的线程栈，默认是采集的
    ![img](/images/jfr/07.png)
- 编写代码模拟内存泄漏业务
  ```java
    public class TestAllocOutsideTLAB {

    private static final String EVENT_TYPE = "jdk.ObjectAllocationOutsideTLAB";

    public static void main(String[] args) throws InterruptedException, IOException {
        WhiteBox whiteBox = WhiteBox.getWhiteBox();
        // 初始化jfr记录
        Recording recording = new Recording();
        recording.enable(EVENT_TYPE);
        // JFR 记录启动
        recording.start();
        // 强制 fullgc 防止程序接下来发生 gc
        // 同时可以区分初始化带来的其他线程的TLAB相关的日志
        whiteBox.fullGC();

        // 模拟正常业务运行分配对象
        runBiz(true);
        TimeUnit.SECONDS.sleep(3);
        System.out.println("Start to create OOM");
        // 模拟并发向 ConcurrentHashMap 分配对象，但是不触发 OOM，看看 Allocation  Outside TLAB 是否可以捕捉到
        runOOM(true);
        TimeUnit.SECONDS.sleep(7);

        // 将 jfr 记录到一个文件
        Path path = new File(new File(".").getAbsolutePath(),
                "recording-" + recording.getId()
                        + "-pid"
                        + ProcessHandle.current().pid()
                        + ".jfr"
        ).toPath();
        recording.dump(path);


    }

    protected static void runBiz(boolean virtualThreadFlag) {
        // 模拟正常业务运行，三个线程并发分配对象，朝生夕死
        Thread[] threads = new Thread[3];
        Runnable bizRunnable = () -> {
            List<Object> objects = new ArrayList<>();
            while (!Thread.currentThread().isInterrupted()) {
                objects.add(new Object());
                if (objects.size() > 1000) {
                    objects.clear();
                }
            }
        };
        for (int i = 0; i < threads.length; i++) {
            if (virtualThreadFlag) {
                threads[i] = Thread.ofVirtual().name("biz-" + i)
                        .unstarted(bizRunnable);
            } else {
                threads[i] = new Thread(bizRunnable);
            }
            threads[i].start();
        }

        Thread thread = new Thread(() -> {
            try {
                TimeUnit.SECONDS.sleep(10);
                for (int i = 0; i < threads.length; i++) {
                    threads[i].interrupt();
                }
            } catch (InterruptedException e) {
                throw new RuntimeException(e);
            }
        });
        thread.start();
    }

    protected static void runOOM(boolean virtualThreadFlag) throws InterruptedException {
        // 模拟并发向 ConcurrentHashMap 分配对象，但是不触发 OOM
        Thread[] threads = new Thread[3];
        Map<Object, Object> map = new ConcurrentHashMap<>();

        Runnable oomRun = () -> {
            for (int j = 0; j < 1000000; j++) {
                map.put(new Object(), new Object());
            }
        };

        for (int i = 0; i < threads.length; i++) {
            if (virtualThreadFlag) {
                threads[i] = Thread.ofVirtual().name("oom-" + i)
                        .unstarted(oomRun);
            } else {
                threads[i] = new Thread(oomRun);
            }
            threads[i].start();
        }

        for (int i = 0; i < threads.length; i++) {
            threads[i].join();
        }
    }

  }
  ```

### 是否建议开启这个事件的采集
- 建议开启
  - 上面提到的Java内存分配路径，对于一般的JVM应用，`TLAB`内分配的量远大于申请新的TLAB分配的量，同时申请新的TLAB的量又远大于在TLAB外分配的量。除非你的应用分配大量的大对象，否则这个事件发生的应该比较少
  - 对于一般的JVM应用，建议还是开启这个事件的采集，这样能采集到在你应用的所有大对象分配。只要你的应用不是大对象分配过多，这个事件的采集对于性能的影响应该是可以接受的。
  - 路径三分配一般会包含核心问题点：
    - 分配大对象一般是路径三和路径四：大对象一般是数组，比如某个数据库请求拉取了太多数据，会尝试路径三和路径四分配
    - 分配小对象，导致的内存泄漏，一般是将小对象放入类似于 `ConcurrentHashMap` 或者一个数组结构中导致的内存泄漏，`ConcurrentHashMap`在 Rehash 以及数组在扩容的时候，一般会分配比较大的数组对象，也是走路径三和路径四。
- 与其他哪些事件是否有重合
  - `Object Allocation Sample`: 虽然 Object Allocation Sample 官方默认开启，但是对于大部分小对象朝生夕死的应用，其实更应该开启 Object Allocation Outside TLAB，而不是Object Allocation Sample。大部分应用，采集到的 Object Allocation Outside TLAB 会比默认的 Object Allocation Sample 少很多很多，性能消耗小很多很多。建议将 Object Allocation Sample 的采样率调很低，主要用于看意向不到的对象分配。
  - `Allocation Requiring GC 以及 ZAllocation Stall`: 后续分析这些事件我们会看到，有内存泄漏嫌疑的对象分配相关的对象分配路径，基本上很少会被这两个事件以及 Object Allocation Outside TLAB 采集到

### 这个事件适合定位什么问题？
- 大对象分配：适合度70%
  - 对于大于TLAB大小的对象，如果分配成功一定可以采集到
  - 对于大于TLAB最大浪费比例的对象，分配成功有概率可以采集到，因为有一部分在TLAB内分配成功
  - 这个`只会采集分配成功`的对象，对于大对象分配，如果触发 `OutOfMemoryError` 代表分配失败，那采集不到
  - 比如前面的代码示例，可以看到 HashMap 不断扩容，但是如果扩容触发 OutOfMemoryError，那这次就采集不到，但是通过前面的事件也能推测出来
- Java 堆对象内存泄漏: 适合度50%。针对不断分配小对象并且不释放的场景比较合适。比如多线程不断向一个 ConcurrentHashMap 塞入对象，但是不释放，这个事件可以采集 ConcurrentHashMap 在不断扩容。
- `意想不到的大对象分配`: 适合度100%。可以定期回顾下这个事件的采集，看看有没有意想不到的大对象分配，以及是否可以优化，或者有利于加深对于JDK的理解
