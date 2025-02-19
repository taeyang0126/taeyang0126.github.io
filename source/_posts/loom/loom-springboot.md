---
title: loom
tags:
  - loom
  - 虚拟线程
  - java
  - spring boot
categories:
  - loom
abbrlink: 17349
date: 2025-02-19 20:52:22
---

#### Spring Boot 使用 project loom

##### 环境

- jdk 22.0.1-graal
- maven 3.6.3
- 内置容器 tomcat，最大线程数量 256
- Xms200M Xmx300M
- 压测条件: 1000线程 循环100次 Ramp-up=10s
- M1 max 64g
- SpringBoot 3.3.0

##### 普通线程，同步请求

```java

@GetMapping("/hello")
public String hello() {
    try {
        Thread.sleep(1000);
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
    return "hello";
}
```

- 压测吞吐量253/s，与配置最大线程 256 基本一致

![img.png](/images/loom/img4.png)

- 内存、线程占用情况

![普通线程.png](/images/loom/img3.png)

##### 虚拟线程，异步servlet

```java

@GetMapping("/loom")
public DeferredResult<String> helloLoom() {
    // 返回异步 -> springmvc会处理为异步servlet，提升吞吐量
    DeferredResult<String> res = new DeferredResult<>();
    Thread.startVirtualThread(() -> {
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        res.setResult("hello");
    });
    return res;
}
```

- 压测吞吐量879/s，大概是普通线程的3~4倍

![/images/loom](/images/loom/img6.png)

- 内存、线程占用情况，可以发现虚拟线程的内存比普通线程占用要大
  这个很好理解，因为开启的虚拟线程多了，虚拟线程也是对象，自然占用的内存会大一些

![img.png](/images/loom/img5.png)

##### 旧版本tomcat不支持异步线程

- 版本9.0.60
- org.apache.tomcat.util.net.SocketProcessorBase.run 方法是用 `synchronized`
  包裹住的，导致虚拟线程无法卸载，这个版本下即使替换了tomcat线程池为虚拟线程池，也会造成阻塞
  ![img.png](/images/loom/img.png)
- 之所以在这里需要使用锁是因为对于一个socket来说，需要保证并发安全，因为这里是在业务线程池executor执行的，会有多个线程访问同一个socket，这里的锁就是锁住每个连接，防止单个连接多个请求并发(题外话: netty高明之处就在于事件监听+事件处理都是用一个eventLoop，就不存在并发问题，如果使用者使用了异步线程池，也只需要在涉及channel的操作放到eventLoop中执行大概率不会有什么并发问题)
- 如果在此版本下想要支持虚拟线程，可以使用上面的方式，将同步servlet转换为异步servlet，再使用虚拟线程包裹一层

##### 新版本tomcat支持异步线程

- 版本10.1.24
- org.apache.tomcat.util.net.SocketProcessorBase.run 方法调整为用 `ReentrantLock` 进行加锁，这样虚拟线程可以正常卸载
  ![img.png](/images/loom/img2.png)
- 此版本下如何启用虚拟线程?
    1. 自定义 `WebServerFactoryCustomizer` 修改tomcat执行线程池
  ```java
  public class VirtualThreadExecutorWebServerFactoryCustomizer implements WebServerFactoryCustomizer<ConfigurableTomcatWebServerFactory>, Ordered {
  
      @Override
      public void customize(ConfigurableTomcatWebServerFactory factory) {
          ExecutorService executorService = Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("tomcat-virtual-", 0).factory());
          factory.addProtocolHandlerCustomizers(
                  (protocolHandler) -> protocolHandler.setExecutor(executorService));
      }
  
      @Override
      public int getOrder() {
          return Ordered.LOWEST_PRECEDENCE;
      }
  }
  ```
  2. 使用框架自带的 `TomcatVirtualThreadsWebServerFactoryCustomizer`
  3. 测试发现二者性能相差不大，可自行选择，不过 `TomcatVirtualThreadsWebServerFactoryCustomizer` 底层使用了反射，性能可能略有损耗，更推荐第一种自定义的
  
