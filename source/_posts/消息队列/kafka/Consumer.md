---
title: kafka-consumer
tags:
  - 分布式
  - 消息队列
  - 中间件
  - kafka
categories:
  - 消息队列
abbrlink: 17349
date: 2025-02-09 19:55:22
---

## 重要参数

| 配置项                      | 默认值           | 说明                                                         | 示例                                                         |
| :-------------------------- | :--------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **bootstrap.servers**       |                  | Kafka broker 地址                                            | `*properties*.put(ProducerConfig.*BOOTSTRAP_SERVERS_CONFIG*, *brokerList*);` |
| **key.deserializer**        |                  | Key 反序列化 实现 Deserializer 接口                          | `*properties*.put(ConsumerConfig.*KEY_DESERIALIZER_CLASS_CONFIG*, StringDeserializer.class.getName());` |
| **value.deserializer**      |                  | Value 反序列化实现 Deserializer 接口                         | `*properties*.put(ConsumerConfig.*VALUE_DESERIALIZER_CLASS_CONFIG*, StringDeserializer.class.getName());` |
| **group.id**                |                  | 消费组 ID                                                    | `*properties*.put(ConsumerConfig.*GROUP_ID_CONFIG*, *groupId*);` |
| **enable.auto.commit**      | true             | 是否开启自动提交默认为 true                                  | `*properties*.put(ConsumerConfig.*ENABLE_AUTO_COMMIT_CONFIG*, false);` |
| **auto.commit.interval.ms** | 5000             | 自动提交间隔时间，只有在 enable.auto.commit 设置为 true 时生效，默认是 5s! ! offset 提交时间点=max（单次 poll 时间， auto.commit.interval.ms） | `*properties*.put(ConsumerConfig.*AUTO_COMMIT_INTERVAL_MS_CONFIG*, 5000);` |
| **auto.offset.reset**       | latest           | 从最早的消息开始消费 默认是 latest，此参数表示当前消费组在没有 offset 的情况下，从哪里开始消费这里的没有 offset 指的是消费组第一次消费或者_consumer_offsets 主题中没有当前消费组的 offset! ! 建议设置为 earliest，否则扩分区时，新增加的消费者可能丢失新分区产生的数据；设置为 earliest 时业务上需要做好幂等处理 | `*properties*.put(ConsumerConfig.*AUTO_OFFSET_RESET_CONFIG*, "earliest");` |
| **max.poll.records**        | 500              | 一次拉取请求中拉取的最大消息数量 默认是 500 条! ! 建议调整此参数，业务处理时间超过 max.poll.interval.ms 会导致 rebalance，所以这里的单次拉取的数据量需要考虑处理时间；max.poll.records < max.poll.interval.ms / 单条消息处理时间 | `*properties*.put(ConsumerConfig.*MAX_POLL_RECORDS_CONFIG*, 500);` |
| **max.poll.interval.ms**    | 5 * 60 * 1000    | 拉取消息线程最长空闲时间，默认是 5 分钟，若超过这个间隔还没有发起 poll 请求，消费者会认为消费者挂掉了，然后触发 rebalance因为 poll 方法还涉及业务处理，所以如果业务处理时间过长，那么需要适当增大此值，或者减少单次拉取的消息数量! ! 如果业务处理时间较长，一定要增加此配置，否则会导致 rebalance | `*properties*.put(ConsumerConfig.*MAX_POLL_INTERVAL_MS_CONFIG*, 5 * 60 * 1000);` |
| **heartbeat.interval.ms**   | 3 * 1000         | 配置消费者的最大心跳间隔时间，默认是 3s心跳间隔时间是指消费者发送心跳给 broker 的时间间隔必须比 session.timeout.ms 小，一般是 session.timeout.ms 的 1/3 | `*properties*.put(ConsumerConfig.*HEARTBEAT_INTERVAL_MS_CONFIG*, 3 * 1000);` |
| **session.timeout.ms**      | 10 * 1000        | 配置消费者与 broker 的会话超时时间，默认是 10s超过此时间 broker 没有收到消费者的心跳，那么 broker 会认为消费者挂掉了，然后触发 rebalance! ! 此参数不能配置过大！！ |                                                              |
| fetch.max.bytes             | 50 * 1024 * 1024 | 一次请求从 kafka 中拉取的最大数据量，默认是 50M，此参数不是绝对的最大值，如果一条消息的大小比此参数还大，那么一次请求也会拉取这条消息 | `*properties*.put(ConsumerConfig.*FETCH_MAX_BYTES_CONFIG*, ConsumerConfig.*DEFAULT_FETCH_MAX_BYTES*);` |
| max.partition.fetch.bytes   | 1 * 1024 * 1024  | 一次请求从 kafka 中拉取单个分区的最大数据量，默认是 1M       | `*properties*.put(ConsumerConfig.*MAX_PARTITION_FETCH_BYTES_CONFIG*, ConsumerConfig.*DEFAULT_MAX_PARTITION_FETCH_BYTES*);` |
| connections.max.idle.ms     | 9 * 60 * 1000    | 指定多久之后关闭闲置的连接，默认是 9 分钟                    | `*properties*.put(ConsumerConfig.*CONNECTIONS_MAX_IDLE_MS_CONFIG*, 9 * 60 * 1000);` |
| receive.buffer.bytes        | 64 * 1024        | 设置 socket 接收消息缓冲区（SO_RCVBUF）的大小，默认是 64KB，如果设置为 -1，那么使用操作系统的默认值，如果 Consumer 与 Kafka 处于不同的数据中心，那么可以适当增大此值 | `*properties*.put(ConsumerConfig.*RECEIVE_BUFFER_CONFIG*, 64 * 1024);` |
| send.buffer.bytes           | 128 * 1024       | 设置 socket 发送消息缓冲区（SO_SNDBUF）的大小，默认是 128KB，如果设置为 -1，那么使用操作系统的默认值，如果 Consumer 与 Kafka 处于不同的数据中心，那么可以适当增大此值 | `*properties*.put(ConsumerConfig.*SEND_BUFFER_CONFIG*, 128 * 1024);` |
| request.timeout.ms          | 30 * 1000        | 配置 consumer 等待请求响应的最大时间，默认是 30s             | `*properties*.put(ConsumerConfig.*REQUEST_TIMEOUT_MS_CONFIG*, 30 * 1000);` |

