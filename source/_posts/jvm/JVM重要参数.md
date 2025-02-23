---
title: JVM重要参数
tags:
  - JVM
  - JVM参数
categories:
  - JVM
keywords:
  - JVM
abbrlink: 30107
date: 2025-02-09 14:08:56
---



### 常规启动配置参数

| 参数                                                         | 说明                                                         | 备注                                                         |
| :----------------------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| -XX:+PrintFlagsFinal                                         | 启动时打印出所有JVM参数                                      |                                                              |
| -XX:+HeapDumpOnOutOfMemoryError-XX:HeapDumpPath=/path/to/heap.hprof-XX:+ExitOnOutOfMemoryError | 开启OOM时堆转储指定dump文件位置发生 OOM 时强制 JVM 立即退出  | ！！dump hprof文件时要求内存比较大，这块后续要再找更好的方案 |
| -Xlog:gc*:file=gc.log::filecount=5,filesize=20M              | JDK 9+ 的新版 GC 日志参数-Xlog:  gc*                    # 记录所有gc相关日志  :file=gc.log          # 输出到gc.log文件  :                           # 空的tag过滤器  :filecount=5,         # 最多保留5个文件  filesize=20M          # 每个文件最大20MB | 等价  jdk8           -verbose:gc        -Xloggc:/path/to/gc.log        -XX:+PrintGCDetails        -XX:+PrintGCDateStamps        -XX:+PrintGCTimeStamps        -XX:+UseGCLogFileRotation        -XX:NumberOfGCLogFiles=5        -XX:GCLogFileSize=20M |
| -XX:StartFlightRecording=delay=1s,disk=true,dumponexit=true,filename=./logs/recording.jfr,maxsize=1024m,maxage=1d,path-to-gc-roots=true-XX:FlightRecorderOptions=stackdepth=128 | jfr启动参数，具体参考 [JFR](https://rq3nt70g815.feishu.cn/wiki/CtdmwY0yPiUkgKkXidecur63nVc) |                                                              |
| -Xlog:safepoint=debug:file=./logs/safepoint.log:utctime,level,tags:filecount=50,filesize=100M | safepoint                                                    |                                                              |

### 内存相关
```shell
# 堆内存
-Xms2g                # 初始堆大小
-Xmx2g                # 最大堆大小
-XX:MaxDirectMemorySize=1g  # 直接内存大小

# 新生代/老年代
-Xmn512m              # 新生代大小
-XX:NewRatio=2        # 新生代:老年代 = 1:2
-XX:SurvivorRatio=8   # Eden:Survivor = 8:1

# 元空间（JDK8+）
-XX:MetaspaceSize=256m      # 元空间初始大小
-XX:MaxMetaspaceSize=256m   # 元空间最大大小
```

### 垃圾回收器
```shell
# 垃圾回收器（选择其一）
-XX:+UseG1GC              # G1收集器
-XX:+UseParallelGC        # 并行收集器
-XX:+UseConcMarkSweepGC   # CMS收集器
-XX:+UseZGC               # ZGC垃圾收集器(JDK11+)

# G1收集器调优
-XX:MaxGCPauseMillis=200  # 最大停顿时间目标
-XX:G1HeapRegionSize=16m  # Region大小
```

### GC日志
```shell
# JDK8
-XX:+PrintGCDetails             # 打印GC详情
-XX:+PrintGCDateStamps          # 打印GC时间戳
-Xloggc:/path/to/gc.log         # GC日志文件

# JDK9+
-Xlog:gc*:file=/path/to/gc.log:time,uptime:filecount=5,filesize=50m
```

### 性能调优
```shell
# 类加载
-XX:+UseDynamicAgentLoading  # 动态加载代理
-XX:+AlwaysPreTouch         # 启动时预占内存

# OOM行为
-XX:+HeapDumpOnOutOfMemoryError  # OOM时堆转储
-XX:HeapDumpPath=/path/to/dump   # 堆转储路径
-XX:OnOutOfMemoryError="kill -9 %p"  # OOM时执行命令
-XX:+ExitOnOutOfMemoryError #OOM退出程序
```

### 调试和监控
```shell
# 远程调试
-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005

# JMX监控
-Dcom.sun.management.jmxremote
-Dcom.sun.management.jmxremote.port=9010
-Dcom.sun.management.jmxremote.authenticate=false
-Dcom.sun.management.jmxremote.ssl=false
```

### 诊断参数
#### Java 11+版本
```shell
-XX:NativeMemoryTracking=summary  // 跟踪JVM本地内存使用
-Xlog:gc*:stdout:time            // 统一日志格式输出GC日志
-XX:+UnlockDiagnosticVMOptions   // 解锁诊断选项
```
#### Java 11以下版本
```shell
-XX:NativeMemoryTracking=summary  // 跟踪JVM本地内存使用
-XX:+PrintGC                      // 打印GC信息
-XX:+PrintGCDateStamps           // 打印GC时间戳
-XX:+PrintGCTimeStamps           // 打印GC耗时
-XX:+UnlockDiagnosticVMOptions   // 解锁诊断选项
```

### JIT
#### 核心参数
```shell
# 分层编译开关（最基础的选择）
-XX:+TieredCompilation    # 启用分层编译(默认开启)
-XX:-TieredCompilation    # 禁用分层编译

# 编译层级（影响启动速度和峰值性能）
-XX:TieredStopAtLevel=1   # 只用C1编译器，快速启动
-XX:TieredStopAtLevel=4   # 完整优化，更好的峰值性能(默认)

# 编译线程数（影响编译速度）
-XX:CICompilerCount=2     # 并行编译线程数
```
#### 常见调优参数
```shell
# 代码缓存（如果出现"CodeCache is full"问题）
-XX:ReservedCodeCacheSize=256m  # 代码缓存大小
-XX:+UseCodeCacheFlushing      # 允许刷新代码缓存

# 方法内联（影响性能优化）
-XX:MaxInlineSize=35      # 最大内联大小
-XX:FreqInlineSize=325    # 热点方法内联大小
```
#### 常用调试参数
```shell
# 查看JIT工作情况
-XX:+PrintCompilation     # 打印编译信息
-XX:+LogCompilation      # 记录详细编译日志
```

#### 典型使用场景
```shell

# 1. 生产环境标准配置
-Xms4g -Xmx4g
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/opt/dumps/
-Xlog:gc*:file=/opt/logs/gc.log:time,uptime:filecount=5,filesize=50m

# 2. 开发环境调试配置
-Xms1g -Xmx1g
-XX:+UseG1GC
-XX:+PrintGCDetails
-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005

# 3. 大内存服务配置
-Xms8g -Xmx8g
-XX:+UseG1GC
-XX:G1HeapRegionSize=32m
-XX:MetaspaceSize=512m
-XX:MaxMetaspaceSize=512m
-XX:+UseCompressedOops

# 4. 快速启动场景（微服务/Serverless）
-XX:+TieredCompilation 
-XX:TieredStopAtLevel=1
-XX:CICompilerCount=2

# 5. 长期运行服务（最大性能）
-XX:+TieredCompilation
-XX:ReservedCodeCacheSize=256m
-XX:+UseCodeCacheFlushing

# 6. 调试编译问题
-XX:+PrintCompilation
-XX:+UseCodeCacheFlushing
```

