---
title: ES
tags:
    - ES
    - 数据库
categories:
    - ES
abbrlink: 17349
date: 2025-02-10 18:51:22
---

### PUT、POST

- `PUT`操作主要是用来创建一个确定的新的文档
  - `PUT /index/_doc/1` 会创建一个 id=1 的新文档，若是文档已存在，那么会进行删除，同时新增一条
  - `PUT /index/_create/2` 会创建一个 id=2 的新文档，若文档已存在，返回 http 409 错误
- POST 操作主要是用来创建一个不确定的新文档或者部分更新文档
  - `POST /index/_doc` 创建新文档，自动生成 ID
  - `POST /index/_update/1` 部分更新现有文档
- 最佳实践
  - 新增指定 ID 文档 & 允许覆盖  `PUT /index/_doc/1`
  - 新增指定 ID 文档 & 文档存在则报错 `PUT /index/_create/2`
  - 新增文档不指定 ID `POST /index/_doc`
  - 部分更新现有文档 `POST /index/_update/1`

### index、create、update API

#### Index API（索引 API）

- 作用：添加或替换文档。
- 类比：把一本书放在书架上。如果那个位置已经有书，就替换它。
- 示例：`PUT /library/book/1 {"title": "Elasticsearch Guide"}`
- 特点：不关心之前是否存在这本书。

#### Create API（创建 API）

- 作用：仅添加新文档，如果文档已存在则失败。
- 类比：只有当书架上没有这本书时，才能放上去。
- 示例：`PUT /library/book/1?op_type=create {"title": "New Book"}`
- 特点：确保只添加新文档，不会覆盖现有文档。

#### Update API（更新 API）

- 作用：修改现有文档的部分内容。
- 类比：修改书架上已有书的某些信息，比如更新作者名。
- 示例：`POST /library/book/1/_update {"doc": {"author": "John Doe"}}`
- 特点：只能修改已存在的文档，且只更新指定的字段。

1. Index：不在乎文档是否已存在，总是添加或替换。（当你有新数据，但不确定它是否已存在时）
2. Create：只在文档不存在时才能成功。（当你只想添加新数据，绝不覆盖现有数据时）
3. Update：只能修改已存在的文档。（当你要修改现有数据的部分内容时）
4. Index 和 Create 通常使用 PUT 方法，Update 使用 POST 方法
5. Update 需要使用 "doc" 字段来指定要更新的内容

### 写入流程

![img](/images/db/es/01.PNG)

### 分页查询

#### from + size

> from、size 超过 10000 时会报错，不适合深度分页，因为需要在每个分片上拉取 （from + size）

```Java
# 简单的分页操作
GET books/_search
{
  "from": 0, # 指定开始位置
  "size": 10, # 指定获取文档个数
  "query": {
    "match_all": {}
  }
}
```

####  search after

> 使用 search after API 可以避免产生深分页的问题，不过 **search after 不支持跳转到指定页数，只能一页页地往下翻**

1. 在 sort 中指定需要排序的字段，并且保证其值的唯一性（可以使用文档的 ID）。
2. 在下一次查询时，带上返回结果中最后一个文档的 sort 值进行访问

```Java
# 第一次调用 search after
POST books/_search
{
  "size": 2,
  "query": { "match_all": {} },
  "sort": [
    { "price": "desc" },
    { "_id": "asc" }
  ]
}

# 返回结果
"hits" : [
  {
    "_id" : "6",
    "_source" : {
      "book_id" : "4ee82467",
      "price" : 20.9
    },
    "sort" : [20.9, "6"]
  },
  {
    "_id" : "1",
    "_source" : {
      "book_id" : "4ee82462",
      "price" : 19.9
    },
    "sort" : [19.9, "1"]
  }
]

# 第二次调用 search after
POST books/_search
{
  "size": 2,
  "query": {
    "match_all": {}
  },
  "search_after":[19.9, "1"], # 设置为上次返回结果中最后一个文档的 sort 值
  "sort": [
    { "price": "desc" },
    { "_id": "asc" }
  ]
}
```

#### Scroll API

