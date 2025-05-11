---
title: MappedByteBuffer VS FileChannel
abbrlink: 45275
date: 2025-05-11 10:43:22
tags: [ JAVA, mmap, FileChannel ]
categories: [ JAVA ]
cover: https://pic4.zhimg.com/v2-99ba5bbbf8253b2f492af33f457d68cf_1440w.jpg
---

> 本文基于 Linux 内核 5.4 版本进行讨论

- [MappedByteBuffer VS FileChannel：从内核层面对比两者的性能差异](https://zhuanlan.zhihu.com/p/689498356)

### FileChannel 读写文件过程

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

#### 为什么必须要在 DirectByteBuffer 中做一次中转

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
#### FileChannel 对文件的读流程

![](https://pic4.zhimg.com/v2-99ba5bbbf8253b2f492af33f457d68cf_1440w.jpg)

1.  当 JVM 在 native 层使用 read 系统调用进行文件读取的时候，JVM 进程会发生**第一次上下文切换**，从用户态转为内核态。
2.  随后 JVM 进程进入虚拟文件系统层，在这一层内核首先会查看读取文件对应的 page cache 中是否含有请求的文件数据，如果有，那么直接将文件数据**拷贝**到 DirectByteBuffer 中返回，避免一次磁盘 IO。并根据内核预读算法从磁盘中异步预读若干文件数据到 page cache 中
3.  如果请求的文件数据不在 page cache 中，则会进入具体的文件系统层，在这一层内核会启动磁盘块设备驱动触发真正的磁盘 IO。并根据内核预读算法同步预读若干文件数据。请求的文件数据和预读的文件数据将被一起填充到 page cache 中。
4.  磁盘控制器 DMA 将从磁盘中读取的数据拷贝到页高速缓存 page cache 中。发生**第一次数据拷贝**。
5.  由于 page cache 是属于内核空间的，不能被 JVM 进程直接寻址，所以还需要 CPU 将 page cache 中的数据拷贝到位于用户空间的 DirectByteBuffer 中，发生**第二次数据拷贝**。
6.  最后 JVM 进程从系统调用 read 中返回，并从内核态切换回用户态。发生**第二次上下文切换**。  

从以上过程我们可以看到，当使用 FileChannel#read 对文件读取的时候，如果文件数据在 page cache 中，涉及到的性能开销点主要有两次上下文切换，以及一次 CPU 拷贝。其中上下文切换是主要的性能开销点。

#### FileChannel 对文件的写流程

![](https://pic4.zhimg.com/v2-47db9ba10664c46773d6f0da662ffc21_1440w.jpg)

1.  当 JVM 在 native 层使用 write 系统调用进行文件写入的时候，JVM 进程会发生**第一次上下文切换**，从用户态转为内核态。
2.  进入内核态之后，JVM 进程在虚拟文件系统层调用 vfs\_write 触发对 page cache 写入的操作。内核调用 iov\_iter\_copy\_from\_user\_atomic 函数将 DirectByteBuffer 中的待写入数据拷贝到 page cache 中。发生**第一次拷贝动作**（ CPU 拷贝）。
3.  当待写入数据拷贝到 page cache 中时，内核会将对应的文件页标记为脏页，内核会根据一定的阈值判断是否要对 page cache 中的脏页进行回写，如果不需要同步回写，进程直接返回。这里发生**第二次上下文切换**。
4.  脏页回写又会根据脏页数量在内存中的占比分为：进程同步回写和内核异步回写。当脏页太多了，进程自己都看不下去的时候，会同步回写内存中的脏页，直到回写完毕才会返回。在回写的过程中会发生**第二次拷贝**（DMA 拷贝）。  

从以上过程我们可以看到，当使用 FileChannel#write 对文件写入的时候，如果不考虑脏页回写的情况，单纯对于 JVM 这个进程来说涉及到的性能开销点主要有两次上下文切换，以及一次 CPU 拷贝。其中上下文切换仍然是主要的性能开销点。

---

### MappedByteBuffer 读写文件过程

![](https://picx.zhimg.com/v2-9921fd1e142ef404977d1be969f2a821_1440w.jpg)

首先我们需要通过 `FileChannel#map` 将文件的某个区域映射到 JVM 进程的虚拟内存空间中，从而获得一段文件映射的虚拟内存区域 MappedByteBuffer。由于底层使用到了 mmap 系统调用，所以这个过程也涉及到了**两次上下文切换**。

如上图所示，当 MappedByteBuffer 在刚刚映射出来的时候，它只是进程地址空间中的一段虚拟内存，其对应在进程页表中的页表项还是空的，背后还没有映射物理内存。此时映射文件对应的 page cache 也是空的，我们要映射的文件内容此时还静静地躺在磁盘中。

当 JVM 进程开始对 MappedByteBuffer 进行读写的时候，就会触发缺页中断，内核会将映射的文件内容从磁盘中加载到 page cache 中，然后在进程页表中建立 MappedByteBuffer 与 page cache 的映射关系。由于这里涉及到了缺页中断的处理，因此也会有**两次上下文切换**的开销。

![](https://pic4.zhimg.com/v2-9235731ee9c68d8b173c784d97b309e7_1440w.jpg)

image.png

后面 JVM 进程对 MappedByteBuffer 的读写就相当于是直接读写 page cache 了，关于这一点，很多读者朋友会有这样的疑问：page cache 是内核态的部分，为什么我们通过用户态的 MappedByteBuffer 就可以直接访问内核态的东西了？

这里大家不要被内核态这三个字给唬住了，虽然 page cache 是属于内核部分的，但其本质上还是一块普通的物理内存，想想我们是怎么访问内存的 ？ 不就是先有一段虚拟内存，然后在申请一段物理内存，最后通过进程页表将虚拟内存和物理内存映射起来么，进程在访问虚拟内存的时候，通过页表找到其映射的物理内存地址，然后直接通过物理内存地址访问物理内存。

回到我们讨论的内容中，这段虚拟内存不就是 MappedByteBuffer 吗，物理内存就是 page cache 啊，在通过页表映射起来之后，进程在通过 MappedByteBuffer 访问 page cache 的过程就和访问普通内存的过程是一模一样的。

也正因为 MappedByteBuffer 背后映射的物理内存是内核空间的 page cache，所以它不会消耗任何用户空间的物理内存（JVM 的堆外内存），因此也不会受到 `-XX:MaxDirectMemorySize` 参数的限制。

--- 

