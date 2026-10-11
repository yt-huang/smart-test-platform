# Delta Spec: mobile-ui-testing

## ADDED Requirements

### Requirement: 移动端统一执行底座
平台 SHALL 以 Appium（UiAutomator2 / XCUITest）作为 Android 与 iOS 原生 App 的执行底座，并 MUST 保持测试脚本仅依赖 WebDriver 标准协议，不得与单一设备供应商 DSL 耦合。

#### Scenario: 供应商可切换
- **WHEN** 云真机供应商从 A 切换为 B
- **THEN** 存量移动用例仅需变更 hub 地址与 capabilities，用例逻辑零修改

### Requirement: 机型矩阵覆盖
平台 SHALL 维护一份基于线上真实分布的 Top 20 机型矩阵（含 Android 主流品牌、鸿蒙机型、近三代 iPhone），主链路用例 MUST 可一键在全矩阵回归。

#### Scenario: 矩阵定期刷新
- **WHEN** 线上机型分布发生显著变化（每季度评估一次）
- **THEN** 矩阵相应调整，并记录变更原因

### Requirement: 低门槛冒烟层
平台 SHALL 提供基于 Maestro（YAML flow）的冒烟编写通道，使非编程背景测试人员可在 1 天内完成一条核心流程冒烟。

#### Scenario: YAML 冒烟入回归
- **WHEN** 测试人员提交一个 Maestro flow
- **THEN** 平台校验语法后将其纳入冒烟套件，与 Appium 用例统一调度

### Requirement: iOS 执行能力
平台 SHALL 提供 iOS 真机执行能力（自建 Mac 节点或云 iOS 真机），覆盖核心流程的 iOS 回归。

#### Scenario: iOS 回归不缺席
- **WHEN** 一次发版前回归发起
- **THEN** iOS 核心用例在近三代 iPhone 上执行并产出报告
