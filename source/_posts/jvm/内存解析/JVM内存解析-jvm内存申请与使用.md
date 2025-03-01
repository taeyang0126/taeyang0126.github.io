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

Commit 内存之后，`并不是操作系统会立刻分配物理内存`，而是在向 `Commit 的内存里面写入数据的时候，操作系统才会实际映射内存`，JVM 有对应的参数，可以在 Commit 内存后立刻写入 0 来强制操作系统分配内存，即 `AlwaysPreTouch` 这个参数。

### JVM commit 的内存与实际占用内存的差异
前面一节我们知道了，JVM 中大块内存，基本都是先 `reserve` 一大块，之后 `commit` 其中需要的一小块，然后开始读写处理内存，在 Linux 环境下，底层基于 `mmap(2)` 实现。但是需要注意一点的是，commit 之后，内存并不是立刻被分配了物理内存，而是真正往内存中 `store` 东西的时候，才会真正映射物理内存，如果是 load 读取也是可能不映射物理内存的。

这其实是可能你平常看到但是忽略的现象，如果你使用的是 SerialGC，ParallelGC 或者 CMS GC，老年代的内存在有对象晋升到老年代之前，可能是不会映射物理内存的，虽然这块内存已经被 commit 了。并且年轻代可能也是随着使用才会映射物理内存。如果你用的是 ZGC，G1GC，或者 ShenandoahGC，那么内存用的会更激进些（主要因为分区算法划分导致内存被写入），`这是你在换 GC 之后看到物理内存内存快速上涨的原因之一`。JVM 有对应的参数，可以在 Commit 内存后立刻写入 0 来强制操作系统分配内存，即 `AlwaysPreTouch` 这个参数，这个参数我们后面会详细分析以及历史版本存在的缺陷。还有的差异，主要来源于在 uncommit 之后，系统可能还没有来的及将这块物理内存真正回收。

所以，JVM 认为自己 commit 的内存，与实际系统分配的物理内存，`可能是有差异的`，可能 JVM 认为自己 commit 的内存比系统分配的物理内存多，也可能少。这就是为啥 `Native Memory Tracking（JVM 认为自己 commit 的内存）与实际其他系统监控中体现的物理内存使用指标对不上的原因`。

## 大页分配 UseLargePages
前面提到了虚拟内存需要映射物理内存才能使用，这个映射关系被保存在内存中的`页表（Page Table）`。现代 CPU 架构中一般有 `TLB` （Translation Lookaside Buffer，翻译后备缓冲，也称为页表寄存器缓冲）存在，在里面保存了经常使用的页表映射项。TLB 的大小有限，一般 TLB 如果只能容纳小于 100 个页表映射项。 我们能让程序的虚拟内存对应的页表映射项都处于 TLB 中，那么能大大提升程序性能，这就要尽量减少页表映射项的个数：`页表项个数 = 程序所需内存大小 / 页大小`。我们要么缩小程序所需内存，要么增大页大小。我们一般会考虑`增加页大小`，这就大页分配的由来，JVM 对于堆内存分配也支持大页分配，用于优化大堆内存的分配。那么 Linux 环境中有哪些大页分配的方式呢？

