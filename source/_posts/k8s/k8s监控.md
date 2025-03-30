---
title: k8s监控
tags:
  - k8s
  - 监控
categories:
  - k8s
abbrlink: 17349
date: 2025-02-10 15:51:22
---

- [官方文档](https://kubernetes.io/zh-cn/docs/home/)

### metric-server

从 Kubernetes v1.8 开始，资源使用情况的监控可以通过 **Metrics** **API** 的形式获取，例如容器 CPU 和内存使用率。这些度量可以由用户直接访问（例如，通过使用 kubectl top 命令）；**Metrics-Server** 是集群核心监控数据的聚合器。通俗地说，它存储了集群中各节点的监控数据，并且提供了 API 以供分析和使用。Metrics-Server 作为一个 Deployment 对象默认部署在 Kubernetes 集群中。不过准确地说，它是 Deployment，Service，ClusterRole，ClusterRoleBinding，APIService，RoleBinding 等资源对象的综合体。

- metric-server 提供的是实时的指标（实际是最近一次采集的数据，保存在内存中），并没有数据库来存储
- 这些数据指标并非由 metric-server 本身采集，而是由每个节点上的 cadvisor 采集，metric-server 只是发请求给 cadvisor 并将 metric 格式的数据转换成 aggregate api
- [K8s 监控之 Metrics-Server 指标获取链路分析](https://cloud.tencent.com/developer/article/2180278)

#### 一、验证 metric-server 功能

1. 通过 raw api 获取 cadvisor 指标

    ```Bash
    kubectl get --raw=/api/v1/nodes/{nodename}/proxy/metrics/cadvisor
    ```

2. 通过 cAdvisor 的本地接口/metrics/cadvisor 获取数据

    ```Bash
    # 这里的token查看👇🏻这章的内容 
    curl -k -H "Authorization: Bearer $TOKEN" https://127.0.0.1:10250/metrics/cadvisor
    ```

#### 二、处理 cadvisor 权限问题

1. 新建 ServiceAccount

    ```YAML
    apiVersion: v1
    kind: ServiceAccount
    metadata:
    name: monitor
    namespace: kube-system
    ```

2. 新建 ClusterRole，构造访问权限

    ```YAML
    apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRole
    metadata:
    name: metrics-reader
    rules:
    - apiGroups:
        - ''
        resources:
        - nodes
        - nodes/stats
        - nodes/metrics
        - nodes/proxy
        verbs:
        - get
        - list
        - watch
    - apiGroups:
        - metrics.k8s.io
        resources:
        - nodes
        - pods
        verbs:
        - get
        - list
        - watch
    ```

3. 绑定账号和角色 ClusterRoleBinding

    ```YAML
    apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRoleBinding
    metadata:
    name: monitor-clusterrolebinding-i26re
    roleRef:
    apiGroup: rbac.authorization.k8s.io
    kind: ClusterRole
    name: metrics-reader
    subjects:
    - kind: ServiceAccount
        name: monitor
        namespace: kube-system
    ```

4. 给 ServiceAccount 生成 token

    ```YAML
    {
        "kind": "Secret",
        "apiVersion": "v1",
        "metadata": {
            "name": "monitor-token",
            "annotations": {
                "kubernetes.io/service-account.name": "monitor"
            }
        },
        "type": "kubernetes.io/service-account-token"
    }
    ```

5. 查看创建的 token

    ```YAML
    kubectl get secret monitor-token -n kube-system -o jsonpath='{.data.token}' | base64 --decode
    ```

#### 三、配置 prometheus

1. 具体配置

    ```YAML
    # cadvisor
    - job_name: 'kubernetes-cadvisor'
    scheme: https
    tls_config:
        insecure_skip_verify: true
    authorization:
        type: Bearer
        credentials: token # 替换为ServiceAccount生成的token
    kubernetes_sd_configs:
    - api_server: https://192.168.8.10:6443  # 替换为 Kubernetes API 服务器地址
        role: node
        tls_config:
        insecure_skip_verify: true
        authorization:
        type: Bearer
        credentials: token # 替换为ServiceAccount生成的token
    relabel_configs:
    - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
    - source_labels: [__meta_kubernetes_node_address_InternalIP] # 这里实际是通过服务发现查询到其他的k8s集群结点
        target_label: __address__
        replacement: ${1}:10250
    - source_labels: [__meta_kubernetes_node_name]
        regex: (.+)
        target_label: __metrics_path__
        replacement: /metrics/cadvisor
    ```

2. 查看配置是否成功

![img](/images/k8s/01.png)

#### 四、配置 grafana

> 这里配置一个简单的 cpu、内存 `deployment` 图表

```YAML
{
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": {
          "type": "grafana",
          "uid": "-- Grafana --"
        },
        "enable": true,
        "hide": true,
        "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 0,
  "id": 10,
  "links": [],
  "panels": [
    {
      "datasource": {
        "default": true,
        "type": "prometheus",
        "uid": "ddz6drhemat4wf"
      },
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "axisBorderShow": false,
            "axisCenteredZero": false,
            "axisColorMode": "text",
            "axisLabel": "",
            "axisPlacement": "auto",
            "axisSoftMax": 10,
            "axisSoftMin": 0,
            "barAlignment": 0,
            "barWidthFactor": 0.6,
            "drawStyle": "line",
            "fillOpacity": 0,
            "gradientMode": "none",
            "hideFrom": {
              "legend": false,
              "tooltip": false,
              "viz": false
            },
            "insertNulls": false,
            "lineInterpolation": "smooth",
            "lineWidth": 1,
            "pointSize": 1,
            "scaleDistribution": {
              "type": "linear"
            },
            "showPoints": "auto",
            "spanNulls": false,
            "stacking": {
              "group": "A",
              "mode": "none"
            },
            "thresholdsStyle": {
              "mode": "off"
            }
          },
          "mappings": [],
          "max": 10,
          "min": 0,
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          },
          "unit": "percent"
        },
        "overrides": [
          {
            "__systemRef": "hideSeriesFrom",
            "matcher": {
              "id": "byNames",
              "options": {
                "mode": "exclude",
                "names": [
                  "nginx-77c6dcdbff-rjrpk"
                ],
                "prefix": "All except:",
                "readOnly": true
              }
            },
            "properties": [
              {
                "id": "custom.hideFrom",
                "value": {
                  "legend": false,
                  "tooltip": false,
                  "viz": true
                }
              }
            ]
          }
        ]
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 0
      },
      "id": 1,
      "options": {
        "legend": {
          "calcs": [],
          "displayMode": "table",
          "placement": "right",
          "showLegend": true
        },
        "tooltip": {
          "mode": "single",
          "sort": "none"
        }
      },
      "targets": [
        {
          "datasource": {
            "type": "prometheus",
            "uid": "ddz6drhemat4wf"
          },
          "editorMode": "code",
          "expr": "sum(rate(container_cpu_usage_seconds_total{namespace=\"$namespace\",container=~\"$deployment\",pod=~\"$pod\"}[5m])) by (pod)",
          "instant": false,
          "legendFormat": "__auto",
          "range": true,
          "refId": "A"
        }
      ],
      "title": "Nginx CPU Usage",
      "type": "timeseries"
    },
    {
      "datasource": {
        "default": true,
        "type": "prometheus",
        "uid": "ddz6drhemat4wf"
      },
      "description": "",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "axisBorderShow": false,
            "axisCenteredZero": false,
            "axisColorMode": "text",
            "axisLabel": "",
            "axisPlacement": "auto",
            "barAlignment": 0,
            "barWidthFactor": 0.6,
            "drawStyle": "line",
            "fillOpacity": 13,
            "gradientMode": "none",
            "hideFrom": {
              "legend": false,
              "tooltip": false,
              "viz": false
            },
            "insertNulls": false,
            "lineInterpolation": "smooth",
            "lineStyle": {
              "fill": "solid"
            },
            "lineWidth": 1,
            "pointSize": 1,
            "scaleDistribution": {
              "type": "linear"
            },
            "showPoints": "auto",
            "spanNulls": false,
            "stacking": {
              "group": "A",
              "mode": "none"
            },
            "thresholdsStyle": {
              "mode": "off"
            }
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          },
          "unit": "MB"
        },
        "overrides": []
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 12,
        "y": 0
      },
      "id": 2,
      "options": {
        "legend": {
          "calcs": [
            "max",
            "mean"
          ],
          "displayMode": "table",
          "placement": "right",
          "showLegend": true
        },
        "tooltip": {
          "mode": "multi",
          "sort": "none"
        }
      },
      "targets": [
        {
          "datasource": {
            "type": "prometheus",
            "uid": "ddz6drhemat4wf"
          },
          "editorMode": "code",
          "exemplar": false,
          "expr": "sum by (pod) (\n  container_memory_rss{namespace=\"$namespace\",container=~\"$deployment\",pod=~\"$pod\"}\n) / 1024 / 1024",
          "instant": false,
          "legendFormat": "{{pod}} - RSS",
          "range": true,
          "refId": "A"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "ddz6drhemat4wf"
          },
          "editorMode": "code",
          "expr": "sum by (pod) (\n  container_memory_usage_bytes{namespace=\"$namespace\",container=~\"$deployment\",pod=~\"$pod\"}\n) / 1024 / 1024",
          "hide": false,
          "instant": false,
          "legendFormat": "{{pod}} - Usage",
          "range": true,
          "refId": "B"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "ddz6drhemat4wf"
          },
          "editorMode": "code",
          "expr": "sum by (pod) (\n  container_memory_working_set_bytes{namespace=\"$namespace\",container=~\"$deployment\",pod=~\"$pod\"}\n) / 1024 / 1024",
          "hide": false,
          "instant": false,
          "legendFormat": "{{pod}} - Working Set",
          "range": true,
          "refId": "C"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "ddz6drhemat4wf"
          },
          "editorMode": "code",
          "expr": "sum by (pod) (\n  container_memory_cache{namespace=\"$namespace\",container=~\"$deployment\",pod=~\"$pod\"}\n) / 1024 / 1024",
          "hide": false,
          "instant": false,
          "legendFormat": "{{pod}} - Cache",
          "range": true,
          "refId": "D"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "ddz6drhemat4wf"
          },
          "editorMode": "code",
          "expr": "sum by (pod) (\n  kube_pod_container_resource_requests{resource=\"memory\",namespace=\"$namespace\",container=~\"$deployment\",pod=~\"$pod\"}\n) / 1024 / 1024",
          "hide": false,
          "instant": false,
          "legendFormat": "{{pod}} - Requests",
          "range": true,
          "refId": "E"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "ddz6drhemat4wf"
          },
          "editorMode": "code",
          "expr": "sum by (pod) (\n  kube_pod_container_resource_limits{resource=\"memory\",namespace=\"$namespace\",container=~\"$deployment\",pod=~\"$pod\"}\n) / 1024 / 1024",
          "hide": false,
          "instant": false,
          "legendFormat": "{{pod}} - Limits",
          "range": true,
          "refId": "F"
        }
      ],
      "title": "Nginx Pods - Memory Metrics",
      "type": "timeseries"
    }
  ],
  "schemaVersion": 39,
  "tags": [],
  "templating": {
    "list": [
      {
        "current": {
          "selected": false,
          "text": "cadvisor",
          "value": "cadvisor"
        },
        "datasource": {
          "type": "prometheus",
          "uid": "ddz6drhemat4wf"
        },
        "definition": "label_values(namespace)",
        "hide": 0,
        "includeAll": false,
        "label": "namespace",
        "multi": false,
        "name": "namespace",
        "options": [],
        "query": {
          "qryType": 1,
          "query": "label_values(namespace)",
          "refId": "PrometheusVariableQueryEditor-VariableQuery"
        },
        "refresh": 1,
        "regex": "",
        "skipUrlSync": false,
        "sort": 0,
        "type": "query"
      },
      {
        "allValue": "",
        "current": {
          "selected": true,
          "text": "nginx",
          "value": "nginx"
        },
        "datasource": {
          "type": "prometheus",
          "uid": "ddz6drhemat4wf"
        },
        "definition": "label_values({namespace=\"$namespace\"},container)",
        "hide": 0,
        "includeAll": true,
        "label": "deployment",
        "multi": false,
        "name": "deployment",
        "options": [],
        "query": {
          "qryType": 1,
          "query": "label_values({namespace=\"$namespace\"},container)",
          "refId": "PrometheusVariableQueryEditor-VariableQuery"
        },
        "refresh": 1,
        "regex": "",
        "skipUrlSync": false,
        "sort": 0,
        "type": "query"
      },
      {
        "current": {
          "selected": true,
          "text": "All",
          "value": "$__all"
        },
        "datasource": {
          "type": "prometheus",
          "uid": "ddz6drhemat4wf"
        },
        "definition": "label_values({namespace=\"$namespace\", container=\"$deployment\"},pod)",
        "hide": 0,
        "includeAll": true,
        "label": "pod",
        "multi": false,
        "name": "pod",
        "options": [],
        "query": {
          "qryType": 1,
          "query": "label_values({namespace=\"$namespace\", container=\"$deployment\"},pod)",
          "refId": "PrometheusVariableQueryEditor-VariableQuery"
        },
        "refresh": 1,
        "regex": "",
        "skipUrlSync": false,
        "sort": 0,
        "type": "query"
      }
    ]
  },
  "time": {
    "from": "now-5m",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "browser",
  "title": "Deployment",
  "uid": "cdz7nqi6hjvnkf",
  "version": 20,
  "weekStart": ""
}
```
