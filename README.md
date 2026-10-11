# 智测平台 · Smart Test Platform

基于本仓库 PRD、架构与 OpenSpec 开发的中心平台，采用 Spring Boot 3 / Java 21、PostgreSQL、React 和主动出站的 Playwright Agent。浏览器可完成用例编写、人工审核、计划编排、实际执行、证据查看与报告导出。

## GitHub Codespaces

已部署的验收工作区：[打开工作区](https://smart-test-platform-7r7vvpp6gqqhp96j.github.dev) · [访问平台](https://smart-test-platform-7r7vvpp6gqqhp96j-8080.app.github.dev)。端口为私有，需要所有者 GitHub 登录；工作区需保持运行。实际云端验收见 [交付记录](docs/delivery.md)。

1. 在仓库 **Code → Codespaces → Create codespace on main** 创建工作区；仓库内 `.devcontainer/devcontainer.json` 自动安装运行环境并构建应用。
2. 首次容器构建需要下载依赖和浏览器。完成后在 **Ports** 打开 **8080**，登录平台。
3. 管理员用户名为 `admin`；在 Codespaces 终端运行 `node scripts/admin-password.mjs` 查看本工作区随机生成的密码。
4. 外部访问地址由 GitHub 分配，形如 `https://<codespace-name>-8080.app.github.dev`。默认端口私有，仅工作区所有者通过 GitHub 登录后可访问；需要团队分享时在 Ports 中选择相应可见性。

Codespaces 停止后应用也停止；这是开发与验收部署。代码和数据保留在工作区及 Docker 命名卷中。长期运行应部署到常驻服务器；不要删除含唯一数据的 Codespace。

## Docker 部署

需要 Docker Engine、Compose 和 Node.js 22+（只用于生成配置）。

```bash
node scripts/init-env.mjs
docker compose up -d --build --wait
node scripts/admin-password.mjs
```

打开 `http://localhost:8080`。Compose 包含中心平台、PostgreSQL、浏览器 Agent；数据库不映射公网端口。应用和证据数据使用独立命名卷。Codespaces 的外部连接由 GitHub HTTPS 终止，当前 Docker 私网使用显式启用的内部 HTTP；完整的内部 TLS 仍需配置并验收。公网部署需要可信 HTTPS 反向代理，办公机 Agent 使用对应 WSS 地址。管理员与数据库密码在忽略提交的 `.env` 中分别随机生成。

## 本地开发

Java 21、Maven 3.9+、Node 22+：

```bash
node scripts/init-env.mjs
# 将 .env 中的 PLATFORM_ADMIN_PASSWORD 设置到当前终端环境
mvn -f backend/pom.xml spring-boot:run
```

另一终端启动门户：

```bash
cd frontend
npm ci
npm run dev
```

前端开发代理转发 API 和 WebSocket 到 `localhost:8080`。开发默认使用本地 H2 文件数据库；Compose 使用 PostgreSQL。没有配置管理员密码时，后端拒绝启动。

在平台 Agent 管理中创建一次性 AgentKey，然后启动办公机 Agent：

```bash
cd agent
npm ci
npm run install:browser
# 设置 PLATFORM_URL、AGENT_KEY 与稳定的 AGENT_ID
npm start
```

Agent 不监听入站端口，主动注册和续租；任务只按平台、浏览器、provider 和标签匹配。浏览器执行使用独立上下文，收集真实截图、trace、视频与错误；清理失败资源进入维护状态。

CLI 和 CI 用法见 [cli/README.md](cli/README.md)，执行协议与权限见 [docs/implementation-handoff.md](docs/implementation-handoff.md)，真实交付与验收状态见 [docs/delivery.md](docs/delivery.md)。

## 浏览器矩阵回归

在 Web 测试计划卡片选择“矩阵回归”，默认提交 Chromium 与 Firefox，可增加 WebKit。门户提供批次进度、各目标真实结果/资源指纹、原执行报告、取消与聚合 JUnit。REST 支持 2–8 个不同能力目标，所有用例必须已审批；无效目标不会留下部分任务。只有全部目标通过，批次才通过。

Compose 的 Agent 会实际探测 Chromium、Firefox、WebKit，启动失败的引擎不会上报为空闲资源。本机 Agent 要先安装所选引擎，并设置 `AGENT_BROWSERS=chromium,firefox`；资源不足按原队列超时处理。

```bash
PLATFORM_URL=http://localhost:8080 PLATFORM_TOKEN="$TOKEN" node cli/src/index.js matrix --plan PLAN_ID --browsers chromium,firefox --junit matrix.xml
```

完整记录见 [矩阵回归交付](docs/matrix-delivery.md)。真机矩阵、设备预约与 Top 20 性能验收继续按原规格推进。

## 隔离用例与 CI 门禁

运行和矩阵报告分别保留原始执行结果与门禁判定。已隔离的用例仍真实执行，纯用例失败可按警告放行；首次触发隔离的失败仍阻塞，缺失结果、取消、超时、资源清理或执行器故障也阻塞。隔离集合在提交时冻结，判定和门禁报告在首次终态冻结，后续人工复核不改历史。

默认 CLI 仍按原始失败退出 1。CI 显式使用 `--gate` 选择门禁策略，PASSED/WARN 退出 0，BLOCKED 退出 1，畸形响应或报告退出 2；`--gate --junit` 下载独立门禁 JUnit，原报告继续保留真实失败。

```bash
node cli/src/index.js run --plan PLAN_ID --gate --junit gate.xml
node cli/src/index.js matrix --plan PLAN_ID --browsers chromium,firefox --gate --junit matrix-gate.xml
```

以上命令需已设置 `PLATFORM_URL` 与 `PLATFORM_TOKEN`。门禁记录见 [交付记录](docs/gate-delivery.md)。工单与告警通知尚待实际接入。

## 验收

```bash
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
npm ci --prefix agent
npm test --prefix agent
npm ci --prefix cli
npm test --prefix cli
mvn -f backend/pom.xml verify
# 后端及真实浏览器 Agent 启动后
node scripts/verify-e2e.mjs
# Agent 启用并安装 Chromium + Firefox 后
node scripts/verify-matrix.mjs
# 用同一审批用例真实触发隔离、警告门禁与人工释放
node scripts/verify-gate.mjs
```

验收包含真实浏览器成功/失败执行、草稿审核门禁、证据鉴权、报告导出、超时、取消、RBAC 和资源清理。GitHub Actions 自动执行相同闭环。

已有真实通过执行后，可以保存基线并检查服务重启后的数据与证据。脚本从环境变量或当前目录的 `.env` 读取管理员密码，快照不保存登录凭据：

```bash
mkdir -p .data
node scripts/verify-persistence.mjs baseline --snapshot .data/persistence.json
docker compose stop browser-agent platform
docker compose restart postgres
docker compose up -d --wait --wait-timeout 120
node scripts/verify-persistence.mjs check --snapshot .data/persistence.json
```

检查保留全部原用例、计划和运行 ID，核对通过报告的证据 SHA-256，并等待同一设备 IDLE、同一 Agent ONLINE；没有真实报告、记录丢失或附件改变都会失败。软件夹具测试使用 `node --test scripts/verify-persistence.test.mjs`；真实云端验证与独立验收见交付记录。

## 备份与恢复

```bash
bash scripts/backup.sh
# 建议在全新部署上恢复，使用对应的 .env
bash scripts/restore.sh backups/<timestamp>
```

备份覆盖 PostgreSQL、证据与 Agent 状态，密码配置单独安全保存。恢复会写入当前部署数据库，先停止任务并备份当前数据。

## 外部接入依赖

Android/iOS 真机、Mac/WDA、scrcpy 远程投屏、私有视觉模型、商业云真机与飞书通知需要实际设备、服务或凭据；浏览器执行闭环不依赖这些资源。界面和报告不得把未连接的设备、模型或执行结果显示成已验收能力。原 `build-test-platform-agent-arch` 的 M2/M3 任务保留各自真实状态。
