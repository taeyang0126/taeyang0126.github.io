---
title: kafka-producer
tags:
  - 分布式
  - 消息队列
  - 中间件
  - kafka
categories:
  - 消息队列
abbrlink: 17349
date: 2025-02-09 19:52:22
---

## 重要参数

| 配置项                                    | 默认值           | 说明                                                         | 示例                                                         |
| :---------------------------------------- | :--------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **bootstrap.servers**                     |                  | Kafka broker 地址                                            | `*properties*.put(ProducerConfig.*BOOTSTRAP_SERVERS_CONFIG*, *brokerList*);` |
| **key.serializer**                        |                  | Key 序列化器实现 Serializer 接口                             | `*properties*.put(ProducerConfig.*KEY_SERIALIZER_CLASS_CONFIG*, StringSerializer.class.getName());` |
| **value.serializer**                      |                  | Value 序列化器实现 Serializer 接口                           | `*properties*.put(ProducerConfig.*VALUE_SERIALIZER_CLASS_CONFIG*, StringSerializer.class.getName());` |
| **acks**                                  | 1                | 指定分区中必须有多少个副本收到消息，生产者才认为消息写入成功，默认 1acks=1 生产者发送消息到分区 leader，leader 将消息写入本地日志后即返回成功acks=0 生产者发送消息到分区 leader，不等待 leader 写入本地日志，直接返回成功acks=all/acks=-1 生产者发送消息到分区 leader，leader 将消息写入本地日志后，等待 ISR 中所有副本都写入成功后才返回成功 acks=all 等价于 acks=-1 并不一定最可靠，因为 ISR 中的副本可能会因为各种原因不可用，导致 ISR 副本只有 leader 节点一个，如果需要获得更高的可靠性，需要配置 min.insync.replicas 参数（broker 参数，建议配置大于 1 & 小于副本数量），此参数表示 ISR 中至少有多少个副本是可用的 | `*properties*.put(ProducerConfig.*ACKS_CONFIG*, "all");`     |
| **retries**                               |                  | 配置重试次数，重试次数只限制于可重试的异常，不可重试的异常此参数无意义 | `*properties*.put(ProducerConfig.*RETRIES_CONFIG*, 10);`     |
| **retry.backoff.ms**                      |                  | 重试的时间间隔                                               | `*properties*.put(ProducerConfig.*RETRY_BACKOFF_MS_CONFIG*, 100);` |
| **max.in.flight.requests.per.connection** | 5                | 配置单个连接最大缓存请求数量，发送的请求 ProducerBatch 会缓存到 InFlightRequests 中，此参数限制 InFlightRequests 的大小，默认 5，即每个连接最多只能缓存 5 个未响应的请求 | `*properties*.put(ProducerConfig.*MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION*, 5);` |
| request.timeout.ms                        | 30 * 1000        | Producer 等待请求响应的最长时间，默认 30s，如果在 30s 内没有收到响应，那么会重发消息这个参数需要比 broker 端的参数 replica.lag.time.max.ms（Follower 副本能够落后 Leader 副本的最长时间间隔，默认值是 10 秒）大，否则可能会出现消息丢失 | `*properties*.put(ProducerConfig.*REQUEST_TIMEOUT_MS_CONFIG*, 30 * 1000);` |
| linger.ms                                 | 0                | 指定生产者发送 ProducerBatch 之前等待更多消息加入到 ProducerBatch 的时间，默认 0，即立即发送，这个参数与 TCP 的 Nagle 算法类似 | `*properties*.put(ProducerConfig.*LINGER_MS_CONFIG*, 0);`    |
| send.buffer.bytes                         | 128 * 1024       | 设置 socket 发送缓冲区大小，默认 128k，如果设置为 -1，那么使用操作系统默认的大小 | `*properties*.put(ProducerConfig.*SEND_BUFFER_CONFIG*, 128 * 1024);` |
| interceptor.classes                       |                  | 消息发送拦截器消息发送到 broker 之前拦截，可修改消息内容实现 ProducerInterceptor 接口 | `*properties*.put(ProducerConfig.*INTERCEPTOR_CLASSES_CONFIG*, ProducerInterceptorPrefix.class.getName());` |
| buffer.memory                             | 32 * 1024 * 1024 | 缓存消息大小生产者主线程会将消息缓存到 RecordAccumulator 中，然后由 Sender 线程发送到 Kafka，这里的参数是 RecordAccumulator 的缓存大小，默认 32M | `// 缓存消息大小，生产者主线程会将消息缓存到RecordAccumulator中，然后由Sender线程发送到Kafka，这里的参数是RecordAccumulator的缓存大小，默认32M *properties*.put(ProducerConfig.*BUFFER_MEMORY_CONFIG*, 32 * 1024 * 1024L);` |
| max.block.ms                              | 60 * 1000        | RecordAccumulator 缓存空间不足时，最大阻塞时间，默认 60s     | `// RecordAccumulator缓存空间不足时，最大阻塞时间，默认60s *properties*.put(ProducerConfig.*MAX_BLOCK_MS_CONFIG*, 60 * 1000);` |
| batch.size                                | 16 * 1024        | 单次发送消息大小，kafka 会将消息组装为 ProducerBatch，此参数影响 ProducerBatch 的大小，如果消息小于此参数，则会通过 BufferPool 进行复用，默认 16k | `*properties*.put(ProducerConfig.*BATCH_SIZE_CONFIG*, 16 * 1024);` |
| max.request.size                          | 1024 * 1024      | 客户端能发送消息的最大值，默认 1M，不建议修改这个值，因为涉及到 broker 端的参数客户端能发送消息的最大值，默认 1M，不建议修改这个值，因为涉及到 broker 端的参数 | `*properties*.put(ProducerConfig.*MAX_REQUEST_SIZE_CONFIG*, 1024 * 1024);` |
| compression.type                          | none             | 消息压缩方式，默认是 none，支持 none、gzip、snappy、lz4，如果需要提升吞吐量，可以开启消息压缩 | `*properties*.put(ProducerConfig.*COMPRESSION_TYPE_CONFIG*, "none");` |
| connections.max.idle.ms                   | 9 * 60 * 1000    | 关闭闲置的连接，默认 9 分钟，如果生产者在 9 分钟内没有发送消息，那么生产者会关闭连接，如果生产者在 9 分钟内发送消息，那么生产者会重置闲置时间 | `*properties*.put(ProducerConfig.*CONNECTIONS_MAX_IDLE_MS_CONFIG*, 9 * 60 * 1000);` |

