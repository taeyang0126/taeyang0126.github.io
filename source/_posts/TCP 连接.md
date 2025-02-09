---
title: TCP 连接
tags:
  - linux
  - 网络
  - tcp
categories:
  - 网络
abbrlink: 17349
date: 2025-02-09 17:45:22
---

### TCP 状态转换图

![img](/images/tcp_01_01.png)

### TCP 连接的分组交换

![img](/images/tcp_01_02.png)

- MSS（Maximum Segment Size）: 指定了 TCP 数据包中数据部分的最大长度
  - 一般约定最小是 536，因为 IPv4 规范中建议的最小 MTU 是 576，减去 20 字节的标准 IPv4 头的长度，再减去 20 字节的标准 TCP 头的长度，得到 536 字节
  - 一般约定最大是 1460，因为 IPv4 规范中建议的最大 MTU 是 1500
- MSS 以双方约定的最小值为准
- 请求 ACK 是服务端对客户端发送过来的数据包的响应
- 应答 ACK 是客户端对服务端发送过来的数据包的响应
- TIME_WAIT 状态
  - 主动关闭的那端经历了这个状态
  - 此状态的持续时间最长是 2MSL，MSL 在 RFC 1122 的建议值是 2 分钟，在 Berkeley 修改为 30s，意味着 TIME_WAIT 状态的持续时间在 1 分钟到 4 分钟之间
    - MSL 是任何 IP 数据报能存活的最长时间，因为每个数据报都有跳限（hop limit），最大是 255 跳
  - 此状态存在的理由
    - 可靠的实现 TCP 全双工连接的终止
    - 被动终止的一方会发送最终的 FIN，因此此端必须维护状态信息，以允许此端重新发送最终的 ACK。如果此端不维护状态信息了，那么会响应一个 **RST**，会被对端解释为一个错误
    - 允许老的重复分节在网络中消逝
    - 假设某个连接关闭了，然后在相同的客户端、服务器之间建立的一个新的连接，这个连接的四元组与之前关闭的连接完全一致，后一个连接称为前一个连接的化身。TCP 必须防止来自某个连接的老的重复分组在该连接已终止后再现，从而被误解成属于同一个连接的某个新的化身。为了做到这一点，TCP 将不给处于 TIME_WAIT 状态的连接发起新的化身。又因为 TIME_WAIT 最长存活时间为 2MSL，此时间足够旧连接的数据包消逝了

### Listen

> 最主要的工作就是`申请和初始化`接收队列，包括`全连接队列以及半连接队列`

```C
// fd、backlog
listen(fd, 128)
```

#### 全连接队列

> 全连接队列是一个链表，内核中使用链表的 head、tail，方便应用层直接根据头尾指针查找接入的连接

##### 全连接队列的长度

- 最大长度是 listen 传入的 backlog 和 net.core.somaxconn 之间较小的值。如果需要加大长度，需要调整这两个值。
- 使用 `cat /proc/sys/net/core/somaxconn` 命令查看
- 查看某个进程的全连接队列的长度，通过使用命令 **`ss -nlt`**进行查看，其中 **Send-Q** 表示全连接队列长度

![img](/images/tcp_01_03.png)

##### 判断全连接队列是否溢出

**`watch 'netstat -s | grep overflowed'`**

如果上述命令结果显示 **xx times the listen queue of a socket overflowed** 则说明有全连接队列溢出了

##### 半连接队列的长度

- 半连接队列的长度是 ***min（backlog，somaxconn，tcp_max_syn_backlog） + 1*** 再向上去整到 **2** 的 ***N*** 次幂，但最小不能小于 **16**
- `cat /proc/sys/net/ipv4/tcp_max_syn_backlog` 命令查看 tcp_max_syn_backlog
- 假设某内核参数 net.core.somaxconn=128，net.ipv4.tcp_max_syn_backlog=8192，用户 backlog=5，经过以下步骤计算得出为 16
  - min(backlog, somaxconn) = min(5, 128) = 5
  - min(5, tcp_max_syn_backlog) = min(5, 8192) = 5
  - max（5， 8） = 8  这一步是内核为了避免传入一个太小的值导致无法接收连接，所以必须要>=8
  - roundup_pow_of_two(8 + 1) = 16