### Linux 大页分配方式 - Huge Translation Lookaside Buffer Page (hugetlbfs)
[相关的 Linux 内核文档](https://www.kernel.org/doc/Documentation/vm/hugetlbpage.txt)

这是出现的比较早的大页分配方式，其实就是在之前提到的页表映射上面做文章：

**默认 4K 页大小**：
![img](/images/jvm/memory/03.png)

**PMD 直接映射实际物理页面，页面大小为 `4K * 2^9 = 2M`**：
![img](/images/jvm/memory/06.png)

**PUD 直接映射实际物理页面，页面大小为 `2M * 2^9 = 1G`**：
![img](/images/jvm/memory/07.png)

但是，要想使用这个特性，需要操作系统构建的时候开启 `CONFIG_HUGETLBFS` 以及 `CONFIG_HUGETLB_PAGE`。之后，大的页面通常是通过系统管理控制预先分配并放入池里面的。然后，可以通过 `mmap` 系统调用或者 `shmget,shmat` 这些 SysV 的共享内存系统调用使用大页分配方式从池中申请内存。

这种大页分配的方式，需要系统预设开启大页，预分配大页之外，对于代码也是有一定侵入性的，在灵活性上面查一些。但是带来的好处就是，性能表现上更加可控。另一种灵活性很强的 Transparent Huge Pages (THP) 方式，总是可能在性能表现上有一些意想不到的情况。

### Linux 大页分配方式 - Transparent Huge Pages (THP)
[相关的 Linux 内核文档](https://www.kernel.org/doc/Documentation/vm/transhuge.txt)

THP 是一种使用大页的第二种方法，它支持页面大小的自动升级和降级，这样对于用户使用代码基本没有侵入性，非常灵活。但是，前面也提到过，这种系统自己去做页面大小的升级降级，并且系统一般考虑通用性，所以在某些情况下会出现意想不到的性能瓶颈。

### JVM 大页分配相关参数与机制
相关的参数如下：
- `UseLargePages`：明确指定是否开启大页分配，如果关闭，那么下面的参数就都不生效。`在 linux 下默认为 false`。
- `UseHugeTLBFS`：明确指定是否使用前面第一种大页分配方式 hugetlbfs 并且通过 `mmap` 系统调用分配内存。在 linux 下默认为 false。
- `UseSHM`：明确指定是否使用前面第一种大页分配方式 hugetlbfs 并且通过 `shmget,shmat` 系统调用分配内存。在 linux 下默认为 false。
- `UseTransparentHugePages`：明确指定是否使用前面第二种大页分配方式 THP。在 linux 下默认为 false。
- `LargePageSizeInBytes`：指定明确的大页的大小，仅适用于前面第一种大页分配方式 hugetlbfs，并且必须属于操作系统支持的页大小否则不生效。默认为 0，即不指定

首先，需要对以上参数做一个简单的判断：如果没有指定 `UseLargePages`，那么使用对应系统的默认 `UseLargePages` 的值，在 linux 下是 false，那么就不会启用大页分配。如果启动参数明确指定 `UseLargePages` 不启用，那么也不会启用大页分配。如果读取 `/proc/meminfo` 获取默认大页大小读取不到或者为 0，则代表系统也不支大页分配，大页分配也不启用。

那么如果大页分配启用的话，我们需要初始化并验证大页分配参数可行性，流程是：
![img](/images/jvm/memory/08.png)

首先，JVM 会读取根据当前所处的平台与系统环境读取支持的页的大小，当然，这个是针对前面第一种大页分配方式 `hugetlbfs` 的。在 Linux 环境下，JVM 会从 `/proc/meminfo` 读取默认的 **`Hugepagesize`**，从 `/sys/kernel/mm/hugepages` 目录下检索**所有支持的大页大小**，这块可以参考源码：https://github.com/openjdk/jdk/blob/jdk-21%2B3/src/hotspot/os/linux/os_linux.cpp。
有关这些文件或者目录的详细信息，请参考前面章节提到的 Linux 内核文档：https://www.kernel.org/doc/Documentation/vm/hugetlbpage.txt

如果操作系统开启了 hugetlbfs，`/sys/kernel/mm/hugepages` 目录下的结构类似于：
```shell
tree /sys/kernel/mm/hugepages
/sys/kernel/mm/hugepages
├── hugepages-1048576kB
│   ├── demote
│   ├── demote_size
│   ├── free_hugepages
│   ├── nr_hugepages
│   ├── nr_hugepages_mempolicy
│   ├── nr_overcommit_hugepages
│   ├── resv_hugepages
│   └── surplus_hugepages
├── hugepages-2048kB
│   ├── demote
│   ├── demote_size
│   ├── free_hugepages
│   ├── nr_hugepages
│   ├── nr_hugepages_mempolicy
│   ├── nr_overcommit_hugepages
│   ├── resv_hugepages
│   └── surplus_hugepages
├── hugepages-32768kB
│   ├── demote
│   ├── demote_size
│   ├── free_hugepages
│   ├── nr_hugepages
│   ├── nr_hugepages_mempolicy
│   ├── nr_overcommit_hugepages
│   ├── resv_hugepages
│   └── surplus_hugepages
└── hugepages-64kB
    ├── free_hugepages
    ├── nr_hugepages
    ├── nr_hugepages_mempolicy
    ├── nr_overcommit_hugepages
    ├── resv_hugepages
    └── surplus_hugepages
```

这个 `hugepages-1048576kB` 就代表支持大小为 `1GB` 的页，`hugepages-2048kB` 就代表支持大小为 2MB 的页。

如果没有设置 `UseHugeTLBFS`，也没有设置 `UseSHM`，也没有设置 `UseTransparentHugePages`，那么其实就是走默认的，默认使用 `hugetlbfs` 方式，不使用 `THP` 方式，因为如前所述， THP 在某些场景下有意想不到的性能瓶颈表现，在大型应用中，稳定性优先于峰值性能。之后，默认优先尝试 `UseHugeTLBFS`（即使用 `mmap` 系统调用通过 hugetlbfs 方式大页分配），不行的话再尝试 `UseSHM`（即使用 `shmget` 系统调用通过 hugetlbfs 方式大页分配）。这里只是验证下这些大页内存的分配方式是否可用，只有可用后面真正分配内存的时候才会采用那种可用的大页内存分配方式。
