# 隔离门禁独立验收

状态：本地 verified；独立检查全部通过，发现均已修复并复核。CI/Codespaces 由主控另验，不并入本报告的独立证明。日期：2026-10-12（Asia/Shanghai）。

## 身份与范围

- 独立验收者：Codex 原生子 Agent `/root/gate_acceptance_resume`，可观测具体模型元数据未提供。
- 输入提交：`13395bc120426bee8f1bf50d9d1c86c98af560c6`；绝对工作目录：`D:/code/ai-test`。
- 最终本地验收版本：`228194f96536b7d5445b597d6162e626e8562cb5`，包含后端 `185ebcd`、CLI `ae03ca1`、Agent 初始化补丁 `30bd56e`、门户真实 Kimi `95839c1` 的集成 `8bd109c`。
- 实际工具：PowerShell、Node v22.11.0、Playwright、独立 .NET System.Xml；实际门户浏览器为 headless Chromium。执行记录指纹为 Chromium `156.0.8078.4`、Firefox `157.0`。
- 依据：`AGENTS.md`、`.agents/skills/saas-multi-agent/SKILL.md`、`references/runtime.md`、Contract v1 与 delta spec；完成后归档至 `openspec/changes/archive/2026-10-12-add-quarantine-ci-gate/`。
- 允许写入：本报告与忽略提交的 `.data/gate-independent/`。不修改实现、规格或其他执行者报告，不管理 8080 进程，不 push。

## 当前状态

主控通知本地 8080 集成服务健康 UP 后才登录、写入自有 fixtures。API 验收时后端包含历史晚到完成补丁；最终服务重启由主控执行，本验收者未管理 8080/真实 Agent 进程。门户第三版已在最终服务实际验证。

API 已实际验证：首次触发仍阻塞、提交隔离/审批快照、客户端 gate/隔离字段不可覆盖、释放与编辑不追溯、显式 FAILED 与缺失结果/缺失状态/SKIPPED/TIMED_OUT 的差异、cleanup 与四类基础设施错误、取消/执行超时后的晚到完成、保守历史策略、矩阵共享快照/部分完成/聚合/取消/排队超时、角色权限、用例/计划删除后历史 gate/JUnit 哈希不变。

程序化 WebSocket 完成、注入 API 响应与 mock executor 仅作为 fixtures。真实用例由主控使用实际 HTTP 页面和 Chromium/Firefox 执行；本验收者重新读取其真实 API、证据和 CLI 运行记录，并以实际浏览器操作 live portal，不替换页面/API 响应。实现者组件测试不作为本报告的独立验收计数。

## 实际命令与结果

