---
title: FileIO
abbrlink: 45275
date: 2025-05-11 10:43:22
tags: [ JAVA, mmap, FileChannel, FileIO ]
categories: [ JAVA ]
cover: https://pic4.zhimg.com/v2-99ba5bbbf8253b2f492af33f457d68cf_1440w.jpg
---

> 本文基于 Linux 内核 5.4 版本进行讨论

- [从 Linux 内核角度探秘 JDK MappedByteBuffer（上）](https://zhuanlan.zhihu.com/p/687793377)
- [从 Linux 内核角度探秘 JDK MappedByteBuffer（下）](https://zhuanlan.zhihu.com/p/687796037)
- [MappedByteBuffer VS FileChannel：从内核层面对比两者的性能差异](https://zhuanlan.zhihu.com/p/689498356)

## FileChannel 读写文件过程

当我们使用 HeapByteBuffer 传入 FileChannel 的 read or write 方法对文件进行读写时，JDK 会首先创建一个临时的 DirectByteBuffer，对于 `FileChannel#read` 来说，JDK 在 native 层会将 read 系统调用从文件中读取的内容首先存放到这个临时的 DirectByteBuffer 中，然后在拷贝到 HeapByteBuffer 中返回。

对于 `FileChannel#write` 来说，JDK 会首先将 HeapByteBuffer 中的待写入数据拷贝到临时的 DirectByteBuffer 中，然后在 native 层通过 write 系统调用将 DirectByteBuffer 中的数据写入到文件的 `page cache` 中。

```java
public class IOUtil {

   static int read(FileDescriptor fd, ByteBuffer dst, long position,
                    NativeDispatcher nd)
        throws IOException
    {
        // 如果我们传入的 dst 是 DirectBuffer，那么直接进行文件的读取
        // 将文件内容读取到 dst 中
        if (dst instanceof DirectBuffer)
            return readIntoNativeBuffer(fd, dst, position, nd);
  
        // 如果我们传入的 dst 是一个 HeapBuffer，那么这里就需要创建一个临时的 DirectBuffer
        // 在调用 native 方法底层利用 read  or write 系统调用进行文件读写的时候
        // 传入的只能是 DirectBuffer
        ByteBuffer bb = Util.getTemporaryDirectBuffer(dst.remaining());
        try {
            // 底层通过 read 系统调用将文件内容拷贝到临时 DirectBuffer 中
            int n = readIntoNativeBuffer(fd, bb, position, nd);    
            if (n > 0)
                // 将临时 DirectBuffer 中的文件内容在拷贝到 HeapBuffer 中返回
                dst.put(bb);
            return n;
        }
    }

    static int write(FileDescriptor fd, ByteBuffer src, long position,
                     NativeDispatcher nd) throws IOException
    {
        // 如果传入的 src 是 DirectBuffer，那么直接将 DirectBuffer 中的内容拷贝到文件 page cache 中
        if (src instanceof DirectBuffer)
            return writeFromNativeBuffer(fd, src, position, nd);
        // 如果传入的 src 是 HeapBuffer，那么这里需要首先创建一个临时的 DirectBuffer
        ByteBuffer bb = Util.getTemporaryDirectBuffer(rem);
        try {
            // 首先将 HeapBuffer 中的待写入内容拷贝到临时的 DirectBuffer 中
            // 随后通过 write 系统调用将临时 DirectBuffer 中的内容写入到文件 page cache 中
            int n = writeFromNativeBuffer(fd, bb, position, nd);     
            return n;
        } 
    }
}
```

### 为什么必须要在 DirectByteBuffer 中做一次中转

![](https://pic4.zhimg.com/v2-a2de0421c5fda585ce677e1121314e23_1440w.jpg)

1. JVM 中的这些 native 方法是处于 safepoint 之下的，执行 native 方法的线程由于是处于 safepoint 中，所以在执行 native 方法的过程中可能会有 GC 的发生
2. 如果把一个 HeapByteBuffer 传递给 native 层进行文件读写的时候不巧发生了 GC，那么 HeapByteBuffer 背后的内存地址就会变化，这样一来，如果我们在读取文件的话，内核将会把文件内容拷贝到另一个内存地址中。如果我们在写入文件的话，内核将会把另一个内存地址中的内存写入到文件的 page cache 中
3. 在通过 native 方法执行相关系统调用的时候必须要保证传入的内存地址是不会变化的，由于 DirectByteBuffer 背后所依赖的 Native Memory 位于 JVM 堆之外，是不会受到 GC 管理的，因此不管发不发生 GC，DirectByteBuffer 所引用的这些 Native Memory 地址是不会发生变化的
4. 将 HeapByteBuffer 中的内容拷贝到临时的 DirectByteBuffer 这个过程中是不会发生 GC 的，因为 JVM 这里会使用 `Unsafe#copyMemory` 方法来实现 HeapByteBuffer 到 DirectByteBuffer 的拷贝操作，copyMemory 被 JVM 实现为一个 `intrinsic` 方法，中间是没有 safepoint 的，执行 copyMemory 的线程由于不在 safepoint 中，所以在拷贝的过程中是不会发生 GC 的。
```java
public final class Unsafe {
  // intrinsic 方法
  public native void copyMemory(Object srcBase, long srcOffset,
                                  Object destBase, long destOffset,
                                  long bytes);  
}
```
### FileChannel 对文件的读流程

![](https://pic4.zhimg.com/v2-99ba5bbbf8253b2f492af33f457d68cf_1440w.jpg)

1.  当 JVM 在 native 层使用 read 系统调用进行文件读取的时候，JVM 进程会发生**第一次上下文切换**，从用户态转为内核态。
2.  随后 JVM 进程进入虚拟文件系统层，在这一层内核首先会查看读取文件对应的 page cache 中是否含有请求的文件数据，如果有，那么直接将文件数据**拷贝**到 DirectByteBuffer 中返回，避免一次磁盘 IO。并根据内核预读算法从磁盘中异步预读若干文件数据到 page cache 中
3.  如果请求的文件数据不在 page cache 中，则会进入具体的文件系统层，在这一层内核会启动磁盘块设备驱动触发真正的磁盘 IO。并根据内核预读算法同步预读若干文件数据。请求的文件数据和预读的文件数据将被一起填充到 page cache 中。
4.  磁盘控制器 DMA 将从磁盘中读取的数据拷贝到页高速缓存 page cache 中。发生**第一次数据拷贝**。
5.  由于 page cache 是属于内核空间的，不能被 JVM 进程直接寻址，所以还需要 CPU 将 page cache 中的数据拷贝到位于用户空间的 DirectByteBuffer 中，发生**第二次数据拷贝**。
6.  最后 JVM 进程从系统调用 read 中返回，并从内核态切换回用户态。发生**第二次上下文切换**。  

从以上过程我们可以看到，当使用 FileChannel#read 对文件读取的时候，如果文件数据在 page cache 中，涉及到的性能开销点主要有两次上下文切换，以及一次 CPU 拷贝。其中上下文切换是主要的性能开销点。

### FileChannel 对文件的写流程

![](https://pic4.zhimg.com/v2-47db9ba10664c46773d6f0da662ffc21_1440w.jpg)

1.  当 JVM 在 native 层使用 write 系统调用进行文件写入的时候，JVM 进程会发生**第一次上下文切换**，从用户态转为内核态。
2.  进入内核态之后，JVM 进程在虚拟文件系统层调用 vfs\_write 触发对 page cache 写入的操作。内核调用 iov\_iter\_copy\_from\_user\_atomic 函数将 DirectByteBuffer 中的待写入数据拷贝到 page cache 中。发生**第一次拷贝动作**（ CPU 拷贝）。
3.  当待写入数据拷贝到 page cache 中时，内核会将对应的文件页标记为脏页，内核会根据一定的阈值判断是否要对 page cache 中的脏页进行回写，如果不需要同步回写，进程直接返回。这里发生**第二次上下文切换**。
4.  脏页回写又会根据脏页数量在内存中的占比分为：进程同步回写和内核异步回写。当脏页太多了，进程自己都看不下去的时候，会同步回写内存中的脏页，直到回写完毕才会返回。在回写的过程中会发生**第二次拷贝**（DMA 拷贝）。  

从以上过程我们可以看到，当使用 FileChannel#write 对文件写入的时候，如果不考虑脏页回写的情况，单纯对于 JVM 这个进程来说涉及到的性能开销点主要有两次上下文切换，以及一次 CPU 拷贝。其中上下文切换仍然是主要的性能开销点。

---

## MappedByteBuffer 读写文件过程

![](https://picx.zhimg.com/v2-9921fd1e142ef404977d1be969f2a821_1440w.jpg)

首先我们需要通过 `FileChannel#map` 将文件的某个区域映射到 JVM 进程的虚拟内存空间中，从而获得一段文件映射的虚拟内存区域 MappedByteBuffer。由于底层使用到了 mmap 系统调用，所以这个过程也涉及到了**两次上下文切换**。

如上图所示，当 MappedByteBuffer 在刚刚映射出来的时候，它只是进程地址空间中的一段虚拟内存，其对应在进程页表中的页表项还是空的，背后还没有映射物理内存。此时映射文件对应的 page cache 也是空的，我们要映射的文件内容此时还静静地躺在磁盘中。

当 JVM 进程开始对 MappedByteBuffer 进行读写的时候，就会触发缺页中断，内核会将映射的文件内容从磁盘中加载到 page cache 中，然后在进程页表中建立 MappedByteBuffer 与 page cache 的映射关系。由于这里涉及到了缺页中断的处理，因此也会有**两次上下文切换**的开销。

![](https://pic4.zhimg.com/v2-9235731ee9c68d8b173c784d97b309e7_1440w.jpg)

后面 JVM 进程对 MappedByteBuffer 的读写就相当于是直接读写 page cache 了，关于这一点，很多读者朋友会有这样的疑问：page cache 是内核态的部分，为什么我们通过用户态的 MappedByteBuffer 就可以直接访问内核态的东西了？

这里大家不要被内核态这三个字给唬住了，虽然 page cache 是属于内核部分的，但其本质上还是一块普通的物理内存，想想我们是怎么访问内存的 ？ 不就是先有一段虚拟内存，然后在申请一段物理内存，最后通过进程页表将虚拟内存和物理内存映射起来么，进程在访问虚拟内存的时候，通过页表找到其映射的物理内存地址，然后直接通过物理内存地址访问物理内存。

回到我们讨论的内容中，这段虚拟内存不就是 MappedByteBuffer 吗，物理内存就是 page cache 啊，在通过页表映射起来之后，进程在通过 MappedByteBuffer 访问 page cache 的过程就和访问普通内存的过程是一模一样的。

也正因为 MappedByteBuffer 背后映射的物理内存是内核空间的 page cache，所以它不会消耗任何用户空间的物理内存（JVM 的堆外内存），因此也不会受到 `-XX:MaxDirectMemorySize` 参数的限制。

--- 

## MappedByteBuffer VS FileChannel

现在已经清楚了 FileChannel 以及 MappedByteBuffer 进行文件读写的整个过程，下面就来把两种文件读写方式放在一起来对比一下，但这里有一个对比的前提：
- 对于 **MappedByteBuffer** 来说，我们对比的是其在缺页处理之后，读写文件的开销。
- 对于 **FileChannel** 来说，我们对比的是文件数据已经存在于 page cache 中的情况下读写文件的开销。

因为笔者认为只有基于这个前提来对比两者的性能差异才有意义。

- 对于 FileChannel 来说，无论是通过 read 方法对文件的读取，还是通过 write 方法对文件的写入，它们都需要**两次上下文切换**，以及**一次 CPU 拷贝**，其中上下文切换是其主要的性能开销点。
- 对于 MappedByteBuffer 来说，由于其背后直接映射的就是 page cache，读写 MappedByteBuffer 本质上就是读写 page cache，整个读写过程和读写普通的内存没有任何区别，因此**没有上下文切换的开销，不会切态，更没有任何拷贝**。

从上面的对比我们可以看出使用 MappedByteBuffer 来读写文件既没有上下文切换的开销，也没有数据拷贝的开销（可忽略），简直是完爆 FileChannel。
既然 MappedByteBuffer 这么屌，那我们何不干脆在所有文件的读写场景中全部使用 MappedByteBuffer，这样岂不省事 ？JDK 为何还保留了 FileChannel 的 read , write 方法呢 ？让我们来带着这个疑问继续下面的内容~~

### 通过 Benchmark 从内核层面对比两者的性能差异
从两个方面来对比 MappedByteBuffer 和 FileChannel 的文件读写性能：
1. 文件数据完全加载到 page cache 中，并且将 page cache 锁定在内存中，不允许 swap，MappedByteBuffer 不会有缺页中断，FileChannel 不会触发磁盘 IO 都是直接对 page cache 进行读写。
2. 文件数据不在 page cache 中，我们加上了 缺页中断，磁盘IO，以及 swap 对文件读写的影响。

具体的测试思路是，用 MappedByteBuffer 和 FileChannel 分别以 64B ,128B ,512B ,1K ,2K ,4K ,8K ,32K ,64K ,1M ,32M ,64M ,512M 为单位依次对 1G 大小的文件进行读写，从以上两个方面对比两者在不同读写单位下的性能表现。

[测试代码](https://github.com/taeyang0126/JavaForge/tree/main/src/main/java/com/lei/java/forge/fileio)

测试环境:
- 处理器：M1 Max
- 内存：64 GB
- 操作系统：macOS
- JVM：OpenJDK 24-graal

#### 文件数据在 page cache 中

下面是 MappedByteBuffer 和 FileChannel 在不同数据集下对 page cache 的读取性能测试结果:

![img.png](../../images/java/02.png)

能看出在 page cache 下 mmap 性能好于 fileChannel，这与 [bin神文章](https://zhuanlan.zhihu.com/p/689498356) 测试结果不一致！！但是能看出随着文件越来越大，FileChannel与 mmap 的性能差距越来越小，至于实际环境使用哪个，需要根据实际情况测试后进行选择

下面是 MappedByteBuffer 和 FileChannel 在不同数据集下对 page cache 的写入性能测试结果:

![img.png](../../images/java/03.png)

#### 文件数据不在 page cache 中

下面是 MappedByteBuffer 和 FileChannel 在不同数据集下对文件的读取性能测试结果:

![img.png](../../images/java/04.png)

从这里我们可以看到，在加入了缺页中断和磁盘 IO 的影响之后，MappedByteBuffer 在缺页中断的影响下平均比之前多出了 100 ms 的开销。FileChannel 在磁盘 IO 的影响下平均比之前多出了 50 ms 的开销。

下面是 MappedByteBuffer 和 FileChannel 在不同数据集下对文件的写入性能测试结果:

![img.png](../../images/java/05.png)

#### 为什么数据量越大，性能差距越小，甚至 fileChannel 好于 mmap？

##### mmap 的性能开销
1. MappedByteBuffer 的主要性能开销是在缺页中断，缺页中断会涉及上下文的切换
2. MappedByteBuffer 的缺页中断也有磁盘IO 也有预读
3. MappedByteBuffer 是需要进程页表支持的，在实际访问内存的过程中会遇到页表竞争以及 TLB shootdown 等问题
4. MappedByteBuffer 刚刚被映射出来的时候，其在进程页表中对应的各级页表以及页目录可能都是空的。所以缺页中断这里需要做的一件非常重要的事情就是补齐完善 MappedByteBuffer 在进程页表中对应的各级页目录表和页表，并在页表项中将 page cache 映射起来，最后还要刷新 TLB 等硬件缓存

##### FileChannel 的性能开销
1. FileChannel 的主要开销是在系统调用，会涉及上下文的切换
2. FileChannel 在读写文件的时候有磁盘IO，有预读

理论上来讲 MappedByteBuffer 应该是完爆 FileChannel 才对啊，因为 MappedByteBuffer 没有系统调用的开销，为什么性能在后面反而被 FileChannel 追赶甚至超越呢？根据上面的性能开销分析，实际上 mmap 的缺页中断要比 FileChannel 的系统调用开销要大。从上面的测试也能看出来，MappedByteBuffer 在缺页中断的影响下平均比之前多出了 100 ms 的开销，FileChannel 在磁盘 IO 的影响下平均比之前多出了 50 ms 的开销。

MappedByteBuffer 的缺页中断是平均每 4K 触发一次，而 FileChannel 的系统调用开销则是每次都会触发。当两者单次按照小数据量读取 1G 文件的时候，MappedByteBuffer 的缺页中断较少触发，而 FileChannel 的系统调用却在频繁触发，所以在这种情况下，FileChannel 的系统调用是主要的性能瓶颈。

这也就解释了当我们在**频繁读写小数据量的时候，MappedByteBuffer 的性能具有压倒性优势**。当单次读写的数据量越来越大的时候，FileChannel 调用的次数就会越来越少，**这时候缺页中断就会成为 MappedByteBuffer 的性能瓶颈，到某一个点之后，FileChannel 就会反超 MappedByteBuffer。因此当我们需要高吞吐量读写文件的时候 FileChannel 反而是最合适的**。

##### 脏页回写对应性能的性能

内核的脏页回写也会对 MappedByteBuffer 以及 FileChannel 的文件写入性能有非常大的影响，无论是我们在用户态中调用 fsync 或者 msync 主动触发脏页回写还是内核通过 pdflush 线程异步脏页回写，当我们使用 MappedByteBuffer 或者 FileChannel 写入 page cache 的时候，如果恰巧遇到文件页的回写，那么写入操作都会有非常大的延迟，这个在 MappedByteBuffer 身上体现的更为明显。

###### 脏页回写对 FileChannel 的写入影响
```c
struct page *grab_cache_page_write_begin(struct address_space *mapping,
          pgoff_t index, unsigned flags)
{
  struct page *page;
  // 在 page cache 中查找写入数据的缓存页
  page = pagecache_get_page(mapping, index, fgp_flags,
      mapping_gfp_mask(mapping));
  if (page)
    wait_for_stable_page(page);
  return page;
}
```
`wait_for_stable_page`，这个函数的作用就是判断当前 page cache 中的这个文件页是否正在被回写，如果正在回写到磁盘，那么**当前进程就会阻塞直到脏页回写完毕**。等到脏页回写完毕之后，进程才会调用 `iov_iter_copy_from_user_atomic` 将待写入数据拷贝到 page cache 中，最后在 write_end 中调用 `mark_buffer_dirty` 将写入的文件页标记为脏页。

除了正在回写的脏页会阻塞 FileChannel 的写入过程之外，如果此时系统中的脏页太多了，超过了 dirty_ratio 或者 dirty_bytes 等内核参数配置的脏页比例，那么进程就会同步去回写脏页，这也对写入性能有非常大的影响。

###### 脏页回写对 MappedByteBuffer 的写入影响

**通过 MappedByteBuffer 写入 page cache 之后，page cache 中的相应文件页是怎么变脏的 ？**

MappedByteBuffer 不会走系统调用，直接读写的就是 page cache，而 page cache 也只是内核在软件层面上的定义，它的本质还是物理内存。另外脏页以及脏页的回写都是**内核**在软件层面上定义的概念和行为。MappedByteBuffer 直接写入的是硬件层面的物理内存（page cache），硬件哪管你软件上定义的脏页以及脏页回写啊，没有内核的参与，那么在通过 MappedByteBuffer 写入文件页之后，文件页是如何变脏的呢 ？还有就是 MappedByteBuffer 如何探测到对应文件页正在回写并阻塞等待呢 ？

既然我们涉及到了软件的概念和行为，那么一定就会有内核的参与，我们回想一下整个 MappedByteBuffer 的生命周期，唯一一次和内核打交道的机会就是缺页中断，我们看看能不能在缺页中断中发现点什么~

当 MappedByteBuffer 刚刚被 mmap 映射出来的时候它还只是一段普通的虚拟内存，背后什么都没有，其在进程页表中的各级页目录项以及页表项都还是空的。

当我们立即对 MappedByteBuffer 进行写入的时候就会发生缺页中断，在缺页中断的处理中，内核会在进程页表中补齐与 MappedByteBuffer 映射相关的各级页目录并在页表项中与 page cache 进行映射。

```c
static vm_fault_t do_shared_fault(struct vm_fault *vmf)
{
    // 从 page cache 中读取文件页
    ret = __do_fault(vmf);   
    if (vma->vm_ops->page_mkwrite) {
        unlock_page(vmf->page);
        // 将文件页变为可写状态，并设置文件页为脏页
        // 如果文件页正在回写，那么阻塞等待
        tmp = do_page_mkwrite(vmf);
    }
}
```

除此之外，内核还会调用 do_page_mkwrite 方法将 MappedByteBuffer 对应的页表项变成可写状态，并将与其映射的文件页立即设置为脏页，如果此时文件页正在回写，那么 MappedByteBuffer 在缺页中断中也会阻塞。

```c
int block_page_mkwrite(struct vm_area_struct *vma, struct vm_fault *vmf,
    get_block_t get_block)
{
 set_page_dirty(page);
 wait_for_stable_page(page);
}
```
这里我们可以看到 MappedByteBuffer 在内核中是先变脏然后在对 page cache 进行写入，而 FileChannel 是先写入 page cache 后在变脏。

从此之后，通过 MappedByteBuffer 对 page cache 的写入就会变得非常丝滑，那么问题来了，当 page cache 中的脏页被内核异步回写之后，内核会把文件页中的脏页标记清除掉，那么这时如果 MappedByteBuffer 对 page cache 写入，**由于不会发生缺页中断，那么 page cache 中的文件页如何再次变脏呢** ？

内核这里的设计非常巧妙，当内核回写完脏页之后，会调用 page_mkclean_one 函数清除文件页的脏页标记，在这里会首先通过 page_vma_mapped_walk 判断该文件页是不是被 mmap 映射到进程地址空间的，如果是，那么说明该文件页是被 MappedByteBuffer 映射的。随后内核就会做一些特殊处理：
1. 通过 pte_wrprotect 对 MappedByteBuffer 在进程页表中对应的页表项 pte 进行写保护，变为只读权限。
2. 通过 pte_mkclean 清除页表项上的脏页标记。

```c
static bool page_mkclean_one(struct page *page, struct vm_area_struct *vma,
       unsigned long address, void *arg)
{

 while (page_vma_mapped_walk(&pvmw)) {
  int ret = 0;

  address = pvmw.address;
  if (pvmw.pte) {
   pte_t entry;
   entry = ptep_clear_flush(vma, address, pte);
   entry = pte_wrprotect(entry);
   entry = pte_mkclean(entry);
   set_pte_at(vma->vm_mm, address, pte, entry);
  }
 return true;
}
```

这样一来，在脏页回写完毕之后，MappedByteBuffer 在页表中就变成**只读**的了，这一切对用户态的我们都是透明的，当再次对 MappedByteBuffer 写入的时候就不是那么丝滑了，**会触发写保护缺页中断**（我们以为不会有缺页中断，其实是有的），**在写保护中断的处理中，内核会重新将页表项 pte 变为可写，文件页标记为脏页**。如果文件页正在回写，缺页中断会阻塞。如果脏页积累的太多，这里也会同步回写脏页。

```c
static vm_fault_t wp_page_shared(struct vm_fault *vmf)
    __releases(vmf->ptl)
{
    if (vma->vm_ops && vma->vm_ops->page_mkwrite) {
        // 设置页表项为可写
        // 标记文件页为脏页
        // 如果文件页正在回写则阻塞等待
        tmp = do_page_mkwrite(vmf);
    } 
    // 判断是否需要同步回写脏页，
    fault_dirty_shared_page(vma, vmf->page);
    return VM_FAULT_WRITE;
}
```

**所以并不是对 MappedByteBuffer 调用 mlock 之后就万事大吉了，在遇到脏页回写的时候，MappedByteBuffer 依然会发生写保护类型的缺页中断**。在缺页中断处理中会等待脏页的回写，并且还可能会发生脏页的同步回写。这对 MappedByteBuffer 的写入性能会有非常大的影响。这就是为什么`RocketMQ`提供了读写分离的场景，如果我们通过 mappedByteBuffer 来高频地不断向 CommitLog 写入消息的话， page cache 中的脏页比例就会越来越大，而 page cache 回写脏页的时机是由内核来控制的，当脏页积累到一定程度，内核就会启动 pdflush 线程来将 page cache 中的脏页回写到磁盘中。
虽然现在 page cache 已经被我们 mlock 住了，但是我们在用户态无法控制脏页的回写，当脏页回写完毕之后，我们通过 mappedByteBuffer 写入文件时**仍然会触发写保护缺页中断**。这样也会加大 mappedByteBuffer 的写入延迟，产生性能毛刺。为了避免这种毛刺，所以产生了读写分离，后续 Broker 再对 CommitLog 写入消息的时候，首先会写到 writeBuffer 中，因为 writeBuffer 只是一段普通的堆外内存，不会涉及到脏页回写，因此 CommitLog 的写入过程就会非常平滑，不会有性能毛刺。而从 CommitLog 读取消息的时候仍然是通过 mappedByteBuffer 进行。


