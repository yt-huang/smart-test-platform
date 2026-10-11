# Delta Spec: agent-connector

## ADDED Requirements

### Requirement: Agent 主动出站连接
Agent SHALL 主动发起到中心平台的 WSS 长连接完成注册与任务交互，且 MUST NOT 监听任何入站端口。

#### Scenario: NAT 后接入零改造
- **WHEN** Agent 部署在 NAT/防火墙之后且仅放行出方向 443
- **THEN** Agent 可完成注册、心跳与任务收发，无需端口映射或内网穿透

### Requirement: AgentKey 鉴权与吊销
平台 SHALL 为每个 Agent 签发独立 AgentKey 并绑定主机指纹；被吊销的 Key MUST 在 60 秒内断开且无法重连。

#### Scenario: 吊销即生效
- **WHEN** 管理员吊销某 Agent 的 AgentKey
- **THEN** 该 Agent 的现有连接被断开，后续注册请求被拒绝并记录审计日志

### Requirement: 心跳租约与断线重连
Agent SHALL 按平台下发的间隔（默认 10s）发送心跳并批量上报资源状态；断线后 MUST 以指数退避自动重连。

#### Scenario: 断线资源回收
- **WHEN** Agent 连接中断超过租约时长（默认 30s）
- **THEN** 平台释放其全部占用锁，相关设备强制进入清机流程，任务按幂等规则重投或失败

### Requirement: 任务协议幂等
任务消息 SHALL 携带全局唯一 taskId；Agent 重连后平台 MUST 重发未确认任务，重复执行由会话登记表去重。

#### Scenario: 重连不重复执行
- **WHEN** Agent 在任务执行中断线并重连
- **THEN** 平台识别该 taskId 已有进行中会话，恢复跟踪而非重新下发
