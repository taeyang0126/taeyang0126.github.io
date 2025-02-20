---
title: JFR详解
abbrlink: 19346
date: 2025-02-20 14:13:52
tags: [JVM, JFR, 监控]
categories: [JFR]
---

- [本篇文章参考张哥JFR全系列](https://www.bilibili.com/video/BV1CBKLe9ECN?spm_id_from=333.788.videopod.sections&vd_source=3950f615078c921132561647ae6a1ddd)

## 为什么需要JFR?

### 我们需要一个持续的，低消耗的JVM层面与JDK层面的类似于 `OpenTelemetry` 标准的监控方式

- arthas: 主要用于实时定位问题，必须有问题线程，必须复现才能定位，没法事后定位，如果有应用问题也可能挂载不上。
JFR可以实现从JVM启动开始一直持续采集监控与事后定位，即使应用有问题卡住，也基本能通过JFR定位。
- APM 框架: 例如 micrometer，open-telemetry，Skywalking 等等，大部分基于 `Java Agent` 和侵入代码的方式结合实现，
这些对于JFR来说：
  - 这些框架没办法采集JVM层面的指标
  - JVM协调安全点，JVM卡住，Java应用有问题，CPU吃满等等，这些框架会受很大影响

### 结合学习 JVM + JDK 的最佳方式
- JFR 有哪些事件，为啥要采集这些事件
- 采集这些事件的机制
- 搞懂上面的问题，基本从 JVM 到 JDK 的任意一个细节都搞懂了，比如：
  - JVM GC 的时候有哪些阶段，每个阶段耗时与做了什么？看 GC 相关 JFR 事件
  - JVM Safepoint 是啥，有啥原因会进入 safePoint？看 Safepoint 相关 JFR 事件
  - JDK 中的 AQS 究竟基于啥，实现原理是啥？看 Thread Park 事件属性与对应线程栈

## JFR 如何实现高效
- ![img](/images/jfr/01.png)

## JFR 如何从 JVM 启动一开始监控到任意时候
> 突破 JFR 本身限制，不用 dumponexit，不用主动 dump

- JFR 写入磁盘的 Data Chunk，默认在临时目录(`java.io.tmpdir`)，这个可以通过
JFR 配置限制
  - `maxage`：限制保留的 JFR 事件的最早时间
  - `maxsize`：限制保留在本地磁盘临时文件的最大总大小
- Java 14开始，增加了 JFR Event Streaming 机制
  - 写入的临时文件不再是.part，而是.jfr，这样即使JMC无法解析，也可以使用jfr命令解析
  - java 14 引入定时任务定时（默认1s）执行 JFR Flush 将元数据刷入本地文件 Data Chunk，这样大概率最新的文件就是数据完整的，即可以被JMC解析

## 准备工作
### Java 17 以上的 JDK
> Azul、Corretto、OpenJdk随意

### JMC
> 下载最新版本即可，即 JMC 9

### WhiteBox
> `WhiteBox API` 是 HotSpot VM 自带的白盒测试工具，将内部的很多核心机制的API暴露出来，用于白盒测试 JVM，压测 JVM 特性，以及辅助学习理解JVM并调优参数

- 编译 WhiteBox API
  1. 拉取 openjdk 源码
    ```shell
    git clone --depth 1 --filter=blob:none --sparse https://github.com/openjdk/jdk
    cd jdk
    git sparse-checkout init --cone
    git sparse-checkout set test/lib/jdk/test/whitebox
    ```
  2. 新建 maven 空项目，将刚刚拉取的代码复制进去，执行 `maven package` 即可
  3. 将编译的 jar 包放在项目根目录，通过 maven 本地 system 依赖的方式将 jar 包加入依赖
  ![img](/images/jfr/02.png)
  4. 不想自己构建可以使用 [whitebox-1.0-SNAPSHOT.jar](/files/jfr/whitebox-1.0-SNAPSHOT.jar)
  5. 编写测试代码
     - 代码
      ```java
        public class TestWhiteBox {
        
        public static void main(String[] args) throws InterruptedException {
        
              /*
                  主要用于添加WhiteBox测试API的jar包，这个jar必须通过引导类加载器加载，因为它需要访问JVM内部功能，/a 表示append，将指定的jar追加到引导类路径末尾
                  -Xbootclasspath/a:/Users/wulei/IdeaProjects/learn/jfr/whitebox-1.0-SNAPSHOT.jar
        
                  解锁JVM诊断选项，启用一些默认被禁用的诊断/调试选项，这是使用WhiteBox API的前提条件
                  -XX:+UnlockDiagnosticVMOptions
        
                  启用WhiteBox测试API，WhiteBox API提供了访问JVM内部状态的能力
                  -XX:+WhiteBoxAPI
        
                  开启GC日志记录，输出带有gc标签的日志
                  -Xlog:gc
               */
        
              WhiteBox whiteBox = WhiteBox.getWhiteBox();
              // 获取 ReservedCodeCacheSize 这个 JVM flag 的值
              Long reservedCodeCacheSize = whiteBox.getUintxVMFlag("ReservedCodeCacheSize");
              System.out.println(reservedCodeCacheSize);
              // 打印内存各项指标
              whiteBox.printHeapSizes();
              // 执行 full GC
              whiteBox.fullGC();
              // 保持进程不退出，打印完整日志
              Thread.currentThread().join();
        
        }
        
      }
       ```
     - 启动VM Options
     ```shell
     -Xbootclasspath/a:/Users/wulei/IdeaProjects/learn/jfr/whitebox-1.0-SNAPSHOT.jar
     -XX:+UnlockDiagnosticVMOptions
     -XX:+WhiteBoxAPI
     -Xlog:gc
     ```
     - 执行结果，出现 NoSuchMethodError 错误没关系，因为打包的是最新的 whitebox，使用的jdk版本可能没有某些最新的api
     ![img](/images/jfr/03.png)