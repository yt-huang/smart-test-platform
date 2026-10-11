# 实施与交付记录

本次从仅有设计文档的 `db60c88` 开始，按项目 `saas-multi-agent` skill 完成中心平台与浏览器执行闭环。交付范围对应 `implement-platform-m1`，原 `build-test-platform-agent-arch` 的全部 M1/M2/M3 尚未整体验收。

## 实际协作与集成

协调者 `/root` 负责需求契约、OpenSpec、部署、CI 和集成；首阶段由真实 Codex 子 Agent `/root/backend`、`/root/frontend`、`/root/runtime` 分别在独立 Git worktree 实现，新上下文 `/root/acceptance` 负责独立业务和视觉验收。后续按用户的主动跨模型协作偏好，真实 Kimi Code CLI 实现持久化校验工具，独立 Codex `/root/kimi_acceptance` 验收；主控并行处理 CI 与云端验证。设计输入为 `docs/ui-handoff.md`，契约为 `docs/implementation-handoff.md`。

后端采用 Spring Boot 3.5.15 / Java 21、PostgreSQL，前端为 React/Vite，执行 Agent 与 CLI 使用 Node/Playwright。与原 Go Agent 方案的差异、单中心进程限制和内部 HTTP 的显式配置在组件实施报告中记录。

## 已实现功能

- 密码登录、四种角色、用户管理、AgentKey 签发与吊销、敏感操作审计；随机初始密码由未提交的 `.env` 提供。
- 结构化用例、版本历史、人工审核、审核版本冲突检测、计划编排、用例执行快照。
- 能力匹配、优先级与 FIFO、队列/执行超时、取消、资源租约和清理隔离；Agent 主动出站注册、心跳、断线重连与任务幂等。
- Chromium 实际执行、独立浏览器上下文、真实失败信息、截图、视频、trace、日志、设备指纹、鉴权证据下载、JUnit 和 Allure JSON 导出。
- 真实执行驱动的看板、用例稳定性 EWMA、人工释放标记与审计。稳定性标记目前用于人工复核，尚未自动调整 CI 门禁集合。
- 中文门户、空/加载/错误状态、移动端导航；Docker Compose、Codespaces devcontainer、GitHub Actions 和 CLI。

Android ADB 发现和 W3C Appium 执行适配器已实现并通过协议夹具测试；没有连接真实手机，因此不计入真机验收。

## 已有验证证据

本地后端使用 H2 文件库；云端必须使用 PostgreSQL。`scripts/verify-e2e.mjs` 实际创建并审核用例，由真实 Chromium Agent 执行成功和故意失败，检查证据访问鉴权、指纹、JUnit/Allure、无资源超时、取消、VIEWER 写入拒绝、审计和资源恢复。

最终本地成功运行 `run-028c43c2-2b6a-4cb7-9241-9ab4196f71e8`，故意失败运行 `run-8dad483a-aca7-46ec-8786-dd3de184b70d`；成功报告产生五份真实证据，全部十一项端到端检查通过。后端 `mvn verify` 通过 17 项测试，前端 7、Agent 14、实际 Chromium 2、CLI 5 项测试通过。运行输出保存在忽略提交的工作目录中，未提交密码和令牌。

GitHub `main` 的应用及环境集成版本 `54d52dc` 已通过完整 GitHub Actions：<https://github.com/yt-huang/smart-test-platform/actions/runs/38135116595>，包含前端构建、Agent/CLI 测试、Java 测试与打包、实际浏览器端到端验收。之后的交付记录和规格归档不改变应用代码。

独立验收及复现步骤见 `docs/independent-acceptance.md`，最终本地结论为 PASS。四项发现均已由原实现者修复并由独立 Agent 复验：审核竞争、设备指纹界面渲染、多段资源版本比较、时间戳 FIFO。实际 `version>=1` 执行 `run-57a6a4d8-3ae9-4204-a786-6a666a98cf35` 在 Chromium `156.0.8078.4` 上通过并恢复资源 IDLE。

## Codespaces 状态

部署与验收日期：2026-10-11。工作区 `smart-test-platform-7r7vvpp6gqqhp96j` 已按 `.devcontainer` 重建，Java 21、Node 22.23.3、Docker 29.8.2、Compose 2.40.3 可用。应用镜像的应用源码为 `54d52dc`；后续新增校验脚本、项目 skill、协作规则与交付记录通过 Git bundle 与 SSH 同步到同一工作区，与本次最终 GitHub `main` 一致（工作区 `git rev-parse HEAD` 可查询）。后续变更未改动 Java、前端或 Agent 应用代码。

