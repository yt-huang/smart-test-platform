# browser-regression-matrix Specification

## Purpose
对已审批 Web 计划进行原子多浏览器编排，保留真实目标结果、资源指纹和聚合报告，并验证取消、失败及重启后的可追溯性。

## Requirements

### Requirement: 原子批次与审批快照
平台 SHALL 将一个 Web 计划的已审批用例一次提交为 2–8 个不同能力目标的子任务，所有输入先验证并在一个事务保存，MUST NOT 在失败提交中下发任务或遗留部分记录。每个任务 SHALL 保留同一输入快照及代码提交关联。

#### Scenario: 一键多浏览器执行
- **WHEN** 用户提交 Chromium 和 Firefox 两个目标
- **THEN** 创建一个持久批次与两个共享审批快照的子任务，按照实际资源能力分别调度

#### Scenario: 任一目标输入无效
- **WHEN** 后续目标无效、重复或计划有未审批用例
- **THEN** 整个提交失败，批次、子任务和 Agent 分配均不产生

### Requirement: 真实汇总与报告
平台 SHALL 提供各目标进度、通过/失败数、资源指纹、原报告链接及聚合 JUnit。全部目标终态前 MUST NOT 将批次判为通过；失败、超时与取消 SHALL 保留真实结果。有效资源不足 SHALL 遵循现有队列超时。

#### Scenario: 混合结果
- **WHEN** 一个浏览器通过而另一个失败或超时
- **THEN** 聚合结果为失败，两个目标的证据及失败原因仍可查看，CLI 返回 1

#### Scenario: 全部通过
- **WHEN** 两个真实浏览器均完成并通过
- **THEN** 聚合结果为通过，CLI 返回 0，JUnit 分开表示两个目标的测试结果

### Requirement: 权限、取消与保留
匿名用户 MUST NOT 访问批次；VIEWER MUST NOT 创建或取消。取消 SHALL 仅影响活跃子任务并按原资源清理流程完成，重复请求幂等。持久批次与报告引用 SHALL 在部署重启后保持可查询。

#### Scenario: 只读角色
- **WHEN** VIEWER 查看批次并尝试取消
- **THEN** 查看成功，取消返回 403且记录不变

#### Scenario: 完成后重启
- **WHEN** 完成批次的中心服务和 Agent 重启
- **THEN** 原批次、所有子任务引用和真实终态保留，证据仍受认证保护

### Requirement: 环境差异与 flaky 判定
同一用例的质量执行计数 SHALL 汇总真实结果，但只有相同代码提交且相同执行环境的不同 verdict SHALL 贡献 flaky flip 与 EWMA。不同浏览器或版本的兼容性差异 MUST NOT 自动导致 flaky 隔离。

#### Scenario: 稳定的浏览器兼容差异
- **WHEN** 同一提交在 Chromium 通过而在 Firefox 失败
- **THEN** 矩阵记录兼容性失败，质量计数保留两个结果，跨环境比较不产生 flaky flip

### Requirement: 门户与 CLI 可操作
门户 SHALL 提供计划发起入口、矩阵列表与轮询详情，并明确显示加载、空、错误、角色禁用与移动端布局。CLI SHALL 验证至少两个不同浏览器，显示批次链接、轮询终态并可导出聚合 JUnit，参数/API 错误返回 2。

#### Scenario: 从计划发起
- **WHEN** 写入角色选择一个 Web 计划并确认两个浏览器
- **THEN** 创建真实批次并跳转其详情；每个目标可打开原执行报告

#### Scenario: 无效 CLI 输入
- **WHEN** matrix 命令只选一个浏览器或使用不支持的浏览器
- **THEN** 命令在提交前返回 2，无远程批次产生
