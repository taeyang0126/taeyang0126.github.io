---
title: spring-kafka
tags:
  - 分布式
  - 消息队列
  - 中间件
  - kafka
  - spring
categories:
  - 消息队列
abbrlink: 17349
date: 2025-02-09 19:58:22
---

>  Spring kafka 版本 2.8.4

## 网站资料

- [spring-kafka(2.8.11)](https://docs.spring.io/spring-kafka/docs/2.8.11/reference/html/#message-listener-container)
- [baeldung-spring-kafka](https://www.baeldung.com/?s=spring+kafka)

## offset管理

### Kafka 自动提交 offset

- enable.auto.commit=true
- auto-commit-interval 自动提交的时间间隔

​      比如 1s，那么自动提交的时间点 deadline 就是当前时间 +1s，但是自动提交 offset 的线程也是 poll 线程，所以提交 offset 的时间不一定是固定的 1s，会有下面几种情况

      A.  业务处理时间 >= auto-commit-interval  提交 offset 的时间点就是每次 poll 的时候，由于业务处理时间已经大于自定提交间隔，那么每次 poll 的时候当前时间一定大于 deadline，

      所以一定会进行一次 offset 提交（异步提交），这里提交的 offset 区间就是单次拉取消息的数量大小 max.poll.records

      B.  业务处理时间 << auto-commit-interval  提叫 offset 的时间点可能在第 n 次 poll 的时候（假设 m=业务处理时间，要求  $$n * m$$  > auto-commit-interval），这时候会进行一次一次 offset 提交（异提   交），这里提交的 offset 区间= $$n * $$max.poll.records 

- 自动提交流程

```Java
public void maybeAutoCommitOffsetsAsync(long now) {
    if (autoCommitEnabled) {
        nextAutoCommitTimer.update(now);
        if (nextAutoCommitTimer.isExpired()) {
            nextAutoCommitTimer.reset(autoCommitIntervalMs);
            doAutoCommitOffsetsAsync();
        }
    }
}
```

![img](/images/message/kafka/02.png)

### SpringKafka 提交 offset 流程

- 前置条件： **enable-auto-commit** = false
- ackMode = *RECORD*

​      业务消息处理完成之后，即 doInvokeOnMessage 方法之后，会对发送每条消息的 offset 给 broker

![img](/images/message/kafka/03.PNG)

- ackMode != *RECORD*

![img](/images/message/kafka/04.png)

- AckMode 解析

| 类型               | 说明                                                         |
| :----------------- | :----------------------------------------------------------- |
| *RECORD*           | 自动提交每条消息处理完后提交 offset监听模式不支持批量，只支持单条消息业务处理完成后向 broker 提交 offset |
| *BATCH*            | 自动提交默认的类型一批消息处理完成后再提交 offset消息处理完成后会记录在 acks 中，再次 poll 的时候会将 akcs 转换为 offset 并提交到 broker |
| *TIME*             | 自动提交经过 ackTime 之后提交 offset消息处理完成后会记录在 acks 中 |
| *COUNT*            | 自动提交消息消费数量超过此配置后提交消息处理完成后会记录在 acks 中 |
| *COUNT_TIME*       | 自动提交满足 COUNT 或 *TIME* 时提交 offset                   |
| *MANUAL*           | 手动提交业务处理后调用 acknowledgment.acknowledge（） 提交 offset（指的是内存中维护的 offset）真正向 broker 提交 offset 还是在下一次 poll（）方法执行时 |
| *MANUAL_IMMEDIATE* | 手动提交业务处理后调用 acknowledgment.acknowledge（） 提交 offset提交 offset 指向 broker 提交 offset，而不是维护内存中的数据 |

### 向 Broker 提交 offset 流程

- 同步提交 syncCommits=true（**默认**）
- 异步提交 syncCommits=false

![img](/images/message/kafka/05.png)

## [异常处理](https://rq3nt70g815.feishu.cn/wiki/RO2qwqD4YiF4W8kQXmPcos02n8f)

### 默认的异常处理器 DefaultErrorHandler

- 此处理会重试 n 次，n 次重试都失败后会跳过当前失败的消息，offset 推进一位，所以会导致失败消息丢失！
- 默认重试 9 次，每次重试之前没有间隔

![img](/images/message/kafka/06.png)

- 业务处理失败 & 重试次数 < 9，抛出异常；会重新 poll 消息进行消费；

假设拉取的整批消息中第 n 条消息消费失败（n > 1），那么在消费失败时会先提交 offset，保证前面已经消费的 offset 正常提交

![img](/images/message/kafka/07.png)

- 定义重试次数 & 重试间隔

```Java
FixedBackOff fixedBackOff = new FixedBackOff(100, 1);
DefaultErrorHandler defaultErrorHandler = new DefaultErrorHandler(fixedBackOff);
kafkaMessageListenerContainer.setCommonErrorHandler(defaultErrorHandler);
```

- 批量消费时，遇到异常需要抛出 BatchListenerFailedException，否则会重试整个批次，重试次数过后会越过整个批次的 offset

```Java
// 3 指的是失败最小消息的index，重试会从这里开始
BatchListenerFailedException batchListenerFailedException = new BatchListenerFailedException("批次消费失败", 3);
throw batchListenerFailedException;
```

### 优雅的异常处理

默认的异常处理器重试失败仅仅打印日志，对于系统来说消息就丢失了。

所以需要重写 ConsumerRecordRecoverer 接口，将失败的消息发送到死信队列中，便于后续人工或程序进行处理

```Java
// 自定义重试次数 & 重试间隔
FixedBackOff fixedBackOff = new FixedBackOff(2000, 1);
// 自定义消息recover，针对不同类型的消息，转发到不同的topic中
DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(kafkaTemplate, (record, exception) -> {
    log.error("消息消费失败, topic: {}, partition: {}, offset: {}, data: {}", record.topic(), record.partition(), record.offset(), record.value());
    if (exception.getCause() instanceof ArithmeticException) {
        return new TopicPartition(record.topic() + ".arithmetic.failures", record.partition());
    }
    return new TopicPartition(record.topic() + ".other.failures", record.partition());
});

DefaultErrorHandler defaultErrorHandler = new DefaultErrorHandler(recoverer, fixedBackOff);
```

### 版本差异

- 当前 spring kafka 版本为 2.8.4，这个版本下因为 DefaultErrorHandler  的原因，无论是自动提交还是手动提交，都会 seek 到失败的消息，再进行重试，所以不会出现消费异常时直接提交 offset 的情况；同时此异常处理器对于某条消息处理失败后，不会跳过这条消息是尝试下一条消息消费，所以理论上不会出现消息丢失的情况，只是消费失败仅仅打印日志不友好，需要参考 2。优雅的异常处理 进行处理
- 在某些早版本的 spring kafka（比如 2.2.4）中，消费失败会直接提交 offset；或者当前这条消息消费失败，下一条消息消费成功后会提交下一条消息的 offset，导致消息丢失；遇到这种情况，以下操作是相对✅的
  - autoCommit = false
  - ackMode = 手动/手动立即
  - 设置错误处理器 SeekToCurrentErrorHandler 更新本地内存拉取 offset 的值为消费失败的 record 的 offset 值，下次 poll 周期就会去重新拉取未提交的 offset。重试 DeadLetterPublishRecover 多次消费失败： 入死信队列，可设置 Topic 名称，默认到 [target_topic]。DLT

![img](/images/message/kafka/08.png)
