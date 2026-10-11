# Quarantine-aware CI gate

## Why

已有 EWMA 会标记同一提交、实际环境内发生结果变化的用例，人工复核可以释放，但 CLI 仍按所有原始失败阻塞。原 M2 要求隔离用例继续执行、不阻塞门禁。本轮补齐可选择的门禁结果、报告和门户，不把标记后的原始 FAILED 改成 PASSED。

## What Changes

- 提交时冻结隔离用例集合，终态冻结明确的 PASSED/WARN/BLOCKED 门禁判定；继续执行全部审批用例。
- 单运行与矩阵公开 gate，提供独立 gate-junit；保留原始状态、JUnit、证据和统计。
- CLI `run` / `matrix` 增加 `--gate`，显式选择隔离策略；默认原始模式兼容。
- 真实 Kimi 实现运行、矩阵和稳定性面板的门禁信息；Codex 后端/CLI 并行实现，独立 Codex 验收。

工单、飞书、3%/14 天升级、真机与完整 T15 验收仍不计入本轮。
