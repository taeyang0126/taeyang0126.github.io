---
title: loom
tags:
  - loom
  - 虚拟线程
  - java
categories:
  - loom
abbrlink: 17349
date: 2025-02-19 20:51:22
---

- [openjdk loom](https://wiki.openjdk.org/display/loom)
- [虚拟线程](https://openjdk.org/jeps/444)
- [结构化并发](https://openjdk.org/jeps/480)
- [虚拟线程网络IO实现原理](https://inside.java/2021/05/10/networking-io-with-virtual-threads/)
- [Project Loom: Java虚拟机的纤程和计算续体](https://cr.openjdk.org/~rpressler/loom/Loom-Proposal.html)
- [State of Loom: part 1](https://cr.openjdk.org/~rpressler/loom/loom/sol1_part1.html)
- [State of Loom: part 2](https://cr.openjdk.org/~rpressler/loom/loom/sol1_part2.html)
- [虚拟线程不推荐上生产的思考](https://zhuanlan.zhihu.com/p/685013298)
- [Java 虚拟线程截止 2024-3-10 在 OpenJDK 还没有解决消息的问题](https://zhuanlan.zhihu.com/p/686222059)
- [Scoped Values](https://openjdk.org/jeps/481)

### pin 
> We say that a virtual thread is `pinned` to its carrier if it is mounted but is in a state in which it cannot be unmounted. If a virtual thread blocks while pinned, it blocks its carrier. This behavior is still correct, but it holds on to a worker thread for the duration that the virtual thread is blocked, making it unavailable for other virtual threads.
- Java 代码调用本地代码 (JNI)
- synchronized 块或方法

#### 减少pin发生
-  synchronized 保护的普通 I/O 操作，请用 `ReentrantLock` 替换监视器，（如果可以的话，使用性能更高的 `StampedLock` 效果会更好）。

#### 目前进度
1. Synchronization
   - synchronized最终会解决，但是JNI不会处理
   - java.util.concurrent 中部分已经调整，比如LockSupport.park / unpark 但是还有大部分的工作
2. I/O
   - java.nio.channels 和 ServerSocketChannel 和 DatagramChannel 类改造为支持虚拟线程。当它们的同步操作（如 read 和 write ）在虚拟线程上执行时，在底层仅使用非阻塞 I/O。
   - getHostName 、 getCanonicalHostName 和 getByName 方法的 DNS 查找仍然委托给操作系统,而操作系统仅提供一个阻塞操作系统线程的 API。正在探索替代方案。
   - Http(s)URLConnection 和 TLS/SSL 的实现已更改为依赖 j.u.c 锁并避免pin
   - 文件 I/O 存在问题。内部,JDK 对文件使用缓冲 I/O,即使读取操作会阻塞,也始终报告可用字节数。在 Linux 上,我们计划使用 io_uring 进行异步文件 I/O,同时我们正在使用 ForkJoinPool.ManagedBlocker 机制,通过向工作池添加更多 OS 线程来平滑阻塞文件 I/O 操作。