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

### 压缩对象指针相关机制 - UseCompressedOops

---

#### 压缩对象指针存在的意义
现代机器大部分是 64 位的，JVM 也从 `9` 开始仅提供 64 位的虚拟机。在 JVM 中，一个对象指针，对应进程存储这个对象的虚拟内存的起始位置，也是 64 位大小：

我们知道，对于 32 位寻址，最大仅支持 4GB 内存的寻址，这在现在的 JVM 很可能不够用，可能仅仅堆大小就超过 4GB。所以目前对象指针一般是 `64` 位大小来支持大内存。但是，这相对 32 位指针寻址来说，`性能上却有衰减`。我们知道，`CPU 仅能处理寄存器里面的数据`，寄存器与内存之间，有很多层 CPU 缓存，虽然内存越来越便宜也越来越大，但是 `CPU 缓存并没有变大`，这就导致如果使用 64 位的指针寻址，相对于之前 32 位的，`CPU 缓存能容纳的指针个数小了一倍`。

Java 是面向对象的语言，JVM 中最多的操作，就是对对象的操作，比如 load 一个对象的字段，store 一个对象的字段，`这些都离不开访问对象指针`。所以 JVM 想尽可能的优化对象指针，这就引入了`压缩对象指针`，让对象指针在条件满足的情况下保持原来的 32 位。

对于 32 位的指针，假设`每一个 1 代表 1 字节`（就是每一位数指向一个字节），那么可以描述 0~2^32-1 这 2^32 字节也就是 `4 GB`（2^10=1024=1KB 2^20=1024*1024=1MB 2^30=1024*1024*1024=1GB） 的虚拟内存。
![img](/images/jvm/memory/11.png)

如果我让`每一个 1 代表 8 字节`呢？也就是让`这块虚拟内存是 8 字节对齐`，也就是我在使用这块内存时候，`最小的分配单元就是 8 字节`。对于 Java 堆内存，也就是一个对象占用的空间，`必须是 8 字节的整数倍`，不足的话会填充到 8 字节的整数倍用于保证对齐。这样最多可以描述 2^32 * 8 字节也就是 32 GB 的虚拟内存。
![img](/images/jvm/memory/12.png)

这就是`压缩指针`的原理，上面提到的相关 JVM 参数是：`ObjectAlignmentInBytes`，这个 JVM 参数表示 `Java 堆中的每个对象，需要按照几字节对齐`，也就是堆按照几字节对齐，值范围是 8 ~ 256，必须是 2 的 n 次方，因为 2 的 n 次方能简化很多运算，例如对于 2 的 n 次方取余数就可以简化成对于 2 的 n 次方减一取与运算，乘法和除法可以简化移位。

如果配置最大堆内存超过 32 GB（当 JVM 是 8 字节对齐），那么压缩指针会失效（其实不是超过 32GB，会略小于 32GB 的时候就会失效，还有其他的因素影响，下一节会讲到）。 但是，这个 32 GB 是和字节对齐大小相关的，也就是 `-XX:ObjectAlignmentInBytes=8` 配置的大小(默认为8字节，也就是 Java 默认是 8 字节对齐)。如果你配置 `-XX:ObjectAlignmentInBytes=16`，那么最大堆内存超过 64 GB 压缩指针才会失效，如果你配置 `-XX:ObjectAlignmentInBytes=32`，那么最大堆内存超过 128 GB 压缩指针才会失效.

#### 压缩对象指针与压缩类指针的关系演进

