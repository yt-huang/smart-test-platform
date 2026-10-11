# Tasks: build-test-platform-agent-arch

## M1 骨架可用（对应 PRD M1）

- [ ] T1 中心平台单体脚手架：Spring Boot 3 模块结构（gateway/scheduler/session/report/admin）+ PostgreSQL + 本地磁盘证据卷，docker compose 两个容器一键拉起（无 Redis/MinIO，见架构文档 3.4 裁剪决策）
- [ ] T2 agent-connector：WSS 出站连接、AgentKey 注册鉴权、心跳租约、断线重连、任务协议（assign/ack/progress/done，幂等）
- [ ] T3 device-access（Android）：ADB 设备枚举/安装/日志 + scrcpy server 投屏通道；设备状态机上报
- [ ] T4 device-access（浏览器）：Playwright 容器池，每会话独立容器
- [ ] T5 session-scheduling：能力匹配、FIFO+优先级队列、占用锁租约、队列/执行超时、强制清机（Android 清机清单 + 截屏基线比对）
- [ ] T6 evidence-report：JUnit/Allure 结果入库、证据预签名直传、基础报告页
- [ ] T7 ci-integration：CLI `platform run` + Jenkins/GitLab 插件冒烟门禁
- [ ] T8 security：RBAC 四角色、AgentKey 签发/吊销、全链路 TLS
- [ ] T9 M1 验收：1 条业务线 Web + Android 冒烟 CI 跑通，冒烟 < 5 分钟

## M2 平台完整（对应 PRD M2）

浏览器矩阵子集通过独立 `add-browser-regression-matrix` 变更实施，交付证据见 `docs/matrix-delivery.md`。T13 的设备预约、真机矩阵和 Top 20 验收仍未完成，因此保留整项未勾选。

- [ ] T10 device-access（iOS）：Mac 节点 Agent、WDA 构建与证书托管、go-ios 设备操作
- [ ] T11 remote-streaming：浏览器投屏操控（WSS 中转 H.264）、拖拽安装、实时日志流、截图/录屏导出
- [ ] T12 远程 adb：平台网关鉴权中转 `platform adb connect`，命令审计
- [ ] T13 session-scheduling 增强：设备预约（15 分钟窗口 + 飞书提醒）、批量回归矩阵编排、Top 20 机型兼容性视图
- [ ] T14 evidence-report 增强：时间轴四轨回放（截图/录像/日志/步骤）、设备指纹记录与聚合
- [ ] T15 flaky 治理：执行记录入仓、EWMA 记分、自动隔离（继续执行不卡门禁）、人工退出、3%/14 天告警升级
- [ ] T16 security 增强：全量审计日志（≥180 天可检索）、敏感用例受信池强制路由
- [ ] T17 云真机预留：`provider=cloud` 适配器接口 + mock 实现 + 接口文档（真实对接走 `enable-cloud-device-farm` 变更）
- [ ] T18 M2 验收：Top 20 机型一键回归 < 30 分钟；flaky 率可度量；远程调试替代真机借用

## M3 智能增强（对应 PRD M3）

- [ ] T19 AI 用例生成（Midscene + 私有化视觉模型）：草稿 → 人工审核 → 入库，占比统计
- [ ] T20 视觉自愈试点：定位失败重定位 + 自愈 diff 评审，2 条业务线试点
- [ ] T21 失败智能归因：证据链 + 日志聚类给出归因建议
- [ ] T22 remote-streaming 升级：WebRTC（P2P/SFU）灰度切换
- [ ] T23 M3 验收：试点业务线脚本维护工时降 > 50%；AI 用例 100% 人工审核入库

## 演进触发器（条件任务，不排期）

- [ ] T24 设备 >100 或 Agent >10：调度器拆分为独立服务（协议已按分布式语义实现）
- [ ] T25 投屏并发 >20：引入 SFU，投屏通道独立部署
- [ ] T26 证据 >2TB：本地磁盘证据卷迁移 MinIO/公有云 OSS（存储接口抽象不变，仅切换实现）
