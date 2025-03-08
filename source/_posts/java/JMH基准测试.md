---
title: JMH基准测试
abbrlink: 45275
date: 2025-03-08 10:43:22
tags: [JAVA, JMH, 基准测试]
categories: [JAVA]
---

- [github代码](https://github.com/taeyang0126/JVMForge)

## 什么是基准测试？

---

基准测试是测量和评估软件性能的过程。
- 比较不同算法的性能
- 分析代码优化的效果
- 识别性能瓶颈
- 验证性能假设

## 为什么需要专业的基准测试工具？

--- 

考虑这个简单的性能测试:
```java
long start = System.currentTimeMillis();
method();
long end = System.currentTimeMillis();
System.out.println("执行时间: " + (end - start) + "ms");
```
这种方法存在严重问题:
- 无法处理 `JVM` 预热和 `JIT` 编译优化
- `单次`测量没有`统计意义`
- 容易受到外部因素干扰
- 无法控制 GC 影响

## JMH：基本设置

--- 

### 添加 JMH 依赖
```xml
<dependency>
    <groupId>org.openjdk.jmh</groupId>
    <artifactId>jmh-core</artifactId>
    <version>1.36</version>
</dependency>
<dependency>
    <groupId>org.openjdk.jmh</groupId>
    <artifactId>jmh-generator-annprocess</artifactId>
    <version>1.36</version>
    <scope>provided</scope>
</dependency>
```

### 比较字符串连接的两种不同方式
```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.MICROSECONDS)
@State(Scope.Thread)
@Warmup(iterations = 3, time = 1)
@Measurement(iterations = 5, time = 1)
@Fork(1)
public class StringConcatBenchmark {

    @Param({"10", "100", "1000"})
    private int length;

    @Benchmark
    public String testStringConcatenation() {
        String result = "";
        for (int i = 0; i < length; i++) {
            result += i;
        }
        return result;
    }

    @Benchmark
    public String testStringBuilder() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < length; i++) {
            sb.append(i);
        }
        return sb.toString();
    }

    public static void main(String[] args) throws RunnerException {
        Options opt = new OptionsBuilder()
                .include(StringConcatBenchmark.class.getSimpleName())
                .build();
        new Runner(opt).run();


        /*

        Benchmark                                      (length)  Mode  Cnt   Score    Error  Units
        StringConcatBenchmark.testStringBuilder              10  avgt    5   0.040 ±  0.001  us/op
        StringConcatBenchmark.testStringBuilder             100  avgt    5   0.225 ±  0.005  us/op
        StringConcatBenchmark.testStringBuilder            1000  avgt    5   3.433 ±  0.104  us/op
        StringConcatBenchmark.testStringConcatenation        10  avgt    5   0.085 ±  0.002  us/op
        StringConcatBenchmark.testStringConcatenation       100  avgt    5   1.128 ±  0.085  us/op
        StringConcatBenchmark.testStringConcatenation      1000  avgt    5  44.292 ±  6.484  us/op

        * */
    }
}
```
这表明:
- 对于小字符串(长度10)，两种方法差异很小
- 对于中等字符串(长度100)，StringBuilder 约快9倍
- 对于长字符串(长度1000)，StringBuilder 约快14倍

## JMH基本概念

---

### 如何理解 `@State`
> `@State` 是 JMH 中管理测试状态（即测试数据和变量）的机制。

#### 为什么需要 @State？
1. 避免 `DCE` (Dead Code Elimination)：如果在测试方法内直接创建变量，JVM 可能会发现这些变量没有被"外部使用"而优化掉，导致测试结果不准确。
2. `管理对象生命周期`: 控制对象何时创建、共享和销毁。
3. `支持不同的共享级别`：通过 Scope 参数控制状态对象如何在线程间共享

#### @State 的 `Scope` 选项：
- Scope.Thread：每个测试线程有一个独立的状态实例（默认且最常用）
- Scope.Benchmark：所有线程共享同一个状态实例（用于测试并发）
- Scope.Group：同一个线程组内的线程共享同一个状态实例

### 为什么需要 `@Fork`
> @Fork 指定了基准测试应该在多少个独立的 JVM 进程中运行。

```java
@Fork(value = 3, warmups = 1)
```

这表示：
- 运行 3 个正式的测量进程
- 运行 1 个预热进程（不计入最终结果）

#### 为什么 Fork 很重要？
1. 隔离性：每个新的 JVM 实例都是干净的环境，没有之前测试的干扰，如 JIT 编译历史、类加载状态、内存状态等。
2. 避免偏差：多个独立运行可以发现潜在的异常值或不稳定因素。
3. 克服 JVM 适应性: JVM 会根据运行情况调整优化策略，Fork 可以避免这种"学习效应"影响测试。
4. 模拟真实环境: 实际应用通常从冷启动开始，Fork 更接近这种情况。
5. `设置JVM参数`: `@Fork(value = 3, jvmArgs = {"-Xms2G", "-Xmx2G"})`

#### 推荐设置：
- 开发阶段可以用 @Fork(1) 快速得到反馈
- 最终测试应该用 @Fork(3) 或更多以获得稳定结果

### @Setup 和 @TearDown 注解来管理资源和初始化操作
```java
@State(Scope.Thread)
public class DatabaseBenchmarkState {
    private Connection connection;
    private PreparedStatement statement;
    
    @Setup(Level.Trial)
    public void setupDatabase() {
        // 在整个测试开始前执行一次
        connection = DriverManager.getConnection("jdbc:h2:mem:test");
        statement = connection.prepareStatement("SELECT * FROM users WHERE id = ?");
    }
    
    @Setup(Level.Iteration)
    public void setupIteration() {
        // 每次迭代前执行
        // 例如重置计数器、准备新的测试数据等
    }
    
    @TearDown(Level.Iteration)
    public void tearDownIteration() {
        // 每次迭代后执行
        // 例如清理临时数据
    }
    
    @TearDown(Level.Trial)
    public void closeDatabase() {
        // 在整个测试结束后执行一次
        statement.close();
        connection.close();
    }
}
```
- `Level.Trial`：整个基准测试
- `Level.Iteration`：每次迭代（一组测量）
- `Level.Invocation`：每次方法调用（谨慎使用，会影响测量）

## 理解 JMH 的执行模型和优化陷阱

--- 

### JMH 的线程模型
> JMH 的线程模型是理解 @State 的关键。

#### JMH 如何运行基准测试
1. **线程设置**：JMH 默认启动多个线程来执行你的基准测试方法
2. **提高准确性**：多线程运行能够更好地利用系统资源，获得更稳定的结果
3. **线程数量**：默认情况下，JMH 会使用等同于 CPU 核心数的线程数

#### 默认行为
当运行一个简单基准测试：
```java
@Benchmark
public void testMethod() {
    // 测试代码
}
```
JMH 可能会创建 4/8/16 个线程（取决于 `CPU` 核心数），`同时运行`这个测试方法。

#### @State 和线程的关系

##### Scope.Thread
- 每个测试线程都会获得一个`独立的实例`
- 线程之间不共享状态
- 适合测试`无共享`、`非并发`的代码
- 例如：字符串处理、算法计算等

##### Scope.Benchmark
- 所有测试线程`共享同一个实例`
- 适合测试并发性能
- 例如：线程安全集合、锁机制、原子操作等

### JVM 优化陷阱
> JVM 可能会发现变量没有被'外部使用'而优化掉，这涉及到 JVM 的一种优化技术称为 死代码消除 (Dead Code Elimination, DCE)。这个问题尤其在微基准测试中很关键。

#### 死代码消除怎么发生
假设有这样一个简单的基准测试
```java
@Benchmark
public void testMethod() {
    int sum = 0;
    for (int i = 0; i < 1000; i++) {
        sum += i;
    }
    // sum变量在方法结束后没有被使用
}
```
对 JVM 来说，sum 变量的计算完全没有必要！因为：
1. 变量没有返回值
2. 变量不会影响任何外部状态
3. 变量只活在这个方法的栈空间里

因此，优化后的代码可能变成：
```java
@Benchmark
public void testMethod() {
    // 所有代码都被优化掉了！
}
```
实际测量的是一个"空方法"的性能，而不是计算过程的性能！

#### 如何解决 DCE 问题
1. 返回计算结果
    ```java
    @Benchmark
    public int testMethod() {
    int sum = 0;
    for (int i = 0; i < 1000; i++) {
    sum += i;
    }
    return sum;  // 返回结果防止优化
    }
    ```
2. 使用 `Blackhole` 消费结果
   ```java
   @Benchmark
    public void testMethod(Blackhole bh) {
    int sum = 0;
    for (int i = 0; i < 1000; i++) {
    sum += i;
    }
    bh.consume(sum);  // 告诉JVM这个值被使用了
    }
   ```
3. 通过 @State 对象存储结果
    ```java
    @State(Scope.Thread)
    public class MyState {
    public int result;
    }
    
    @Benchmark
    public void testMethod(MyState state) {
    int sum = 0;
    for (int i = 0; i < 1000; i++) {
    sum += i;
    }
    state.result = sum;  // 修改外部状态
    }
    ```

### 常见基准测试陷阱

#### 常量折叠 (Constant Folding)
> 编译器可能在编译时计算常量表达式
```java
@Benchmark
public int badConstantFolding() {
    int a = 1;
    int b = 2;
    return a + b;  // 编译器可能直接返回 3
}
```
解决方案：使用 @State 变量：
```java
@State(Scope.Thread)
public class MyState {
    public int a = 1;
    public int b = 2;
}

@Benchmark
public int goodConstantFolding(MyState state) {
    return state.a + state.b;
}
```

#### 循环优化 (Loop Optimizations)
> JVM 可能优化循环，甚至完全消除它们
```java
@Benchmark
public void badLoopBenchmark() {
    int sum = 0;
    for (int i = 0; i < 1000; i++) {
        sum += i;
    }
    // 结果没有使用，循环可能被优化掉
}
```
解决方案：使用 Blackhole 或返回结果
```java
@Benchmark
public void goodLoopBenchmark(Blackhole bh) {
    int sum = 0;
    for (int i = 0; i < 1000; i++) {
        sum += i;
    }
    bh.consume(sum);
}
```
#### 方法内联 (Method Inlining)
> JVM 可能内联小方法，改变测量结果
```java
@Benchmark
public int measureMethodCall() {
    return addNumbers(1, 2);
}

private int addNumbers(int a, int b) {
    return a + b;
}
```
解决方案：使测试目标足够复杂，或禁用特定优化



