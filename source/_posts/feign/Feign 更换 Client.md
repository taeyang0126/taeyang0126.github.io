---
title: Feign 更换 Client
tags:
  - feign
  - rpc
  - 微服务
categories:
  - feign
abbrlink: 17349
date: 2025-02-09 18:51:22
---



## 基于 loadBalancer 更换 FeignClient 为 vertx-web 实现

- feignClient 实现类依旧是 LoadBalancerFeignClient
- LoadBalancerFeignClient 中 delegate 更换为自定义实现的 vertx-web-client

```Java
public class VertxFeignClient implements Client {

    private final WebClient webClient;

    public VertxFeignClient() {
        Vertx vertx = Vertx.vertx();
        WebClientOptions webClientOptions = new WebClientOptions()
                .setMaxPoolSize(100)
                .setMaxWaitQueueSize(10000);
        this.webClient = WebClient.create(vertx, webClientOptions);
    }

    @Override
    public Response execute(Request request, Request.Options options) throws IOException {
        String url = request.url();
        var bodys = request.requestBody().asBytes();
        Map<String, Collection<String>> headers = request.headers();
        io.vertx.core.http.HttpMethod vertxMethod = io.vertx.core.http.HttpMethod.valueOf(request.httpMethod().name());

        HeadersMultiMap entries = new HeadersMultiMap();
        headers.forEach(entries::add);

        CompletableFuture<Response> completableFuture = new CompletableFuture<>();

        webClient.requestAbs(vertxMethod, url)
                .putHeaders(entries)
                .sendBuffer(bodys == null ? Buffer.buffer() : Buffer.buffer(bodys))
                .timeout(options.readTimeoutMillis(), TimeUnit.MILLISECONDS)
                .onSuccess(t -> {
                    log.info("url[{}] 响应 -> {}", url, t.bodyAsString());
                    MultiMap responseHeaders = t.headers();
                    Map<String, Collection<String>> map = new HashMap<>();
                    responseHeaders.forEach((k, v) -> map.put(k, Collections.singleton(v)));
                    completableFuture.complete(Response.builder()
                            .status(t.statusCode())
                            .reason(t.statusMessage())
                            .headers(map)
                            .body(t.bodyAsBuffer().getBytes())
                            .request(request)
                            .build());
                }).onFailure(completableFuture::completeExceptionally);

        try {
            return completableFuture.get();
        } catch (InterruptedException | ExecutionException e) {
            throw new RuntimeException(e);
        }
    }
```

- 配置类装配 FeignClient bean

```Java
@Configuration
public class VertxFeignClientConfiguration {

    @Bean
    @Primary
    public Client feignClient(CachingSpringLoadBalancerFactory cachingFactory,
                              SpringClientFactory clientFactory) {
        return new LoadBalancerFeignClient(new VertxFeignClient(), cachingFactory, clientFactory);
    }

}
```