- 只读读取项目规则/技能、设计和 delta spec；退出 0。
- `git status --short` / `git rev-parse HEAD` / `git worktree list --porcelain`；退出 0。HEAD 为输入提交，主目录干净。
- 只读 `git diff 13395bc 12b860d -- frontend/...`；退出 0。尚未运行组件测试，未重复实现者检查。
- 读取根目录 `package.json` 返回不存在（退出 1）；实际 Node 项目入口为 `agent/`、`cli/`、`frontend/`。
- `node --check .data/gate-independent/api.mjs` / `node --check .data/gate-independent/cli.mjs`；退出 0。
- `GATE_CLI_PATH=C:/Users/admin/.codex/worktrees/platform-runtime/ai-test/cli/src/run.js node .data/gate-independent/cli.mjs`；退出 0，48 项契约 fixtures 通过，0 个失败。源码 SHA256 记录于 `cli-results.json`。该时点 CLI 尚未集成，正在增加 XML 严格解析，导出部分仍待新版本针对性复测。
- `GATE_CLI_PHASE=xml ... node .data/gate-independent/cli.mjs`；退出 0，17 项针对性 XML fixtures 通过。证据 `cli-xml-results.json`；包括有效导出、HTML/畸形 XML/DOCTYPE、计数/节点/结果矛盾、矩阵缺目标与重复目标拒绝。
- 集成后核对 4 个 CLI 模块 SHA256，确认 `run.js`/`gate.js`/`gate-junit.js` 在先前检查后发生改变，因此在主目录最终 CLI 上运行 `node .data/gate-independent/cli.mjs`；退出 0，61 项通过、0 个失败。最终证据与四文件 SHA256 已覆盖保存到 `cli-results.json`。未运行完整组件测试。
- `GATE_INFRASTRUCTURE_CODES=["EXECUTOR_FAILED","CASE_VALIDATION_FAILED","EXECUTION_ABORTED","EVIDENCE_UPLOAD_FAILED"] node .data/gate-independent/api.mjs`；退出 0，97 项通过、0 个发现，约 5.16 秒。证据 `api-results.json`。真实 HTTP/API 与自有 WebSocket Agent，但结果为程序化完成 fixtures，不是真实用例执行。
- `node .data/gate-independent/xml.mjs`；退出 0，下载 16 份上述 fixtures 的实际 gate JUnit。`.data/gate-independent/xml.ps1` 初次因验收脚本自身 `Split-Path` 参数组合退出 1，修正路径读取后重跑退出 0：16 份使用独立 .NET `System.Xml` 解析器验证根、父/子 suite 节点计数、gate 计数、隔离 caseId/原始 FAILED/失败原因全部一致。证据 `xml-index.json`、`xml-results.json`。
- `node --check .data/gate-independent/ui.mjs`；退出 0。
- `node .data/gate-independent/agent-init-fixture.mjs`；退出 0，发现下述未分类初始化故障。该检查使用 mock browser，仅是 synthetic executor fixture，不是真实浏览器。
- 主控最终服务重启后 `node .data/gate-independent/persistence.mjs`；退出 0，8 项通过：WARN、cancel-late、timeout-late、matrix WARN 的 gate JSON 与 JUnit SHA256 均与重启前一致。
- 按主控真实 run/matrix ID 设置 `GATE_REAL_WARN_RUN`、`GATE_REAL_WARN_MATRIX`、`GATE_REAL_PASS_RUN`、`GATE_REAL_BLOCK_RUN` 后，运行 `node .data/gate-independent/ui.mjs`；最终退出 0，106 项通过、4 份实际失败证据，0 JavaScript 错误、0 发现。首次 97 项版本补充 VIEWER 两类实际下载与干净截图后重跑，不是失败修复。证据 `ui-results.json` 和截图。
- `node .data/gate-independent/frontend-guard.mjs`；退出 0，最终门户 22 个独立数据 fixtures 通过：legacy WARN、prototype 状态、缺失/重复/非法 ID、计数与状态矛盾均不可显示为合法门禁，合法聚合隔离重复计数可展示。
- `node .data/gate-independent/provenance.mjs`；退出 0，21 项通过：真实证据字节/SHA、门禁 XML SHA 与主控记录吻合，三条实际 CLI 创建的运行/矩阵逐一在 live API 上确认 FAILED + WARN 及实际浏览器版本。实际 CLI 执行者为主控，其记录退出码 `[0,1,0]`；本验收者独立核验记录和 CLI 契约，未将读取记录冒称自己重新发起的真实 CLI 执行。

## 已验证的 API 结果

| 场景 | 实际结果 |
|---|---|
| 同 commit、同 fixture 环境 PASSED → FAILED | 首次失败 BLOCKED，质量指标被隔离 |
| 下一次显式 FAILED | 原始 FAILED；gate WARN；原 JUnit failure 与 gate JUnit skipped 同时保留 |
| 提交后释放、编辑审批内容 | 已提交运行仍 WARN，名字/步骤审批快照保留；新失败 BLOCKED |
| SKIPPED、TIMED_OUT、缺失结果、缺失状态 | BLOCKED；不能因冻结集合而转 WARN |
| cleanup 失败、EXECUTOR_FAILED、CASE_VALIDATION_FAILED、EXECUTION_ABORTED、EVIDENCE_UPLOAD_FAILED | BLOCKED，基础设施计数 > 0，XML 有 error |
| 取消、执行超时后补传 FAILED/PASSED | 原始状态仍 CANCELLED/TIMED_OUT；gate JSON 与 gate JUnit SHA256 保持不变 |
| 矩阵部分完成/全部完成 | 部分 PENDING/导出 409；全部 WARN，计数逐目标求和、ID 稳定去重 |
| 缺失资源的矩阵取消/排队超时 | BLOCKED，基础设施计数 > 0，用例计数守恒 |
| 匿名、VIEWER | 匿名报告 401；VIEWER 可读两类 gate 报告，创建/取消/释放 403 |
| 删除测试用例与计划 | 历史 WARN 运行/矩阵 gate JSON、JUnit SHA256 不变 |

fixtures 的 Agent key 已撤销、WebSocket 已关闭，自有测试用例/计划已删除；未修改真实 Agent 标签或管理用户进程。

