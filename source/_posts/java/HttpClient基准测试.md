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


## 使用 httpbin 测试

---

### 使用 testcontainers 构建通用的测试类

```java
@Testcontainers
public class CommonMicroServiceTest {

    // 创建一个私有的 Docker 网络，使得不同的容器可以在这个网络内相互通信。
    private static final Network network = Network.newNetwork();
    private static final String HTTPBIN = "httpbin";
    public static final int HTTPBIN_PORT = 80;
    /*
        设置一个 httpbin 容器（它提供各种 HTTP 测试端点）
        暴露 80 端口
        将容器连接到之前创建的网络
        给容器一个网络别名 "httpbin"，使其在网络内可通过该名称访问
     */
    public static final GenericContainer<?> HTTPBIN_CONTAINER
            = new GenericContainer<>("kennethreitz/httpbin:latest")
            .withExposedPorts(HTTPBIN_PORT)
            .withNetwork(network)
            .withNetworkAliases(HTTPBIN);
    /**
     * <a href="https://java.testcontainers.org/modules/toxiproxy/">toxiproxy</a>
     * 使用 toxiproxy 封装 httpbin
     * 可以使用 toxiproxy 模拟网络故障等情况
     * 可以用的 port 范围是 8666～8697
     * 也连接到同一个网络
     * 一个 TOXIPROXY_CONTAINER 对应多个不同 proxy，通过 TOXIPROXY_CONTAINER.getMappedPort(内部端口) 获取映射到主机的端口
     */
    private static final ToxiproxyContainer TOXIPROXY_CONTAINER = new ToxiproxyContainer("ghcr.io/shopify/toxiproxy:2.5.0")
            .withNetwork(network);

    // 可用的 httpbin 端口
    private static final int GOOD_HTTPBIN_PROXY_PORT = 8666;
    // READ_TIMEOUT httpbin 端口
    private static final int READ_TIMEOUT_HTTPBIN_PROXY_PORT = 8667;
    //
    private static final int RESET_PEER_HTTPBIN_PROXY_PORT = 8668;

    public static final String GOOD_HOST;
    public static final int GOOD_PORT;
    /**
     * 以下代表请求已经发出到服务端，但是响应超时，或者不能响应（比如服务器重启）
     */
    public static final String READ_TIMEOUT_HOST;
    public static final int READ_TIMEOUT_PORT;
    public static final String RESET_PEER_HOST;
    public static final int RESET_PEER_PORT;

    /**
     * 以下代表请求都没有发出去，TCP 链接都没有建立
     */
    public static final String CONNECT_TIMEOUT_HOST = "localhost";
    /**
     * 端口 1 一定连不上的
     */
    public static final int CONNECT_TIMEOUT_PORT = 1;


    static {
        // 不使用 @Container 注解管理容器声明周期，因为我们需要在静态块生成代理，必须在这之前启动容器
        // 不用担心容器不会被关闭，因为 testcontainers 会启动一个 ryuk 容器，用于监控并关闭所有容器
        HTTPBIN_CONTAINER.start();
        TOXIPROXY_CONTAINER.start();
        final ToxiproxyClient toxiproxyClient = new ToxiproxyClient(TOXIPROXY_CONTAINER.getHost(), TOXIPROXY_CONTAINER.getControlPort());
        try {

            // 1. 创建正常代理
            @SuppressWarnings("all")
            Proxy proxy = toxiproxyClient.createProxy("good", "0.0.0.0:" + GOOD_HTTPBIN_PROXY_PORT, HTTPBIN + ":" + HTTPBIN_PORT);

            // 2. 创建读取超时代理
            // 关闭流量，会 READ TIME OUT
            proxy = toxiproxyClient.createProxy("read_timeout", "0.0.0.0:" + READ_TIMEOUT_HTTPBIN_PROXY_PORT, HTTPBIN + ":" + HTTPBIN_PORT);
            // 将上下行带宽设为0，模拟读取超时
            // bandwidth 限制网络连接的带宽
            // UPSTREAM=0 客户端无法向服务端发送请求，导致写超时
            // DOWNSTREAM=0 服务端无法向客户端响应，导致读超时
            proxy.toxics().bandwidth("UP_DISABLE", ToxicDirection.UPSTREAM, 0);
            proxy.toxics().bandwidth("DOWN_DISABLE", ToxicDirection.DOWNSTREAM, 0);

            // 3. 创建连接重置代理
            // todo reset peer 不生效，抓包发现没有发送 rst 包，具体原因需要再看
            proxy = toxiproxyClient.createProxy("reset_peer", "0.0.0.0:" + RESET_PEER_HTTPBIN_PROXY_PORT, HTTPBIN + ":" + HTTPBIN_PORT);
            // 在连接建立后立即重置连接
            // 上游重置 (ToxicDirection.UPSTREAM): 当客户端尝试向服务器发送数据时，连接会被重置，客户端会收到 "Connection reset by peer" 错误
            // 下游重置 (ToxicDirection.DOWNSTREAM): 当服务器尝试向客户端发送数据时，连接会被重置，服务器会收到 "Connection reset by peer" 错误
            // 延迟为1ms
            proxy.toxics().resetPeer("UP_SLOW_CLOSE", ToxicDirection.UPSTREAM, 1);
            proxy.toxics().resetPeer("DOWN_SLOW_CLOSE", ToxicDirection.DOWNSTREAM, 1);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
        GOOD_HOST = TOXIPROXY_CONTAINER.getHost();
        GOOD_PORT = TOXIPROXY_CONTAINER.getMappedPort(GOOD_HTTPBIN_PROXY_PORT);
        READ_TIMEOUT_HOST = TOXIPROXY_CONTAINER.getHost();
        READ_TIMEOUT_PORT = TOXIPROXY_CONTAINER.getMappedPort(READ_TIMEOUT_HTTPBIN_PROXY_PORT);
        RESET_PEER_HOST = TOXIPROXY_CONTAINER.getHost();
        RESET_PEER_PORT = TOXIPROXY_CONTAINER.getMappedPort(RESET_PEER_HTTPBIN_PROXY_PORT);
    }
}
```
### 测试
```java
@Log4j2
public class NetworkTest {

    private OkHttpClient okHttpClient;

    @Before
    public void init() {
        okHttpClient = new OkHttpClient.Builder()
                .readTimeout(Duration.ofSeconds(1))
                .writeTimeout(Duration.ofSeconds(1))
                .connectTimeout(Duration.ofSeconds(1))
                .retryOnConnectionFailure(false)
                .build();
    }

    @Test
    public void test_good() throws IOException {
        curl(GOOD_HOST, GOOD_PORT);
    }

    @Test(expected = ConnectException.class)
    public void test_connectTimeout() throws IOException {
        curl(CONNECT_TIMEOUT_HOST, CONNECT_TIMEOUT_PORT);
    }

    @Test(expected = SocketTimeoutException.class)
    public void test_readTimeout() throws IOException {
        curl(READ_TIMEOUT_HOST, READ_TIMEOUT_PORT);
    }

    @Test
    public void test_reset() throws IOException {
        curl(RESET_PEER_HOST, RESET_PEER_PORT);
    }

    private void curl(String goodHost, int goodPort) throws IOException {
        String url = "http://" + goodHost + ":" + goodPort + "/delay/0.5";

        Request request = new Request.Builder()
                .url(url)
                .build();

        var res = okHttpClient
                .newCall(request)
                .execute()
                .body()
                .string();

        log.info("res => {}", res);
    }

}
```



