# Kimi 持久化验收脚本的独立验收

日期：2026-10-11。审查者：真实 Codex 独立上下文子 Agent `/root/kimi_acceptance`。最终状态：**PASS（脚本行为与安全边界）**，固定提交 `a731caf738632900e5a3ed1614dee7861d426981`。26 项行为测试及 34 项独立观察全部通过，三个实际复现问题均由 Kimi 修复并由本 Agent 复验。本报告只记录真实读取与执行结果；没有读取真实 `.env`、密码、保存令牌或 GitHub 凭据，没有修改实现代码、推送或部署。

## 输入与执行身份

- 实现工作树：`C:\Users\admin\.codex\worktrees\platform-kimi\ai-test`；输入提交 `d770b756c15bc0b5467537e98af5a294aefeedf0`。
- 规格：主控工作树 `D:\code\ai-test` 中 `openspec/changes/verify-deployment-persistence`，本轮明确场景版本 `9d8e2bb3d543cb851c13fb152f9152edfe2edc0c`；另读 `AGENTS.md`、项目多 Agent skill/runtime、`docs/delivery.md` 与真实后端 API 字段。
- 审查工具：Codex 实际子 Agent 工具调用、PowerShell、Node `v22.11.0`。可观测的具体 Codex 模型元数据未提供，记为未知；没有冒充 Kimi。
- Kimi provider/model 的验证与 CLI 生命周期由主控记录，本审查不以进程名或实现者自述证明身份。
- 独立检查使用系统临时目录、临时 HTTP 平台和跨域 trap，子进程只接收合成密码与令牌；临时目录检查后删除。

## 固定提交的最终检查

- 固定 HEAD：`a731caf738632900e5a3ed1614dee7861d426981`，检查前后工作树均干净。
- 实际差异：相对输入提交仅新增 `scripts/verify-persistence.mjs`、`scripts/verify-persistence.test.mjs`、`docs/kimi-persistence-implementation.md`；生产应用 API 与配置没有改变。
- 主脚本 SHA-256：`ca2be99163648bf7d8e7b5da415853fbf49acf5b39bb8da36a5445f755828e90`。
- 行为测试文件 SHA-256：`fb6f062b84827ae0fb4e6a624c189aafeeed0db3e75df4eb532c7f067faf7a32`。
- 在该绝对工作树运行 `node --test scripts/verify-persistence.test.mjs`：**26 tests / 26 pass / 0 fail / 0 skipped，退出 0**；运行约 7 秒。验收者读取完整脚本、初稿测试及最终修复 diff，未以实现者自评代替结论。
- `git diff --check d770b756c15bc0b5467537e98af5a294aefeedf0..HEAD`：无诊断，退出 0。
- 同一固定提交运行三组独立临时 Node HTTP 夹具：**34 项观察全符合预期**，三个夹具进程退出 0；所有读取的主脚本 SHA-256 相同。共实际启动 **30 个 CLI 子进程：5 个正向退出 0、25 个负向退出 1**；另外 4 项观察核对原 ID 集合、两次跨域 trap 零请求及 API 鉴权。
- 没有已知的脚本侧阻断项。实际 Codespaces/PostgreSQL 重启及集成状态由主控独立记录，本 PASS 不冒充真实数据库恢复结论。

34 项独立观察包括：

| 行为组 | 实际结果 |
| --- | --- |
| 成功基线、原样检查、新增 case/plan/run、直接 caseIds 且 plans=0 的基线与检查 | 5 个 CLI 均退出 0 |
| 原 ID 全量保留；删除 FAILED 运行、未关联用例或未关联计划 | 原集合包含全部 ID；3 个删除场景均退出 1 |
| 相同长度的证据篡改、空证据、缺摘要、未完成 PASSED 报告、缺设备身份 | 均退出 1 |
| 设备非 IDLE、Agent OFFLINE、设备换 Agent、畸形 snapshot 中 report/resource Agent 不一致 | 均退出 1 |
| 版本 1 空快照；登录、列表 API、证据 401 | 均退出 1；响应体凭据未回显 |
| 登录 307、API 302、证据 302、直接跨域证据 | 均退出 1；trap 收到 0 请求 |
| base URL 含 userinfo/query；证据 URL 的 userinfo/query/path/host 含合成凭据 | 均退出 1；全部输出 credentialLeak=false |
| 所有正常列表/证据请求强制正确 Bearer；成功快照检查 | 无漏鉴权请求；快照不含合成凭据 |

## 初版检查记录

以下为**未提交版本**主脚本 SHA-256 `3c7f14dad00b6c5e18e01476ab89c57e555fe18a74ddd40df11db581e493b258` 的结果。通过 PowerShell 字面 here-string 将独立 Node HTTP 夹具输入 `node --input-type=module`；夹具实际启动 CLI 子进程并检查输出与退出码，两个夹具进程均退出 0，表示观测完成，不表示程序已被验收通过。