## 真实门户与证据

| 真实记录 | 门禁与原始结果 |
|---|---|
| `run-16ace466-ed73-4a19-b2f8-9c138c0f9041` | PASSED / PASSED |
| `run-c3e674f4-29cf-4595-8d55-9d15e3a5ae38` | BLOCKED / FAILED，首次触发仍阻塞 |
| `run-d73f14bf-a1cb-4916-8e57-60c45fc661bd` | WARN / FAILED，真实 expectText 失败和 4 份证据保留 |
| `matrix-bdc2787a-f35b-4b54-b9b4-3ffdfb8c9f53` | WARN / FAILED，Chromium/Firefox 各一个隔离失败 |

桌面 `1440×1000` 与手机视口 `390×844` 逐个检查上述 PASS/BLOCKED/WARN 与 WARN 矩阵的门禁标签、五项计数、原始状态和冻结说明；页面无横向溢出。VIEWER 实际点击 gate/raw JUnit 下载成功，原始 XML 仍有 failure；活动任务两个下载按钮禁用、取消控制缺失、gate 导出 409；真实不存在记录返回错误态，活动任务呈现无结果空态。截图已人工查看，门禁卡、长断言失败、按钮和状态均保持可读；矩阵目标表格在自身容器内横向滚动。

门禁 run XML SHA256：`48c02ee0e9cc9e32dd5482a4af4de11cb2cad2f6a9d0abf4cd60d6ce31fea9ae`；矩阵 XML：`5e8d69e624cd8c99cf1ec85d595ae9522c1b464b6552c2f0f31c23db0456c4b6`。使用浏览器 DOMParser 解析，counts 与 testcase/skipped/failure/error 节点、caseId、原始 FAILED 与真实失败原因一致。独立重新下载的真实失败 PNG/trace ZIP/video/log 共 4 份，大小和 SHA256 全部与主控证据一致；未登录证据请求 401。

截图位置：`.data/gate-independent/real-warn-run-desktop.png`、`real-warn-run-mobile.png`、`real-warn-matrix-desktop.png`、`real-warn-matrix-mobile.png`、`real-pass-run-*.png`、`real-block-run-*.png`、`viewer-real-warn-mobile.png`、`viewer-pending-mobile.png`、`viewer-missing-mobile.png`。UI 验收新建的未匹配任务已在 finally 取消；VIEWER 验收账号留存，密码未落盘到证据或报告。

## 发现与限制

已关闭：门户 `gateFreezeNote` 曾将“门禁判定”也描述为提交时冻结；真实 Kimi 原作者在 `013ef91` 修复，独立代码及实际 UI 复核确认。该版还修复 prototype status 与畸形计数保护。独立负例发现该版 guard 仍接受 strict-legacy-v1 + WARN + 无冻结 ID 的矛盾数据，真实 Kimi 在 `95839c1` 补充历史策略和 ID 约束，最终主目录 22 个独立 fixtures 与实际 UI 复核通过。

已关闭：`agent/src/executor.js` 的 `browser.newContext` / route / tracing / newPage 初始化阶段曾位于只写 FAILED 的用例 catch，未标记 EXECUTOR_FAILED。最小 synthetic executor fixture 模拟 launch 已成功、newContext 因浏览器断开拒绝，修复前实际 done 为 FAILED、cleanupOk=true、infrastructureErrors=[]，可能使已隔离用例的资源故障变成 WARN。主控在 `30bd56e` 修复初始化、浏览器断连/page crash、trace/video finalize 故障分类。`GATE_AGENT_EXPECT_INFRA=true node .data/gate-independent/agent-init-fixture.mjs` 独立重跑退出 0，确认 infrastructureErrors=[EXECUTOR_FAILED]；修复前后结果分别保存 `agent-init-result.json`、`agent-init-final-result.json`。97 项 API 检查同时证明该枚举会被后端 BLOCKED。

没有未关闭的本地验收发现。主控真实受控 HTTP 页面 `8093` 已在其 finally 关闭，历史报告与证据可访问，本报告不称该页面仍持续演示。CI、Codespaces 部署/云端重启保留由主控另验；现场手机、通知服务与真机不在本次工具连接范围内，手机检查仅为浏览器视口。

观测运行时间：API fixtures 约 5.16 秒、最终 CLI fixtures 约 0.17 秒、最终 UI 检查约 3.14 秒；其他只读检查及等待另计，未统计完整 wall time。费用未知。