- 假设某内核参数 net.core.somaxconn=128，net.ipv4.tcp_max_syn_backlog=8192，用户 backlog=512，经过以下步骤计算得出为 256
  - min(backlog, somaxconn) = min(512, 128) = 128
  - min(128, tcp_max_syn_backlog) = min(128, 8192) = 128
  - max(128, 8) = 128  
  - roundup_pow_of_two(128 + 1) = 256

##### 判断半连接队列是否溢出？

1. 计算办连接队列的长度
2. 查看当前SYN_RECV状态的连接数量

**`netstat -antp | grep SYN_RECV | wc -l`**

其实只需要保证 **`tcp_syncookies`** 这个内核参数是 **1** 就不会有半连接队列溢出的问题，👍🏻推荐开启此参数！！且开启此参数可以抵御 SYN flood 攻击

**`cat /proc/sys/net/ipv4/tcp_syncookies`** 通过此命令查看对应参数

**`echo 1 > /proc/sys/net/ipv4/tcp_syncookies`** 此命令进行修改

### Connect

客户端在执行 connect 函数的时候，把本地 socket 状态设置成了**`TCP_SYN_SENT`**，选了一个可用端口，接着发出 SYN 握手请求并启动重传定时器

#### 选择可用端口

1. 如果调用过 bind，那么以 bind 定义的端口为准，否则需要按照以下规则寻找可用的端口
2. 可用的端口范围是根据内核参数 **`net.ipv4.ip_local_port_range`**，此参数的范围就是能选择的端口范围，可以使用命令 **`cat /proc/sys/net/ipv4/ip_local_port_range`**进行查看，下图表示能使用的范围是 32768-60999。注意这里查找端口是循环的，如果需要很多轮才查找到可用的端口，会导致 connect 系统调用的 cpu 升高
   - ![img](/images/tcp_01_04.png)
3. 判断选择的端口是否在保留端口中，如果是则不能使用此端口。内核参数**`net.ipv4.ip_local_reserved_ports`** 表示保留端口，如果希望某些端口不被内核使用，将他们写到这个参数里面就可以。**`cat /proc/sys/net/ipv4/ip_local_reserved_ports`**
4. 判断选择的端口是否已经使用过了，内核会维护一个使用过的端口的 hash 表，如果在 hash 表中没有找到，证明此端口是可用的，后面会在此 hash 表中记录端口已经被使用
5. 如果上面还是没有找到合适的端口，就会出现 **Cannot assign requested address** 这个错误

#### 端口被使用过怎么办？

> 👆🏻选择可用端口的第四步判断端口是否已经使用过了，不是简单的判断端口是否使用过了，而是如果端口被使用过了，且**四元组完全一致**时才无法使用此端口，如果四元组有一个不一致，那么这个端口是可以使用的。

#### 发起 sync 请求

1. 申请一个 skb，并将其设置为`SYN`包
2. 添加到发送队列 `sk_write_queue` 
3. 调用`tcp_transmit_skb`将该包发出
4. 启动一个重传定时器，超时会重发。首次超时时间是在`TCP_TIMEOUT_INIT`宏中定义的

### 三次握手

![img](/images/tcp_01_05.png)

1. 第一次握手服务端只是创建了**`request sock`**，并加入到半连接队列中，并没有创建 socket，实际创建socket是在三次握手完成时。
2. TCP 连接建立的网络耗时大约需要三次传输，再加上少许的双方 cpu 开销，总共大约比 **1.5 倍 RTT** 大一点点。不过从客户端角度来看，只要 ACK 包发出了，内核就认为连接建立成功可以开始发送数据了，所以如果在客户端进行打点统计 TCP 连接建立耗时只需要两次传输耗时——即一个 RTT 多一点的时间（服务端也是同理，从 SYN 包接收到开始算起，到 ACK 包接收完毕）
