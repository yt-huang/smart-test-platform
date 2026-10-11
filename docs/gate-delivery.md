# 隔离用例 CI 门禁交付

日期：2026-10-12（Asia/Shanghai）。应用集成版本 `228194f96536b7d5445b597d6162e626e8562cb5` 已通过完整 CI，并实际部署到已有 Codespaces。本轮完成原 M2 flaky 门禁子集；工单、3%/14 天通知升级与整体 M2/M3 尚未完成。

## 实际协作

主控 `/root` 维护 OpenSpec、契约、Agent 基础设施错误分类、真实验收脚本、集成与云端。Codex `/root/gate_backend_resume` 与 `/root/gate_cli` 在已有独立 worktree 分别实现后端和 CLI，独立上下文 `/root/gate_acceptance_resume` 验收。最初后端/验收子 Agent 曾因账户额度退出且没有落地实现；随后由上述真实执行者继续，不把失败分派计为完成。

门户由实际 Kimi Code CLI 0.29.0 实现。核验别名 `kimi-code/kimi-for-coding` 映射 model `kimi-for-coding`，provider `managed:kimi-code` / type kimi / host api.kimi.com。复用原登录，不同步认证到 GitHub 或云端。

| 真实 Kimi 执行 | 输入 → 原提交 | CLI 结果与可观测墙钟 |
| --- | --- | --- |
| 门户实施 | `13395bc` → `12b860d` | 退出0，537秒，20项测试和构建通过 |
| 冻结说明、状态原型及计数保护修复 | `12b860d` → `013ef91` | 退出0，324秒，24项测试和构建通过 |
| 历史策略与隔离 ID 保护修复 | `013ef91` → `95839c1` | 退出0，248秒，25项测试和构建通过 |

后端原提交 `1a8be79` / `168a3df`、CLI 原提交 `c876b34` 与三个真实 Kimi 提交均已由主控集成。原作者实施记录为 implemented，独立验收及实际集成证据分别见组件报告和 [独立验收](gate-independent-acceptance.md)。Native Agent 的具体模型元数据与实际费用不可观测，记未知；Kimi stdout/退出元数据保存在忽略提交的 `.data/kimi-gate/`。

## 行为与边界

运行、矩阵及每个目标公开独立 gate。隔离集合由服务端在创建事务读取并冻结，全部审批用例继续真实执行。首次失败触发隔离的任务仍 BLOCKED，之后提交的纯隔离用例失败可 WARN。人工解除只影响新提交。判定与门禁导出快照在首次终态冻结；晚到完成可补原始证据，不能追溯放行。

原始 FAILED、原始 JUnit、证据和看板统计保留。独立门禁 JUnit 用 skipped 标记隔离失败，同时保存实际错误与 caseId。SKIPPED/TIMED_OUT、缺失结果、取消、排队/执行超时、断线、清理故障与显式执行器/证据故障始终阻塞，并有基础设施 error 节点。历史无快照任务使用 strict-legacy-v1，不能因当前隔离标记被放行。

默认 CLI 保持原始策略；显式 `--gate` 使用门禁 PASSED/WARN=0、BLOCKED=1、畸形响应或 XML=2，`--gate --junit` 下载门禁报告。JSON、原始状态、矩阵聚合、XML 节点及计数互相校验，导出重定向拒绝。门户显示原始结果与门禁的区别，保留两份报告，VIEWER 可读和下载，无法执行或解除隔离。

旧 Agent 未上报 infrastructureErrors 的兼容路径不能证明其内部所有故障分类。当前自有浏览器/Android 适配器已上报明确错误；Android 部分只通过软件协议测试，本轮没有现场手机验收。用例隔离仍是用例级策略，编辑不自动释放，需人工复核。

## 实际检查

