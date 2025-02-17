---
title: Arthas
tags:
  - Arthas
  - 问题排查
categories:
  - Arthas
abbrlink: 17349
date: 2025-02-09 14:51:22
---

- [Arthas的一些特殊用法文档说明 · Issue #71 · alibaba/arthas](https://github.com/alibaba/arthas/issues/71)

- [arthas 获取spring被代理的目标对象 · Issue #1424 · alibaba/arthas](https://github.com/alibaba/arthas/issues/1424)

- [Arthas实践--jad/mc/redefine线上热更新一条龙 · Issue #537 · alibaba/arthas](https://github.com/alibaba/arthas/issues/537)

### 1. 获取当前HttpServletRequest

- 执行某个request方法

    `@org.springframework.web.context.request.RequestContextHolder@currentRequestAttributes().getRequest().xxx`

- 获取全部的请求头

    `@org.springframework.web.context.request.RequestContextHolder@currentRequestAttributes().getRequest().getHeaderNames()`

### 2. 获取spring context 并执行某些操作

   > **前置** 使用tt记录请求，获取到上下文
   >
   > tt -t org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter invokeHandlerMethod -n 3

    tt -i 1000 -w 'target.getApplicationContext().getBean("jdbcTemplate")'

    tt -i 1000 -w 'target.getApplicationContext().getBean("jdbcTemplate").dataSource.ConnectionPool'

    tt -i 1000 -w 'target.getApplicationContext().getBean("jdbcTemplate").getTargetSource().target'

    tt -i 1000 -w 'target.getApplicationContext().getBean("jdbcTemplate").getTargetSource().target.cacheMap'

    tt -i 1000  -w 'target.getApplicationContext().getEnvironment().getProperty("spring.datasource.riskctrl.url")'

### 3. 使用[ognl](https://commons.apache.org/dormant/commons-ognl/language-guide.html)

- 对前置表达式值进行二次计算  #this 表示前置表达式的值 **`.()`** 表示自表达式，产生一个单一值

    **`listeners.size().(#this > 100? 2\*#this : 20+#this)`**

- 对前置表达式进行二次计算，产生一个数组

    **`params[0].{#this == "lei" ?  "yes" : "no"}`**

- 对前置表达式(数组类型)进行二次计算，产生一个新的数组

    **`params.{#this instanceof String ?  "yes" : "no"}`**

- 返回数组中第一个匹配的对象

    **`params.{^#this instanceof Integer}`**

- 调用static方法 使用  **@class@method(****args****)**

    **`@org.springframework.web.context.request.RequestContextHolder@currentRequestAttributes()`**

- 获取静态字段 **@class@field**

### 4. 一些常用命令

- 获取classloader hash，如果是springBoot项目取 org.springframework.boot.loader.LaunchedURLClassLoader

    **`classloader -t`**

- 容器安装 vim

    **`apt-get update && apt-get install -y vim`**

- Ognl 获取spring context

    ```Plain
    # 49c2faae 表示classloader hash
    # cn.hutool.extra.spring.SpringUtil 表示能获取到spring容器的方法
    ognl -c 49c2faae '#beanName="eventDataAuthManage", #bean=@cn.hutool.extra.spring.SpringUtil@getBean(#beanName), @org.springframework.aop.support.AopUtils@getTargetClass(#bean).getName()'
    ```

- Ognl lambda 表达式

    ```Shell
    -- 使用 =:[] 定义lambda即函数
    -- 使用 #getBean() 调用
    ognl -c 49c2faae '
    #getBean =:[@cn.hutool.extra.spring.SpringUtil@getBean(#this)],
    #getBean("syncDataAuthController").dataCodeList'
    ```

- 查找方法

    **`sm com.xx.class`**

- 修改静态变量的值

    **`getstatic com.xyz.HelloWorld s "#s='abc'"`**

- 修改变量的值

    ```Shell
    -- 1. 使用 tt 记录方法调用
    tt -t com.example.UserService getUserById
    -- 2. 查看记录
    tt -l
    -- 3. 修改捕获的对象 target 代表当前被调用方法的对象实例（即 "this" 对象）
    tt -i 1000 -w 'target.name="newName"'
    ```

- 过滤参数类型为class的方法

    ```Shell
    -- 过滤要点就是通过全类名@class拿到class对象，再getName()获取名称
    watch com.wangji92.arthas.plugin.demo.controller.StaticTest invokeClass '{returnObj,throwExp}'  -n 5  -x 3  
    'params[0].getName().equals(@com.wangji92.arthas.plug.demo.controller.User@class.getName())' -v
    ```

- 查找response404的堆栈

    ```Shell
    stack -E javax.servlet.http.HttpServletResponse sendError|setStatus params[0]==404
    ```

### 5. 特殊命令

- Trace 命令多个类、多个方法、指定线程、指定耗时时间

    ```Plain
    # trace -E 表示正则
    trace -E 
    # 表示类是 NioEventLoop 或者 SingleThreadEventExecutor
    'io\.netty\.channel\.nio\.NioEventLoop|io\.netty\.util\.concurrent\.SingleThreadEventExecutor'  
    # 表示方法是 select processSelectedKeys runAllTasks
    'select|processSelectedKeys|runAllTasks' 
    # @Thread arthas提供表示当前线程 #cost arthas提供，表示耗时
    '@Thread@currentThread().getName().contains("IO-HTTP-WORKER-IOPool")&&#cost>500'
    ```

- 获取代理对象的原始对象

    ```Shell
    tt -w '#isProxy=:[ @org.springframework.aop.support.AopUtils@isAopProxy(#this)?1: #this instanceof java.lang.reflect.Proxy ? 0 :-1],#isJdkDynamicProxy =:[@org.springframework.aop.support.AopUtils@isJdkDynamicProxy(#this) ? true :false ],#cglibTarget =:[#hField =#this.getClass().getDeclaredField("CGLIB$CALLBACK_0"),#hField.setAccessible(true),#dynamicAdvisedInterceptor=#hField.get(#this),#fieldAdvised=#dynamicAdvisedInterceptor.getClass().getDeclaredField("advised"),#fieldAdvised.setAccessible(true),1==1? #fieldAdvised.get(#dynamicAdvisedInterceptor).getTargetSource().getTarget():null],#jdkTarget=:[ #hField=#this.getClass().getSuperclass().getDeclaredField("h"),#hField.setAccessible(true),#aopProxy=#hField.get(#this),#advisedField=#aopProxy.getClass().getDeclaredField("advised"),#advisedField.setAccessible(true),1==1?#advisedField.get(#aopProxy).getTargetSource().getTarget():null],#nonProxyResultFunc = :[#proxyResul=#isProxy(#this),#proxyResul== -1 ?#this :#proxyResul== 0? @java.lang.reflect.Proxy@getInvocationHandler(#this):#isJdkDynamicProxy(#this)? #isJdkDynamicProxy(#this) : #cglibTarget(#this)],#nonProxyTarget=#nonProxyResultFunc(target),#nonProxyTarget'  -x 1 -i 1002
    ```

### 6. Vmtool 使用

> `vmtool` 利用 Java 的 Instrumentation API 和 JVM TI（JVM Tool Interface）与 JVM 进行交互，可以绕过spring context 直接获取对象

- 常用子命令
  - `--action getInstances`：获取类的实例
  - `--action forceGc`：强制执行垃圾回收
  - `--action getClassLoader`：获取类加载器信息
- com.xxx.cache.CacheAspect 中的 boolean 变量 cacheEnabled 修改为false

    ```Shell
    vmtool: Arthas 的一个命令，用于对 JVM 进行底层操作。
    -x 3: 设置执行次数限制为 3 次。
    --action getInstances: 指定操作为获取类的实例。
    --className com.xxx.cache.CacheAspect: 指定要操作的类名。
    --express: 后面跟着的是要执行的 OGNL 表达式
    ongl表达式:
    反射获取字段 #field=instances[0].getClass().getDeclaredField("cacheEnabled")
    设置为true #field.setAccessible(true)
    修改字段 #field.set(instances[0],false)

    vmtool -x 3 --action getInstances --className com.xxx.cache.CacheAspect --express '#field=instances[0].getClass().getDeclaredField("cacheEnabled"),#field.setAccessible(true),#field.set(instances[0],false)' -c 3bd94634
    ```

- 修改final变量

    ```Shell
    vmtool -x 4 --action getInstances --className com.wangji92.arthas.plugin.demo.controller.CommonController  --express '#field=instances[0].getClass().getDeclaredField("FINAL_VALUE"),#modifiers=#field.getClass().getDeclaredField("modifiers"),#modifiers.setAccessible(true),#modifiers.setInt(#field,#field.getModifiers() & ~@java.lang.reflect.Modifier@FINAL),#field.setAccessible(true),#field.set(instances[0]," 3333")' -c  18b4aac2
    ```

- 执行某个方法

    ```Shell
    vmtool -x 1 --action getInstances 
    --className com.xx.SyncDataAuthController 
    --express 'instances[0].getDataCodePage(@com.xx.UtilJson@convertValue("{\"pageIndex\":0,\"pageSize\":0}", @com.xx.BaseQuery@class))'
    -c 49c2faae
    ```

- 获取spring context

    ```Shell
    vmtool --action getInstances --className org.springframework.context.ConfigurableApplicationContext --express 'instances[0].getEnvironment().getProperty("server.port")'
    ```

- 获取 spring Environment 配置
    
    ```Shell
    vmtool -x 3 --action getInstances --className org.springframework.core.env.Environment  --express 'instances[0].getProperty("server.port")' -c 7b5a12ae
    ```