- 成功基线、保留原 case/plan/run IDs（包含未关联用例/计划和 FAILED 运行）、原样检查、新增记录：退出 0。
- 删除原 FAILED 运行、未关联用例或未关联计划：分别退出 1。
- 相同长度的证据字节篡改：退出 1，实际检查使用 SHA-256。
- 设备 BUSY、Agent OFFLINE（设备仍 IDLE）、设备换 Agent：分别退出 1。
- 版本 1 空快照、缺 SHA-256 摘要、未完成 PASSED 报告、缺设备身份、空证据：分别退出 1。
- 登录、列表 API、证据的 401：分别退出 1；失败响应体中的合成凭据未被回显。
- 登录 307、API 302、证据 302、直接跨域证据：分别退出 1；跨域 trap 实际收到 **0 请求**。
- 配置 base URL 含 userinfo 或 query：分别退出 1，输出未含合成凭据。
- 所有正常列表与证据请求均被夹具强制校验正确 Bearer，未出现漏带鉴权的请求；成功快照未含合成密码或令牌。

## 已修复的可复现发现

### A1：不一致的 report/resource Agent 身份仍可通过 — 已修复并复验

1. 创建有效基线，报告保存 `deviceId=dev-1`、`agentId=agent-1`。
2. 只把快照 `resources[0].agentId` 改为 `agent-2`，保持报告字段不变。
3. 当前设备列表让 `dev-1` 归属 `agent-2` 且 IDLE；Agent 列表让 `agent-2` ONLINE；当前运行报告继续保留原 `agent-1`。
4. 实际 `check --wait-seconds 0` 退出 **0** 并输出 verified，预期为非零。

原因：快照校验只用 deviceId Set 关联 reports/resources，没有证明同一 deviceId 对应同一 agentId。已交回主控，由 Kimi 修复；验收者没有修改生产脚本。

最终复验：保持完全相同的复现输入，固定提交退出 **1**，拒绝不一致的身份配对；相关仓库回归测试也通过。

### A2：证据 URL 的错误路径仍可能输出凭据 — 已修复并复验

三种合成凭据场景均实际退出 1，但输出包含夹具凭据：

1. 同源证据 URL 含 `userinfo` 与 token query，Node fetch 拒绝构造请求；`apiFetch` 回显原始 `err.message`。
2. 同源证据 pathname 含合成 token 并返回 401；错误 label 保留 pathname。
3. 跨域证据 host 含合成 token；同源拒绝错误保留 host。

报告及工具输出只记录 `credentialLeak: true`，不打印凭据值。已请求实现者使用固定证据操作标签并清理原始网络错误，避免仅删除 query 后仍输出服务端可控 host/path。

修复中的独立复验：主脚本 SHA-256 `f877c1f88ef3d418479f955a0b7f8a87bc1f72493dc7fcb20e8a87f059635d01` 的 30 项主观察和 2 项额外 URL 凭据观察全部符合预期；A1 的畸形快照退出 1，A2 的 userinfo/path/host 三个场景均退出 1 且 `credentialLeak: false`。该轮属于未提交版本的过程证据，最终固定提交结果如下。

最终复验：固定提交的 userinfo、pathname、host 三种独立输入均退出 **1**，全部 `credentialLeak: false`。实现使用固定证据操作标签、不回显原始网络错误，并拒绝 userinfo；仓库测试同时覆盖平台元数据内嵌当前凭据时拒绝写盘。

### A3：合法的直接 caseIds 运行被强制要求存在计划 — 已修复并复验

真实后端 `PlatformService.createRun` 允许 `planId=''`，直接使用 `caseIds` 执行，无须创建计划。独立夹具保留完整 PASSED 报告、非空证据与正确设备/Agent，仅设 `planId=''`、`plans=[]`，实际 baseline 退出 1，预期为 0。首次在主脚本 SHA-256 `19a28e18fe7de891b8a59f197b19372976e9dbc84fdd4fe7e09bc7e097f23100` 复现，随后在 `76c8a1481d6963a300de3c8b37c87df26dc85e6067ddf9282798b6c740a2c07c` 仍复现。

原因：baseline 和快照 schema 一律禁止空 planIds，而规格只要求实际 PASSED 报告、证据与可恢复资源。允许合法空计划集合不会允许无报告的空快照通过。当时已将真实 API 契约及最小复现交回主控，由 Kimi 完成修复。

最终复验：固定提交在同样 `planId=''`、`plans=[]` 的完整证据场景中，baseline 和 check 分别退出 **0**；版本 1 空快照仍退出 **1**。新增仓库回归测试通过。

## 尚未验证

- 实际 Codespaces/PostgreSQL 服务重启由主控另行执行；临时 HTTP 夹具结果不替代真实数据库恢复证据。
- 原平台的真机、AI 接入、灾难恢复等范围没有因本次脚本验收得到新增成功结论。
