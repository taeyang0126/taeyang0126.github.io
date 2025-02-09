---
title: JVM重要参数
tags:
  - JVM
  - 参数
categories:
  - JVM
keywords:
  - JVM
abbrlink: 30107
date: 2025-02-09 14:08:56
---



## 常规启动配置参数

| 参数                                                         | 说明                                                         | 备注                                                         |
| :----------------------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| -XX:+PrintFlagsFinal                                         | 启动时打印出所有JVM参数                                      |                                                              |
| -XX:+HeapDumpOnOutOfMemoryError-XX:HeapDumpPath=/path/to/heap.hprof-XX:+ExitOnOutOfMemoryError | 开启OOM时堆转储指定dump文件位置发生 OOM 时强制 JVM 立即退出  | ！！dump hprof文件时要求内存比较大，这块后续要再找更好的方案 |
| -Xlog:gc*:file=gc.log::filecount=5,filesize=20M              | JDK 9+ 的新版 GC 日志参数-Xlog:  gc*                    # 记录所有gc相关日志  :file=gc.log          # 输出到gc.log文件  :                           # 空的tag过滤器  :filecount=5,         # 最多保留5个文件  filesize=20M          # 每个文件最大20MB | 等价  jdk8           -verbose:gc        -Xloggc:/path/to/gc.log        -XX:+PrintGCDetails        -XX:+PrintGCDateStamps        -XX:+PrintGCTimeStamps        -XX:+UseGCLogFileRotation        -XX:NumberOfGCLogFiles=5        -XX:GCLogFileSize=20M |
| -XX:StartFlightRecording=delay=1s,disk=true,dumponexit=true,filename=./logs/recording.jfr,maxsize=1024m,maxage=1d,path-to-gc-roots=true-XX:FlightRecorderOptions=stackdepth=128 | jfr启动参数，具体参考 [JFR](https://rq3nt70g815.feishu.cn/wiki/CtdmwY0yPiUkgKkXidecur63nVc) |                                                              |
| -Xlog:safepoint=debug:file=./logs/safepoint.log:utctime,level,tags:filecount=50,filesize=100M | safepoint                                                    |                                                              |