> 对结果集进行遍历的时候，例如做全量数据导出时，可以使用 scroll API。**scroll API 会创建数据快照，后续的访问将会基于这个快照来进行，所以无法检索新写入的数据**

1. ES 7.10 中引入了 Point In Time 后，scroll API 就不建议被使用了

```Java
# 第一次使用 scroll API，指定快照10m结束，超过10m
POST books/_search?scroll=10m
{
  "query": {
    "match_all": {}
  },
  "sort": { "price": "desc" }, 
  "size": 2
}

# 结果
{
  "_scroll_id" : "FGluY2x1ZGVfY29udGV4dF9......==",
  "hits" : {
    "hits" : [
      {
        "_id" : "6",
        "_source" : {
          "book_id" : "4ee82467",
          "price" : 20.9
        }
      },
      ......
    ]
  }
}

# 进行翻页
POST /_search/scroll                                                    
{
  "scroll_id" : "FGluY2x1ZGVfY29udGV4dF9......==" 
}
```

#### Point in time

> Point In Time（PIT）是 ES 7.10 中引入的新特性，**PIT 是一个轻量级的数据状态视图，用户可以利用这个视图反复查询某个索引，仿佛这个索引的数据集停留在某个时间点上**。也就是说，在创建 PIT 之后更新的数据是无法被检索到的

1. 使用 PIT 前需要显式使用 _pit API 获取一个 PID ID
2.  PIT 可以允许用户在同一个固定数据集合上运行不同的查询，例如多个请求可以使用同一个 PIT 视图而互不影响

```Java
# 使用 pit API 获取一个 PID ID
POST /books/_pit?keep_alive=20m

# 结果
{
  "id": "46ToAwMDaWR5BXV1aWQy......=="
}
```

1. PIT 可以结合 search after 进行查询，能有效保证数据的一致性
2. Pit + search after 允许更改查询或排序字段，因为根据 search_after 一定定位到了某条数据，无论更改查询条件还是排序条件，只需要从新的查询条件的结果过滤出 search_after 后面的数据就能得到结果了

```Java
# 第一次调用 search after，因为使用了 PIT，这个时候搜索不需要指定 index 了。
# 不再需要在 sort 中指定唯一的排序值了
POST _search
{
  "size": 2,
  "query": { "match_all": {} },
  "pit": {
    "id":  "46ToAwMDaWR5BXV1aWQy......==", # 添加 PIT id
    "keep_alive": "5m" # 视图的有效时长
  },
  "sort": [
    { "price": "desc" } # 按价格倒序排序
  ]
}

# 结果
{
  "pit_id" : "46ToAwMDaWR5BXV1aWQy......==",
  "hits" : {
    "hits" : [
      {
        "_id" : "6",
        "_source" : {
          "book_id" : "4ee82467",
          "price" : 20.9
        },
        "sort" : [20.9, 8589934593]
      },
      {
        "_id" : "1",
        "_source" : {
          "book_id" : "4ee82462"
          "price" : 19.9
        },
        # 第一个是我们用作排序的 price 的值
        # 第二个值是一个隐含的排序值。所有的 PIT 请求都会自动加入一个隐式的用于排序的字段称为：_shard_doc，当然这个排序值可以显式指定。
        # 这个隐含的字段官方也称它为：tiebreaker（决胜字段），其代表的是文档的唯一值，保证了分页不会丢失或者分页结果的数据不会重复，其作用就好像原 search after 的 sort 字段中要指定的唯一值一样
        "sort" : [19.9, 8589934592]
      }
    ]
  }
}

# 第二次调用 search after，因为使用了 PIT，这个时候搜索不需要指定 index 了。
POST _search
{
  "size": 2,
  "query": {
    "match_all": {}
  },
  "pit": {
    "id":  "46ToAwMDaWR5BXV1aWQy......==", # 添加 PIT id
    "keep_alive": "5m" # 视图的有效时长
  },
  "search_after": [19.9, 8589934592], # 上次结果中最后一个文档的 sort 值
  "sort": [
    { "price": "desc" }
  ]
}
```
