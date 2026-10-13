# 浏览器矩阵交付记录

本轮在已有平台上完成 Web 计划的多浏览器回归批次、CLI 与中文门户，应用集成版本为 `ebe904dd4c60431e716a3b25bde4c98627b9cb3a`。原项目的 Android/iOS 真机、投屏、预约、AI 与全部 M2/M3 验收仍未完成。

## 实际协作

按项目 `saas-multi-agent` skill 分配独立 worktree，主控 `/root` 维护 OpenSpec、契约、真实环境、集成与部署；Codex `/root/matrix_backend` 实现后端，`/root/matrix_cli` 实现 CLI，独立上下文 `/root/matrix_acceptance` 验收。

门户由实际 Kimi Code CLI 0.29.0 执行。核验 provider 为 `managed:kimi-code`，type `kimi`，host `api.kimi.com`，别名 `kimi-code/kimi-for-coding` 对应 model `kimi-for-coding`。不是改名的 Codex 子 Agent。复用已有登录，凭据没有写入任务包、仓库、报告或云端。

初始规格输入为 `86724c5f2a7ade2c035216e626f46a6cb33a63d3`；后端随后读取主控维护的事务与历史设计补充。真实 Kimi 初次实现及三次原作者修复均退出 0：

| 执行 | 原提交 | 本次可观测运行时间 | 结果 |
| --- | --- | --- | --- |
| 门户实现 | `1c1f6c4462a32fe7d7a0fdc074372d9cf902f8fc` | 405 秒 | 14 项前端测试、构建通过 |
| 名称、指纹与文案修复 | `2ede3b96937e6b406564ae3dbdbd4ff1cac8410c` | 186 秒 | 16 项前端测试、构建通过 |
| 角色入口与可访问选择器修复 | `7b431e1` | 111 秒 | 16 项前端测试、构建通过 |
| 指标显示修复 | `3216bf0` | 41 秒 | 16 项前端测试、构建通过 |

Kimi 日志、退出结果和 resume session 元数据保留在忽略提交的 `.data/kimi-matrix/`。后端原提交 `9878f7e` / `2ae576c`、CLI 原提交 `95419b3` / `24582ba` 已由主控集成。可观测费用未知；上述时间为 CLI 进程墙钟，不是人工工时。

## 已交付行为

- 一次发起 2–8 个不同资源能力的 Web 目标，全部校验通过才保存批次与子任务；事务提交后才向 Agent 分配，提交失败不会留下部分任务。
- 固定审批快照、计划参数与提交；按真实资源能力独立排队、执行、超时和取消。完成目标保持原结果，批次结束后可下载聚合 JUnit。
- 门户显示实际子任务、浏览器版本、资源指纹、进度和原报告；权限、加载、空、失败及手机布局已检查。
- `platform matrix --plan ID --browsers chromium,firefox` 实际调用 API，只有所有非空结果通过才退出 0，失败退出 1，配置或响应错误退出 2。
- 稳定性比较按实际平台、浏览器、版本与来源区分历史；稳定的跨浏览器差异不会被误计为 flaky。

## 实际验证

最终组件检查：后端 Maven verify 38 项、前端 16 项与构建、CLI 23 项全部通过。独立验收实际执行 API 43 项、CLI 13 项、门户 28 项、修复针对检查 45 项、部分完成真实浏览器行为 14 项；独立后端聚焦检查另运行 20 项。详见 [独立验收](matrix-independent-acceptance.md)，不把上述不同范围累加为独立测试总数。

`scripts/verify-matrix.mjs` 在本地和 Codespaces 各实际执行 15 项通过，包含审批、原子拒绝、Chromium/Firefox 全通过、Firefox 专属失败、证据鉴权与哈希、跨环境评分、聚合报告、取消、超时、角色以及真实 CLI 0/1。这些场景使用临时 HTTP 测试页面，脚本结束后页面服务关闭；历史报告仍可查看，原计划不是持续运行的示例站点。

云端实际 Chromium `156.0.8078.4`、Firefox `157.0`：

| 结果 | 批次 ID |
| --- | --- |
| 全通过 | `matrix-fd0c6855-5894-4165-b2fa-fd18e4fe4023` |
| 真实浏览器差异导致失败 | `matrix-dde3b637-8553-425c-8640-c1b76b07de33` |
| 取消 | `matrix-57a05c6d-cf67-4f36-a30b-ffcdc559350d` |
| 排队超时 | `matrix-e1c5d7b1-6558-4019-a911-cfad6f34b32f` |

最终镜像构建并更新后，实际停止平台与 Agent、重启 PostgreSQL、重新启动全部服务。检查 6 个终态批次与 12 个子任务引用的元数据哈希不变；既有持久化校验同时确认 16 条运行、4 条用例、4 个计划、7 份通过报告、35 份证据 SHA-256 完整，原 Chromium/Firefox 资源恢复 IDLE，Agent ONLINE。独立本地另确认 4 个批次、8 个子任务、聚合 JUnit 哈希和 20 份证据在重启后不变。这是重启保留检查，不替代异地恢复演练。

GitHub 完整 CI [38151953533](https://github.com/yt-huang/smart-test-platform/actions/runs/38151953533) 对应最终应用版本 `ebe904d`，已实际完成且结论为 success，包含真实双浏览器矩阵与持久化检查。

## 访问

- [平台](https://smart-test-platform-7r7vvpp6gqqhp96j-8080.app.github.dev)
- [Codespaces 工作区](https://smart-test-platform-7r7vvpp6gqqhp96j.github.dev)

8080 保持 private；登录有权限的 GitHub 账号后访问。主控已从 Chrome 登录并看到最终真实矩阵与两个版本指纹，截图保存在 `.data/acceptance/cloud-matrix-final.jpg`。管理员密码在工作区执行 `node scripts/admin-password.mjs` 获取，不写入交付记录。Codespaces 当前空闲 30 分钟自动停止，可从工作区恢复；它不是全天运行的独立生产主机。

WebKit 可选能力由 Agent 实际启动探测决定，本轮执行验收覆盖 Chromium/Firefox，未声称实际跑过 WebKit。随后已实现 [隔离用例 CI 门禁](gate-delivery.md) 与 [浏览器证据时间轴](timeline-delivery.md)；告警升级、真机、投屏和AI接入继续按独立功能推进。
