# 实施与交付记录

本次从仅有设计文档的 `db60c88` 开始，按项目 `saas-multi-agent` skill 完成中心平台与浏览器执行闭环。交付范围对应 `implement-platform-m1`，原 `build-test-platform-agent-arch` 的全部 M1/M2/M3 尚未整体验收。

## 实际协作与集成

协调者 `/root` 负责需求契约、OpenSpec、部署、CI 和集成；真实 Codex 子 Agent `/root/backend`、`/root/frontend`、`/root/runtime` 分别在独立 Git worktree 实现；新上下文 `/root/acceptance` 负责独立业务和视觉验收。没有模拟 Agent 身份，没有调用 Kimi。设计输入为 `docs/ui-handoff.md`，契约为 `docs/implementation-handoff.md`。

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

部署与验收日期：2026-10-11。工作区 `smart-test-platform-7r7vvpp6gqqhp96j` 已按 `.devcontainer` 重建，Java 21、Node 22.23.3、Docker 29.8.2、Compose 2.40.3 可用。源码通过 Git bundle 与 SSH 同步到 `54d52dc`，此后交付记录与规格归档也同步到同一工作区。GitHub `main` 已发布集成代码。

- 工作区：<https://smart-test-platform-7r7vvpp6gqqhp96j.github.dev>
- 平台：<https://smart-test-platform-7r7vvpp6gqqhp96j-8080.app.github.dev>
- 端口 8080 为 private，已在登录 GitHub 的 Chrome 中实际访问平台、登录并看到真实执行数据。
- 平台和 PostgreSQL 容器健康；实际查询确认 PostgreSQL 16.15；数据库未映射公网端口。
- 浏览器资源 `codespace-browser-chromium` 实际报告 Chromium `156.0.8078.4`，Agent `codespace-browser` 在线并完成真实执行。
- 云端 `ACCEPTANCE_TARGET_URL=http://host.docker.internal:8091/ node scripts/verify-e2e.mjs` 全部十一项通过。成功报告 `run-d4419b98-e45f-4628-8978-6759b49d7d2e`，故意失败报告 `run-eb9f9b5e-d7fd-474a-a9a2-d9e372b7f348`；成功报告的五份证据均非空且匿名访问被拒绝。
- 停止平台与 Agent、重启 PostgreSQL、再启动全部服务后，重新登录验证两条用例、四条运行和成功报告仍在；五份证据下载长度一致；同一 Agent 与设备重新连接并恢复 IDLE。此为重启持久性验收，尚未替代异地灾难恢复演练。

初次环境验证暴露基础 Java 镜像的未使用 Yarn apt 源签名失效、缺少 SSH 与 Git LFS；已移除该可选源，并在开发容器配置中加入 SSH 与 Git LFS。保留软件包签名验证；实际工作区也已安装 Git LFS 并完成精确源码同步。首次应用构建、postCreate 与 postStart 的真实创建日志均显示成功。

管理员用户名为 `admin`。在上述工作区终端执行 `node scripts/admin-password.mjs` 查看该工作区的随机密码；密码不写入交付文档、Git 或截图。工作区停止后从工作区链接重新启动，再打开平台。

## 仍需接入或后续实施

原规格中 Android/iOS 真机业务冒烟、Mac/WDA、Maestro、scrcpy 投屏、远程 ADB、预约/矩阵编排、Top 20 真机、云真机供应商、飞书通知、私有视觉模型、AI 生成/自愈/归因、WebRTC，以及全链路内部 TLS 均未完成验收。当前浏览器隔离使用每用例独立上下文，尚非原规格的每会话独立容器池。证据为平台鉴权上传下载，尚非对象存储预签名直传。

后端调度只支持一个中心进程；横向扩容需要数据库原子分布式资源认领。长期生产还需要分页/索引、证据保留策略、外部身份和账号生命周期、完整审计保留与实际备份恢复演练。

本次可观测输入：用户确认 Codespaces 目标，并完成 GitHub `codespace` 授权；内部交接与返工记录由上述四个实际子 Agent、组件报告和 Git 提交保留。模型与 Codespaces 实际费用当前接口未返回，记为未知，不以估算冒充账单。工作区配置空闲 30 分钟停止，停止后访问需重新启动工作区。
