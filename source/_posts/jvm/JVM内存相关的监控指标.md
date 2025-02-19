---
title: JVM内存相关的监控指标
abbrlink: 58697
date: 2025-02-09 13:53:30
tags: [JVM, 监控, 内存]
categories: [JVM]
keywords: [JVM, 内存监控]
---



![jvm内存图片](/images/jvm/jvm-memory.PNG)

### Heap

> JVM Heap代表存放Java Objects的Heap

### Non-Heap

#### 1. SpringBoot的JVM metrics埋点代码

```Java
// 通过io.micrometer.core引入了JVMMemoryuMetrics这个埋点实现
for (MemoryPoolMXBean memoryPoolBean : ManagementFactory.getPlatformMXBeans(MemoryPoolMXBean.class)) {
    String area = MemoryType.HEAP.equals(memoryPoolBean.getType()) ? "heap" : "nonheap";
    Iterable<Tag> tagsWithId = Tags.concat(tags, "id", memoryPoolBean.getName(), "area", area);

    Gauge.builder("jvm.memory.used", memoryPoolBean, (mem) -> getUsageValue(mem, MemoryUsage::getUsed))
        .tags(tagsWithId)
        .description("The amount of used memory")
        .baseUnit(BaseUnits.BYTES)
        .register(registry);

    Gauge
        .builder("jvm.memory.committed", memoryPoolBean, (mem) -> getUsageValue(mem, MemoryUsage::getCommitted))
        .tags(tagsWithId)
        .description("The amount of memory in bytes that is committed for the Java virtual machine to use")
        .baseUnit(BaseUnits.BYTES)
        .register(registry);

    Gauge.builder("jvm.memory.max", memoryPoolBean, (mem) -> getUsageValue(mem, MemoryUsage::getMax))
        .tags(tagsWithId)
        .description("The maximum amount of memory in bytes that can be used for memory management")
        .baseUnit(BaseUnits.BYTES)
        .register(registry);
}

// MemoryPoolMXBean接口的实现类是sun.management.MemoryPoolImpl，该类通过native method得到JVM提供的内存使用信息
// Native VM support
private native MemoryUsage getUsage0();
```

#### 2. JVM本身的代码

> 设置-XX:NativeMemoryTracking=summary或者details，然后使用jcmd去查看

- CodeCache
- Metaspace
- CompressedClassSpace
- DirectBuffer
- Thread Stacks



### 常见问题

#### 1. JVM里used内存很低，但是容器物理内存占用很高

因为k8s不允许使用交换分区，所以这里不用考虑外存和内存的交换关系。

JVM申请内存的时候，会预先使用**pretouch**的方式声明去告知OS，期望使用多少size的内存，由于物理内存的分配（内核本身的虚拟内存-物理内存管理）时惰性的，所以声明要使用多少size，不代表物理内存就立刻分配多少。

比如JavaHeap声明了1G的内存需要使用，但实际使用过程中，物理内存也是逐步被分配的，由于JavaHeap的内存被JVM的GC管理，当Heap满时，JVM的GC会内部释放内存空间，很明显，GC的过程不会让OS感知，不会去释放物理内存，假如FGC后，JavaHeap实际used的内存（常驻在JavaHeap）中只有200M，但此时容器物理内存很可能是1G多。
