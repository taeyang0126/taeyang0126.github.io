---
title: HttpClient基准测试
abbrlink: 45275
date: 2025-03-15 10:43:22
tags: [ JAVA, http client, 基准测试 ]
categories: [ JAVA ]
---

- [case](https://github.com/taeyang0126/JavaForge/tree/main/src/main/java/com/lei/java/forge/http)

## 使用 WireMockServer 测试

---

### 自定义 WireMockServer

```java
public class CustomWireMockServer {

    private final WireMockServer mockServer;

    private final String url;

    public CustomWireMockServer(int fixedDelayMs) {

        int containerThreads = 100; // 增加容器线程数
        int responseThreads = 100;  // 增加响应线程数

        WireMockConfiguration options = WireMockConfiguration.options()
                .port(8080)
                .containerThreads(containerThreads)      // 增加容器线程数
                .jettyAcceptors(4)                       // 增加接收器数量
                .jettyAcceptQueueSize(100)               // 增加接受队列大小
                .asynchronousResponseEnabled(true)       // 启用异步响应
                .asynchronousResponseThreads(responseThreads); // 设置异步响应线程数

        this.mockServer = new WireMockServer(options);
        this.mockServer.start();

        mockServer.stubFor(get(urlEqualTo("/test"))
                .willReturn(aResponse()
                        .withFixedDelay(fixedDelayMs)
                        .withStatus(200)
                        .withBody("Hello")));

        this.url = mockServer.baseUrl() + "/test";
    }

    public String getUrl() {
        return url;
    }

    public void close() {
        this.mockServer.shutdown();
    }

}
```

### 测试结果

| http client            | 测试条件                                 | 测试结果                                                                                            | 说明                                                                                                         | 推荐指数 |
|------------------------|--------------------------------------|-------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|------|
| jdk11之后提供的 `HttpClient` | 线程数量=1<br/>单个请求耗时0.1s                | requestCount=1000 => `0.5s`<br/> requestCount=10000 => `1.2s`                                   | 1. 底层使用`nio`<br/>2. 在请求数量一定的情况下，总的耗时最少<br/>3. 耗时最少的原因是对于每个http请求都会建立一个连接，造成连接极大的浪费<br/>4. 会出现大量time_wait连接 | ⭐️⭐️⭐️   |
| `httpasyncclient`      | 线程数量=1<br/>单个请求耗时0.1s<br/>最大连接数量=100 | requestCount=1000 => `1.2s`                                                                     | 1. 底层使用`nio`<br/>2. 总耗时与最大连接数量成反比<br/>3. 连接数可控且可复用<br/>4. 性能与线程数量不正相关                                      |  ⭐️⭐️⭐️⭐️⭐    |
| `OkHttp`               |      单个请求耗时0.1s                                 | maxConnection=1 => `106s`<br/>maxConnection=5(default) => `21s`<br/>maxConnection=100 => `1.2s` | 1. 底层使用`bio`<br/>2. 总耗时与最大连接数量成反比<br/>3. 每条连接对应一个线程，线程数增长过快                                                |   ⭐️⭐   |
| `SpringWebflux`        |         线程数量=1<br/>单个请求耗时0.1s<br/>最大连接数量=100                             | requestCount=1000 => `1.4s`                                                                     | 1. 底层使用`reactor`<br/>2. 总耗时与最大连接数量成反比<br/>3. 连接数可控且可复用<br/>4. 性能与线程数量不正相关                                  | ⭐️⭐️⭐️⭐️⭐     |
| `VertxWebClient`         |             线程数量=1<br/>单个请求耗时0.1s<br/>最大连接数量=100                              | requestCount=1000 => `1.3s`                                                                     | 1. 底层使用`netty`<br/>2. 总耗时与最大连接数量成反比<br/>3. 连接数可控且可复用<br/>4. 性能与线程数量不正相关                                    |    ⭐️⭐️⭐️⭐️⭐  |