```Java
static {
    properties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, brokerList);
    properties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
    properties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());

    // 发送拦截器
    properties.put(ProducerConfig.INTERCEPTOR_CLASSES_CONFIG, ProducerInterceptorPrefix.class.getName());

    // 生产者发送配置
    // 缓存消息大小，生产者主线程会将消息缓存到RecordAccumulator中，然后由Sender线程发送到Kafka，这里的参数是RecordAccumulator的缓存大小，默认32M
    properties.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 32 * 1024 * 1024L);
    // RecordAccumulator缓存空间不足时，最大阻塞时间，默认60s
    properties.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, 60 * 1000);
    // 单次发送消息大小，kafka会将消息组装为ProducerBatch，此参数影响ProducerBatch的大小，如果消息小于此参数，则会通过pBufferPool进行复用，默认16k
    properties.put(ProducerConfig.BATCH_SIZE_CONFIG, 16 * 1024);
    // 配置单个连接最大缓存请求数量，发送的请求ProducerBatch会缓存到InFlightRequests中，此参数限制InFlightRequests的大小，默认5，即每个连接最多只能缓存5个未响应的请求
    properties.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);

    // 重要的生产者参数
    // 指定分区中必须有多少个副本收到消息，生产者才认为消息写入成功，默认1
    // acks=1 生产者发送消息到分区leader，leader将消息写入本地日志后即返回成功
    // acks=0 生产者发送消息到分区leader，不等待leader写入本地日志，直接返回成功
    // acks=all/acks=-1 生产者发送消息到分区leader，leader将消息写入本地日志后，等待ISR中所有副本都写入成功后才返回成功
    // acks=all 等价于 acks=-1 并不一定最可靠，因为ISR中的副本可能会因为各种原因不可用，导致ISR副本只有leader节点一个，如果需要获得更高的可靠性，需要配置 min.insync.replicas 参数，此参数表示ISR中至少有多少个副本是可用的
    properties.put(ProducerConfig.ACKS_CONFIG, "all");

    // 客户端能发送消息的最大值，默认1M，不建议修改这个值，因为涉及到broker端的参数
    // 此参数表示单次网络请求的大小，这次请求中可能包含很多个ProducerBatch
    properties.put(ProducerConfig.MAX_REQUEST_SIZE_CONFIG, 1024 * 1024);
    // 指定生产者发送ProducerBatch之前等待更多消息加入到ProducerBatch的时间，默认0，即立即发送，这个参数与TCP的Nagle算法类似
    properties.put(ProducerConfig.LINGER_MS_CONFIG, 0);
    // 设置socket发送缓冲区大小，默认128k，如果设置为-1，那么使用操作系统默认的大小
    properties.put(ProducerConfig.SEND_BUFFER_CONFIG, 128 * 1024);
    // Producer等待氢气响应的最长时间，默认30s，如果在30s内没有收到响应，那么会重发消息
    // 这个参数需要比broker端的参数replica.lag.time.max.ms（Follower 副本能够落后 Leader 副本的最长时间间隔，默认值是 10 秒）大，否则可能会出现消息丢失
    properties.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30 * 1000);

    // 配置重试次数，重试次数只限制于可重试的异常，不可重试的异常此参数无意义
    properties.put(ProducerConfig.RETRIES_CONFIG, 10);
    // 重试的时间间隔
    properties.put(ProducerConfig.RETRY_BACKOFF_MS_CONFIG, 100);
    // 某些场景下消息的顺序是非常重要的，如果retry重试次数设置大于0 & max.in.flight.requests.per.connection > 1，那么可能会导致消息乱序
    // 比如第一批次消息发送失败，第二批次消息发送成功，第一批次消息重试发送成功，那么第一批次消息就会出现在第二批次消息之后
    // 建议如果需要保证消息的顺序，那么将max.in.flight.requests.per.connection设置为1，而不是设置重试次数为0，不过这样会导致吞吐量下降
    // ? todo-wl 如果重试次数=0，max.in.flight.requests.per.connection>1，怎么保证消息是有序的？
    // -> 因为单次网络包可能包含多个ProducerBatch，kafka在处理的时候会将多个ProducerBatch合并为一个请求，同时对于同一个分区的消息，kafka会保证消息的顺序，所以能保证消息是有序的

    // 消息压缩方式，默认是none，支持none、gzip、snappy、lz4，如果需要提升吞吐量，可以开启消息压缩
    properties.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "none");

    // 关闭闲置的连接，默认9分钟，如果生产者在9分钟内没有发送消息，那么生产者会关闭连接，如果生产者在9分钟内发送消息，那么生产者会重置闲置时间
    properties.put(ProducerConfig.CONNECTIONS_MAX_IDLE_MS_CONFIG, 9 * 60 * 1000);


}

// 幂等性配置
static {
    // 开启幂等性
    properties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
    // 幂等的原理是消费者会被分配一个pid，pid是一个递增的序列号，生产者每发送一条消息就会将<PID,分区>对应的序列号+1
    // 当发送消息时，会将seq发送到broker，broker内存中保存<PID,分区>对应的序列号，如果seq大于broker中的序列号+1，那么broker会将消息写入日志，然后更新序列号
    // 如果seq小于broker中的序列号+1，那么broker会直接返回成功，不会写入日志
    // 如果seq大于broker中的序列号+1，那么broker会返回错误
    // !! Kafka幂等只保证单个生产者会话(session)中单个分区内的幂等性，不保证多个分区之间的幂等性

    // 如果没有配置以下配置，只需要配置上面的配置即可
    // retry重试次数必须大于0
    properties.put(ProducerConfig.RETRIES_CONFIG, 10);
    // acks 必须是 all
    properties.put(ProducerConfig.ACKS_CONFIG, "all");
    // max.in.flight.requests.per.connection 不能大于5
    properties.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);

}

// 事务配置
// 幂等性不能跨分区，如果需要跨分区的幂等性，那么需要使用事务
// 事务可以保证对多个分区写入操作的原子性
// kafka中的事务可以使应用程序将消费消息、生产消息、提交消费位移当做原子操作来处理，同时成功或失败
static {
    // 必须提供唯一的transactional.id，如果transactional.id相同，那么会认为是同一个事务
    // 显示设置
    properties.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "transactional-id");
    // ！！事务要求生产者开启幂等性
}
```

## 如何保证消息顺序

- **retries** > 0 & **max.in.flight.requests.per.connection** = 1

​      推荐使用此方式，一定程度上能保证消息不丢失，但是会导致吞吐量下降；

- **retries** = 0 & **max.in.flight.requests.per.connection** > 1

NetworkClient:

![img](/images/message/kafka/01.png)

​      
