---
title: linux内核接收网络包
tags:
  - linux
  - 网络
  - socket
categories:
  - 网络
abbrlink: 17349
date: 2025-02-09 17:46:22
---



### RingBuffer

#### RingBuffer到底是什么?

> 是内存中的一块特殊区域，环形队列是笼统的说法，实际上包括`igb_rx_buffer` 环形队列数组、`e1000_adv_rx_desc` 环形队列数组及众多的skb

![img](/images/socket_02_01.png)

网卡在收到数据的时候以`DMA` 方式将包写到RingBuffer中。软中断收包的时候来这里将skb取走，并申请新的skb重新挂上去。

RingBuffer内存是预先分配的还是动态分配的？

指针数组是预先分配好的，而skb虽然也会预先分配好，但是在后面的收包过程中会不断的动态地分配申请

#### RingBuffer为什么会丢包？

- RingBuffer是有大小和长度限制的
- 使用 `ethtool -g eth0` 命令查看长度，Pre-set maximums 指的是最大值，Current hardware settings 表示当前设置，下图表示最大允许1024，目前设置为1024

![img](/images/socket_02_02.png)

- 查看是否有溢出情况发生  `ethtool -S eth0`，如果有溢出情况发生(ifconfig中体现为overruns指标增长)，表示有包因为RingBuffer装不下而被丢弃了，解决思路有两种
  - 加大RingBuffer长度 `ethtool -G eth0 rx 4096 tx 4096` ，此种方式只是临时解决，治标不治本
  - 开启多队列提升网络性能，打散队列的亲核性
  - 现在主流网卡基本上都支持多队列，通过`ethtool -l eth0` 进行查看，下图表示当前网卡支持的最大队列数是2，当前开启的也是2，通过sysfs也可以看到真正生效的队列数量。
  - ![img](/images/socket_02_03.png)
  - ![img](/images/socket_02_04.png)
  - 加大队列数量，可以使用 `ethtool -L eth0 combined 32` 
  - 如果发现某个cpu核心si特别高，可以考虑调整队列亲和的cpu核心
    - `cat /proc/interrupts`查看队列的硬件硬中断，下图显示输入队列0的中断号是25，队列1的中断号是27，通过这个中断号对应的`smp_affinity`可以查看到亲和的cpu核是哪个。下图显示的2在二进制中代表第二位是1，所以表示第2个cpu核心——CPU2
    - ![img](/images/socket_02_05.png)
    - ![img](/images/socket_02_06.png)
    - 每个队列都会有独立的、不同的中断号。所以不同的队列在将数据收取到自己的RingBuffer后，可以分别向不同的CPU发起硬中断通知。而在硬中断的处理中，发起软中断是基于当前核心的，这意味着**哪个核响应的硬中断，那么该硬中断发起的软中断任务就必然由这个核来处理**。
    - 通过设置每个队列中断号上的`smp_affinity`，将各个队列的硬中断打散到不同的cpu上。

### 网络相关的硬中断、软中断都是什么?

 在网卡将数据放到`RingBuffer` 之后，接着就发起`硬中断`，通知cpu进行处理。不过在硬中断的上下文里做的工作很少，将传过来的`poll_list` 添加到每个cpu变量`softnet_data` 的 `poll_list` 里面，接着触发`软中断` `NET_RX_SOFTIRQ`。在软中断中对softnet_data的设备列表poll_list进行遍历，执行网卡驱动提供的poll来收取网络包。处理完成后会送到协议栈的ip_rcv、udp_rcv、tcp_rcv_v4等函数中

poll_list 是个双向链表，存储待处理NAPI实例的链表。

一个网卡驱动程序通常会注册一个NAPI结构(struct napi_struct)，这个结构基本约等于一个接收队列，目的是为了减少硬中断的次数。在高并发网络中，频繁的接收到网络包导致频繁触发硬中断，浪费了CPU性能，通过NAPI一个队列中接收到网络包后将此队列信息传递给软中断，软中断处理程序在处理的时候先停止触发硬中断，专注接收包的处理，处理完成后再打开硬中断触发，大大减少了硬中断的触发。

### ksoftirqd内核线程是用来干嘛的?

- 机器上有几核，内核就会创建几个ksoftirqd线程出来
- 内核线程ksoftirqd包含了所有的软中断处理逻辑，软中断信息可以通过 `cat /proc/softirqs` 命令进行查看

![img](/images/socket_02_07.png)

### tcpdump是如何工作的？

> tcpdump工作在设备层，是通过虚拟协议的方式工作的。通过调用packet_create将抓包函数以协议的形式挂到ptype_all上。这个函数会将包送到协议栈函数(ip_rcv、arp_rcv)之前，将包先送到ptype_all抓包点。

- iptable/netfilter 主要是在IP、ARP等层实现的。如果配置过于复杂的规则，则会消耗过多的cpu，加大网络延迟
- tcpdump工作在设备层，将包送到ip层以前就能处理，而netfilter工作在IP、ARP等层，从下图来看，netfilter工作在tcpdump之后，所以iptable封禁规则不影响tcpdump抓包；但是发包过程恰恰相反，发包的时候netfilter先进行工作，在协议层就被过滤掉了，所以tcpdump什么都看不到。

![img](/images/socket_02_08.png)

### 网络接收过程中的CPU开销如何查看？

> 在网络包的接收过程中，主要工作集中在硬中断和软中断上，二者的消耗可以通过top命令进行查看

- 输入top命令后，再输入1即可查看。其中hi是CPU处理硬中断的开销，si是处理软中断的开销，都是以百分比的形式展现的。

![img](/images/socket_02_09.png)