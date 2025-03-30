---
title: Netty中的细节优化
tags:
  - Netty
  - 源码解析
categories:
  - Netty
abbrlink: 17349
date: 2025-02-12 20:02:22
---

### 优化 jdk 原生 selector 中 IO 就绪事件的插入和遍历效率

- 优化代码 `io.netty.channel.nio.NioEventLoop#openSelector`
- 原生的 jdk selector 实现是 `sun.nio.ch.SelectorImpl` 其中 IO 就绪事件存放容器是`Set`

![netty](/images/netty/01.png)

- `SelectedSelectionKeySet` 底层使用数组存储，减少了插入时的 hash 碰撞，遍历时又能利用 cpu 缓存提升效率

![netty](/images/netty/02.png)

### 优化客户端 channel 选择 reactor 的效率

- 从 reactor 数量是 2 的倍数时使用 & 运算

![netty](/images/netty/03.png)

- 从 reactor 数量不是 2 的倍数时使用取模运算

![netty](/images/netty/04.png)

### 解决 JDK epoll 空轮训 bug

由于`JDK NIO Epoll的空轮询BUG`存在，这样会导致`Reactor线程`在没有任何事情可做的情况下被意外唤醒，导致 CPU 空转。

其实 Netty 也没有从根本上解决这个`JDK BUG`，而是选择巧妙的绕过这个`BUG`

![netty](/images/netty/05.png)

### 对象池的设计

- stack 是对象池中真正用来存储池化对象的地方；为了避免这种不必要的同步竞争，Netty 也采用了类似 TLAB 分配内存的方式，每个线程拥有一个独立 Stack，这样当多个线程并发从对象池中获取对象时，都是从自己线程中的 Stack 中获取，全程无锁化运行。大大提高了多线程从对象池中获取对象的效率