老版本中， `UseCompressedClassPointers` 取决于 `UseCompressedOops`，即压缩对象指针如果没开启，那么压缩类指针也无法开启。但是从 **Java 15 Build 23** 开始， `UseCompressedClassPointers` 已经不再依赖 `UseCompressedOops` 了，两者在大部分情况下已经独立开来。除非在 x86 的 CPU 上面启用 JVM Compiler Interface（例如使用 GraalVM）。参考 [JDK ISSUE](https://link.juejin.cn/?target=https%3A%2F%2Fbugs.openjdk.java.net%2Fbrowse%2FJDK-8241825)

#### 压缩对象指针的不同模式与寻址优化机制
JVM 需要从虚拟内存的某一点开始申请内存，并且，需要预留出足够多的空间，给可能的一些系统调用机制使用，比如前面我们 native memory tracking 中看到的一些 malloc 内存，其实某些就在这个预留空间中分配的。`JVM会首先确保在操作系统提供的内存空间中分配足够的内存给Java堆`，在确保Java堆内存需求后，JVM才会考虑为元空间、代码缓存等分配内存。

JVM 在 `Reserve` 分配 Java 堆空间的时候，会一下子 Reserve `最大 Java 堆空间的大小`，然后在此基础上 Reserve 分配其他的存储空间。之后分配 Java 对象，在 Reserve 的 Java 堆内存空间内 `Commit` 然后`写入数据映射物理内存`分配 Java 对象。根据前面说的 Java 堆大小的伸缩策略，决定继续 Commit 占用更多物理内存还是 UnCommit 释放物理内存：
![img](/images/jvm/memory/13.png)

Java 是一个面向对象的语言，JVM 中执行最多的就是访问这些对象，`在 JVM 的各种机制中，必须无时无刻考虑怎么优化访问这些对象的速度`，对于压缩对象指针，JVM 就考虑了很多优化。如果我们要使用压缩对象指针，那么需要将这个 64 位的地址，转换为 32 位的地址。然后在读取压缩对象指针所指向的对象信息的时候，需要将这个 32 位的地址，解析为 64 位的地址之后寻址读取。这个转换公式，如下所示：
1. `64 位地址 = 基址 + （压缩对象指针 << 对象对齐偏移）`
2. `压缩对象指针 = (64 位地址 - 基址) >> 对象对齐偏移`

基址其实就是对象地址的开始，注意，`这个基址不一定是 Java 堆的开始地址`，我们后面就会看到。对象对齐偏移与前面提到的 `ObjectAlignmentInBytes` 相关，例如 `ObjectAlignmentInBytes=8` 的情况下，对象对齐偏移就是 3 （因为 8 是 2 的 3 次方）。我们针对这个公式进行优化：

首先，我们考虑把`基址和对象对齐偏移`去掉，那么压缩对象指针可以直接作为对象地址使用。什么情况下可以这样呢？那么就是对象地址从 0 开始算，并且`最大堆内存 + Java 堆起始位置不大于 4GB`。因为这种情况下，Java 堆中对象的最大地址不会超过 4GB，那么压缩对象指针的范围可以直接表示所有 Java 堆中的对象。可以直接使用压缩对象指针作为对象实际内存地址使用。这里为啥是最大堆内存 + Java 堆起始位置不大于 4GB？因为前面的分析，我们知道进程可以申请的空间，是原生堆空间。所以，Java 堆起始位置，肯定不会从 `0x0000 0000 0000 0000` 开始。
![img](/images/jvm/memory/14.png)

如果最大堆内存 + Java 堆起始位置大于 4GB，第一种优化就不能用了，`对象地址偏移就无法避免了`。但是如果可以保证`最大堆内存 + Java 堆起始位置小于 32位 * ObjectAlignmentInBytes`，默认 `ObjectAlignmentInBytes=8` 的情况即 32GB，我们还是可以让基址等于 0（因为最大对象内存大小也不会超过32GB，所以相当于对象可以从0开始），这样 `64 位地址 = （压缩对象指针 << 对象对齐偏移）`
![img](/images/jvm/memory/15.png)

但是，在`ObjectAlignmentInBytes=8` 的情况，如果最大堆内存太大，接近 32GB，想要保证最大堆内存 + Java 堆起始位置小于 32GB，那么 Java 堆起始位置其实就快接近 0 了，这显然不行。所以在最大堆内存接近 32GB 的时候，上面第二种优化也就失效了。但是我们可以让 Java 堆从一个与 `32GB 地址完全不相交的地址`开始（因为如果地址在32GB之内，由于系统需要一些虚拟内存，所以堆占用的内存肯定就小于32GB了，如果从完全不想交的地址开始，那么整个32GB都能用作堆内存，这样就不需要使用基址相加，而是取或即可），这样加法就可以优化为取或运算，即`64 位地址 = 基址 |（压缩对象指针 << 对象对齐偏移）`
![img](/images/jvm/memory/16.png)

最后，在`ObjectAlignmentInBytes=8` 的情况，如果用户通过 `HeapBaseMinAddress` 自己指定了 Java 堆开始的地址，并且与 32GB 地址相交，并最大堆内存 + Java 堆起始位置大于 32GB，但是最大堆内存没有超过 32GB，那么就无法优化了，只能 `64 位地址 = 基址 + （压缩对象指针 << 对象对齐偏移）`
![img](/images/jvm/memory/17.png)

总结下，上面我们说的那四种模式，对应 JVM 中的压缩对象指针的四种模式（以下叙述基于 `ObjectAlignmentInBytes=8` 的情况，即默认情况）：

1. `32-bit` 压缩指针模式：最大堆内存 + Java 堆起始位置不大于 4GB（并且 Java 堆起始位置不能太小），`64 位地址 = 压缩对象指针`
2. `Zero based` 压缩指针模式：最大堆内存 + Java 堆起始位置不大于 32GB（并且 Java 堆起始位置不能太小），`64 位地址 = （压缩对象指针 << 对象对齐偏移）`
3. `Non-zero disjoint` 压缩指针模式：`最大堆内存不大于 32GB`，由于要保证 Java 堆起始位置不能太小，最大堆内存 + Java 堆起始位置大于 32GB，`64 位地址 = 基址 |（压缩对象指针 << 对象对齐偏移）`
4. `Non-zero based` 压缩指针模式：用户通过 `HeapBaseMinAddress` 自己指定了 Java 堆开始的地址，并且与 32GB 地址相交，并最大堆内存 + Java 堆起始位置大于 32GB，但是`最大堆内存没有超过 32GB`，`64 位地址 = 基址 + （压缩对象指针 << 对象对齐偏移）`