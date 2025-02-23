---
title: dockerfile
tags:
    - docker
    - dockerfile
    - 基础镜像
categories:
    - docker
abbrlink: 17349
date: 2025-02-10 17:51:22
---

### Dockerignore

> dockerfile中忽略特定的文件和目录

- 示例表示忽略全部，除了一些必要的

```Dockerfile
*
!pom.xml
!sh
!src
```

### DockerFile

> 构建java基础项目docker镜像

- 提供 maven 编译构建 + 运行
- `BASE_JAVA_IMAGE` 基础的java镜像，建议选择带有jre的基础java镜像
- `MAVEN_IMAGE` maven编译的基础镜像，建议与java版本对应
- 内置 `arthas`
- 内置运行脚本 [run.sh](/files/java/run.sh)

```Dockerfile
####################################################################
# Global ARGs (build-time variables)
# ARG 定义的变量在 FROM 指令中是可以直接使用的
# ARG 定义的变量在不同的构建阶段需要重新定义
# ARG 是构建时的变量，不能在容器中访问，而ENV是环境变量
####################################################################
# Base images
ARG BASE_JAVA_IMAGE=eclipse-temurin:8-jdk-jammy
ARG MAVEN_IMAGE=maven:3-eclipse-temurin-8

# Application info
ARG APP_NAME=aws-starter
ARG APP_VERSION=1.0
ARG MAINTAINER=17674030991@163.com

# Arthas
ARG ARTHAS_VERSION=3.7.1

# Directory structure
ARG WORK_HOME=/opt/deployments
ARG APP_USER=app
ARG APP_GROUP=app

####################################################################
# Stage 0 : Download Arthas
####################################################################
FROM alpine:latest AS arthas-downloader
ARG ARTHAS_VERSION
RUN apk add --no-cache wget unzip && \
    mkdir -p /opt/arthas && \
    wget -q https://maven.aliyun.com/repository/public/com/taobao/arthas/arthas-packaging/${ARTHAS_VERSION}/arthas-packaging-${ARTHAS_VERSION}-bin.zip -O arthas-bin.zip && \
    unzip -q arthas-bin.zip -d /opt/arthas && \
    rm -f arthas-bin.zip

####################################################################
# Stage 1 : BUILD JAR
####################################################################
FROM ${MAVEN_IMAGE} AS maven-builder

# Maven configuration
ENV MAVEN_OPTS="-Dmaven.test.skip=true -Dmaven.compile.fork=true"

# 自定义 settings.xml
# 使用 --build-arg 传入本地 settings.xml 的路径
# ARG MAVEN_SETTINGS
# COPY ${MAVEN_SETTINGS} /root/.m2/settings.xml

# 先复制 pom 文件以利用缓存
# pom 文件不变，依赖的下载就会使用缓存，源代码改变只会触发编译，不会重新下载依赖
# -B: 批处理模式
# dependency:resolve: 预下载声明在 pom.xml 中的依赖
COPY pom.xml ./
RUN mvn dependency:resolve -B

# 复制源代码和其他文件
COPY src ./src/
COPY sh ./sh/

# 构建应用
# -am 同时构建所列模块的依赖模块
# -B 以"批处理模式"运行 Maven，减少输出信息
# -DskipUTs 跳过单元测试
# -DskipITs 跳过集成测试
# --no-transfer-progress 不显示文件传输进度，减少输出
RUN mvn clean package -am -B -DskipUTs -DskipITs --no-transfer-progress

####################################################################
# Stage 2: BUILD IMAGE
####################################################################
FROM ${BASE_JAVA_IMAGE}

# Use ARGs in LABEL
ARG APP_NAME
ARG APP_VERSION
ARG MAINTAINER

LABEL maintainer="${MAINTAINER}" \
      version="${APP_VERSION}" \
      description="${APP_NAME}"

# Set environment variables
ARG WORK_HOME
ARG APP_USER
ARG APP_GROUP

ENV WORK_HOME=${WORK_HOME}
ENV ARTHAS_OUTPUT_DIR=${WORK_HOME}/arthas-output

# Ubuntu/Debian 方式创建用户和目录
# install -d -m 避免 chown 命令导致镜像膨胀
RUN groupadd --system ${APP_GROUP} && \
    useradd --system --gid ${APP_GROUP} --shell /bin/false ${APP_USER} && \
    install -d -m 755 -o ${APP_USER} -g ${APP_GROUP} ${WORK_HOME}/logs ${WORK_HOME}/arthas-output

WORKDIR ${WORK_HOME}

# Copy application files
# 这里使用 --chown=${APP_USER}:${APP_GROUP} 是为了避免单独使用chown -R ${APP_USER}:${APP_GROUP}命令，导致镜像大小膨胀1倍
COPY --from=maven-builder --chown=${APP_USER}:${APP_GROUP} target/*-exec.jar ./app.jar
COPY --from=maven-builder --chown=${APP_USER}:${APP_GROUP} sh ./
COPY --from=arthas-downloader --chown=${APP_USER}:${APP_GROUP} /opt/arthas ./arthas/
RUN chmod +x ./run.sh

# Switch to app user
USER ${APP_USER}

ENTRYPOINT ["./run.sh"]
```
