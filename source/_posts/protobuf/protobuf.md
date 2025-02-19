---
title: protobuf
tags:
  - protobuf
  - 序列化
categories:
  - protobuf
abbrlink: 17349
date: 2025-02-19 22:51:22
---

#### 1. 执行命令编译
```shell
protoc --java_out=./src/main/java ./proto3/User.proto
```

#### 2. 通过maven插件
```xml
<build>

  <extensions>
    <!--判断系统-->
    <extension>
      <groupId>kr.motd.maven</groupId>
      <artifactId>os-maven-plugin</artifactId>
      <version>1.7.1</version>
    </extension>
  </extensions>

  <plugins>
    <!--
        Protobuf Maven 插件
        作用：
             - 自动下载和使用 protoc 编译器
             - 编译 .proto 文件生成 Java 代码
             - 集成到 Maven 生命周期
     -->
    <plugin>
      <groupId>org.xolstice.maven.plugins</groupId>
      <artifactId>protobuf-maven-plugin</artifactId>
      <version>0.6.1</version>
      <extensions>true</extensions>
      <configuration>
        <!-- protoc 编译器配置 -->
        <protocArtifact>com.google.protobuf:protoc:${protobuf.version}:exe:${os.detected.classifier}</protocArtifact>
        <!-- proto 文件源目录 -->
        <protoSourceRoot>${project.basedir}/src/main/proto</protoSourceRoot>
        <!-- 生成的 Java 代码输出目录 -->
        <outputDirectory>${project.build.directory}/generated-sources/protobuf/java</outputDirectory>
        <!-- 是否清空输出目录 -->
        <clearOutputDirectory>true</clearOutputDirectory>
      </configuration>
      <executions>
        <execution>
          <phase>generate-sources</phase>
          <goals>
            <goal>compile</goal>
          </goals>
        </execution>
      </executions>
    </plugin>

  </plugins>
</build>
```

#### 3. proto3
- 所有字段都有默认值，比如string默认为空串
- 因为有默认值，所以所有的字段都是不为null的，需要判断是否为空，hasXXX()、getCount() > 0 等等进行判断
- 使用 1-15 的字段号给最常用的字段  （频繁访问的字段放在前面，cpu缓存命中率更高）
- 不常用字段使用 16+ 的字段号  （不常访问的字段放在后面）
- 对于较小范围的数字，用 int32 而不是 int64
- 固定长度的数字用 fixed32/fixed64
- 对于负数多的场景用 sint32/sint64
- 字段更新规则！！
  1. 添加新字段
  2. 删除字段(但保留字段号)
  3. 重命名字段(字段号不变)
  4. 添加repeated字段   reserved 2, 15, 9 to 11;       // 保留字段号  reserved "foo", "bar";         // 保留字段名
- 字段不能做的更新规则！！
  1. 改变已有字段的类型
  2. 复用已删除的字段号
  3. 改变已有字段的编号