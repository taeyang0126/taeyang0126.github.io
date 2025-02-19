---
title: Spring Boot 单元测试最佳实践
abbrlink: 45275
date: 2025-02-19 23:55:22
tags: [单元测试, spring boot]
categories: [spring boot]
keywords: [spring boot, 单元测试]
---


> 标题党，各位大佬手下留情~_~

单测是十分重要的，既能提升代码健壮性，又能降低代码重构的风险；但在当下国内环境中，单测又是不现实的，单测耗费的时间可能比开发还多，这对老板来说显然是不能接受的(万恶的资本家)；关键业务缺少单测不仅提高了测试回归的难度，也成为了代码重构的拦路虎，看着那一堆屎山代码，要是没有单测的保障，你敢去重构吗!!(不怕死的当我没说)

> !! 笔者使用的是 2.6.6 版本


![image.png](/images/spring/boot/01.png)
> SpringBoot 常规单元测试

常规的单元测试如下图所示，这样会将整个容器启动起来，需要加载各种各样的外部化配置，耗时时间长且容易失败；大部分场景下我们只是测试某个功能，只需加载部分组件即可

![image.png](/images/spring/boot/02.png)

> SpringBoot 单元测试指定加载配置

为了解决以上问题，我们可以指定配置进行加载，避免加载整个容器；如下图所示，只会加载基础的Spring容器以及IdGenerator，大大提升了单测的效率

`推荐学习`[spring-test-examples](https://github.com/chanjarster/spring-test-examples)

![image.png](/images/spring/boot/03.png)

> SprongBoot 固定组件单元测试

以上指定配置加载已经基本满足了我们的需求(加载部分组件)；但在日常开发中，要求每次单测都指定加载的配置本身就是个伪命题，一是因为本身开发可能对于需要加载的配置不太熟悉，二是因为这种重复的工作过于啰嗦；那么我们该怎么优化这个流程呢？

1. 要简化配置，第一步就是禁用所有自动加载的配置
- 仿造`SpringBootTest`的注解，构建一个元注解，禁用所有自动加载的配置

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@BootstrapWith(EmptyTestContextBootstrapper.class)
@ExtendWith(SpringExtension.class)
@OverrideAutoConfiguration(enabled = false)
@TypeExcludeFilters(EmptyTypeExcludeFilter.class)
public @interface TestEmptyEnvironment {

    String[] properties() default {};

    boolean useDefaultFilters() default true;

    ComponentScan.Filter[] includeFilters() default {};

    ComponentScan.Filter[] excludeFilters() default {};

}

public class EmptyTestContextBootstrapper extends SpringBootTestContextBootstrapper {

    @Override
    protected String[] getProperties(final Class<?> testClass) {
        final TestEmptyEnvironment annotation = AnnotatedElementUtils.getMergedAnnotation(testClass, TestEmptyEnvironment.class);
        return (annotation != null) ? annotation.properties() : null;
    }

}


public class EmptyTypeExcludeFilter extends AnnotationCustomizableTypeExcludeFilter {
    private final TestEmptyEnvironment annotation;

    EmptyTypeExcludeFilter(final Class<?> testClass) {
        this.annotation = AnnotatedElementUtils.getMergedAnnotation(testClass, TestEmptyEnvironment.class);
    }

    @Override
    protected boolean hasAnnotation() {
        return this.annotation != null;
    }

    @Override
    protected ComponentScan.Filter[] getFilters(final FilterType type) {
        switch (type) {
            case INCLUDE:
                return this.annotation.includeFilters();
            case EXCLUDE:
                return this.annotation.excludeFilters();
            default:
                throw new IllegalStateException("Unsupported type " + type);
        }
    }

    @Override
    protected boolean isUseDefaultFilters() {
        return this.annotation.useDefaultFilters();
    }

    @Override
    protected Set<Class<?>> getDefaultIncludes() {
        return Collections.emptySet();
    }

    @Override
    protected Set<Class<?>> getComponentIncludes() {
        return Collections.emptySet();
    }
}

```


- **TestEmptyEnvironment**: 禁用所有自动配置，只加载最基础的spring容器
- **EmptyTestContextBootstrapper**: 重写properties加载方法，将TestEmptyEnvironment注解中的properties属性加载到容器中
- **EmptyTypeExcludeFilter**: 容器过滤
- **@OverrideAutoConfiguration(enabled = false)**: 禁用自动配置加载，如果是boot2.2.x之前的版本，此配置不会生效，可以使用 @ContextConfiguration(classes = EmptyConfiguration.class) 替代，其中 EmptyConfiguration 表示空的配置

2. 要简化单测的流程，就需要将重复的工作声明化，即使用注解完成自动配置的大部分工作；具体需要如何处理呢，我们可以将常用单测注解进行声明化处理，编写单测时只需引入对应组件的注解即可
- **service** 仅对service进行单测，可声明以下注解，构建一个简单的spring容器即可，需要测试哪个service，直接Import加载即可；若此service中有其他注解，可进行mock处理，这里不再赘述mock的使用
```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@TestEmptyEnvironment
public @interface TestService {
}


@TestService
// 若是boot2.2.x之后这里不再需要，因为元注解中已经增加了 @ExtendWith(SpringExtension.class)
// @RunWith(SpringRunner.class)
@Import(value = {
        LabelService.class
})
public class SimpleServiceTest {

    @Autowired
    private LabelService labelService;

}
```
- **redis** 对redis进行单测，需要引入redis相关的自动配置，如下代码中的 RedisTestAutoConfiguration 类，不同项目使用的框架不同，自动装配也不相同，这里需要根据项目进行个性化设置

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@TestEmptyEnvironment
@ImportAutoConfiguration(classes = {
        RedisTestAutoConfiguration.class
})
public @interface TestRedis {


}

@Configuration
@ImportAutoConfiguration(classes = {
        LettuceAutoConfiguration.class
})
public class RedisTestAutoConfiguration {
}

@TestRedis
// 优先级最高，可覆盖项目中的配置文件
@TestPropertySource(properties = {
        "redis.host=localhost:6379"
})
public class SimpleRedisTest {

    @Autowired
    private RedisClient redisClient;

    @Test
    public void test_getRedisHost() {
        assertThat(redisClient)
        .isNotNull();
    }
}
```

- **kafka** kafka单测也和redis一样，进行个性化配置即可

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@TestEmptyEnvironment
@ImportAutoConfiguration(classes = {
        KafkaTestAutoConfiguration.class
})
public @interface TestKafka {
}

@Configuration
@ImportAutoConfiguration(classes = {
        KafkaAutoConfiguration.class
})
public class KafkaTestAutoConfiguration {
}

```

- 其他组件也都是一样的做法，笔者暂时用到的组件如下
  - feign
  - kafka
  - mongodb
  - redis
  - service
  - controller
  - mybatis

tips: 如果不知道组件需要加载哪些配置，可通过完整启动项目打印所有装配的配置，然后再筛选需要的即可
```java
@Component
public class LoaderPrint implements CommandLineRunner {

    @Autowired
    private ApplicationContext applicationContext;

    @Override
    public void run(String... args) throws Exception {
        Arrays.stream(applicationContext.getBeanDefinitionNames())
                .forEach(System.out::println);
    }
}
```





