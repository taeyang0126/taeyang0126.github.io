---
title: Feign、Hystrix、Ribbon 超时机制
tags:
  - feign
  - rpc
  - 微服务
categories:
  - feign
abbrlink: 17349
date: 2025-02-09 18:50:22
---



## 使用版本

- open-feign、hystrix、ribbon: 2.1.0.RELEASE

- feign-okhttp: 10.1.0

- archaius: 0.7.6

- jackson: 2.17.0

##  前置条件

- feign.okhttp.enabled=true   #feign 使用 OkHttpClient 作为 http 请求框架
- feign.hystrix.enabled=true   #开启 hystrix

##  关系图

![img](/images/feign/01.png)

##  超时机制

###  hystrix 超时

- 最上层是 hystrix 超时，hystrix 会异步提交一个延时任务，延时时间就是配置的超时时间
- 配置 hystrix 全局的超时时间

```YAML
hystrix:
  command:
    # 默认的配置，如果没有独立配置，那么这个会是默认的配置
    default:
      execution:
        isolation:
          thread:
            timeoutInMilliseconds: 6000
```

- [配置文件]配置具体接口的超时时间，${commandKey} 表示 commandKey，比如接口位于类 HttpBinFeign，方法名为 delay_3（），则 commandKey=HttpBinFeign#delay_3（）；默认会优先读取具体接口的配置，具体接口的配置不存在则会使用默认的配置

```Properties
hystrix.command.${commandKey}.execution.isolation.thread.timeoutInMilliseconds=4000
```

![img](/images/feign/02.png)

![img](/images/feign/03.png)

- [@HystrixCommand]配置具体接口的超时时间

    1. 启用切面

    ```Java
    @Configuration
    public class HystrixConfiguration {

        @Bean
        public HystrixCommandAspect hystrixCommandAspect() {
            return new HystrixCommandAspect();
        }
    }
    ```

    2. @HystrixCommand 配置，这里用了种取巧的方式，添加上此注解会先转换为 HystrixCommandProperties，然后当 Feign 接口封装为 hystrixCommand 时就会从 factory 中根据 cacheKey 获取，cacheKey 就是 commandKey，所以只需要保证在 feign 接口前面组装此配置就行。这里是取巧的方式，不确定会有什么问题- _ -

    ```Java
    @HystrixCommand(
            commandKey = "HttpBinFeign#delay_3()",
            commandProperties = {
                    @HystrixProperty(name = "execution.isolation.thread.timeoutInMilliseconds", value = "2000")
            }
    )
    public String delay_3() {
        return httpBinFeign.delay_3();
    }
    ```

![img](/images/feign/04.png)

###  feign、ribbon 超时配置

- feign 未配置时，请求超时按 ribbon 配置；若配置了 feign 超时，则请求超时按 feign 配置
- feign 全局超时配置，**注意 connect-timeout 与 read-timeout 两个配置都需要配置**，单独配置不生效

```Java
feign:
  client:
    config:
      # 默认配置
      default:
        connect-timeout: 1000
        read-timeout: 5000
```

![img](/images/feign/05.png)

- 单个 feign 接口超时配置

    1. 优先级： 配置分为 3 种，分别是代码配置、默认配置、单个接口配置文件配置；

    默认情况下（feign.client.defaultToProperties=true） 时配置优先级为 代码配置 -> 默认配置 -> 单个接口配置文件配置，优先级从低到高，高优先级的会覆盖低优先级的；

    feign.client.defaultToProperties=false 时配置优先级为 默认配置 -> 单个接口配置文件配置 -> 代码配置；

    也就是说默认情况下代码配置会被默认配置覆盖，所以如果想要针对单个接口进行配置，必须要使用配置文件进行配置；当然也可以设置 feign.client.defaultToProperties=false，这样代码配置的优先级最高

    ![img](/images/feign/06.png)

    2. 单个接口配置

    ```Properties
    # 这里的httpbin代表的是FeignClient中的contextId
    feign.client.config.httpbin.read-timeout=2500
    feign.client.config.httpbin.connect-timeout=800
    ```

    3. 单个接口代码配置，注意配置类不能使用@component 注解，否则会全局生效

    ```Java
    public class CustomFeignConfiguration {

        @Bean
        public Request.Options request() {
            return new Request.Options(1000, 3000);
        }
    }

    @FeignClient(name = "service-httpbin"
            , contextId = "httpbin", configuration = CustomFeignConfiguration.class
    )
    ```

- ribbon 全局配置

```Java
ribbon:
  ReadTimeout: 5000 # 请求处理的超时时间
  ConnectTimeout: 2000 # 请求连接超时时间
  # 以下两个重试配置表示同一个接口最多调用2次，且第二次重试不在同一个实例上
  MaxAutoRetries: 0 #同一台实例最大重试次数,不包括首次调用
  MaxAutoRetriesNextServer: 1 # 切换实例的重试次数
  OkToRetryOnAllOperations: false #重试操作，false表示只会对get接口进行重试
```