- 工作区：<https://smart-test-platform-7r7vvpp6gqqhp96j.github.dev>
- 平台：<https://smart-test-platform-7r7vvpp6gqqhp96j-8080.app.github.dev>
- 端口 8080 为 private，已在登录 GitHub 的 Chrome 中实际访问平台、登录并看到真实执行数据。
- 平台和 PostgreSQL 容器健康；实际查询确认 PostgreSQL 16.15；数据库未映射公网端口。
- 浏览器资源 `codespace-browser-chromium` 实际报告 Chromium `156.0.8078.4`，Agent `codespace-browser` 在线并完成真实执行。
- 云端 `ACCEPTANCE_TARGET_URL=http://host.docker.internal:8091/ node scripts/verify-e2e.mjs` 全部十一项通过。成功报告 `run-d4419b98-e45f-4628-8978-6759b49d7d2e`，故意失败报告 `run-eb9f9b5e-d7fd-474a-a9a2-d9e372b7f348`；成功报告的五份证据均非空且匿名访问被拒绝。
- 停止平台与 Agent、重启 PostgreSQL、再启动全部服务后，重新登录验证两条用例、四条运行和成功报告仍在；五份证据下载长度一致；同一 Agent 与设备重新连接并恢复 IDLE。此为重启持久性验收，尚未替代异地灾难恢复演练。
- 新增自动化重启校验：Kimi `b70a3f6` 候选脚本生成重启前版本 1 基线，记录全部 4 条运行、2 条用例、1 个计划及通过报告的 5 份证据 SHA-256。实际停止 Agent/平台、重启 PostgreSQL、`docker compose up -d --wait --wait-timeout 120` 后，最终已独立验收的 `a731caf` 脚本检查该基线，退出 0、`status=verified`；全部原 ID 保留，五份证据 SHA-256 一致，`codespace-browser-chromium` 与 `codespace-browser` 原身份恢复 IDLE/ONLINE。固定脚本 SHA-256 为 `ca2be99163648bf7d8e7b5da415853fbf49acf5b39bb8da36a5445f755828e90`，与独立验收相同。基线与安全结果保存在云端忽略提交的 `.data/kimi-persistence.json`、`.data/kimi-baseline-result.json`、`.data/kimi-check-result.json`。

初次环境验证暴露基础 Java 镜像的未使用 Yarn apt 源签名失效、缺少 SSH 与 Git LFS；已移除该可选源，并在开发容器配置中加入 SSH 与 Git LFS。保留软件包签名验证；实际工作区也已安装 Git LFS 并完成精确源码同步。首次应用构建、postCreate 与 postStart 的真实创建日志均显示成功。

管理员用户名为 `admin`。在上述工作区终端执行 `node scripts/admin-password.mjs` 查看该工作区的随机密码；密码不写入交付文档、Git 或截图。工作区停止后从工作区链接重新启动，再打开平台。

## Kimi 与 Codex 的实际分工证据

项目 `AGENTS.md` 已保存默认主动分配偏好，不要求用户每次启用 Kimi；项目 skill、runtime 与交接模板已随仓库保存。新环境分别核验执行工具与登录，不随 Git 复制凭据。后续其他 Agent 沿用输入提交、文件所有权、provider/model 元数据、实际退出结果与独立验收的统一交接。

本机实际调用 `C:/Users/admin/.kimi-code/bin/kimi.exe` 0.29.0，显式模型别名 `kimi-code/kimi-for-coding`；从配置白名单字段核验 provider 为 `managed:kimi-code`、type `kimi`、host `api.kimi.com`。未输出认证配置。Kimi 在独立 `codex/platform-kimi` worktree 中只改动两个脚本和自己的实施报告；未推送或部署。

| 实际阶段 | 输入与输出 | 真实结果 |
| --- | --- | --- |
| 运行前置 | 输入 `d770b75`，首次缺 Git Bash | 退出 1，1 秒；官方便携 Git 下载 SHA-256 核验后补齐 |
| 首次代码产出 | 输入 `d770b75`，写出脚本与测试初稿 | 主控为提前交回审查暂停进程，退出 1，499 秒；不计完成 |
| 完整实现 | 输入 `d770b75` → `b70a3f6` | CLI 退出 0，734 秒，22 项行为测试通过 |
| 安全修复 | 输入 `b70a3f6` → `4554ff3`，复用 CLI 返回的真实 session | CLI 退出 0，391 秒，25 项测试通过 |
| API 兼容修复 | 输入 `4554ff3` → `a731caf`，允许合法无计划运行 | CLI 退出 0，98 秒，26 项测试通过 |

退出 0 表示 implemented；独立 Codex 对固定 `a731caf` 实际运行 26 项测试、34 项独立观察后给出 PASS，三个实际复现问题均由 Kimi 修复。详见 `docs/kimi-persistence-implementation.md` 与 `docs/kimi-independent-acceptance.md`。主控 cherry-pick 后再次运行 26 项测试全部通过，CI 增加软件夹具测试及真实浏览器报告的 baseline/check。云端数据库重启证据另见上文，未用 HTTP 夹具冒充真实部署。

CLI 生命周期元数据及 stdout JSONL/stderr 保存在本机忽略提交的 `.data/kimi/`。底层未提供的模型版本、Kimi 与 Codespaces 实际费用均记为未知。

## 仍需接入或后续实施

浏览器矩阵回归已另行实现，详见 [矩阵交付记录](matrix-delivery.md)。原规格中 Android/iOS 真机业务冒烟、Mac/WDA、Maestro、scrcpy 投屏、远程 ADB、设备预约/真机矩阵、Top 20 真机、云真机供应商、飞书通知、私有视觉模型、AI 生成/自愈/归因、WebRTC，以及全链路内部 TLS 均未完成验收。当前浏览器隔离使用每用例独立上下文，尚非原规格的每会话独立容器池。证据为平台鉴权上传下载，尚非对象存储预签名直传。

后端调度只支持一个中心进程；横向扩容需要数据库原子分布式资源认领。长期生产还需要分页/索引、证据保留策略、外部身份和账号生命周期、完整审计保留与实际备份恢复演练。

本次可观测输入：用户确认 Codespaces 目标，并完成 GitHub `codespace` 授权；内部交接与返工记录由上述四个实际子 Agent、组件报告和 Git 提交保留。模型与 Codespaces 实际费用当前接口未返回，记为未知，不以估算冒充账单。工作区配置空闲 30 分钟停止，停止后访问需重新启动工作区。
