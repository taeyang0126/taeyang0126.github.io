---
title: LoadBalancerClient 自定义
tags:
  - feign
  - rpc
  - 微服务
categories:
  - feign
abbrlink: 17349
date: 2025-02-09 18:52:22
---

## 自定义路由信息

> 日常开发中 loadBalancer 一般是基于服务发现，不需要我们显示的指定；某些场景下（比如单元测试、联调）需要我们自定义 LoadBalancerClient，不走默认的服务发现，而是自定义路由信息

- `LoadBalancerClient` 默认的配置是 `LoadBalancerClientConfiguration`
- 仿造 `LoadBalancerClientConfiguration` 实现自己的配置

> 由于`LoadBalancerClientConfiguration`也是基于 NamedContextFactory，所以我们只需要实现需要修改的配置，其他配置会默认读取`LoadBalancerClientConfiguration`
>
> 比如下面的代码中，自定义了服务路由信息，会根据配置返回服务的路由信息

```Java
public class UserServiceLoadBalanceConfiguration {

    @Bean
    public ReactorLoadBalancer<ServiceInstance> reactorServiceInstanceLoadBalancer(Environment environment,
                                                                                   LoadBalancerClientFactory loadBalancerClientFactory) {
        // 获取当前 loadBalance 的 client name
        // 由于此配置用在 UserRegistrationService 上，所以这里默认 = user-service
        String name = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
        return new RoundRobinLoadBalancer(
                // 这里相当于根据这个name，找到对应的子context，从里面获取到 ServiceInstanceListSupplier 对应的bean
                // 也就是相当于这个 UserRegistrationServiceLoadBalanceConfiguration 下配置的 ServiceInstanceListSupplier -> 也就是 ServiceInstanceListSupplier
                loadBalancerClientFactory.getLazyProvider(name, ServiceInstanceListSupplier.class),
                name
        );
    }

    @Bean
    public ServiceInstanceListSupplier userServiceClientServiceInstanceListSupplier(
            ConfigurableApplicationContext context) {
        return new UserServiceServiceInstanceListSupplier(context.getEnvironment());
    }

}

public class UserServiceServiceInstanceListSupplier implements ServiceInstanceListSupplier {

    private final Environment environment;

    public UserServiceServiceInstanceListSupplier(Environment environment) {
        this.environment = environment;
    }

    @Override
    public String getServiceId() {
        return environment.getProperty("user-service-name", "user-service");
    }

    @Override
    public Flux<List<ServiceInstance>> get() {
        DefaultServiceInstance defaultServiceInstance = new DefaultServiceInstance();
        defaultServiceInstance.setServiceId(getServiceId());
        defaultServiceInstance.setHost(environment.getProperty("user-service-host", "127.0.0.1"));
        defaultServiceInstance.setPort(Integer.parseInt(environment.getProperty("user-service-port", "8080")));
        return Flux.just(Arrays.asList(defaultServiceInstance));
    }
}
```

- 使用，注解上指定配置即可

> @LoadBalancerClient(name = "user-service", configuration = UserServiceLoadBalanceConfiguration.class)

- 以上就能实现自定义路由的功能
