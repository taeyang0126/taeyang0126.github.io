---
title: jvm监控和故障处理工具
abbrlink: 58697
date: 2025-02-19 13:53:30
tags: [JVM, 监控, 工具]
categories: [JVM]
keywords: [JVM, 故障处理工具]
---

### 命令行处理工具
#### 1. jps
> 显示指定系统类所有的HotSpot虚拟机进程
```shell
# 显示所有java进程，输出主类的名称
jps -l
# 输出虚拟机进程启动时传给主类main()函数的参数
jps -m 
# 输出虚拟机启动时JVM参数
jps -v
```

#### 2. jstat
> 用于监控虚拟机各种运行状态信息的命令行工具。他可以显示本地或者远程虚拟机进程中的类装载、内存、垃圾收集、JIT编译等运行数据

> 命令格式: jstat [ option vmind [interval[s|ms]] [count] ]-printcompilation

- 选项`option`代表用户希望查询的虚拟机信息，主要分为3类: 类装载、垃圾收集、运行期编译状况 使用 `jstat -options` 获取支持的options

| 选项              | 作用                               | 例子                                                       |
|-----------------|----------------------------------|----------------------------------------------------------|
| -class          | 监视类装载、卸载数量、总空间以及类装载所耗费的时间        | ![img.png](/images/jvm/img.png)                               |
| -gc             | 监视java堆状况                        | ![img.png](assets/img2.png)  ![img.png](/images/jvm/img3.png) |
| -gccapacity     | 与-gc基本相同，主要关注堆各个区域使用到的最大最小空间     | ![img.png](/images/jvm/img4.png)                              |
| -gcutil         | 与-gc基本相同，主要关注已使用空间占总空间的百分比       | ![img.png](/images/jvm/img5.png)                              |
| -gccause        | 与-gcutil基本相同，但是会额外输出导致上一次GC产生的原因 | LGCC: 上一次垃圾收集的原因 GCC: 触发垃圾收集的原因                          |
| -gcnew          | 监视新生代GC状况                        |                   |
| -gcnewcapacity  | 与gcnew基本相同，主要关注使用到的最大、最小空间       |                         |
| -gcold          | 监视老年代GC状况                        |                   |
| -gcoldcapacity  | 与gcold基本相同，主要关注使用到的最大、最小空间       |                         |
| -gcmetacapacity | metaspace用的最大、最小空间               |                         |
| -compiler       | 输出JIT编译器编译过的方法、耗时等信息             |                         |
| -printcompilation       | 输出已经被JIT编译的方法                    |                         |

#### 3. jinfo
> Java配置信息工具。使用`jps -v`可以查看虚拟机启动时显示指定的参数列表，如果想知道未被显示指定的参数的系统默认值，可以使用 jinfo 的 -flag 选项查询

```shell
# 查看进程所有的参数
jinfo -flags #pid
# 查看某个参数
jinfo -flag UseG1GC #pid
```

#### 4. jmap
> jmap(Memory Map for Java) 命令用于生产堆快照(heapdump)。还可以查询finalize执行队列、java堆和metaspace的详细信息，如空间使用率、当前使用的是哪种收集器
```shell
# 使用 jmap 查看更多命令
jmap 
# 显示堆中对象统计信息，包括类、实例数量、合计容量
jmap -histo:live,file=histo.data #pid
# 生成dump快照 在线分析工具 https://heaphero.io/
jmap -dump:live,format=b,file=hh.bin #pid
```

#### 5. jstack
> 用于生成虚拟机当前时刻的线程快照
```shell
# 显示当前线程堆栈输出到某个文件
jstack -l 17723 > thread.info
```

#### 6. jcmd
> jcmd 是从 Java 7 开始引入的一个命令行工具。它提供了一种非常强大和灵活的方式来与 JVM 进行交互，可以用于诊断和监控 Java 应用程序。jcmd是以上工具的集合
```shell
# 列出所有可用命令
jcmd <pid> help
# 获取 JVM 运行时信息
jcmd <pid> VM.info
# 打印堆转储
jcmd <pid> GC.heap_dump <filename>
# 打印线程信息
jcmd <pid> Thread.print
# 打印系统属性
jcmd <pid> VM.system_properties
# 打印 JVM 配置参数
jcmd <pid> VM.flags
```

### 可视化处理工具
#### 1. JCconsole
> JConsole 是一个图形化界面，用于监控和配置 Java 应用程序。它提供了一些基本的监控功能，如线程、内存、垃圾回收、类加载等，并提供了插件机制，可以扩展到更复杂的监控需求。

a. 启动JConsole
```shell
# 位于jdk/bin目录下
open `sdk home java 17.0.11-zulu`/bin/jconsole
```

