---
title: JVM内存解析 - 2.JVM 内存申请与使用流程
abbrlink: 58697
date: 2025-03-01 15:46:30
tags: [JVM, 内存, linux内存]
categories: [JVM内存解析]
---

> 本文参考张哥 -> 全网最硬核 JVM 内存解析 - 2.JVM 内存申请与使用流程
- [JVM 内存申请与使用流程](https://juejin.cn/post/7225875600644407357)

## Linux 下内存管理模型简述
- [bin神系列文章深入理解linux内存](https://mp.weixin.qq.com/s?__biz=Mzg2MzU3Mjc3Ng==&mid=2247486732&idx=1&sn=435d5e834e9751036c96384f6965b328&chksm=ce77cb4bf900425d33d2adfa632a4684cf7a63beece166c1ffedc4fdacb807c9413e8c73f298&token=1468822011&lang=zh_CN&scene=21&key=d9f8952995f1859ec52d8f5d9e6ab4720ffabd5403c103322ee7ec6f45279c0d6ff004df4d91e603b8da30fc862da32560064a1680e06e498f1478dedf8d24cd54abfe5bbf80610ac6a1ecfcadeceb1ce74fd27e061bc962a5e9d18c369786619a9ac7ad030b16a0f350638aed32ec61ad2c47b2df53b2fffac6419c8a55feb1&ascene=2&uin=MTQxMDM0OTkyNA%3D%3D&devicetype=Windows+11+x64&version=6308011a&exportkey=n_ChQIAhIQLReSAiPPBq%2FrjeEsvhWLGhLpAQIE97dBBAEAAAAAAPboBnzhWE0AAAAOpnltbLcz9gKNyK89dVj0LB8MByB%2BLnarvTJ9k5LjHnaHSiRCVUH6zSSXMnbZ9AQCusp6IDK5hwtnugd9Du4BG2pqPuJHPIkVIcUMia320lXFN61yM%2F%2B2MKyl86soaJUlu0zu8x69eop1Fbdi4YBaoocZrDbr%2BBuq4hsy%2BKf6ElIQw%2B6gPfQqllJ5R86pa0DoVOjdnD2bi7ZuxdMyvcOPEu3pDa5H%2FBgY1A%2BDcifqtVZlp%2B5LoJKYNhtlZg1zOS06RY15Ry0DdonN38efMsG2Req%2F&acctmode=0&pass_ticket=ywhUvrTZ0ZCaWLuvLdidNGnNwyS7T41V%2BKEL2N0td3RvwmPJ%2BZREM3Zc0lit4wDxNhALtKqF2gPCKD6sLdagzA%3D%3D&wx_header=1&fontgear=2)

CPU 是通过寻址来访问内存的，目前大部分 CPU 都是 64 位的，即寻址范围是：`0x0000 0000 0000 0000 ~ 0xFFFF FFFF FFFF FFFF`，即可以管理 16EB 的内存。但是，实际程序并不会直接通过 CPU 寻址访问到实际的物理内存，而是通过引入 `MMU`（Memory Management Unit 内存管理单元）与实际物理地址隔了一层虚拟内存的抽象。这样，程序申请以及访问的其实是`虚拟内存地址`，MMU 会将这个虚拟内存地址`映射`为实际的物理内存地址。同时，`为了减少内存碎片，以及增加内存分配效率`，在 MMU 的基础上 Linux 抽象了`内存分页（Paging）`的概念，将虚拟地址按固定大小分割成`页`（默认是 4K，如果平台支持更多更大的页大小 JVM 也是可以利用的，我们后面分析相关的 JVM 参数会看到），并在页被实际使用写入数据的时候，`映射同样大小的实际的物理内存`（页帧，Page Frame），或者是在物理内存不足的时候，将某些不常用的页`转移到其他存储设备比如磁盘上`。

一般系统中会有多个进程使用内存，每个进程都有自己独立的虚拟内存空间，假设我们这里有三个进程，进程 A 访问的虚拟地址可以与进程 B 和进程 C 的虚拟地址相同，那么操作系统如何区分呢？即操作系统如何将这些虚拟地址转换为物理内存。这就需要页表了，页表也是每个进程独立的，操作系统会在给进程映射物理内存用来保存用户数据的时候，将物理内存保存到进程的页表里面。然后，进程访问虚拟内存空间的时候，通过页表找到物理内存：
![img](/images/jvm/memory/01.png)

页表如何将一个虚拟内存地址（我们需要注意一点，目前虚拟内存地址，用户空间与内核空间可以使用从 `0x0000 0000 0000 0000 ~ 0x0000 FFFF FFFF FFFF` 的地址，即 256TB），转化为物理内存的呢？下面我们举一个在 x86，64 位环境下四级页表的结构视图：
![img](/images/jvm/memory/02.png)

在这里，页表分为四个级别：PGD（Page Global Directory），PUD（Page Upper Directory），PMD（Page Middle Directory），PTE（Page Table Entry）。每个页表，里面的页表项，保存了指向下一个级别的页表的引用，除了最后一层的 PTE 里面的页表项保存的是指向用户数据内存的指针。如何将虚拟内存地址通过页表找到对应用户数据内存从而读取数据，过程是：
![img](/images/jvm/memory/03.png)
1. 取虚拟地址的 `39 ~ 47` 位（因为用户空间与内核空间可以使用从 0x0000 0000 0000 0000 ~ 0x0000 FFFF FFFF FFFF 的地址，即 47 位以下的地址）作为 offset，在`唯一`的 PGD 页面根据 offset 定位到 PGD 页表项 `pgd_t`
2. 使用 `pgd_t` 定位到具体的 PUD 页面
3. 取虚拟地址的 `30 ~ 38` 位作为 offset，在对应的 PUD 页面根据 offset 定位到 PUD 页表项 `pud_t`
4. 使用 `pud_t` 定位到具体的 PMD 页面
5. 取虚拟地址的 `21 ~ 29` 位作为 offset，在对应的 PMD 页面根据 offset 定位到 PMD 页表项 `pmd_t`
6. 使用 `pmd_t` 定位到具体的 PTE 页面
7. 取虚拟地址的 `12 ~ 20` 位作为 offset，在对应的 PTE 页面根据 offset 定位到 PTE 页表项 `pte_t`
8. 使用 `pte_t` 定位到具体的用户数据物理内存页面
9. 使用最后的 `0 ~ 11` 位作为 offset，对应到用户数据物理内存页面的对应 offset

如果每次访问虚拟内存，都需要访问这个页表翻译成实际物理内存的话，性能太差。所以一般 CPU 里面都有一个 `TLB`（Translation Lookaside Buffer，翻译后备缓冲）存在，一般它属于 CPU 的 MMU 的一部分。`TLB 负责缓存虚拟内存与实际物理内存的映射关系`，一般 TLB 容量很小。每次访问虚拟内存，先查看 TLB 中是否有缓存，如果没有才会去页表查询。
![img](/images/jvm/memory/04.png)
默认情况下，TLB 缓存的 key 为地址的 `12 ~ 47` 位，value 是实际的物理内存页面。这样前面从`第 1 到第 7 步`就可以被替换成访问 TLB 了：
1. 取虚拟地址的 `12 ~ 47` 位作为 key，访问 TLB，定位到具体的用户数据物理内存页面。
2. 使用最后的 `0 ~ 11` 位作为 offset，对应到用户数据物理内存页面的对应 offset。
![img](/images/jvm/memory/05.png)

TLB 整体可以容纳个数不多；页大小越大，TLB 能容纳的个数越少。但是整体看，TLB 能容纳的页大小还是增多的（比如 Nehalem 的 iTLB，页大小 4K 的时候，一共可以容纳 128 * 4 = 512K 的内存，页大小 2M 的时候，一共可以容纳 2 * 7 = 14M 的内存）

JVM 中很多地方需要知道页大小，JVM 在初始化的时候，通过系统调用 `sysconf(_SC_PAGESIZE)` 读取出页大小，并保存下来以供后续使用。参考源码：https://github.com/openjdk/jdk/blob/jdk-21%2B3/src/hotspot/os/linux/os_linux.cpp
```cpp
//设置全局默认页大小，通过 Linux::page_size() 可以获取全局默认页大小
Linux::set_page_size(sysconf(_SC_PAGESIZE));
if (Linux::page_size() == -1) {
    fatal("os_linux.cpp: os::init: sysconf failed (%s)",
      os::strerror(errno));
}
//将默认页大小加入可选的页大小列表，在涉及大页分配的时候有用
_page_sizes.add(Linux::page_size());
```

## JVM 主要内存申请分配流程

### 每个子系统 `Reserve` 内存
**第一步，JVM 的每个子系统**（例如 Java 堆，元空间，JIT 代码缓存，GC 等等等等），**如果需要的话，在初始化的时候首先 `Reserve` 要分配区域的最大限制大小的内存**（这个最大大小，需要按照`页大小对齐`（即是页大小的整数倍），默认页大小是前面提到的 `Linux::page_size()`），例如对于 Java 堆，就是最大堆大小（通过 `-Xmx` 或者 `-XX:MaxHeapSize`限制），还有对于代码缓存，也是最大代码缓存大小（通过 `-XX:ReservedCodeCacheSize` 限制）。Reserve 的目的是在虚拟内存空间划出一块内存专门给某个区域使用，这样做的好处是：
1. 隔离每个 JVM 子系统使用的内存的`虚拟空间`，这样在 JVM 代码有 bug 的时候（例如发生 Segment Fault 异常），通过报错中的`虚拟内存地址`可以快速定位到是哪个子系统出了问题。
2. 可以很方便的限制这个区域使用的最大内存大小。
3. 便于管理，`Reserve 不会触发操作系统分配映射实际物理内存`，这个区域可以在 Reserve 的区域内按需伸缩。
4. 便于一些 JIT 优化，例如我们故意将这个区域保留起来但是故意不将这个区域的虚拟内存映射物理内存，访问这块内存会造成 Segment Fault 异常。JVM 会预设 Segment Fault 异常的处理器，在处理器里面检查发生 Segment Fault 异常的内存地址属于哪个子系统的 Reserve 的区域，判断要做什么操作。后面我们会看到，null 检查抛出 `NullPointerException` 异常的优化，全局安全点，抛出 `StackOverflowError` 的实现，都和这个机制有关。

在 Linux 的环境下，Reserve 通过  `mmap(2)` 系统调用实现，参数传入 `prot = PROT_NONE`，`PROT_NONE` 代表不会使用，即`不能做任何操作，包括读和写`。如果 JVM 使用这块内存，会发生 Segment Fault 异常。

### 每个子系统按照各自策略向操作系统申请映射物理内存
**第二步，JVM 的每个子系统，按照各自的策略，通过 `Commit` 第一步 Reserve 的区域的`一部分扩展内存`（大小也一般页大小对齐的），从而`向操作系统申请映射物理内存`，通过 `Uncommit` 已经 Commit 的内存来释放物理内存给操作系统**

Commit 内存之后，并不是操作系统会立刻分配物理内存，而是在向 `Commit 的内存里面写入数据的时候，操作系统才会实际映射内存`，JVM 有对应的参数，可以在 Commit 内存后立刻写入 0 来强制操作系统分配内存，即 AlwaysPreTouch 这个参数


