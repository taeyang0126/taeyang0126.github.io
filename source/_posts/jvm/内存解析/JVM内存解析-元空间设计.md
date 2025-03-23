---
title: JVM内存解析 - 4.JVM 元空间设计
abbrlink: 58697
date: 2025-03-23 17:46:30
tags: [JVM, 内存, 元空间]
categories: [JVM内存解析]
---

> 本文参考张哥 -> 全网最硬核 JVM 内存解析
- [元空间存储的元数据](https://juejin.cn/post/7225879698952486972)

## 什么是元数据，为什么需要元数据

---

JVM 在执行 Java 应用程序时，将加载的 Java 类的许多细节记录在内存中，这些信息称为类`元数据（Class MetaData）`。这些元数据对于 Java 的很多灵活的语言以及虚拟机特性都是很重要的，比如动态类加载、JIT 实时编译、反射以及动态代理等等。不同的 JVM 加载类保存的内存信息是不一样的，它们通常`在更低的内存占用`与`更快的执行速度之间进行权衡`（类似于空间还是时间的权衡）。对于 OpenJDK Hotspot 使用的则是相对丰富的元数据模型来获得尽可能快的性能（时间优先，不影响速度的情况下尽量优化空间占用）。相比于 C,C++,Go 这些离线编译为可执行二进制文件的程序相比，像 JVM 这样的托管运行时动态解释执行或者编译执行的，`则需要保留更多关于正在执行的代码的运行时信息`。原因如下：

1. `依赖类库并不是一个确定的有限集`: Java 可以动态加载类，并且还有 ASM 以及 Javassist 这些工具在运行时动态定义类并加载，还有 JVMTI agent 这样的机制来动态修改类。所以，JVM 通过类元数据保存：`运行时中存在哪些类，它们包含哪些方法和字段，并能够在链接加载期间动态地解析从一个类到另一个类的引用`。类的链接也需要考虑类的`可见性和可访问性`。类元数据`与类加载器相关联`，同时类元数据也包括`类权限和包路径以及模块信息`（Java 9之后引入的模块化），以确定可访问性
2. `JVM 解释执行或者通过 JIT 实时编译执行 Java 代码的时候需要基于类元数据的很多信息才能执行`：需要知道例如类与类之间的关系，类属性以及字段还有方法结构等等等等。例如在做强制转换的时候，需要检查类型的父子类关系确定是否可以强制转换等等。
3. `JVM 需要一些统计数据决定哪些代码解释执行那些代码是热点代码需要 JIT 即时编译执行`。
4. `Java 有反射 API 供用户使用`，这就需要运行时知道所有类的各种信息。

## 什么时候用到元空间，元空间保存什么

---

### 什么时候用到元空间，以及释放时机

`只要发生类加载，就会用到元空间`。例如我们创建一个类对象时：这个类首先会被类加载器加载，在发生类加载的时候，对应类的元数据被存入元空间。元数据分为`两部分存入元空间`，`一部分存入了元空间的类空间另一部分存入了元空间的非类空间`。堆中新建的对象的对象头中的 `Klass` 指针部分，指向元空间中 Klass，同时，Klass 中各种字段都是指针，实际对象的地址，可能在非类空间，例如实现方法多态以及 virtual call 的 vtable 与 itable 保存着方法代码地址的引用指针。非类空间中存储着比较大的元数据，例如常量池，字节码，JIT 编译后的代码等等。由于编译后的代码可能非常大，以及 JVM 对于多语言支持的扩展可能动态加载很多类，所以`将 MetaSpace 的类空间与非类空间区分开`。如图所示：

![img.png](../../../images/jvm/memory/19.png)

JVM 启动参数 `-XX:CompressedClassSpaceSize` 指定的是压缩类空间大小，默认是 `1G`。`-XX:MaxMetaspaceSize` 控制的是 MetaSpace 的总大小。

当类加载器加载的所有类都没有任何实例，并且没有任何指向这些类对象(java.lang.Class)的引用，也没有指向这个类加载器的引用的时候，如果发生了 GC，这个类加载器使用的元空间就会被释放。但是这个释放并不一定是释放回操作系统，而是被标记为可以被其他类加载器使用了。

### 元空间保存什么

元空间保存的数据，目前分为两大类：

- `Java 类数据`: 即加载的 Java 类对应 JVM 中的 Klass 对象（Klass 是 JVM 源码中的一个 c++ 类，你可以理解为类在 JVM 中的内存形式），但是这个 Klass 对象中存储的很多数据都是指针，具体的数据存储属于非 Java 类数据，一般非 Java 类数据远比 Java 类数据占用空间大。
- `非 Java 类数据`: 即被 Klass 对象引用的一些数据，例如：类中的各种方法，注解，执行采集与统计信息等等。

如果是 64 位的 JVM 虚拟机（从 Java 9+ 开始只有 64 位的虚拟机了）并且开启了压缩类指针(`-XX:+UseCompressedClassPointers`，默认是开启的)，那么元空间会被划分成两部分：

- `类元空间`：存储上面说的Java 类数据的空间
- `数据元空间`：存储上面说的非 Java 类数据的空间

基于是否开启了压缩类指针分为这两部分的原因是，在对象头需要保留指向 `Klass` 的指针，如果我们能尽量压缩这个指针的大小，那么每个对象的大小也能得到压缩，这将节省很多堆空间。在 64 位虚拟机上面，指针默认都是 64 位大小的，开启压缩类指针(`-XX:+UseCompressedClassPointers`，默认是开启的)之后，类指针变为 32 位大小，最多能指向 2^32 也就是 4G 的空间，如果我们能保持 Klass 所处的空间占用不超过这个限制的话，就能使用压缩类指针了。所以我们把 Klass 单独提取到一个单独的区域进行分配。Klass 占用的空间并不会太大，虽然对于 Java 中的每一个类都会有一个 Klass，但是占用空间的方法内容以及动态编译信息等等，具体数据都在`数据元空间`中存储，Klass 中大部分都是指针。基本上很少会遇到 32 位指针不够用的情况。

注意，老版本中， `UseCompressedClassPointers` 取决于 `UseCompressedOops`，即压缩对象指针如果没开启，那么压缩类指针也无法开启。但是从 Java 15 Build 23 开始， UseCompressedClassPointers 已经不再依赖 UseCompressedOops 了，两者在大部分情况下已经独立开来。除非在 x86 的 CPU 上面启用 JVM Compiler Interface（例如使用 GraalVM）。

在元空间分配的对象，都是调用 `Metaspace::allocate` 从元空间分配空间。调用这个方法的是 `MetaspaceObj` 的构造函数，对应源码：https://github.com/openjdk/jdk/blob/jdk-21+3/src/hotspot/share/memory/allocation.cpp
```c++
void* MetaspaceObj::operator new(size_t size, ClassLoaderData* loader_data,
                                 size_t word_size,
                                 MetaspaceObj::Type type, TRAPS) throw() {
  // Klass has its own operator new
  return Metaspace::allocate(loader_data, word_size, type, THREAD);
}//你以为我想这样么？主要是抄袭狗太多

void* MetaspaceObj::operator new(size_t size, ClassLoaderData* loader_data,
                                 size_t word_size,
                                 MetaspaceObj::Type type) throw() {
  assert(!Thread::current()->is_Java_thread(), "only allowed by non-Java thread");
  return Metaspace::allocate(loader_data, word_size, type);
}
```

`MetaspaceObj` 的 Operator new 方法定义了从 MetaSpace 上分配内存，即所有 `MetaspaceObj` 的子类，只要没有明确覆盖从其他地方分配，就会从 MetaSpace 分配内存。`MetaspaceObj` 的子类包括：

`位于类元空间的`：

- `Klass`: 其实就是 Java 类的实例（每个 Java 的 class 有一个对应的对象实例，用来反射访问，这个就是那个对象实例），即 Java 对象头的类型指针指向的实例：
  - `InstanceKlass`：普通对象类的 Klass：
    - `InstanceRefKlass`：`java.lang.ref.Reference` 类以及子类对应的 Klass
    - `InstanceClassLoaderKlass`：Java 类加载器对应的 Klass
    - `InstanceMirrorKlass`：java.lang.Class 对应的 Klass
  - `ArrayKlass`：Java 数组对应的 Klass
    - `ObjArrayKlass`：普通对象数组对应的 Klass
    - `TypeArrayKlass`：原始类型数组对应的 Klass

`位于数据元空间的`：

- `Symbol`：符号常量，即类中所有的符号字符串，例如类名称，方法名称，方法定义等等。
- `ConstantPool`：运行时常量池，数据来自于类文件中的常量池。
- `ConstanPoolCache`：运行时常量池缓存，用于加速常量池访问
- `ConstMethod`：类文件中的方法解析后，静态信息放入 ConstMethod，这部分信息可以理解为是不变的，例如字节码，行号，方法异常表，本地变量表，参数表等等。
- `MethodCounters`：方法的计数器相关数据。
- `MethodData`：方法数据采集，动态编译相关数据。例如某个方法需要采集一些指标，决定是否采用 C1 C2 动态编译优化性能。
- `Method`：Java 方法，包含以上 `ConstMethod`，`MethodCounters`，`MethodData` 的指针以及一些额外数据。
- `RecordComponent`：对应 Java 14 新特性 Record，即从 Record 中解析出的关键信息。