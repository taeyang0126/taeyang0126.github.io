---
title: Socket
tags:
  - linux
  - 网络
  - socket
categories:
  - 网络
abbrlink: 17349
date: 2025-02-09 17:43:22
---

- [聊聊Netty那些事儿之从内核角度看IO模型](https://zhuanlan.zhihu.com/p/455352339)

### Socket 数据接收到 Epoll 处理流程

{% mermaid %}
sequenceDiagram
    participant S as Socket
    participant WQ as Wait Queue
    participant CB as Callback (ep_poll_callback)
    participant EP as eppoll_entry
    participant EI as epitem
    participant EPL as eventpoll

    S->>S: 接收数据
    S->>WQ: 触发等待队列
    WQ->>CB: 调用回调函数
    CB->>EP: container_of 找到 eppoll_entry
    EP->>EI: 访问 base 指针找到 epitem
    EI->>EPL: 将 epitem 加入活跃队列
{% endmermaid %}


1. 数据到达和初始处理： 
   - 网卡接收数据，通过 DMA 将数据放入 Ring Buffer。
   - 触发软中断，内核将数据包（sk_buff）放入 socket 的接收队列。
2. Socket 唤醒等待队列： 
   - Socket 检测到有新数据，开始唤醒其等待队列（wait_queue）中的等待者。
   - 获取其中一个 wait_queue_entry_t，这里不获取全部一是避免惊群效应，二是 epoll 场景下一般也只会有一个 wait_queue_entry_t
3. 回调函数触发： 
   - 对于 epoll 添加的等待项，其 wait_queue_entry_t 的回调函数是 ep_poll_callback。
   - 内核调用这个回调函数，传入 wait_queue_entry_t 指针作为参数。
4. 找到 eppoll_entry： 
   - 在 ep_poll_callback 函数中，使用 container_of 宏。
   - 通过 wait_queue_entry_t 指针，找到包含它的 eppoll_entry 结构。

    ```C
    struct eppoll_entry *pwq = container_of(wait, struct eppoll_entry, wait);
    ```

5. 从 eppoll_entry 到 epitem： 
   - eppoll_entry 结构中有一个 base 指针，直接指向关联的 epitem。

    ```C
    struct epitem *epi = pwq->base;
    ```

6. 获取 eventpoll 结构： 
   - epitem 结构中包含指向其关联的 eventpoll 结构的指针。

    ```C
    struct eventpoll *ep = epi->ep;
    ```

7. 将 epitem 加入活跃队列： 
   - 检查 epitem 是否已经在活跃队列中。
   - 如果不在，则将其添加到 eventpoll 的活跃队列（rdllist）中。

    ```C
    if (!ep_is_linked(&epi->rdllink))
        list_add_tail(&epi->rdllink, &ep->rdllist);
    ```

8. 唤醒等待的进程： 
   - 如果有进程正在等待 epoll 事件（通过 epoll_wait），唤醒它。
