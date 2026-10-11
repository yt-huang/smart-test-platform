# Delta Spec: session-scheduling

## ADDED Requirements

### Requirement: 执行目标抽象
任务 SHALL 仅以能力声明（capabilities）描述所需执行目标，MUST NOT 点名具体设备；资源描述 MUST 携带 provider 分档（local/cloud）与标签。

#### Scenario: 能力匹配执行
- **WHEN** 提交 `{platform: android, version: ">=13", brand: xiaomi}` 的任务
- **THEN** 调度器在全部匹配资源中按策略分配一台，报告记录实际命中设备的完整指纹

#### Scenario: 云真机零协议变更
- **WHEN** 未来接入云真机供应商
- **THEN** 仅需新增 provider=cloud 适配器，调度协议与任务声明格式不变

### Requirement: 队列语义
会话队列 SHALL 支持 FIFO + 优先级 + 队列超时（默认 10 分钟可配）；超时任务 MUST 转为明确失败状态并通知提交人。

#### Scenario: 排队超时
- **WHEN** 任务排队超过阈值仍无匹配资源
- **THEN** 任务置为已超时，提交人收到飞书/邮件通知，资源不出现无限等待

### Requirement: 占用锁租约
匹配成功 SHALL 即写入会话登记表并下发占用锁；锁以心跳续租，Agent 断线或确认超时 MUST 自动释放。

#### Scenario: 幽灵占用防护
- **WHEN** Agent 进程被杀死而锁未释放
- **THEN** 租约到期后锁自动回收，设备强制清机后回池

### Requirement: 会话后强制清机
所有会话结束路径（正常完成/超时/断线/人工终止）MUST 汇聚到清机流程：卸载被测应用、清账号缓存、重置网络、重启 ADB/WDA、截屏基线比对。

#### Scenario: 异常路径也清机
- **WHEN** 会话因执行超时被打断
- **THEN** 设备仍走完整清机清单，校验通过才回空闲池

### Requirement: 设备预约
平台 SHALL 支持人工调试预约占用（默认 15 分钟窗口），到期提醒与自动释放。

#### Scenario: 预约到期回收
- **WHEN** 预约窗口到期且未续约
- **THEN** 平台提前 5 分钟飞书提醒，到期自动回收并清机

### Requirement: 批量回归编排
一个回归计划 SHALL 可拆分为并行任务按机型/浏览器矩阵分发，主链路矩阵回归墙钟时间 MUST 小于 30 分钟。

#### Scenario: 一键矩阵回归
- **WHEN** 发起 Top 20 机型主链路回归
- **THEN** 任务并行分发到匹配设备，聚合报告在 30 分钟内产出