- 集成组件：Java21 Maven verify 56项、门户25项与构建、CLI42项、Agent协议15项、真实 Chromium 执行器3项，全部退出0。后端56项之后仅更新门户静态资源，重新打包；最终完整 CI 再次从源码测试并构建全部组件。
- 本地独立：API/WS fixtures97项、CLI fixtures61项、实际门户106项、门户保护fixtures22项、真实证据/执行来源核对21项、重启保留8项，以及独立解析16份 XML，均通过。不同范围分开记录，不累加为单个独立测试总数；程序化结果、注入API与mock初始化明确不是实际用例执行。
- `scripts/verify-gate.mjs` 本地与 Codespaces 各实际通过13个业务场景；同一审批快照、同一提交、同一实际 Chromium 环境，控制 HTTP 页面先通过再出现真实 expectText 失败，不伪造 Agent 完成或 EWMA。
- 真实 CLI 退出分别为 `0 / 1 / 0`：单运行 --gate、默认单运行、双浏览器矩阵 --gate；三次都保留真实 FAILED+WARN。Chromium `156.0.8078.4`、Firefox `157.0`，警告运行实际 PNG/trace ZIP/video/log 四份非空且已校验鉴权与 SHA-256。
- 完整 GitHub Actions [38184942031](https://github.com/yt-huang/smart-test-platform/actions/runs/38184942031) 对应 `228194f`，实际 completed/success，包含原端到端、浏览器矩阵、新门禁实际失败链路与证据持久性检查。

独立发现的门户冻结文案、历史隔离策略保护、Agent 初始化故障遗漏已由各原作者修复并复核。主控验收脚本初次把超时基础设施错误数假定为2；实际每目标同时有缺少完成与超时错误，合计4。修正为按实际子任务求和且每目标必须有错误，完整重跑通过，未删除产品负向要求。

## 云端记录与重启

| 实际场景 | 记录 |
| --- | --- |
| 通过基线 | `run-243d7624-2bb3-42df-b312-9b5ee1f294f5` |
| 首次失败仍阻塞 | `run-c7a49256-a0b3-430b-908d-71ea04cb728a` |
| 隔离失败 WARN，原始 FAILED | `run-8aff70fa-b945-4560-b9f4-9b140b34af07` |
| Chromium/Firefox 警告矩阵 | `matrix-201a9a53-dfa4-40c7-92ec-2fbedc72846b` |
| 解除后新失败阻塞 | `run-e8df246d-f57d-4c5d-8ebc-23dcf306a295` |
| 排队超时阻塞矩阵 | `matrix-4064d2bc-f077-48c2-b868-4c96086513e3` |

升级前保存原数据基线，更新平台/Agent 镜像后核验16条原运行、4条用例、4个计划、7份通过报告及35份证据完整。新增验收后实际停止 Agent/平台、重启 PostgreSQL、启动所有服务并重新登录：

- 38条单运行/矩阵 gate及门禁 JUnit哈希逐项不变，其中9条WARN；上述真实失败的4份证据长度/SHA-256一致。
- 29条运行、5条用例、6个计划保留；8份通过报告的40份证据SHA-256一致，原Chromium/Firefox设备恢复IDLE，Agent ONLINE。
- 健康接口UP。安全结果在云端 `.data/gate-retention-check-result.json`、`.data/gate-persistence-check-result.json` 与 `.data/gate-cloud-result.json`。这是升级/重启保留验收，不替代异地灾难恢复演练。

受控HTTP测试页8093在脚本finally关闭，验收计划目标不是长期演示站点；历史报告和证据可访问。主控已从Chrome查看云端真实原始失败与警告门禁，截图 `.data/acceptance/cloud-gate-final.jpg`。独立手机检查为390px浏览器视口，不是物理手机。

## 访问与后续范围

[平台](https://smart-test-platform-7r7vvpp6gqqhp96j-8080.app.github.dev) · [Codespaces工作区](https://smart-test-platform-7r7vvpp6gqqhp96j.github.dev)。8080保持private，用有权限的GitHub账号访问；管理员密码在工作区运行 `node scripts/admin-password.mjs` 查看。工作区空闲30分钟会停止，从工作区恢复后访问。

证据时间轴、设备预约、Android/iOS现场业务验收、投屏、云真机、通知和私有视觉模型/AI仍按原规格后续推进；未启用的能力不展示为已接入。原T15的通知/工单与整体验收保持未勾选。
