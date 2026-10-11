# 隔离门禁门户实施报告（Kimi）

## 输入与执行身份

- 任务包：`.data/task/gate-handoff.md`，阶段 implement，输入提交 `13395bc120426bee8f1bf50d9d1c86c98af560c6`，接口版本 contract v1（`openspec/changes/add-quarantine-ci-gate/design.md`，规格 `openspec/changes/add-quarantine-ci-gate/specs/quarantine-ci-gate/spec.md`）。
- 执行者：真实 Kimi Code CLI 0.29.0，provider `managed:kimi-code` / type kimi / host api.kimi.com，核验别名 `kimi-code/kimi-for-coding` → model `kimi-for-coding`。
- 工作目录：`C:/Users/admin/.codex/worktrees/platform-frontend/ai-test`，分支 `codex/gate-portal`。

## 变更范围（仅授权文件）

- 新增 `frontend/src/gateUtils.js`：`gateStatusLabels`（PENDING 等待判定 / PASSED 通过 / WARN 警告放行 / BLOCKED 阻塞）；`isGatePresent` 仅接受契约四种状态的 gate 对象，缺失或状态无法识别的数据一律视为“未提供门禁判定”，不推断通过、不渲染原始字段；`gateCounts` 读取 total/passed/quarantinedFailures/blockingFailures/infrastructureFailures，畸形值收敛为非负整数；`gateStatusDescription` 用用户可理解的中文说明等待判定、全部真实通过、隔离失败警告放行（隔离集合冻结于提交、原始失败证据仍保留）与阻塞失败/基础设施错误（隔离不能抵消取消、超时与资源故障）的差异；`gateFreezeNote` 说明判定与隔离集合在提交时冻结、人工解除不修改历史报告。
- 新增 `frontend/src/gate.jsx`：共用 `GateSummary` 组件（无 gate 时显示“此历史报告未提供门禁判定，仅展示原始执行结果，不推断为通过”的说明条；有 gate 时显示状态徽章、说明文案与五项计数：计划用例/通过/隔离失败（警告放行）/阻塞失败/基础设施错误，附冻结说明脚注，按状态着色 pending/passed/warn/blocked）与矩阵目标行内 `GateBadge`（无 gate 显示 “—”）。
- 修改 `frontend/src/pages/Runs.jsx`：RunDetail 在结果指标与执行上下文之间渲染 `<GateSummary gate={run.gate} />`；标题区新增「门禁 JUnit」下载按钮（`GET /api/runs/{id}/gate-junit`，文件名 `run-{id}.gate.xml`），活跃时禁用，忙碌互斥，失败经 toast 报错后可重试；原「JUnit 报告」「Allure 数据」按钮与语义不变。
- 修改 `frontend/src/pages/Matrices.jsx`：MatrixDetail 渲染矩阵级 `<GateSummary gate={matrix.gate} />`；执行目标表新增「门禁」列，每个 variant 显示 `GateBadge gate={variant.gate}`；标题区新增「门禁 JUnit」下载按钮（`GET /api/matrices/{id}/gate-junit`，文件名 `matrix-{id}.gate.xml`），下载状态改为按类型互斥（与原聚合 JUnit 一致，活跃禁用、失败可重试），原聚合 JUnit 保留。
- 修改 `frontend/src/pages/QualityPanel.jsx`：稳定性面板说明更新为“同一非空 Commit、相同实际环境下的结果变化进入稳定性评分，已隔离用例仍会真实执行”；说明条补充“新提交任务的门禁将已隔离失败记为警告放行，但取消、超时与资源故障仍会阻塞；人工解除隔离只影响之后提交的任务，不修改已归档的历史门禁”。未宣称告警通知或工单接入。
- 修改 `frontend/src/styles.css`：门禁卡按状态着色、五项计数网格（桌面 5 列、≤540px 降为 2 列保证 390px 不溢出）、`status-pending/warn/blocked` 徽章配色与既有 badge 体系一致；未改动既有门户样式。
- 新增 `frontend/src/gateUtils.test.js`：行为测试覆盖状态中文标签、gate 存在性判定（拒绝缺失/数组/未知状态/非字符串状态）、计数读取与畸形值收敛、各状态说明文案要点。
- 修改 `frontend/package.json`：test 脚本并入 `src/gateUtils.test.js`。

## 实际命令与退出结果

- `npm ci --prefix frontend`：未执行——`frontend/node_modules` 已存在且与本任务未新增依赖的 lockfile 一致，`npm test`/`npm run build` 均正常解析依赖，故不属于“需要时”。
- `npm test --prefix frontend`：退出 0，20/20 通过（utils 7 + matrixUtils 9 + gateUtils 4），duration ≈56ms。
- `npm run build --prefix frontend`：退出 0，vite v6.4.4，1594 modules transformed，dist 正常产出（index CSS 51.74 kB / JS 350.99 kB）。

## 契约落实说明

- 门禁卡全部基于接口返回的真实 `gate` 字段渲染，未新增任何 fake 数据；无 gate 的历史报告显示“此历史报告未提供门禁判定”，绝不推断为通过。
- 原始 FAILED、原 JUnit / 聚合 JUnit 报告语义与入口全部保留；门禁 JUnit 为独立按钮与独立路由，只读角色（VIEWER）同样可下载（沿用既有 `downloadFile` 登录凭据），未新增任何写入能力。
- 活跃（run 为 QUEUED/ASSIGNED/RUNNING/CLEANING，matrix 为 QUEUED/RUNNING）时两个报告按钮均禁用；下载失败走既有 toast 报错并复位忙碌态，可重试。
- 界面文案只使用 PENDING/PASSED/WARN/BLOCKED 的用户语义（等待判定/通过/警告放行/阻塞）与中文计数名称，不暴露 policy 名、字段名或 HTTP 状态。
- 加载 / 错误 / 空状态沿用既有 `Loading` / `ErrorNotice` / `Empty` 与轮询逻辑，既有门户页面未回归（既有 16 项单测全部保持通过）。

## 状态与未验收事项

- implement 状态：implemented（代码 + 单测 + 构建完成）。
- 尚未验证：本 worktree 未连接真实后端 gate 字段做端到端渲染验证（backend/CLI 由其他执行者在独立 worktree 按同一 contract v1 并行实现）；未启动或占用 8080 服务；未做真实浏览器视觉、交互与 390px 移动端检查——`npm run build` 成功不代替独立验收，待主控与独立 Codex 使用真实 HTTP 页面和 Chromium 验收。
- 规格疑问：无；按已确定 contract v1 实现，普通组件选择（计数网格布局、图标、说明条样式）自行完成。
