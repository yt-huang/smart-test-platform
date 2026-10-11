# Delta Spec: web-ui-testing

## ADDED Requirements

### Requirement: 统一 Web 自动化引擎
平台 SHALL 以 Playwright 作为 Web 端新用例的默认执行引擎，覆盖 Chromium、Firefox、WebKit 三引擎；存量 Selenium 套件 SHALL 继续在 Selenium Grid 上执行，不强制迁移。

#### Scenario: 新用例默认走 Playwright
- **WHEN** 业务线创建新的 Web UI 自动化用例
- **THEN** 用例基于 Playwright 工程骨架编写，且可在三引擎上并行执行

#### Scenario: 存量 Selenium 套件继续可用
- **WHEN** 一个存量 Selenium 用例集被触发执行
- **THEN** 其在 Selenium Grid 上运行并产出与 Playwright 一致的统一格式报告

### Requirement: PR 级冒烟门禁
平台 SHALL 在每次 PR 上自动执行核心流程冒烟套件，执行墙钟时间 MUST 小于 5 分钟。

#### Scenario: 冒烟超时处置
- **WHEN** 冒烟套件执行超过 5 分钟
- **THEN** 平台标记该套件为"需优化"，并产出按用例耗时排序的分析报告

### Requirement: 失败证据采集
平台 SHALL 为每条失败的 Web 用例自动采集截图、trace 与控制台日志，并可在报告中回放。

#### Scenario: 失败可诊断
- **WHEN** 一条 Web 用例在 CI 中失败
- **THEN** 报告页可直接查看失败时刻截图、完整 trace 与控制台错误，无需本地复现

### Requirement: 移动端 H5 覆盖
平台 SHALL 使用 Playwright 设备模拟覆盖移动端 H5/小程序 WebView 的响应式场景，并以真机云抽检兜底。

#### Scenario: H5 双通道验证
- **WHEN** 一个 H5 核心流程用例进入回归
- **THEN** 它在模拟设备上全量执行，并在至少 3 款真机上按版本抽检