###   非负载均衡下调用

- feignClient 指定 url 则不会走 loadbalancer 调用，会直接使用 okHttpClient 进行调用，参考关系图中[1]
- OkHttpClient 默认超时配置如下

![img](/images/feign/07.png)

- 若配置了 feign 接口超时，则会覆盖 okHttpClient 配置

![img](/images/feign/08.png)

###   负载均衡下的调用

- feignClient 未指定 url 时会根据 name 找到对应的服务，走 loadbalancer 调用，参考关系图中[2]
- 若指定了 feign 超时配置，则使用 feign 超时配置，否则使用 ribbon 超时配置

![img](/images/feign/09.png)

###  超时机制总结

1. Hystrix 配置的超时时间需要大于 feign & ribbon 配置的超时时间
2. 由于 ribbon 有重试机制，所以 hystrix 配置的超时时间需要大于单个请求超时时间 * 请求的总次数（**MaxAutoRetries+ 1）\*（MaxAutoRetriesNextServer+1**） 
3. 只要配置了 feign 超时，那么无论是 Okhttp 还是 ribbon 的超时都会被覆盖
4. feign 超时需要同时配置 connectTimeout & readTimeout
5. 建议 hystrix、feign、ribbon 都配置默认的超时时间，且 hystrix 超时时间 > feign == ribbon
6. 针对独立接口的配置，需要注意 hystrix、feign 超时都需要配置

##  定制 CachingSpringLoadBalancerFactory，实现负载均衡到本地服务上

###  自定义 CachingSpringLoadBalancerFactory，给所有服务添加本地地址

```Java
public class LocalCachingSpringLoadBalancerFactory extends CachingSpringLoadBalancerFactory {

    private volatile Map<String, FeignLoadBalancer> cache = new ConcurrentReferenceHashMap<>();
    private String localHost;
    private Integer localPort;

    public LocalCachingSpringLoadBalancerFactory(SpringClientFactory factory, String localHost, Integer localPort) {
        super(factory);
        this.localHost = localHost;
        this.localPort = localPort;
    }

    public FeignLoadBalancer create(String clientName) {
        FeignLoadBalancer client = this.cache.get(clientName);
        if(client != null) {
            return client;
        }
        IClientConfig config = this.factory.getClientConfig(clientName);
        ILoadBalancer lb = this.factory.getLoadBalancer(clientName);
        // 添加本地地址
        lb.addServers(Lists.newArrayList(new Server(this.localHost, this.localPort)));
        ServerIntrospector serverIntrospector = this.factory.getInstance(clientName, ServerIntrospector.class);
        client = loadBalancedRetryFactory != null ? new RetryableFeignLoadBalancer(lb, config, serverIntrospector,
                loadBalancedRetryFactory) : new FeignLoadBalancer(lb, config, serverIntrospector);
        this.cache.put(clientName, client);
        return client;
    }
}
```

###  注入 bean，覆盖默认的配置 FeignRibbonClientAutoConfiguration

```Java
@Configuration
public class LocalRibbonConfiguration {

    @Value("${server.local.host:127.0.0.1}")
    private String localHost;

    @Value("${server.local.port:8000}")
    private Integer localPort;

    @Bean
    @Primary
    public CachingSpringLoadBalancerFactory cachingLBClientFactory(
            SpringClientFactory factory) {
        return new LocalCachingSpringLoadBalancerFactory(factory, localHost, localPort);
    }
}
```

###  使用 BeanPostProcessor 修改 LoadBalancerFeignClient 中的 CachingSpringLoadBalancerFactory

```Java
public class LocalCachingSpringLoadBalancerFactoryBeanPostProcessor implements BeanPostProcessor {

    private String localHost;
    private Integer localPort;

    public LocalCachingSpringLoadBalancerFactoryBeanPostProcessor(String localHost, Integer localPort) {
        this.localHost = localHost;
        this.localPort = localPort;
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {

        if (bean instanceof LoadBalancerFeignClient) {
            try {
                var loadBalancerFeignClient = (LoadBalancerFeignClient) bean;
                Field lbClientFactory = FieldUtils.getDeclaredField(LoadBalancerFeignClient.class, "lbClientFactory", true);
                lbClientFactory.setAccessible(true);
                var clientFactory = FieldUtils.getDeclaredField(LoadBalancerFeignClient.class, "clientFactory", true);
                clientFactory.setAccessible(true);
                // 获取到 springClientFactory
                var springClientFactory = (SpringClientFactory) clientFactory.get(loadBalancerFeignClient);
                // 构建local
                LocalCachingSpringLoadBalancerFactory cachingSpringLoadBalancerFactory = new LocalCachingSpringLoadBalancerFactory(springClientFactory, localHost, localPort);
                // 设置到值里面
                lbClientFactory.set(loadBalancerFeignClient, cachingSpringLoadBalancerFactory);
            } catch (IllegalAccessException e) {
                throw new RuntimeException(e);
            }
        }

        return bean;
    }
}
```
