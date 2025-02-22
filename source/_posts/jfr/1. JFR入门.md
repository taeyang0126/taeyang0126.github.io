---
title: JFR入门
abbrlink: 19346
date: 2025-02-09 14:13:52
tags: [JVM, JFR, 监控]
categories: [JFR]
---



### 学习资料

- [hashcon JFR 全解](https://www.zhihu.com/column/c_1264859821121355776)

### JVM 启动

```java
Java - XX:StartFlightRecording=delay=6s,disk=true,dumponexit=true,filename=/Users/wulei/tmp/recording.jfr,maxsize=1024m,maxage=1d,settings=/Users/wulei/IdeaProjects/personal/op-lei4play/op-samples/jfr/lei-default.jfc,path-to-gc-roots=true -XX:FlightRecorderOptions=repository=/Users/wulei/tmp,stackdepth=64 test.Main
```



`-XX:StartFlightRecording`有这个参数就会启用 JFR 记录，以下是相关的参数

|     配置 key     | 默认值                                                       | 说明                                                         |
| :--------------: | :----------------------------------------------------------- | :----------------------------------------------------------- |
|      delay       | 0                                                            | 延迟多久后启动 JFR 记录，支持带单位配置， 例如 delay=60s（秒）， delay=20m（分钟）， delay=1h（小时）， delay=1d（天），不带单位就是秒， 0 就是没有延迟直接开始记录。一般为了避免框架初始化等影响，我们会延迟 1 分钟开始记录（例如 Spring cloud 应用，可以看下日志中应用启动耗时，来决定下这个时间 |
|       disk       | true                                                         | 是否写入磁盘，global buffer 满了之后，是直接丢弃还是写入磁盘文件 |
|    dumponexit    | false                                                        | 程序退出时，是否要 dump 出 。jfr 文件                        |
|     duration     | 0                                                            | JFR 记录持续时间，同样支持单位配置，不带单位就是秒，0 代表不限制持续时间，一直记录 |
|     filename     | 启动目录/hotspot-pid-26732-id-1-2020_03_12_10_07_22.jfr，pid 后面就是 pid， id 后面是第几个 JFR 记录，可以启动多个 JFR 记录。最后就是时间 | dump 的输出文件                                              |
|       name       | 无                                                           | 记录名称，由于可以启动多个 JFR 记录，这个名称用于区分，否则只能看到一个记录 id，不好区分 |
|      maxage      | 0                                                            | 这个参数只有在 disk 为 true 的情况下才有效。最大文件记录保存时间，就是 global buffer 满了需要刷入本地临时目录下保存，这些文件最多保留多久的。也可以通过单位配置，没有单位就是秒，默认是 0，就是不限制 |
|     maxsize      | 250MB                                                        | 这个参数只有在 disk 为 true 的情况下才有效。最大文件大小，支持单位配置， 不带单位是字节，m 或者 M 代表 MB，g 或者 G 代表 GB。设置为 0 代表不限制大小**。虽然官网说默认就是 0，但是实际用的时候，不设置会有提示**： No limit specified， using maxsize=250MB as default。 注意，这个配置不能小于后面将会提到的 maxchunksize 这个参数 |
| path-to-gc-roots | false                                                        | 是否记录 GC 根节点到活动对象的路径，一般不打开这个，首先这个在我个人定位问题的时候，很难用到，只要你的编程习惯好。还有就是打开这个，性能损耗比较大，会导致 FullGC 一般是在怀疑有内存泄漏的时候热启动这种采集，并且通过产生对象堆栈无法定位的时候，动态打开即可。一般通过产生这个对象的堆栈就能定位，如果定位不到，怀疑有其他引用，例如 ThreadLocal 没有释放这样的，可以在 dump 的时候采集 gc roots |
|     settings     | default.jfc                                                  | 位于 `$JAVA_HOME/lib/jfr/default.jfc`采集 Event 的详细配置，采集的每个 Event 都有自己的详细配置。另一个 JDK 自带的配置是 profile.jfc，位于 `$JAVA_HOME/lib/jfr/profile.jfc`如果需要指定自己的配置，这里可以设置为全路径的配置文件，类似 `settings=/Users/wulei/tmp/lei-default.jfc` |

**`-XX:FlightRecorderOptions`** 相关的参数

| 配置 key                    | 默认值                                         | 说明                                                         |
| :-------------------------- | :--------------------------------------------- | :----------------------------------------------------------- |
| allow_threadbuffers_to_disk | false                                          | 是否允许 在 thread buffer 线程阻塞的时候，直接将 thread buffer 的内容写入文件。默认不启用，一般没必要开启这个参数，只要你设置的参数让 global buffer 大小合理不至于刷盘很慢，就行了 |
| globalbuffersize            | 如果不设置，根据设置的 memorysize 自动计算得出 | 单个 global buffer 的大小，一般通过 memorysize 设置，不建议自己设置 |
| maxchunksize                | 12M                                            | 存入磁盘的每个临时文件的大小。默认为 12MB，不能小于 1M。可以用单位配置，不带单位是字节，m 或者 M 代表 MB，g 或者 G 代表 GB。注意这个大小最好不要比 memorySize 小，更不能比 globalbuffersize 小，否则会导致性能下降 |
| memorysize                  | 10M                                            | FR 的 global buffer 占用的整体内存大小，一般通过设置这个参数，numglobalbuffers 还有 globalbuffersize 会被自动计算出。可以用单位配置，不带单位是字节，m 或者 M 代表 MB，g 或者 G 代表 GB |
| numglobalbuffers            | 如果不设置，根据设置的 memorysize 自动计算得出 | global buffer 的个数，一般通过 memorysize 设置，不建议自己设置 |
| old-object-queue-size       | 256                                            | 对于 Profiling 中的 Old Object Sample 事件，记录多少个 Old Object，这个配置并不是越大越好。记录是怎么记录的，会在后面的各种 Event 介绍里面详细介绍。我的建议是，一般应用 256 就够，时间跨度大的，例如 maxage 保存了一周以上的，可以翻倍 |
| repository                  | 等同于 -Djava.io.tmpdir 指定的目录             | JFR 保存到磁盘的临时记录的位置                               |
| retransform                 | true                                           | 是否通过 JVMTI 转换 JFR 相关 Event 类，如果设置为 false，则只在 Event 类加载的时候添加相应的 Java Instrumentation，这个一般不用改，这点内存 metaspace 还是足够的 |
| samplethreads               | true                                           | 这个是是否开启线程采集的状态位配置，只有这个配置为 true，并且在 Event 配置中开启线程相关的采集（这个后面会提到），才会采集这些事件 |
| stackdepth                  | 64                                             | 采集事件堆栈深度，有些 Event 会采集堆栈，这个堆栈采集的深度，统一由这个配置指定。注意这个值不能设置过大，如果你采集的 Event 种类很多，堆栈深度大很影响性能。比如你用的是 default.jfc 配置的采集，堆栈深度 64 基本上就是不影响性能的极限了。你可以自定义采集某些事件，增加堆栈深度 |
| threadbuffersize            | 8KB                                            | threadBuffer 大小，最好不要修改这个，如果增大，那么随着你的线程数增多，内存占用会增大。过小的话，刷入 global buffer 的次数就会变多。8KB 就是经验中最合适的 |

### jcmd 命令启动

- **`jcmd <pid> JFR.start`** 启动 JFR 记录，参数和`-XX:StartFlightRecording`一模一样，请参考上面的表格。但是注意这里不再是逗号分割，而是空格示例，代表启动一个名称为 profile_online， 最多保留一天，最大保留 1G 的本地文件记录

```Shell
jcmd 21 JFR.start name=profile_online maxage=1d maxsize=1g
```

- **`jcmd <pid> JFR.stop`** 停止 JFR 记录，需要传入名称，例如如果要停止上面打开的，则执行：

```Shell
jcmd 21 JFR.stop name=profile_online
```

- **`jcmd <pid> JFR.check`** 查看当前正在执行的 JFR 记录
- **`jcmd <pid> JFR.configure`** 如果不传入参数，则是查看当前配置，传入参数就是修改配置。配置与-XX:FlightRecorderOptions 的一模一样。请参考上面的表格 示例
- **`jcmd <pid> JFR.dump`** 生成 jfr 文件

| 参数             | 默认值 | 描述                                                         |
| :--------------- | :----- | :----------------------------------------------------------- |
| name             | 无     | 指定要查看的 JFR 记录名称                                    |
| filename         | 无     | 指定文件输出位置                                             |
| maxage           | 0      | dump 最多的时间范围的文件，可以通过单位配置，没有单位就是秒，默认是 0，就是不限制 |
| maxsize          | 0      | dump 最大文件大小，支持单位配置， 不带单位是字节，m 或者 M 代表 MB，g 或者 G 代表 GB。设置为 0 代表不限制大小 |
| begin            | 无     | dump 开始位置， 可以这么配置：09:00， 21:35:00， 2018-06-03T18:12:56.827Z， 2018-06-03T20:13:46.832， -10m， -3h， or -1d |
| end              | 无     | dump 结束位置，可以这么配置： 09:00， 21:35:00， 2018-06-03T18:12:56.827Z， 2018-06-03T20:13:46.832， -10m， -3h， or -1d （STRING， no default value） |
| path-to-gc-roots | false  | 是否记录 GC 根节点到活动对象的路径，一般不记录，dump 的时候打开这个肯定会触发一次 fullGC，对线上应用有影响。最好参考之前对于 JFR 启动记录参数的这个参数的描述，考虑是否有必要 |

### jfr 配置文件 

- openJdk 11.0.22

 [default.jfc](/files/default.jfc) 

 [profile.jfc](/files/profile.jfc) 

- 优化后的配置文件，基于 openJdk 11.2.22 default.jfr，根据👇🏻JFR Event 中的建议对于某些事件进行了关闭或者调整

 [lei-default.jfc](/files/lei-default.jfc) 

### JFR Event

- [EVENT-1](https://zhuanlan.zhihu.com/p/124242959)
- [EVENT-2](https://zhuanlan.zhihu.com/p/126709861)
- [EVENT-3](https://zhuanlan.zhihu.com/p/158592899)

- [JIT相关jfr事件](https://zhuanlan.zhihu.com/p/158592899)

![img](/images/jfr_01_01.png)
