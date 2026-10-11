# Project: 智能测试平台引入（Smart Testing Platform Adoption）

## 背景
公司需要引入一套覆盖 **手机端（Android / iOS / 鸿蒙 / 小程序）** 与 **Web 端** 的智能测试平台。
调研结论见仓库根目录《智能测试平台调研报告.md》。总体路线：**开源框架为骨架 + 商业云真机补资源 + 开源 AI 视觉引擎做智能化**，分四阶段（P0 诊断基线 → P1 框架统一 → P2 平台化 → P3 智能化试点）在 6–12 个月内推进至成熟度 L2 收尾 + L3 试点。

## 目录约定（OpenSpec）
- `openspec/specs/`：现行行为规范（source of truth），按能力域组织。
- `openspec/changes/<change-id>/`：进行中的变更，含 `proposal.md`、`design.md`、`tasks.md`、`specs/<domain>/spec.md`（delta）。
- 变更完成后归档至 `openspec/changes/archive/YYYY-MM-DD-<change-id>/`，delta 合并回 `openspec/specs/`。

## 技术基线（调研结论）
- Web 引擎：Playwright（新项目默认）；Selenium Grid 承接存量与真 Safari/Edge 合规场景。
- 移动引擎：Appium（资源层通用协议底座）；Maestro 作为冒烟/核心流程补充。
- AI 引擎：Midscene.js + 私有化视觉模型（Qwen3-VL / UI-TARS），MIT 许可，覆盖 Web/Android/iOS/鸿蒙/桌面。
- 测试管理：MeterSphere（开源版起步，评估企业版 X-Pack 的 UI 测试）。
- 设备资源：自建核心机池（Sonic，10–20 台）+ 商业云真机（优测 / WeTest，长尾兼容与鸿蒙）；出海叠加 BrowserStack 或 AWS Device Farm。
- 注意：阿里云移动测试国内站 2026-06-01 停服，不作为选项。

## 硬性约束
1. 测试逻辑层只使用标准协议（WebDriver / Playwright API），禁止与单一供应商 DSL 耦合。
2. AI 生成的用例必须经人工审核后方可进入回归门禁链路。
3. 受监管业务数据不出内网：敏感链路仅在自建机池执行，视觉模型私有化部署。
4. 开源组件引入前完成许可证评审（优先 MIT；AGPL 项目如 Skyvern 需法务确认）。
