---
title: JFR详解-1
abbrlink: 19346
date: 2025-02-20 14:13:52
tags: [JVM, JFR, 监控, OOM, 内存泄漏]
categories: [JFR]
---

- [本篇文章参考张哥JFR全系列](https://www.bilibili.com/video/BV1CBKLe9ECN?spm_id_from=333.788.videopod.sections&vd_source=3950f615078c921132561647ae6a1ddd)

## 为什么需要JFR?

### 我们需要一个持续的，低消耗的JVM层面与JDK层面的类似于 `OpenTelemetry` 标准的监控方式

- arthas: 主要用于实时定位问题，必须有问题线程，必须复现才能定位，没法事后定位，如果有应用问题也可能挂载不上。
JFR可以实现从JVM启动开始一直持续采集监控与事后定位，即使应用有问题卡住，也基本能通过JFR定位。
- APM 框架: 例如 micrometer，open-telemetry，Skywalking 等等，大部分基于 `Java Agent` 和侵入代码的方式结合实现，
这些对于JFR来说：
  - 这些框架没办法采集JVM层面的指标
  - JVM协调安全点，JVM卡住，Java应用有问题，CPU吃满等等，这些框架会受很大影响

### 结合学习 JVM + JDK 的最佳方式
- JFR 有哪些事件，为啥要采集这些事件
- 采集这些事件的机制
- 搞懂上面的问题，基本从 JVM 到 JDK 的任意一个细节都搞懂了，比如：
  - JVM GC 的时候有哪些阶段，每个阶段耗时与做了什么？看 GC 相关 JFR 事件
  - JVM Safepoint 是啥，有啥原因会进入 safePoint？看 Safepoint 相关 JFR 事件
  - JDK 中的 AQS 究竟基于啥，实现原理是啥？看 Thread Park 事件属性与对应线程栈

## JFR 如何实现高效
- ![img](/images/jfr/01.png)

## JFR 如何从 JVM 启动一开始监控到任意时候
> 突破 JFR 本身限制，不用 dumponexit，不用主动 dump

- JFR 写入磁盘的 Data Chunk，默认在临时目录(`java.io.tmpdir`)，这个可以通过
JFR 配置限制
  - `maxage`：限制保留的 JFR 事件的最早时间
  - `maxsize`：限制保留在本地磁盘临时文件的最大总大小
- Java 14开始，增加了 JFR Event Streaming 机制
  - 写入的临时文件不再是.part，而是.jfr，这样即使JMC无法解析，也可以使用jfr命令解析
  - java 14 引入定时任务定时（默认1s）执行 JFR Flush 将元数据刷入本地文件 Data Chunk，这样大概率最新的文件就是数据完整的，即可以被JMC解析

## 准备工作
### Java 17 以上的 JDK
> Azul、Corretto、OpenJdk随意

### JMC
> 下载最新版本即可，即 JMC 9

### WhiteBox
> `WhiteBox API` 是 HotSpot VM 自带的白盒测试工具，将内部的很多核心机制的API暴露出来，用于白盒测试 JVM，压测 JVM 特性，以及辅助学习理解JVM并调优参数

- 编译 WhiteBox API
  1. 拉取 openjdk 源码
    ```shell
    git clone --depth 1 --filter=blob:none --sparse https://github.com/openjdk/jdk
    cd jdk
    git sparse-checkout init --cone
    git sparse-checkout set test/lib/jdk/test/whitebox
    ```
  2. 新建 maven 空项目，将刚刚拉取的代码复制进去，执行 `maven package` 即可
  3. 将编译的 jar 包放在项目根目录，通过 maven 本地 system 依赖的方式将 jar 包加入依赖
  ![img](/images/jfr/02.png)
  4. 不想自己构建可以使用 [whitebox-1.0-SNAPSHOT.jar](/files/jfr/whitebox-1.0-SNAPSHOT.jar)
  5. 编写测试代码
     - 代码
      ```java
        public class TestWhiteBox {
        
        public static void main(String[] args) throws InterruptedException {
        
              /*
                  主要用于添加WhiteBox测试API的jar包，这个jar必须通过引导类加载器加载，因为它需要访问JVM内部功能，/a 表示append，将指定的jar追加到引导类路径末尾
                  -Xbootclasspath/a:/Users/wulei/IdeaProjects/learn/jfr/whitebox-1.0-SNAPSHOT.jar
        
                  解锁JVM诊断选项，启用一些默认被禁用的诊断/调试选项，这是使用WhiteBox API的前提条件
                  -XX:+UnlockDiagnosticVMOptions
        
                  启用WhiteBox测试API，WhiteBox API提供了访问JVM内部状态的能力
                  -XX:+WhiteBoxAPI
        
                  开启GC日志记录，输出带有gc标签的日志
                  -Xlog:gc
               */
        
              WhiteBox whiteBox = WhiteBox.getWhiteBox();
              // 获取 ReservedCodeCacheSize 这个 JVM flag 的值
              Long reservedCodeCacheSize = whiteBox.getUintxVMFlag("ReservedCodeCacheSize");
              System.out.println(reservedCodeCacheSize);
              // 打印内存各项指标
              whiteBox.printHeapSizes();
              // 执行 full GC
              whiteBox.fullGC();
              // 保持进程不退出，打印完整日志
              Thread.currentThread().join();
        
        }
        
      }
       ```
     - 启动VM Options
     ```shell
     -Xbootclasspath/a:/Users/wulei/IdeaProjects/learn/jfr/whitebox-1.0-SNAPSHOT.jar
     -XX:+UnlockDiagnosticVMOptions
     -XX:+WhiteBoxAPI
     -Xlog:gc
     ```
     - 执行结果，出现 NoSuchMethodError 错误没关系，因为打包的是最新的 whitebox，使用的jdk版本可能没有某些最新的api
     ![img](/images/jfr/03.png)

## Java 对象分配过程

### 路径一 TLAB 内分配
- 需要分配的大小小于 TLAB (Thread Local Alloction Buffer) 的剩余空间，直接在 TLAB 中分配
- 这是大多数对象的分配路径

### 路径二 申请新的 TLAB 分配
- 需要分配的大小大于 TLAB 的剩余空间，TLAB 的当前剩余空间小于 TLAB 的最大浪费空间
- 重新分配一个 TLAB，然后在新的 TLAB 中分配

### 路径三 TLAB 外分配
- 需要分配的大小大于 TLAB 的剩余空间，TLAB 的当前剩余空间大于 TLAB 的最大浪费空间
- 或者是申请新的 TLAB，TLAB 扩容也无法满足需要的大小
- 或者是申请新的 TLAB，堆剩余空间不足以分配新的 TLAB，但是足够分配这个对象并且这个线程抢到了全局堆锁
- 以上三种情况都会直接在堆上分配

### 路径四 分配前触发GC或者等待GC
- 路径二和路径三都失败，即堆剩余空间不足导致申请TLAB失败，堆剩余空间也不足以分配这个对象或者没有抢到全局堆锁
- 这种情况下，会触发 GC 或者等待 GC 释放对象

### 为什么有个最大浪费空间？？
- 这是为了避免更有效的利用空间
- 假设当前剩余12KB，最大浪费空间是10KB，有个对象需要分配20KB，因为TLAB剩余空间不够，这时候面临两个选择
    - 丢弃掉当前这个TLAB，去申请一个新的
    - 不在当前这个TLAB上配置，去堆上分配
    - 最大浪费空间就是以上两种选择的决定者，假设剩余空间大于最大浪费空间，那么就保留当前这个TLAB，因为下次很可能在分配成功，所以要去堆上分配；假设剩余空间小于最大浪费空间，说明下次分配的可能性也不大了，可以丢弃掉当前TLAB去申请一个新的TLAB了

### TLAB
- TLAB 是动态的，一般分配频繁的线程TLAB=2M
- 每次fullGC都会触发所有线程填充自己的TLAB，然后退回堆，申请一个新的TLAB

## JFR 事件

### Java Application/Object Allocation In New TLAB
![img](/images/jfr/04.png)
![img](/images/jfr/05.png)
#### 使用
- Type(JVM,JDK内部唯一标识，用于jfr配置): jdk.ObjectAllocationInNewTLAB
- Label(Event Type，用于显示): Object Allocation In New TLAB
- Category(用于分类显示): Java Application
- 事件从哪个版本引入？
  - Java11：即一开始就存在
- 事件类型
  - `埋点事件：即满足某些条件会触发的采集事件`
  - `JVM内部事件`
- default.jfc 配置
  ```xml
    <event name="jdk.ObjectAllocationInNewTLAB">
        <setting name="enabled" control="gc-enabled-high">false</setting>
        <setting name="stackTrace">true</setting>
    </event>
  ```
- Profiling.jfc 配置
  ```xml
    <event name="jdk.ObjectAllocationInNewTLAB">
        <setting name="enabled" control="gc-enabled-high">false</setting>
        <setting name="stackTrace">true</setting>
    </event>
  ```
- 此事件对应 `Java 对象分配过程` 中的路径二
- 事件字段
  - Event Thread：发生路径二分配的线程的名称
  - Allocation Size：触发路径二分配的对象大小（实际占用，考虑了对象对其）
  - Object Class：触发路径二分配的对象类型
  - TLAB Size：触发路径二分配，申请新的TLAB的大小
  - 线程栈：发生路径二的线程栈，默认是采集的
  ![img](/images/jfr/06.png)
- 测试代码
   ```java
  public class TestAllocInNewTLAB {

    // 对于字节数组对象头占用16字节
    private static final int BYTE_ARRAY_OVERHEAD = 16;
    // 测试的对象大小是KB
    private static final int OBJECT_SIZE = 1024;
    // 字节数组对象名称
    private static final String BYTE_ARRAY_CLASS_NAME = new byte[0].getClass().getName();

    // 需要使用静态field，而不是方法内本地变量，否则编译后循环内的new byte[] 会被全部省略，只剩最后一次的
    public static byte[] tmp;

    private static final String EVENT_TYPE = "jdk.ObjectAllocationInNewTLAB";


    public static void main(String[] args) throws Exception {


        WhiteBox whiteBox = WhiteBox.getWhiteBox();
        // 初始化jfr记录
        Recording recording = new Recording();
        recording.enable(EVENT_TYPE);
        // JFR 记录启动
        recording.start();
        // 强制 fullgc 防止程序接下来发生 gc
        // 同时可以区分初始化带来的其他线程的TLAB相关的日志
        whiteBox.fullGC();
        // 分配对象，大小1KB
        for (int i = 0; i < 512; i++) {
            tmp = new byte[OBJECT_SIZE - BYTE_ARRAY_OVERHEAD];
        }
        // 强制 fullgc 回收所以 TLAB
        whiteBox.fullGC();
        // 分配对象，大小100KB
        for (int i = 0; i < 200; i++) {
            tmp = new byte[OBJECT_SIZE * 100 - BYTE_ARRAY_OVERHEAD];
        }
        whiteBox.fullGC();

        // 将 jfr 记录到一个文件
        Path path = new File(new File(".").getAbsolutePath(),
                "recording-" + recording.getId()
                        + "-pid"
                        + ProcessHandle.current().pid()
                        + ".jfr"
        ).toPath();
        recording.dump(path);
        // 统计事件类型
        int countOf1KBObjectAllocationInNewTLAB = 0;
        int countOf100KBObjectAllocationInNewTLAB = 0;
        // 读取文件中的所有 JFR 事件
        for (RecordedEvent event : RecordingFile.readAllEvents(path)) {
            // 获取分配的对象类型
            String className = event.getString("objectClass.name");

            // 确保分配类型是byte
            if (BYTE_ARRAY_CLASS_NAME.equals(className)) {
                RecordedFrame recordedFrame = event.getStackTrace().getFrames().get(0);
                // 同时必须是main方法分配的对象，并且是java堆栈中的main方法
                if (
                        recordedFrame.isJavaFrame()
                                && "main".equalsIgnoreCase(recordedFrame.getMethod().getName())
                ) {
                    // 获取分配对象大小
                    long allocationSize = event.getLong("allocationSize");
                    if (EVENT_TYPE.equalsIgnoreCase(event.getEventType().getName())) {
                        if (allocationSize == OBJECT_SIZE) {
                            countOf1KBObjectAllocationInNewTLAB++;
                        } else if (allocationSize == 100 * OBJECT_SIZE) {
                            countOf100KBObjectAllocationInNewTLAB++;
                        }

                    }
                } else {
                    throw new Exception("unexpected size of TLAB event");
                }
                System.out.println(event);
            }
        }

        System.out.println("countOf1KBObjectAllocationInNewTLAB: " + countOf1KBObjectAllocationInNewTLAB);
        System.out.println("countOf100KBObjectAllocationInNewTLAB: " + countOf100KBObjectAllocationInNewTLAB);
    }
   }
   ```

#### 为什么针对大部分应用不建议开启这个事件的采集?
- `路径二分配一般不是核心问题点`
  - 分配大对象一般是路径三和路径四：大对象一般是数组，比如某个数据库请求拉取了太多数据，会尝试路径三和路径四分配
  - 分配小对象，导致的内存泄漏，一般是将小对象放入类似于 `ConcurrentHashMap` 或者一个数组结构中导致的内存泄漏，`ConcurrentHashMap`在 Rehash 以及数组在扩容的时候，一般会分配比较大的数组对象，也是走路径三和路径四。
- `对于大部分应用，没有啥必要性`
  - 重新申请 TLAB 分配，对于热点线程来说，虽然不如TLAB内分配那么多，但是也是比较频繁的
  - 如果重新申请 TLAB 分配的次数，和 TLAB 内分配的次数差不多，这才会是问题
  - 但是 TLAB 的大小是根据线程的分配情况动态调整的，所以 TLAB 内的分配的次数会比较多，而重新申请 TLAB 分配的次数会比较少
  - 所以这个事件的采集，对于大部分的应用来说，并不是很有必要
- `性能损耗`
  - 这个事件的采集，会捕获堆栈信息，堆栈信息是比较耗性能的，如果开启这个事件的采集，会导致性能损耗比较大。并且这个事件的采集也相对频繁

#### 那种情况下才会考虑开启这个事件的采集?
- 正常的应用场景下，不需要调整TLAB的配置参数。一般情况下，JVM会根据应用的情况自动调整TLAB的大小
- 如果确实怀疑TLAB的配置参数有问题，第一步是开启 Java Application -> Allocation In New TLAB(jdk.ObjectAllocationInNewTLAB) 和 Java Application ->  Allocation outside TLAB(jdk.ObjectAllocationOutsideTLAB)
- 确认有大量的 Object Allocation Outside TLAB 事件发生（一般在应用稳定之后，如果很多线程的 Object Allocation Outside TLAB 相对于 Allocation In New TLAB 大于 5%以上就需要调整 TLAB 相关参数了），然后再考虑是否需要调整 TLAB 的配置参数。

### Java Application/Object Allocation Outside TLAB

#### 使用
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

#### 是否建议开启这个事件的采集
- 建议开启
  - 上面提到的Java内存分配路径，对于一般的JVM应用，`TLAB`内分配的量远大于申请新的TLAB分配的量，同时申请新的TLAB的量又远大于在TLAB外分配的量。除非你的应用分配大量的大对象，否则这个事件发生的应该比较少
  - 对于一般的JVM应用，建议还是开启这个事件的采集，这样能采集到在你应用的所有大对象分配。只要你的应用不是大对象分配过多，这个事件的采集对于性能的影响应该是可以接受的。
  - 路径三分配一般会包含核心问题点：
    - 分配大对象一般是路径三和路径四：大对象一般是数组，比如某个数据库请求拉取了太多数据，会尝试路径三和路径四分配
    - 分配小对象，导致的内存泄漏，一般是将小对象放入类似于 `ConcurrentHashMap` 或者一个数组结构中导致的内存泄漏，`ConcurrentHashMap`在 Rehash 以及数组在扩容的时候，一般会分配比较大的数组对象，也是走路径三和路径四。
- 与其他哪些事件是否有重合
  - `Object Allocation Sample`: 虽然 Object Allocation Sample 官方默认开启，但是对于大部分小对象朝生夕死的应用，其实更应该开启 Object Allocation Outside TLAB，而不是Object Allocation Sample。大部分应用，采集到的 Object Allocation Outside TLAB 会比默认的 Object Allocation Sample 少很多很多，性能消耗小很多很多。建议将 Object Allocation Sample 的采样率调很低，主要用于看意向不到的对象分配。
  - `Allocation Requiring GC 以及 ZAllocation Stall`: 后续分析这些事件我们会看到，有内存泄漏嫌疑的对象分配相关的对象分配路径，基本上很少会被这两个事件以及 Object Allocation Outside TLAB 采集到

#### 这个事件适合定位什么问题？
- 大对象分配：适合度70%
  - 对于大于TLAB大小的对象，如果分配成功一定可以采集到
  - 对于大于TLAB最大浪费比例的对象，分配成功有概率可以采集到，因为有一部分在TLAB内分配成功
  - 这个`只会采集分配成功`的对象，对于大对象分配，如果触发 `OutOfMemoryError` 代表分配失败，那采集不到
  - 比如前面的代码示例，可以看到 HashMap 不断扩容，但是如果扩容触发 OutOfMemoryError，那这次就采集不到，但是通过前面的事件也能推测出来
- Java 堆对象内存泄漏: 适合度50%。针对不断分配小对象并且不释放的场景比较合适。比如多线程不断向一个 ConcurrentHashMap 塞入对象，但是不释放，这个事件可以采集 ConcurrentHashMap 在不断扩容。
- `意想不到的大对象分配`: 适合度100%。可以定期回顾下这个事件的采集，看看有没有意想不到的大对象分配，以及是否可以优化，或者有利于加深对于JDK的理解