```Java
static {
    properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, brokerList);
    properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
    properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
    properties.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);

    // 提交，默认是自动提交，间隔是5s
    // properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, true);
    // properties.put(ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG, 5000);
    // 调整为手动提交
    properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
    // 自动提交间隔时间，只有在enable.auto.commit设置为true时生效，默认是5s
    properties.put(ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG, 5000);

    // 从最早的消息开始消费 默认是latest，此参数表示当前消费组在没有offset的情况下，从哪里开始消费
    // 这里的没有offset指的是消费组第一次消费或者_consumer_offsets主题中没有当前消费组的offset
    properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

    // 一次请求从kafka中拉取的最大数据量，默认是50M，此参数不是绝对的最大值，如果一条消息的大小比此参数还大，那么一次请求也会拉取这条消息
    properties.put(ConsumerConfig.FETCH_MAX_BYTES_CONFIG, ConsumerConfig.DEFAULT_FETCH_MAX_BYTES);
    // 一次请求从kafka中拉取单个分区的最大数据量，默认是1M
    properties.put(ConsumerConfig.MAX_PARTITION_FETCH_BYTES_CONFIG, ConsumerConfig.DEFAULT_MAX_PARTITION_FETCH_BYTES);

    // 一次拉取请求中拉取的最大消息数量 默认是500条
    properties.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);

    // 指定多久之后关闭闲置的连接，默认是9分钟
    properties.put(ConsumerConfig.CONNECTIONS_MAX_IDLE_MS_CONFIG, 9 * 60 * 1000);

    // 设置socket接收消息缓冲区(SO_RCVBUF)的大小，默认是64KB，如果设置为-1，那么使用操作系统的默认值，如果Consumer与Kafka处于不同的数据中心，那么可以适当增大此值
    properties.put(ConsumerConfig.RECEIVE_BUFFER_CONFIG, 64 * 1024);
    // 设置socket发送消息缓冲区(SO_SNDBUF)的大小，默认是128KB，如果设置为-1，那么使用操作系统的默认值，如果Consumer与Kafka处于不同的数据中心，那么可以适当增大此值
    properties.put(ConsumerConfig.SEND_BUFFER_CONFIG, 128 * 1024);

    // 配置consumer等待请求响应的最大时间，默认是30s
    properties.put(ConsumerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30 * 1000);

    // todo-wl 配置消费者的事务隔离级别
    // properties.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");

    // !! 配置消费者的最大心跳间隔时间，默认是3s
    // 心跳间隔时间是指消费者发送心跳给broker的时间间隔
    // 必须比session.timeout.ms小，一般是session.timeout.ms的1/3
    properties.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, 3 * 1000);
    // !! 配置消费者与broker的会话超时时间，默认是10s
    // 超过此时间broker没有收到消费者的心跳，那么broker会认为消费者挂掉了，然后触发rebalance
    properties.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 10 * 1000);

    // !! 拉取消息线程最长空闲时间，默认是5分钟，若超过这个间隔还没有发起poll请求，消费者会认为消费者挂掉了，然后触发rebalance
    // 因为poll方法还涉及业务处理，所以如果业务处理时间过长，那么需要适当增大此值，或者减少单次拉取的消息数量
    properties.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 5 * 60 * 1000);

}
```

## Kafka-rebalance

- [kafka-rebalancing](https://redpanda.com/guides/kafka-performance/kafka-rebalancing)
- 发生再平衡的场景
  - 消费者加入或离开
  - 消费者遇到暂时故障或网络中断
  - 消费者闲置时间过长
  - 扩大了主题分区
- 再平衡的副作用
  - 延迟增加
  - 吞吐量降低
  - 资源使用量增加
  - 潜在的数据重复和丢失
  - 复杂性增加
- 减少再平衡的措施
  - 增加会话超时时间 session.timeout.ms，此参数不能设置太高，不然导致消费者长时间不活动进而导致消息堆积；heartbeat.interval.ms 此参数
  - ​       需要小于 session.timeout.ms，一般是 1/3
  - 减少每个主题的分区，每个主题的分区过多会增加重新平衡的频率
  - 增加轮训间隔时间，max.poll.interval.ms 配置规定了消费者被视为非活动并从组中移除前的最长空闲时间，增加此时间助于避免消费者组的频繁更改
- 增量合作再平衡
  -  Kafka 2.4 中引入了增量合作再平衡协议，以最大程度地减少 Kafka 再平衡造成的中断。在传统的再平衡中，组中的所有消费者在重新平衡过程中停止使用数据，通常称为“停止世界效应”。这会导致数据处理延迟和中断。
  -  增量合作再平衡协议将再平衡拆分为更小的子任务，消费者在这些子任务完成后继续使用数据。因此，重新平衡发生得更快，对数据处理的中断更少。
  -  该协议还为再平衡过程提供了更精细的控制。例如，它允许使用者根据其当前负载和容量协商他们将使用的特定分区集。这可以防止单个使用者的过载，并确保以更平衡的方式分配分区。
