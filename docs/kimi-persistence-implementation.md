# Kimi 持久化验证脚本实施报告（第二轮：阻断修复）

## 输入与执行者

- 输入提交（实现前 `git rev-parse HEAD` 实测）：`d770b756c15bc0b5467537e98af5a294aefeedf0`
- 执行者：Kimi Code CLI（交接记录版本 0.29.0）；模型别名 `kimi-code/kimi-for-coding`
- Provider 元数据：第一轮已由主控从配置核验为 `managed:kimi-code` / type `kimi` / api.kimi.com。按本轮交接约束（禁止读取工作目录外文件），本轮未重复读取配置文件，沿用主控的核验记录；不以进程名或模型自述代替。
- 底层模型版本与可观测费用：未知，不作编造。

## 交付物（授权范围内三个文件）

- `scripts/verify-persistence.mjs` — 可复用 CLI（baseline / check）
- `scripts/verify-persistence.test.mjs` — Node 内建 test runner 行为测试（22 个）
- `docs/kimi-persistence-implementation.md` — 本报告

未修改任何其他生产代码、共享规格、AGENTS、CI 或用户配置。

## 本轮修复的 Codex 独立审查阻断发现

1. **完整 ID 保留**：baseline 快照现保留当时全部 `runIds`/`caseIds`/`planIds`（含 FAILED/CANCELLED 运行、未被任何通过报告引用的用例与计划）；完整性明细（报告元数据、证据 SHA-256、资源身份）仅选中已完成 PASSED 且有非空证据的运行。check 对任一基线 ID 丢失即失败，同时允许新增记录。
2. **拒绝无效快照**：任何 version-1 快照在认证与检查之前先经 `validateSnapshot` 严格结构校验——`runIds`/`caseIds`/`planIds` 非空且无重复；至少一个 `status: "PASSED"` 报告带 `finishedAt`、非空 `deviceId`/`agentId`、数字 summary、非空 `caseIds`；每个证据项有 id、正整数 size、64 位十六进制 SHA-256；资源项含 `deviceId`/`agentId` 且每个报告的设备都有已解析资源身份。四个空数组之类的空快照/hand-edit 快照在登录前即非零退出，不再误报 verified。
3. **资源身份边界**：baseline 要求每个入选 PASSED 报告具备 `finishedAt` + 非空 `deviceId`/`agentId`，并在当前 `/api/devices`、`/api/agents` 中解析同一身份（设备缺失、设备挂在其他 Agent 下、Agent 缺失均失败），资源清单不得静默过滤。check 要求当前运行记录的 `deviceId`/`agentId` 与基线一致，且同一设备恢复 IDLE、其 Agent 恢复 ONLINE；设备改挂其他 Agent 判失败。

一并保持/加固的安全约束：所有鉴权 fetch（含证据下载）`redirect: manual` 并拒绝意外重定向；证据仅限平台同源，Bearer 绝不外发；错误信息只输出 origin+pathname 的安全端点标签，不回显携带 query 凭据的服务端 URL，不输出原始错误响应体；`PLATFORM_URL` 必须是纯 http(s) origin（拒绝 userinfo/query/fragment）；密码/令牌只驻留进程内存，快照与输出不含凭据。

## 检查命令与实测结果

- `node --version` → v22.11.0（Node 22 内建能力，无新增依赖）
- `node --test scripts/verify-persistence.test.mjs` → `# tests 22 / # pass 22 / # fail 0`，退出码 0（多轮运行结果一致）
- 测试使用临时目录 + 本地 HTTP 夹具（含跨域 trap server），覆盖：基线/check 正向、失败/取消运行与孤儿用例计划的 ID 保留、丢记录失败、等长篡改失败、新增记录仍通过、空部署/无证据失败、快照缺失/非法 JSON/版本不符、空快照与畸形元数据在认证前拒绝、身份缺失/改挂失败、401 不落盘不回显、跨域证据与重定向不泄漏 Bearer、凭据 query 不回显、非法 PLATFORM_URL、Agent OFFLINE 即使设备 IDLE 仍失败、恢复超时上限、usage 错误不触网。

## 未验证项（由主控在真实环境验收）

- 云端 Codespaces + PostgreSQL + 真实 Agent/Chromium 设备上的重启恢复、真实证据字节 SHA-256 校验，由 Codex 主控执行；本地夹具为内存 HTTP 服务，**不是** PostgreSQL/真云端，不构成对平台真实持久化的验收。
- 与真实后端字段的对接依据第一轮 API 探查记录与后端源码静态核对（`run.status/finishedAt/deviceId/agentId/summary`、`device.agentId/status`、`agent.status`、同源 `/api/evidence/{id}`）。

## 遗留事项

- 无已知的脚本侧未完成项。云端验收结果以主控最终交付为准。
