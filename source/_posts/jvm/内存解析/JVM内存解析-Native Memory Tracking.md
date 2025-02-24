---
title: JVM内存解析 - 1.Native Memory Tracking
abbrlink: 58697
date: 2025-02-23 09:46:30
tags: [JVM, 内存, NMT]
categories: [JVM内存解析]
---

> 本文参考张哥 -> 全网最硬核 JVM 内存解析 - 1.从 Native Memory Tracking 说起
- [Native Memory Tracking](https://juejin.cn/post/7225871227743043644)

### 开启
Native Memory Tracking 主要是用来通过在 `JVM 向系统申请内存的时候进行埋点实现的`。注意，这个埋点，并不是完全没有消耗的，我们后面会看到。由于需要埋点，并且 JVM 中申请内存的地方很多，这个埋点是有不小消耗的，这个 Native Memory Tracking 默认是不开启的，并且`无法动态开启`（因为这是埋点采集统计的，如果可以动态开启那么没开启的时候的内存分配没有记录无法知晓，所以无法动态开启），目前只能通过在启动 JVM 的时候通过启动参数开启。即通过 `-XX:NativeMemoryTracking` 开启:
- `-XX:NativeMemoryTracking=off`:这是默认值，即关闭 Native Memory Tracking
- `-XX:NativeMemoryTracking=summary`: 开启 Native Memory Tracking，但是仅仅按照各个 JVM 子系统去统计内存占用情况
- `-XX:NativeMemoryTracking=detail`: 开启 Native Memory Tracking，从每次 JVM 中申请内存的不同调用路径的维度去统计内存占用情况。注意，开启 detail 比开启 summary 的消耗要大不少，因为 detail 每次都要解析 CallSite 分辨调用位置。我们一般用不到这么详细的内容，除非是 JVM 开发。

开启之后，我们可以通过 jcmd 命令去查看 Native Memory Tracking 的信息，即`jcmd <pid> VM.native_memory`：
- `jcmd <pid> VM.native_memory`或者`jcmd <pid> VM.native_memory summary`：两者是等价的，即查看 Native Memory Tracking 的 summary 信息。默认单位是 KB，可以指定单位为其他，例如 jcmd <pid> VM.native_memory summary scale=MB
- `jcmd <pid> VM.native_memory detail`：查看 Native Memory Tracking 的 detail 信息，包括 summary 信息，以及按照虚拟内存映射分组的内存使用信息，还有按照不同 CallSite 调用分组的内存使用情况。默认单位是 KB，可以指定单位为其他，例如 jcmd <pid> VM.native_memory detail scale=MB


### 使用
> 我们只关心并且查看 Native Memory Tracking 的 summary 信息即可，detail 信息一般是供 JVM 开发人员使用的，我们不用太关心

一般地，只有遇到问题的时候，我们才会考虑开启 Native Memory Tracking，并且在定位出问题后，我们想把它关闭，可以通过 `jcmd <pid> VM.native_memory shutdown` 进行关闭并清理掉之前 Native Memory tracking 使用的埋点以及占用的内存。如前面所述，我们无法动态开启 Native Memory tracking，所以只要动态关闭了，这个进程就无法再开启了。

jcmd 本身提供了简单的对比功能，例如：
1. 使用 `jcmd <pid> VM.native_memory baseline` 记录当前内存占用信息
2. 之后过一段时间 `jcmd <pid> VM.native_memory summary.diff` 会输出当前 Native Memory Tracking 的 summary 信息，如果与第一步 baseline 的有差异，会在对应位将差异输出

但是这个工具本身比较粗糙，我们有时候并不知道何时调用 `jcmd <pid> VM.native_memory summary.diff` 合适，因为我们不确定什么时候会有我们想看到的内存使用过大的问题。所以我们一般做成一种持续监控的方式

### summary 信息每部分含义
以下是一个 Native Memory Tracking 的示例输出：
1. 压测 [spring-petclinic](https://github.com/spring-projects/spring-petclinic.git) 项目
2. jdk21
3. vm options 
  ```shell
  -Xmx256m
  -XX:StartFlightRecording=disk=true,maxsize=5000m,maxage=2d,settings=./default.jfc
  -XX:FlightRecorderOptions=maxchunksize=128m,repository=./,stackdepth=256
  -XX:NativeMemoryTracking=summary
  ```
```text
Native Memory Tracking:

(Omitting categories weighting less than 1KB)

Total: reserved=1751414KB, committed=470662KB
       malloc: 104634KB #545587
       mmap:   reserved=1646780KB, committed=366028KB

-                 Java Heap (reserved=262144KB, committed=82944KB)
                            (mmap: reserved=262144KB, committed=82944KB, peak=262144KB) 
 
-                     Class (reserved=1050511KB, committed=17167KB)
                            (classes #21948)
                            (  instance classes #20377, array classes #1571)
                            (malloc=1935KB #58688) (peak=1999KB #58351) 
                            (mmap: reserved=1048576KB, committed=15232KB, at peak) 
                            (  Metadata:   )
                            (    reserved=131072KB, committed=91072KB)
                            (    used=90300KB)
                            (    waste=772KB =0.85%)
                            (  Class space:)
                            (    reserved=1048576KB, committed=15232KB)
                            (    used=14704KB)
                            (    waste=528KB =3.46%)
 
-                    Thread (reserved=117590KB, committed=117590KB)
                            (threads #58)
                            (stack: reserved=117420KB, committed=117420KB, peak=117420KB)
                            (malloc=103KB #350) (peak=123KB #391) 
                            (arena=67KB #114) (peak=3010KB #121)
 
-                      Code (reserved=52246KB, committed=27478KB)
                            (malloc=2710KB #9638) (peak=2833KB #13764) 
                            (mmap: reserved=49536KB, committed=24768KB, at peak) 
                            (arena=0KB #0) (peak=33KB #1)
 
-                        GC (reserved=58006KB, committed=54566KB)
                            (malloc=20038KB #14233) (peak=20310KB #15935) 
                            (mmap: reserved=37968KB, committed=34528KB, peak=37968KB) 
 
-                 GCCardSet (reserved=70KB, committed=70KB)
                            (malloc=70KB #778) (peak=483KB #1344) 
 
-                  Compiler (reserved=230KB, committed=230KB)
                            (malloc=100KB #711) (peak=142KB #1118) 
                            (arena=130KB #2) (peak=10244KB #9)
 
-                  Internal (reserved=2904KB, committed=2904KB)
                            (malloc=2872KB #56765) (peak=2920KB #57573) 
                            (mmap: reserved=32KB, committed=32KB, at peak) 
 
-                     Other (reserved=108KB, committed=108KB)
                            (malloc=108KB #18) (peak=130KB #20) 
 
-                    Symbol (reserved=39117KB, committed=39117KB)
                            (malloc=33100KB #285200) (peak=33111KB #284967) 
                            (arena=6017KB #1) (at peak)
 
-    Native Memory Tracking (reserved=8633KB, committed=8633KB)
                            (malloc=108KB #1942) (peak=109KB #1948) 
                            (tracking overhead=8525KB)
 
-               Arena Chunk (reserved=199KB, committed=199KB)
                            (malloc=199KB #306) (peak=16383KB #630) 
 
-                   Tracing (reserved=21522KB, committed=21522KB)
                            (malloc=21522KB #12431) (at peak) 
                            (arena=0KB #0) (peak=32KB #1)
 
-                   Logging (reserved=0KB, committed=0KB)
                            (malloc=0KB #2) (peak=6KB #4) 
 
-                    Module (reserved=276KB, committed=276KB)
                            (malloc=276KB #4515) (peak=303KB #4521) 
 
-                 Safepoint (reserved=32KB, committed=32KB)
                            (mmap: reserved=32KB, committed=32KB, at peak) 
 
-           Synchronization (reserved=3462KB, committed=3462KB)
                            (malloc=3462KB #66139) (peak=3479KB #66484) 
 
-            Serviceability (reserved=2837KB, committed=2837KB)
                            (malloc=2837KB #33552) (peak=2850KB #33877) 
 
-                 Metaspace (reserved=131503KB, committed=91503KB)
                            (malloc=431KB #186) (peak=443KB #226) 
                            (mmap: reserved=131072KB, committed=91072KB, at peak) 
 
-      String Deduplication (reserved=1KB, committed=1KB)
                            (malloc=1KB #8) (at peak) 
 
-           Object Monitors (reserved=24KB, committed=24KB)
                            (malloc=24KB #116) (peak=162KB #798) 
 
-                   Unknown (reserved=0KB, committed=0KB)
                            (mmap: reserved=0KB, committed=0KB, peak=32KB) 

```
#### Java堆内存(Java Heap)
> 所有 Java 对象分配占用内存的来源，由 JVM GC 管理回收
```text
// 堆内存占用，reserve 了 262144KB=256M，当前 commit 了 82944KB(81M) 用于实际使用
// 发现 申请的内存大小正好等于=-Xmx256m，预留内存空间（不实际分配物理内存），只是为了让操作系统选择地址，预留大小。commit才是实际使用的物理内存
Java Heap (reserved=262144KB, committed=82944KB)
    // 堆内存都是通过 mmap 系统调用方式分配的，peak=最大使用量
    (mmap: reserved=262144KB, committed=82944KB, peak=262144KB) 
```

#### 元空间(Class)
> JVM 将类文件加载到内存中用于后续使用占用的空间，注意是 JVM C++ 层面的内存占用，主要包括类文件中在 JVM 解析为 C++ 的 Klass 类以及相关元素。对应的 Java 反射类 Class 还是在堆内存空间中
```text
// Class 是类元空间总占用，reserve 了 1050511KB(1025M)，当前 commit 了 17167KB(16MB) 用于实际使用
// 总共 reserved 1050511KB = mmap reserved 1048576KB(1024) + malloc 1935KB(1.8)
// 总共 committed 17167KB = mmap committed 15232KB + malloc 1999KB
 Class (reserved=1050511KB, committed=17167KB)
        (classes #21948) //一共加载了 21948 个类
        (  instance classes #20377, array classes #1571)    //其中 20377 个实体类，1571 个数组类
        (malloc=1935KB #58688) (peak=1999KB #58351)  //通过 malloc 系统调用方式一共分配了 1935KB，一共调用了 58688 次 malloc
        (mmap: reserved=1048576KB, committed=15232KB, at peak)  //通过 mmap 系统调用方式 reserve 了 1048576KB，当前 commit 了 15232KB 用于实际使用
        (  Metadata:   ) //注意，MetaData 这块不属于类元空间，属于数据元空间
        (    reserved=131072KB, committed=91072KB) //数据元空间当前 reserve 了 131072KB，commit 了 91072KB 用于实际使用
        (    used=90300KB) //但是实际从 MetaChunk 的角度去看使用，只有 90300KB 用于实际数据的分配，有 772KB 的浪费
        (    waste=772KB =0.85%)
        (  Class space:)
        (    reserved=1048576KB, committed=15232KB) //类元空间当前 reserve 了 1048576KB，commit 了 15232KB 用于实际使用 
        (    used=14704KB)  //但是实际从 MetaChunk 的角度去看使用，只有 14704KB 用于实际数据的分配，有 528KB 的浪费
        (    waste=528KB =3.46%)
Module (reserved=276KB, committed=276KB) //加载并记录模块占用空间，当前 reserve 了 276KB，commit 了 276KB 用于实际使用
        (malloc=276KB #4515) (peak=303KB #4521) 
Metaspace (reserved=131503KB, committed=91503KB) //等价于上面 Class 中的 MetaChunk（除了 malloc 的部分），当前 reserve 了 131503KB，commit 了 91503KB 用于实际使用
        (malloc=431KB #186) (peak=443KB #226) 
        (mmap: reserved=131072KB, committed=91072KB, at peak) 
```
#### C++ 字符串即符号(Symbol)占用空间
> 前面加载类的时候，其实里面有很多字符串信息（注意不是 Java 字符串，是 JVM 层面 C++ 字符串），不同类的字符串信息可能会重复。所以统一放入符号表(Symbol table)复用。元空间中保存的是针对符号表中符号的引用
```text
Symbol (reserved=39117KB, committed=39117KB)
        (malloc=33100KB #285200) (peak=33111KB #284967)  //通过 malloc 系统调用方式一共分配了 33100KB，一共调用了 285200 次 malloc
        (arena=6017KB #1) (at peak) //通过 arena 系统调用方式一共分配了 6017KB，一共调用了 1 次 arena
```

#### 线程占用内存(Thread)
> 主要是每个线程的线程栈，我们也只会主要分析线程栈占用空间（在第五章），其他的管理线程占用的空间很小，可以忽略不计
```text
// 总共 reserve 了 117590KB(114M)，commit 了 117590KB(114M)
Thread (reserved=117590KB, committed=117590KB)
    (threads #58) //当前线程数量是 58
    (stack: reserved=117420KB, committed=117420KB, peak=117420KB) //线程栈占用的空间: 每个线程实际占用 ≈ 1MB(栈) + 2MB(Guard Pages) 58个线程总占用 ≈ 58 * (1MB + 2MB) ≈ 174MB，实际看到117MB比理论值小，因为Guard Pages可能共享
    (malloc=103KB #350) (peak=123KB #391) 
    (arena=67KB #114) (peak=3010KB #121)
```

#### JIT编译器本身占用的空间以及JIT编译器编译后的代码占用空间(Code)
```text
Code (reserved=52246KB, committed=27478KB)
    (malloc=2710KB #9638) (peak=2833KB #13764) 
    (mmap: reserved=49536KB, committed=24768KB, at peak) 
    (arena=0KB #0) (peak=33KB #1)
```

#### Arena 数据结构占用空间(Arena Chunk)
>  Native Memory Tracking 中有很多通过 arena 分配的内存，这个就是管理 Arena 数据结构占用空间
```text
Arena Chunk (reserved=199KB, committed=199KB)
            (malloc=199KB #306) (peak=16383KB #630) 
```

#### JVM Tracing 占用内存
> 包括 JVM perf 以及 JFR 占用的空间。其中 JFR 占用的空间可能会比较大
```text
Tracing (reserved=21522KB, committed=21522KB)
    (malloc=21522KB #12431) (at peak) 
    (arena=0KB #0) (peak=32KB #1)
```

#### 写 JVM 日志占用的内存(Logging)
> -Xlog 参数指定的日志输出，并且 Java 17 之后引入了异步 JVM 日志-Xlog:async，异步日志所需的 buffer 也在这里
```text
Logging (reserved=0KB, committed=0KB)
        (malloc=0KB #2) (peak=6KB #4) 
```

#### JVM 参数占用内存(Arguments)
> 我们需要保存并处理当前的 JVM 参数以及用户启动 JVM 的是传入的各种参数（有时候称为 flag）
```text
Arguments (reserved=31KB, committed=31KB)
(malloc=31KB #90) 
```

#### JVM 安全点占用内存(Safepoint)
> 是固定的两页内存（我这里是一页是 16KB，后面第二章会分析这个页大小与操作系统相关），用于 JVM 安全点的实现，不会随着 JVM 运行时的内存占用而变化
```text 
Safepoint (reserved=32KB, committed=32KB)
           (mmap: reserved=32KB, committed=32KB, at peak) 
```

#### Java 同步机制(Synchronization)
> 例如 synchronized，还有 AQS 的基础 LockSupport 底层依赖的 C++ 的数据结构，系统内部的 mutex 等占用的内存
```text 
Synchronization (reserved=3462KB, committed=3462KB)
                (malloc=3462KB #66139) (peak=3479KB #66484) 
```

#### JVM TI 相关内存(Serviceability)
> JVMTI 是 Java 虚拟机工具接口（Java Virtual Machine Tool Interface）的缩写。它是 Java 虚拟机（JVM）的一部分，提供了一组 API，使开发人员可以开发自己的 Java 工具和代理程序，以监视、分析和调试 Java 应用程序。JVMTI API 是一组 C/C++ 函数，可以通过 JVM TI Agent Library 和 JVM 进行交互。开发人员可以使用 JVMTI API 开发自己的 JVM 代理程序或工具，以监视和操作 Java 应用程序。例如，可以使用 JVMTI API 开发性能分析工具、代码覆盖率工具、内存泄漏检测工具等等。这里的内存就是调用了 JVMTI API 之后 JVM 为了生成数据占用的内存
```text
Serviceability (reserved=2837KB, committed=2837KB)
                (malloc=2837KB #33552) (peak=2850KB #33877) 
```

#### Java 字符串去重占用内存(String Deduplication)
> Java 字符串去重机制可以减少应用程序中字符串对象的内存占用。 在 Java 应用程序中，字符串常量是不可变的，并且通常被使用多次。这意味着在应用程序中可能存在大量相同的字符串对象，这些对象占用了大量的内存。Java 字符串去重机制通过在堆中共享相同的字符串对象来解决这个问题。当一个字符串对象被创建时，JVM 会检查堆中是否已经存在相同的字符串对象。如果存在，那么新的字符串对象将被舍弃，而引用被返回给现有的对象。这样就可以减少应用程序中字符串对象的数量，从而减少内存占用。 但是这个机制一直在某些 GC 下表现不佳，尤其是 `G1GC` 以及 `ZGC` 中，所以默认是关闭的，可以通过 `-XX:+UseStringDeduplication` 来启用
```text
String Deduplication (reserved=1KB, committed=1KB)
                    (malloc=1KB #8) (at peak) 
```

#### JVM GC需要的数据结构与记录信息占用的空间(GC)
> 这块内存可能会比较大，尤其是对于那种专注于低延迟的 GC，例如 `ZGC`。其实 ZGC 是一种以空间换时间的思路，提高 CPU 消耗与内存占用，但是消灭全局暂停。之后的 ZGC 优化方向就是尽量降低 CPU 消耗与内存占用，相当于提高了性价比
```text
GC (reserved=58006KB, committed=54566KB)
    (malloc=20038KB #14233) (peak=20310KB #15935) 
    (mmap: reserved=37968KB, committed=34528KB, peak=37968KB) 
```

#### JVM内部与其他占用
> JVM内部(不属于其他类的占用就会归到这一类)与其他占用(不是 JVM 本身而是操作系统的某些系统调用导致额外占的空间)，不会很大
```text
Internal (reserved=2904KB, committed=2904KB)
        (malloc=2872KB #56765) (peak=2920KB #57573) 
        (mmap: reserved=32KB, committed=32KB, at peak) 

 Other (reserved=108KB, committed=108KB)
        (malloc=108KB #18) (peak=130KB #20) 
```

#### 开启 Native Memory Tracking 本身消耗的内存
```text
Native Memory Tracking (reserved=8633KB, committed=8633KB)
                    (malloc=108KB #1942) (peak=109KB #1948) 
                    (tracking overhead=8525KB)
```

### Native Memory Tracking 的 summary 信息的持续监控
现在 JVM 一般大部分部署在 k8s 这种云容器编排的环境中，每个 JVM 进程内存是受限的。如果超过限制，那么会触发 OOMKiller 将这个 JVM 进程杀掉。我们一般都是由于自己的 JVM 进程被 OOMKiller杀掉，才会考虑打开 `NativeMemoryTracking` 去看看哪块内存占用比较多以及如何调整的。

`OOMKiller 是积分制`，并不是你的 JVM 进程一超过限制就立刻会被杀掉，而是超过的话会累积分，累积到一定程度，就可能会被 OOMKiller 杀掉。所以，我们可以通过`定时输出` Native Memory Tracking的 summary 信息，从而抓到超过内存限制的点进行分析

但是，我们不能仅通过 Native Memory Tracking 的数据就判断 JVM 占用的内存，因为在后面的 JVM 内存申请与使用流程的分析我们会看到，`JVM 通过 mmap 分配的大量内存都是先 reserve 再 commit 之后实际往里面写入数据的时候，才会真正分配物理内存`。同时，JVM 还会动态释放一些内存，这些内存可能不会立刻被操作系统回收。`Native Memory Tracking 是 JVM 认为自己向操作系统申请的内存，与实际操作系统分配的内存是有所差距的`，所以我们不能只查看 Native Memory Tracking 去判断，我们还需要查看能体现真正内存占用指标。这里可以查看 linux 进程监控文件 smaps_rollup 看出具体的内存占用，例如 (一般不看 Rss，因为如果涉及多个虚拟地址映射同一个物理地址的话会有不准确，所以主要关注 `Pss` 即可，但是 Pss 更新不是实时的，但也差不多，这就可以理解为进程占用的实际物理内存)：
```text
> cat /proc/1/smaps_rollup 
f8000000-ffffe5c27000 ---p 00000000 00:00 0                              [rollup]
Rss:              198904 kB
Pss:              197331 kB
Pss_Dirty:        181900 kB
Pss_Anon:         181880 kB
Pss_File:          15451 kB
Pss_Shmem:             0 kB
Shared_Clean:       1864 kB
Shared_Dirty:          0 kB
Private_Clean:     15140 kB
Private_Dirty:    181900 kB
Referenced:       198904 kB
Anonymous:        181880 kB
KSM:                   0 kB
LazyFree:              0 kB
AnonHugePages:         0 kB
ShmemPmdMapped:        0 kB
FilePmdMapped:         0 kB
Shared_Hugetlb:        0 kB
Private_Hugetlb:       0 kB
Swap:                  0 kB
SwapPss:               0 kB
Locked:                0 kB
```
通过在每个 Spring Cloud 微服务进程加入下面的代码，来实现定时的进程内存监控，主要通过 `smaps_rollup` 查看实际的物理内存占用找到内存超限的时间点，Native Memory Tracking 查看 JVM 每块内存占用的多少，用于指导优化参数。

```java
import lombok.extern.log4j.Log4j2;
import org.apache.commons.io.FileUtils;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

import static org.springframework.cloud.bootstrap.BootstrapApplicationListener.BOOTSTRAP_PROPERTY_SOURCE_NAME;

@Log4j2
public class MonitorMemoryRSS implements ApplicationListener<ApplicationReadyEvent> {
    private static final AtomicBoolean INITIALIZED = new AtomicBoolean(false);

    private static final ScheduledThreadPoolExecutor sc = new ScheduledThreadPoolExecutor(1);


    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        if (isBootstrapContext(event)) {
            return;
        }
        synchronized (INITIALIZED) {
            if (INITIALIZED.get()) {
                return;
            }
            sc.scheduleAtFixedRate(() -> {
                long pid = ProcessHandle.current().pid();
                try {
                    //读取 smaps_rollup
                    List<String> strings = FileUtils.readLines(new File("/proc/" + pid + "/smaps_rollup"));
                    log.info("MonitorMemoryRSS, smaps_rollup: {}", strings.stream().collect(Collectors.joining("\n")));
                    //读取 Native Memory Tracking 信息
                    Process process = Runtime.getRuntime().exec(new String[]{"jcmd", pid + "", "VM.native_memory"});
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                        log.info("MonitorMemoryRSS, native_memory: {}", reader.lines().collect(Collectors.joining("\n")));
                    }
                } catch (IOException e) {
                }

            }, 0, 30, TimeUnit.SECONDS);
            INITIALIZED.set(true);
        }
    }

    static boolean isBootstrapContext(ApplicationReadyEvent applicationEvent) {
        return applicationEvent.getApplicationContext().getEnvironment().getPropertySources().contains(BOOTSTRAP_PROPERTY_SOURCE_NAME);
    }
}

```


