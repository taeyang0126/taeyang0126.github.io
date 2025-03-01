---
title: JVM内存解析 - 3.Java堆内存相关设计
abbrlink: 58697
date: 2025-03-01 17:46:30
tags: [JVM, 内存, 堆内存]
categories: [JVM内存解析]
---

> 本文参考张哥 -> 全网最硬核 JVM 内存解析 - 4.Java 堆内存大小的确认
- [JVM 堆内存大小设计](https://juejin.cn/post/7225874698906615864)

### 通用初始化与扩展流程

--- 

目前最新的 JVM，主要根据三个指标初始化堆以及扩展或缩小堆：
- 最大堆大小
- 最小堆大小
- 初始堆大小

不同的 GC 情况下，初始化以及扩展的流程可能在某些细节不太一样，但是，大体的思路都是：

1. 初始化阶段，`reserve` `最大堆`大小，并且 `commit` `初始堆`大小
2. 在某些 GC 的某些阶段，根据上次 GC 的数据，动态扩展或者缩小堆大小，扩展就是 commit 更多，缩小就是 uncommit 一部分内存。但是，堆大小不会小于`最小堆大小`，也不会大于`最大堆大小`

### 直接指定三个指标(MinHeapSize,MaxHeapSize,InitialHeapSize)的方式

---

这三个指标，直接对应的 JVM 参数是：

- **最大堆大小**：`MaxHeapSize`，如果没有指定的话会有默认**预设值**用于指导 JVM 计算这些指标的大小，`预设值为 125MB 左右`（96M*13/10）
- **最小堆大小**：`MinHeapSize`，默认为 0，0 代表让 JVM 自己计算
- **初始堆大小**：`InitialHeapSize`，默认为 0，0 代表让 JVM 自己计算

[对应源码](https://github.com/openjdk/jdk/blob/jdk-21+3/src/hotspot/share/gc/shared/gc_globals.hpp)

```cpp
#define ScaleForWordSize(x) align_down((x) * 13 / 10, HeapWordSize)

product(size_t, MaxHeapSize, ScaleForWordSize(96*M),                \
  "Maximum heap size (in bytes)")                                   \
  constraint(MaxHeapSizeConstraintFunc,AfterErgo)                   \
product(size_t, MinHeapSize, 0,                                     \
  "Minimum heap size (in bytes); zero means use ergonomics")        \
  constraint(MinHeapSizeConstraintFunc,AfterErgo)                   \
product(size_t, InitialHeapSize, 0,                                 \
  "Initial heap size (in bytes); zero means use ergonomics")        \
  constraint(InitialHeapSizeConstraintFunc,AfterErgo)               \
```

我们可以通过类似于 `-XX:MaxHeapSize=1G` 这种启动参数对这三个指标进行设置，但是，我们经常看到的可能是 `Xmx` 以及 `Xms` 这两个参数设置这三个指标，这两个参数分别对应：

- `Xmx`：对应 **最大堆大小** 等价于 `MaxHeapSize`
- `Xms`: 相当于同时设置**最小堆大小** `MinHeapSize` 和**初始堆大小** `InitialHeapSize`

[对应JVM源码](https://github.com/openjdk/jdk/blob/jdk-21+3/src/hotspot/share/runtime/arguments.cpp)

```cpp
//如果设置了 Xms
else if (match_option(option, "-Xms", &tail)) {
  julong size = 0;
  //解析 Xms 大小
  ArgsRange errcode = parse_memory_size(tail, &size, 0);
  if (errcode != arg_in_range) {
    jio_fprintf(defaultStream::error_stream(),
                "Invalid initial heap size: %s\n", option->optionString);
    describe_range_error(errcode);
    return JNI_EINVAL;
  }
  //将解析的值设置到 MinHeapSize
  if (FLAG_SET_CMDLINE(MinHeapSize, (size_t)size) != JVMFlag::SUCCESS) {
    return JNI_EINVAL;
  }
  //将解析的值设置到 InitialHeapSize
  if (FLAG_SET_CMDLINE(InitialHeapSize, (size_t)size) != JVMFlag::SUCCESS) {
    return JNI_EINVAL;
  }
//如果设置了 Xmx
} else if (match_option(option, "-Xmx", &tail) || match_option(option, "-XX:MaxHeapSize=", &tail)) {
  julong long_max_heap_size = 0;
  //解析 Xmx 大小
  ArgsRange errcode = parse_memory_size(tail, &long_max_heap_size, 1);
  if (errcode != arg_in_range) {
    jio_fprintf(defaultStream::error_stream(),
                "Invalid maximum heap size: %s\n", option->optionString);
    describe_range_error(errcode);
    return JNI_EINVAL;
  }
  //将解析的值设置到 MaxHeapSize
  if (FLAG_SET_CMDLINE(MaxHeapSize, (size_t)long_max_heap_size) != JVMFlag::SUCCESS) {
    return JNI_EINVAL;
  }
}

```

### 不手动指定三个指标的情况下，这三个指标(MinHeapSize,MaxHeapSize,InitialHeapSize)是如何计算的

--- 

JVM 会读取 **JVM 可用内存**：首先 JVM 需要知道自己可用多少内存，我们称为可用内存。由此引入第一个 JVM 参数，`MaxRAM`，这个参数是用来明确指定 JVM 进程可用内存大小的，如果没有指定，JVM 会自己读取系统可用内存。这个可用内存用来指导 JVM 限制最大堆内存。后面我们会看到很多 JVM 参数与这个可用内存相关。

前面我们还提到了，就算没有指定 `MaxHeapSize` 或者 `Xmx`，`MaxHeapSize` 也有自己预设的一个参考值。源码中这个预设参考值为 125MB 左右（`96M*13/10`）。但是一般最后不会以这个参考值为准，JVM 初始化的时候会有很复杂的计算计算出合适的值。比如你可以在你的电脑上执行下下面的命令，可以看到类似下面的输出：

```shell
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintFlagsFinal -version|grep MaxHeapSize
   size_t MaxHeapSize                              = 17179869184                               {product} {ergonomic}
   size_t SoftMaxHeapSize                          = 17179869184                            {manageable} {ergonomic}
openjdk version "21.0.4" 2024-07-16 LTS
OpenJDK Runtime Environment Temurin-21.0.4+7 (build 21.0.4+7-LTS)
OpenJDK 64-Bit Server VM Temurin-21.0.4+7 (build 21.0.4+7-LTS, mixed mode)
```

可以看到 `MaxHeapSize` 的大小，以及它的值是通过 `ergonomic` 决定的。也就是非人工指定而是 JVM 自己算出来的。

上面提到的那个 125MB 左右的初始参考值，一般用于 JVM 计算。我们接下来就会分析这个计算流程，首先是最大堆内存 MaxHeapSize 的计算流程：
![img](/images/jvm/memory/09.png)
流程中涉及了以下几个参数，还有一些已经过期的参数，会被转换成未过期的参数：
- `MinRAMPercentage`：注意不要被名字迷惑，这个参数是在可用内存比较小的时候生效，即最大堆内存占用为可用内存的这个参数指定的百分比，默认为 50，即 50%
- `MaxRAMPercentage`：注意不要被名字迷惑，这个参数是在可用内存比较大的时候生效，即最大堆内存占用为可用内存的这个参数指定的百分比，默认为 25，即 25%
- `ErgoHeapSizeLimit`：通过自动计算，计算出的最大堆内存大小不超过这个参数指定的大小，默认为 0 即不限制
- `MinRAMFraction`: 已过期，如果配置了会转化为 `MinRAMPercentage` 换算关系是：`MinRAMPercentage` = 100.0 / `MinRAMFraction`，默认是 2
- `MaxRAMFraction`: 已过期，如果配置了会转化为 `MaxRAMPercentage` 换算关系是：`MaxRAMPercentage` = 100.0 / `MaxRAMFraction`，默认是 4

[对应源码](https://github.com/openjdk/jdk/blob/jdk-21+3/src/hotspot/share/gc/shared/gc_globals.hpp)

```cpp
product(double, MinRAMPercentage, 50.0,                             \
  "Minimum percentage of real memory used for maximum heap"         \
  "size on systems with small physical memory size")                \
  range(0.0, 100.0)                                                 \
product(double, MaxRAMPercentage, 25.0,                             \
  "Maximum percentage of real memory used for maximum heap size")   \
  range(0.0, 100.0)                                                 \
product(size_t, ErgoHeapSizeLimit, 0,                               \
  "Maximum ergonomically set heap size (in bytes); zero means use " \
  "MaxRAM * MaxRAMPercentage / 100")                                \
  range(0, max_uintx)                                               \
product(uintx, MinRAMFraction, 2,                                   \
  "Minimum fraction (1/n) of real memory used for maximum heap "    \
  "size on systems with small physical memory size. "               \
  "Deprecated, use MinRAMPercentage instead")                       \
  range(1, max_uintx)                                               \
product(uintx, MaxRAMFraction, 4,                                   \
  "Maximum fraction (1/n) of real memory used for maximum heap "    \
  "size. "                                                          \
  "Deprecated, use MaxRAMPercentage instead")                       \
  range(1, max_uintx)                                               \
```

然后如果我们也没有设置 `MinHeapSize` 以及 `InitialHeapSize`，也会经过下面的计算过程计算出来：

![img](/images/jvm/memory/10.png)

流程中涉及了以下几个参数，还有一些已经过期的参数，会被转换成未过期的参数：
- `NewSize`：初始新生代大小，预设值为 1.3MB 左右（1*13/10）
- `OldSize`：老年代大小，预设值为 5.2 MB 左右（4*13/10）
- `InitialRAMPercentage`：初始堆内存为可用内存的这个参数指定的百分比，默认为 1.5625，即 1.5625%
- `InitialRAMFraction`: 已过期，如果配置了会转化为 `InitialRAMPercentage` 换算关系是：`InitialRAMPercentage` = 100.0 / `InitialRAMFraction`

[对应源码](https://github.com/openjdk/jdk/blob/jdk-21+3/src/hotspot/share/gc/shared/gc_globals.hpp)

```cpp
product(size_t, NewSize, ScaleForWordSize(1*M),                     \
  "Initial new generation size (in bytes)")                         \
  constraint(NewSizeConstraintFunc,AfterErgo)                       \
product(size_t, OldSize, ScaleForWordSize(4*M),                     \
  "Initial tenured generation size (in bytes)")                     \
  range(0, max_uintx)                                               \
product(double, InitialRAMPercentage, 1.5625,                       \
  "Percentage of real memory used for initial heap size")           \
  range(0.0, 100.0)                                                 \
product(uintx, InitialRAMFraction, 64,                              \
  "Fraction (1/n) of real memory used for initial heap size. "      \
  "Deprecated, use InitialRAMPercentage instead")                   \
  range(1, max_uintx)                                               \
```