---
title: JVM与JFR事件-你可能没必要 Heap Dump
abbrlink: 19346
date: 2025-02-22 15:25:52
tags: [JVM, JFR, 监控, 对象分配, OOM, Heap Dump]
categories: [JFR]
---

### OutOfMemoryError
> 很多情况会导致 Java 应用抛出 `OutOfMemoryError` [参考 StackOverflowError 与 OutOfMemoryError](https://zhuanlan.zhihu.com/p/265039643)

#### 会触发`HeapDumpOnOutOfMemoryError`
- `OutOfMemoryError: Java heap space` 和 `OutOfMemoryError: GC overhead limit exceeded` ：这两个都是 Java 对象堆内存不够了，一个是分配的时候发现剩余空间不足，一个是到达某一界限
- `OutOfMemoryError: Requested array size exceeds VM limit` ：当申请的数组大小超过堆内存限制，就会抛出这个异常
- `OutOfMemoryError: Compressed class space` 和 `OutOfMemoryError: Metaspace` ：这两个都和元空间相关（[底层原理](https://juejin.cn/post/7225879724545835045)）
- `Shenandoah` 分配区域位图，内存的时候，触发的 OutOfMemoryError

#### 不会触发`HeapDumpOnOutOfMemoryError`
- **OutOfMemoryError: unable to create native thread** ：无法创建新的平台线程
- **OutOfMemoryError: Cannot reserve xxx bytes of direct buffer memory (allocated: xxx, limit: xxx)** ：在 DirectByteBuffer 中，首先向 Bits 类申请额度， Bits 类有一个全局的 totalCapacity 变量，记录着全部DirectByteBuffer 的总大小，每次申请，都先看看是否超限，可用 `-XX:MaxDirectMemorySize` 限制（未指定默认与-Xmx相同）
- **OutOfMemoryError: map failed** ：这个是 File MMAP （文件映射内存）时，如果系统内存不足，就会抛出这个异常
- OutOfMemoryError: Native heap allocation failed ，这个 Message 可能不同操作系统不一样，但是一般都有 native heap 。这个就和 Java 对象堆一般没关系，而是其他块内存无法申请导致的

### 为什么不建议打开`HeapDumpOnOutOfMemoryError`

#### `HeapDumpOnOutOfMemoryError` 的原理
- 进入安全点，所有应用线程暂停，针对 HeapDumpOnOutOfMemoryError，单线程（如果是 jcmd jmap 可以多线程）dump 堆为线程个数个文件。退出安全点。
- 将上面的多个文件，合并为一个，压缩。

#### `HeapDumpOnOutOfMemoryError` 的瓶颈
> 这里的瓶颈主要在于第一步写入，并且，主要瓶颈在磁盘 IO

- [AWS EFS （普通存储）](https://docs.aws.amazon.com/efs/latest/ug/performance.html)
- [AWS EBS （对标 SSD ）](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-volume-types.html)
- 对于一个 4G 大小的 Java 对象堆内存，如果是 EFS ，对标的应该是 100G 以内的磁盘，写入最少
  也需要大概 4 * 1024 / 300 = 13.65 秒（注意，这个是峰值性能），如果当时峰值性能被用完了，那
  么需要： 4 * 1024 / 15 = 273 秒。如果用 EBS ，那么也需要 4 * 1024 / 1000 = 4 秒。注意，这个
  计算的时间，是应用线程个完全处于安全点（即 Stop-the-world ）的时间，还没有考虑一个
  机器上部署多个容器实例的情况，考虑成本我们也不能堆每个微服务都使用 AWS EBS 这种（对标
  SSD ）。所以，建议还是不要打开 `HeapDumpOnOutOfMemoryError`

### 为什么觉得 90% 以上的内存泄漏问题没必要 Heap Dump 就能通过 JFR 定位到？

#### jfr配置
- jfc配置文件
```xml
<configuration version="2.0">
  <event name="jdk.ObjectAllocationOutsideTLAB">
      <setting name="enabled">true</setting>
      <setting name="stackTrace">true</setting>
  </event>
  <event name="jdk.ObjectAllocationSample">
      <setting name="enabled" control="object-allocation-enabled">true</setting>
      <setting name="throttle" control="allocation-profiling">5/s</setting>
      <setting name="stackTrace">true</setting>
  </event>
  <event name="jdk.AllocationRequiringGC">
      <setting name="enabled" control="gc-enabled-high">true</setting>
      <setting name="stackTrace">true</setting>
  </event>
  <event name="jdk.ZAllocationStall">
      <setting name="enabled">true</setting>
      <setting name="stackTrace">true</setting>
      <setting name="threshold">0 ms</setting>
  </event>
</configuration>
```
- ObjectAllocationOutsideTLAB：TLAB外的分配
- ObjectAllocationSample：TLAB外的以及申请新的TLAB的采样
- AllocationRequiringGC：某个对象分配失败导致gc采集，针对serial、parallel、G1 gc
- ZAllocationStall：ZGC中使用，当一个线程分配对象发现内存不够了，就会阻塞，从而生成此事件。"threshold">0 阻塞0ms以上都采集
  ZGC Allocation Stall事件为啥看不到触发内存溢出的业务代码呢？jdk23才可以
- JVM参数
  ```shell
  # stackdepth=256 是为了演示效果，一般不需要这么大
  # maxchunksize=128m 是为了演示效果，一般不需要这么大
  -Xmx256m
  -XX:StartFlightRecording=disk=true,maxsize=5000m,maxage=2d,settings=./default.jfc
  -XX:FlightRecorderOptions=maxchunksize=128m,repository=./,stackdepth=256
  ```

#### 大对象分配导致的问题

##### 问题1
> 某个请求有 bug，导致全表扫描，冲爆了 Java 对象堆内存。抛出了 OutOfMemoryError ，但是这是异常情况，可能无法输出堆栈日志，在茫茫众多的请求中很难找到这个请求
- 模拟了一个方法，从db返回结果非常大，直接导致OOM，输出的jfr如下
- ![img](/images/jfr/08.png)
- ![img](/images/jfr/09.png)
- ZGC查看如下图
  ![img](/images/jfr/10.png)

##### 问题2
> 用户累计订单量随着你的系统成熟越来越多，大历史订单量的用户越来越多。之前的代码有 bug ，用户订单列表实际是拉取每个用户的所有订单 内存分页。可能两个大历史订单量的用户同时查询的时候就会抛出 OutOfMemoryError ，就算不抛出也会频繁 GC 影响性能。
- 模拟了一个方法，多个大订单量的用户并发查询，可能没有导致OOM，但是会频繁的GC，输出的jfr如下
- ![img](/images/jfr/11.png)
- ![img](/images/jfr/12.png)

#### 小对象分配导致的问题

##### 问题3
> 某个请求会触发分配一个小对象放入类似于缓存的地方，但是这个小对象一直没有被回收，日积月累导致 FullGC 越来越频繁，最后
OutOfMemoryError
- 这种情况，可能导致 JFR 事件丢失，但是大概率不影响我们定位问题，因为是一连串的趋势可以看出来
- ![img](/images/jfr/13.png)
- ![img](/images/jfr/14.png)

##### 问题4
> 由于虚拟线程的引入，原来进程内处理请求的数量一定程度受限于 IO 以及线程数量，现在则是受限于 Java 对象堆内存大小，如何识别这种`背压`问题。

### 为什么抛出 OutOfMemoryError 的微服务最好下线重启？
- 因为包括 JDK 的源码在内，都没有在每一个分配内存的代码的地方考虑会出现 OutOfMemoryError ，这样会导致代码
  状态不一致，例如 hashmap 的 rehash ，如果里面某行抛出 OutOfMemoryError ，前面更新的状态就不对了。
- 还有其他很多库，就不用说了，都很少有 catch Throwable 的，大部分是 catch Exception 的。并且，在每一个分配内
  存的代码的地方考虑会出现 OutOfMemoryError 也是不现实的，所以为了防止 OutOfMemoryError 带来意想不到的
  一致性问题，还是下线重启比较好。

### 如何实现抛出 OutOfMemoryError 的微服务下线重启？
- 一般通过 -XX:OnOutOfMemoryError="/path/to/script.sh" 指定脚本，脚本执行
  - 微服务的下线
  - 微服务的重启(可以依赖k8s)
- 针对 spring boot ，可以考虑开启允许本地访问 /actuator/shutdown 来关闭微服务（有群友反应抛出
  OutOfMemoryError 的时候调用这个会卡死，这是因为前面说的原因，你可能开启了
  HeapDumpOnOutOfMemoryError 导致的）， k8s 会自动拉起一个新的。
  - 因为`HeapDump`需要进入安全点，所有线程都 STW 了，导致k8s健康检查失败，从而k8s会自动拉起一个新的，导致dump失败