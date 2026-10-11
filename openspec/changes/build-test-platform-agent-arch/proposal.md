# Proposal: build-test-platform-agent-arch

## Why（为什么做）

前置调研（《智能测试平台调研报告》）与小团队方案（《小团队智能测试落地方案》）已完成方向决策：公司决定**自研一套"中心平台 + Agent 执行机"远端运行机制的智能测试平台**，统一承载 Web 与手机端（Android/iOS）的自动化执行、设备资源池调度与远程真机调试。当前状态是：设备在个人手里、脚本散落各项目、无调度无证据链，云真机暂不接入（仅预留适配点）。不自建该机制的代价是：框架统一后仍无资源池承载，平台化（P2 阶段）无从落地。

市面参照已调研完毕：Sonic（Agent WS 出站 + AGENT_KEY）、STF/DeviceFarmer（过度微服务化的反面教材）、Selenium Grid 4（Queue+Distributor+SessionMap 调度模型）、Appium Device Farm（Hub-Node + WebSocket + PostgreSQL + OpenTelemetry）、AWS Device Farm（会话后强清机）、Genymotion（裸 ADB 不可暴露）、HeadSpin（部署分档与 Auto Device Cleaner）。

## What（做什么）

建设平台 + Agent 架构的七个能力域（详细需求见各 delta spec，架构论证见《平台架构设计文档》，功能与验收见《平台需求文档PRD》）：

1. **agent-connector**：Agent 主动出站 WSS 连接、AgentKey 鉴权、心跳租约、断线重连、任务协议（幂等 + 租约回收）。
2. **device-access**：Android（ADB + scrcpy server 投屏）、iOS（WDA + go-ios，Mac 节点）、浏览器容器池的统一接入与设备状态机（离线/空闲/占用/清机/维护）。
3. **session-scheduling**：执行目标抽象（capabilities 声明、provider 分档 local/cloud 预留）、FIFO+优先级+超时队列、占用锁、会话后强制清机、预约。
4. **remote-streaming**：浏览器内实时投屏操控（首版 WSS 中转 H.264，二期 WebRTC）、远程 adb 鉴权中转、实时日志。
5. **evidence-report**：证据链（截图/录像/日志/性能采样）对象存储直传、时间轴回放报告、设备指纹、JUnit/Allure 结构化结果。
6. **security-multitenancy**：RBAC、全链路 TLS、审计日志、敏感用例受信池路由、workspace 维度数据模型预留。
7. **ci-integration**：Jenkins/GitLab CI 插件、OpenAPI/CLI、质量门禁、flaky 隔离联动。

## 范围边界

- **包含**：上述七域的平台侧与 Agent 侧实现；20 台本地设备起步规模；单命令私有化部署。
- **不包含**：云真机真实供应商对接（仅 mock 适配器与协议预留，见 `enable-cloud-device-farm` BACKLOG 变更）；性能压测；安全渗透；生产环境监控。

## 成功标准（验收）

| 指标 | 目标 |
| --- | --- |
| Agent 跨网段接入 | NAT 后主机零网络改造上线 |
| 调度延迟 | 资源空闲时提交到 Agent 确认 ≤ 5s |
| 会话隔离 | 会话间状态泄漏事故 = 0（强制清机 + 截屏基线比对） |
| Top 20 机型主链路一键回归 | 支持，墙钟 < 30 分钟 |
| 核心冒烟 | CI 触发，< 5 分钟 |
| 投屏延迟 | 局域网 ≤ 300ms（WSS 方案） |
| flaky 治理 | 可度量、自动隔离不卡门禁、退出须人工 |
| 平台运维成本 | ≤ 0.5 人，docker compose 单命令部署 |
| 架构演进 | 500 台设备规模有拆分路径，无需重写协议 |

## 备选方案及不采用理由

1. **直接部署 Sonic 二开**：Sonic 是 Spring Cloud 七服务微服务，26 人团队运维负担过重；且平台与自身研发流程的深度集成（门禁、flaky 治理、AI 引擎）仍需自研。仅借鉴其 Agent 出站连接与协议设计。
2. **Selenium Grid 4 扩展支持移动端**：Grid 4 不原生支持真机；围绕它自研移动接入等于重做 Agent 层，收益不抵成本。仅借用其调度模型。
3. **一步到位 WebRTC + 微服务**：信令/TURN 与分布式运维成本超出首版必要；按演进触发器分阶段实施。
