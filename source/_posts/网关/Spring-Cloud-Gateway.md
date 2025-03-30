---
title: Spring Cloud Gateway
abbrlink: 45275
date: 2025-02-09 13:25:22
tags: [网关, spring cloud gateway, spring cloud]
categories: [网关]
keywords: [网关, spring cloud gateway]
---

## 重要属性
1. GATEWAY_ORIGINAL_REQUEST_URL_ATTR
  - 记录原始的url请求
  - 错误重试时可以用原始URI重试
  - 可以记录完整的请求转换链路
  - 故障分析时可以知道请求的来源
  - 在路由重写时需要更新此属性
2. GATEWAY_REQUEST_URL_ATTR
  - 存储请求将要转发的目标URL
  - 后续的过滤器和路由可以通过这个属性知道请求要被转发到哪里
  - 在路由重写时需要更新此属性
3. PRESERVE_HOST_HEADER_ATTRIBUTE
  - 控制是否保留原始请求的 Host 头
  - true: 转发请求时会保留客户端的原始 Host header
  - false: 会使用目标服务的 Host
  - 使用场景：假设自定义的过滤器修改了host属性，如果没有开启此配置，那么后续的处理可能影响此属性，这时候需要开启此配置

## 重要过滤器
1. RetryGatewayFilterFactory
    > 重试过滤器

    ```java
    - name: Retry #重试策略:目前只对提供者下线导致的连接异常重试，需持续观察异常情况
      args: 
        retries: 1
        series: #不对http状态来判断是否进行重试
        exceptions: io.netty.channel.AbstractChannel$AnnotatedConnectException
    ```
