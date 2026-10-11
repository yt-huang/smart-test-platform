# Design: build-test-platform-agent-arch

> 完整论证与调研出处见《平台架构设计文档》（含总体架构图与会话/设备状态机图）；本文件只固化决策。

## 总体结构

```
用户侧（门户 / CLI / CI 插件）
        │ HTTPS / WSS
中心平台（模块化单体，Spring Boot 3 + PostgreSQL + 本地磁盘证据卷）
  接入网关 → 调度器(队列+匹配+SessionMap) → 会话管理 → 报告/证据 · AI 引擎 · 可观测性
        ▲ WSS 出站长连接（Agent 发起，AgentKey 鉴权）
Agent 执行机（Go 单二进制 × N）
  Connector → 设备接入(ADB+scrcpy / WDA+go-ios / 浏览器容器) → 执行运行时(Appium/Maestro) → 证据采集
```

## 关键设计决策

### D1：Agent 主动出站 WSS 长连接
- **决策**：连接方向永远是 Agent → 平台；Agent 不监听入站端口。
- **理由**：Sonic 与 Appium Device Farm 的共同选择；NAT/防火墙/跨网段零改造；平台天然掌握 Agent 可达性。
- **代价**：任务下发依赖长连接在线，需租约 + 超时回收防幽灵占用（已内建协议）。

### D2：控制面 / 数据面分离
- **决策**：控制信令走 WSS JSON 帧；屏幕流走独立通道（WSS 中转 → 二期 WebRTC）；证据文件走存储抽象层直传（首版本地磁盘卷，接口语义兼容 S3 预签名）。
- **理由**：两类流量 QoS 不同；STF 让所有数据过消息总线是已知瓶颈反例。

### D3：模块化单体起步，协议按分布式语义设计
- **决策**：中心平台单进程部署，模块边界清晰；调度借用 Grid 4 三段式（队列/匹配/SessionMap）但单进程实现；占用锁、租约、幂等从第一天按分布式语义实现。
- **理由**：起步规模 20 台设备，微服务只带来运维成本（STF 弃坑教训）；拆分触发器已定义（设备 >100 或 Agent >10 拆调度器）。
- **代价**：模块边界需评审守护，禁止跨模块读库表。

### D4：Android 投屏用 scrcpy server，iOS 用 WDA + go-ios
- **决策**：Android 主通道 scrcpy server（H.264 硬编、35–70ms、免 root），保留 minicap 降级；iOS 经 Mac 节点构建 WDA，设备操作走 go-ios（iOS 17/18 稳定性优于 tidevice）。
- **理由**：minicap 的 so 需逐版本适配，小米 8/9 有已知坑；go-ios 社区对新一代 iOS 适配更快。
- **代价**：iOS 强依赖一台 Mac mini 做签名与 WDA 托管。

### D5：执行目标抽象 + provider 分档，云真机零协议变更接入
- **决策**：任务只声明 capabilities；资源带 `provider: local | cloud` 与标签；调度器按能力匹配 + 最少占用优先；敏感用例强制 `local + 受信池`。
- **理由**：与落地方案第 6 章 devices.yaml 设计闭环；云真机接入只需新增适配器（对应 `enable-cloud-device-farm` BACKLOG 变更）。

### D6：会话后强制清机是底线能力，非可选
- **决策**：所有会话结束路径（正常/超时/断线）汇聚到清机；清机含卸载应用、清账号缓存、重置网络、重启 ADB/WDA、截屏基线比对；失败进维护中 + 告警 + 人工恢复。
- **理由**：AWS Device Farm 的会话后清理语义；安全社区已有"清机被禁用导致持久化植入"的攻击案例。

### D7：flaky 治理内建于证据管线
- **决策**：每次执行 `{test_id, commit_sha, verdict}` 入仓，EWMA 分数 > 0.15 自动隔离；隔离用例继续执行但不卡门禁；退出隔离必须人工；flake rate 3% 告警、隔离 14 天升级。
- **理由**：行业通行的隔离生命周期（检测→标记→隔离→跟踪→修复/删除），避免隔离区变成垃圾场。

### D8：远程 adb 必须平台鉴权中转
- **决策**：`platform adb connect <session>` 经平台网关中转 adb 流到 Agent；任何环境不暴露裸 5555。
- **理由**：Genymotion 官方安全警告：ADB over TCP 无认证无加密。

## 数据与证据流

任务提交（capabilities）→ 队列 → 匹配 → 占用锁（租约）→ Agent 执行 → 证据直传本地磁盘证据卷（平台只收索引）→ 结构化结果入 PostgreSQL → 报告回放 / flaky 记分 / 审计归档。

## 安全与合规

全链路 TLS；用户 RBAC 四角色；AgentKey 可吊销绑指纹；审计日志 ≥ 180 天；数据模型预留 `workspace_id`；平台与设备 VLAN 隔离，Agent 仅需出站 443。

## 演进触发器

设备 >100/Agent >10 → 拆调度服务；并发任务 >100 → 队列/锁迁出 PG（引入 Redis）；投屏并发 >20 → 引入 SFU；证据 >2TB → 本地磁盘卷切 MinIO/OSS（存储接口抽象不变）；平台服务数 >3 → 引入 OpenTelemetry + Prometheus；云真机评审通过 → 实现 `provider=cloud` 适配器。
