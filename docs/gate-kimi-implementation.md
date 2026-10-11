# 隔离门禁门户实施报告（Kimi）

## 输入与执行身份

- 任务包：`.data/task/gate-handoff.md`，阶段 implement，输入提交 `13395bc120426bee8f1bf50d9d1c86c98af560c6`，接口版本 contract v1（`openspec/changes/add-quarantine-ci-gate/design.md`，规格 `openspec/changes/add-quarantine-ci-gate/specs/quarantine-ci-gate/spec.md`）。
- 执行者：真实 Kimi Code CLI 0.29.0，provider `managed:kimi-code` / type kimi / host api.kimi.com，核验别名 `kimi-code/kimi-for-coding` → model `kimi-for-coding`。
- 工作目录：`C:/Users/admin/.codex/worktrees/platform-frontend/ai-test`，分支 `codex/gate-portal`。

## 变更范围（仅授权文件）

- 新增 `frontend/src/gateUtils.js`：`gateStatusLabels`（PENDING 等待判定 / PASSED 通过 / WARN 警告放行 / BLOCKED 阻塞）；`gatePolicies` 为三种允许策略（quarantine-at-submission-v1 / strict-legacy-v1 / aggregate-v1）；`isGatePresent` 仅接受契约四种状态的 gate 对象（`Object.hasOwn` + 字符串校验，toString/constructor/__proto__ 等原型属性不算有效状态），缺失或状态无法识别的数据一律视为“未提供门禁判定”，不推断通过、不渲染原始字段；`isGateDataValid` 严格校验 policy 三种允许值、total 为正整数、计数均为安全非负整数、终态 passed+blockingFailures+quarantinedFailures=total、PASSED 全部真实通过、WARN 仅有隔离失败且阻塞/基础设施为 0、BLOCKED 必有阻塞或基础设施错误、PENDING 计数和不超过 total，矛盾或畸形数据判为不可用而不是把 clamp 后的 0 计数渲染成通过；`gateCounts` 读取 total/passed/quarantinedFailures/blockingFailures/infrastructureFailures，畸形值收敛为非负整数；`gateStatusDescription` 用用户可理解的中文说明等待判定、全部真实通过、隔离失败警告放行（隔离集合冻结于提交、原始失败证据仍保留）与阻塞失败/基础设施错误（隔离不能抵消取消、超时与资源故障）的差异；`gateFreezeNote` 说明隔离集合在提交时冻结、门禁判定与导出快照在首次到达终态时冻结、人工解除不修改已归档报告。
- 新增 `frontend/src/gate.jsx`：共用 `GateSummary` 组件（无 gate 时显示“此历史报告未提供门禁判定，仅展示原始执行结果，不推断为通过”的说明条；gate 状态无法识别或状态与计数矛盾时显示“门禁数据不可用”说明条，与真正缺失历史区分且不推断为通过；仅契约一致的数据渲染状态徽章、说明文案与五项计数：计划用例/通过/隔离失败（警告放行）/阻塞失败/基础设施错误，附冻结说明脚注，按状态着色 pending/passed/warn/blocked）与矩阵目标行内 `GateBadge`（无 gate 显示 “—”，数据不可用显示“不可用”）。
- 修改 `frontend/src/pages/Runs.jsx`：RunDetail 在结果指标与执行上下文之间渲染 `<GateSummary gate={run.gate} />`；标题区新增「门禁 JUnit」下载按钮（`GET /api/runs/{id}/gate-junit`，文件名 `run-{id}.gate.xml`），活跃时禁用，忙碌互斥，失败经 toast 报错后可重试；原「JUnit 报告」「Allure 数据」按钮与语义不变。
- 修改 `frontend/src/pages/Matrices.jsx`：MatrixDetail 渲染矩阵级 `<GateSummary gate={matrix.gate} />`；执行目标表新增「门禁」列，每个 variant 显示 `GateBadge gate={variant.gate}`；标题区新增「门禁 JUnit」下载按钮（`GET /api/matrices/{id}/gate-junit`，文件名 `matrix-{id}.gate.xml`），下载状态改为按类型互斥（与原聚合 JUnit 一致，活跃禁用、失败可重试），原聚合 JUnit 保留。
- 修改 `frontend/src/pages/QualityPanel.jsx`：稳定性面板说明更新为“同一非空 Commit、相同实际环境下的结果变化进入稳定性评分，已隔离用例仍会真实执行”；说明条补充“新提交任务的门禁将已隔离失败记为警告放行，但取消、超时与资源故障仍会阻塞；人工解除隔离只影响之后提交的任务，不修改已归档的历史门禁”。未宣称告警通知或工单接入。
- 修改 `frontend/src/styles.css`：门禁卡按状态着色、五项计数网格（桌面 5 列、≤540px 降为 2 列保证 390px 不溢出）、`status-pending/warn/blocked` 徽章配色与既有 badge 体系一致、`gate-invalid` 说明条与 `gate-badge-invalid` 徽标（区分“数据不可用”与“缺失历史”）；未改动既有门户样式。
- 新增 `frontend/src/gateUtils.test.js`：行为测试覆盖状态中文标签、gate 存在性判定（拒绝缺失/数组/未知状态/非字符串状态及 toString/constructor/hasOwnProperty/__proto__ 等原型属性名）、契约一致性校验（四种状态三种 policy 的正例，以及 PASSED 非全通过/带基础设施错误、WARN 含阻塞或隔离数为 0、BLOCKED 无阻塞与基础设施错误、终态计数和≠total、PENDING 计数和超过 total、非整数/字符串/超安全整数计数、非法 policy 等矛盾成功负向）、计数读取与畸形值收敛、各状态说明文案要点、冻结脚注语义（隔离集合提交时冻结、判定首次终态冻结）。
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

## 复审修正（针对 12b860d 的审查）

主控审查 `12b860d` 后发现两项问题，本轮仅改 frontend 与本报告，矩阵与运行的真实状态渲染逻辑不变：

- 冻结文案不准确：`gateFreezeNote` 原文称“判定与隔离集合在提交时冻结”。按 contract v1，只有隔离集合在提交事务内冻结；门禁判定与导出的结果快照在首次到达终态时冻结。已改为“隔离集合在提交时冻结；门禁判定与导出快照在首次到达终态时冻结；之后人工解除隔离或编辑用例不会改变已归档的门禁报告”，`WARN` 说明中“隔离集合冻结于提交时刻”的表述本身准确，保持不变。
- 原型属性被当成有效状态：`isGatePresent` 直接用 `gateStatusLabels[status]` 取值，字符串 `'toString'`/`'constructor'`/`'__proto__'` 等会命中原型链返回真值而被误判为存在门禁。已改为 `Object.hasOwn` 且 `typeof status === 'string'` 双重校验；`gateStatusDescription` 的查表同样加固，`'toString'` 等输入返回空串。
- 畸形计数被 clamp 成 0 后照常渲染：原实现 `gateCounts` 把任何畸形值收敛为 0，`total=0` 的 PASSED 这类矛盾数据会被渲染成通过。新增 `isGateDataValid` 严格校验：policy 必须为 `quarantine-at-submission-v1`/`strict-legacy-v1`/`aggregate-v1` 三种允许值；total 为正整数、五项计数均为安全非负整数；终态 passed+blockingFailures+quarantinedFailures=total（基础设施错误另计）；PASSED 必须全部真实通过且基础设施错误为 0；WARN 只能有隔离失败且阻塞/基础设施为 0；BLOCKED 必须存在阻塞或基础设施错误；PENDING 为活跃态，计数和允许小于 total（矩阵可已有子任务终态并产生基础设施错误）但不得超过 total。任何矛盾或畸形数据一律显示“门禁数据不可用：报告中的门禁状态与计数不一致，仅展示原始执行结果，不推断为通过”，行内 `GateBadge` 显示“不可用”，与真正缺失历史的“此历史报告未提供门禁判定”/“—”明确区分，绝不推断成功。

复审后真实检查结果（取代上方第一轮的数字）：

- `npm test --prefix frontend`：退出 0，24/24 通过（utils 7 + matrixUtils 9 + gateUtils 8），duration ≈83ms。
- `npm run build --prefix frontend`：退出 0，vite v6.4.4，1594 modules transformed，dist 正常产出（index CSS 51.90 kB / JS 351.87 kB）。

## 二次复审修正（针对 013ef91 的独立 Codex 审查）

独立 Codex 复审 `013ef91` 发现 `isGateDataValid` 仍接受 `strict-legacy-v1` WARN（total1 / passed0 / blockingFailures0 / quarantinedFailures1 / infrastructureFailures0 / quarantinedCaseIds[]）——历史无快照任务按 contract v1 必须为空隔离集并按真实结果保守判定，legacy 出现隔离失败即矛盾，且 `quarantinedCaseIds` 完全未校验。本轮仅改 `frontend/src/gateUtils.js`、`frontend/src/gateUtils.test.js` 与本报告：

- 补齐隔离 ID 约束：`quarantinedCaseIds` 必须为数组，每项为非空字符串，彼此唯一，且数量不得超过 total（矩阵聚合按去重后 ID 集合公开）。
- 补齐 policy 约束：`strict-legacy-v1` 必须 ID 集为空且 quarantinedFailures 恒为 0（legacy WARN 因此不可能合法存在）；单运行策略 `quarantine-at-submission-v1` 的隔离失败只能来自提交时冻结的集合，quarantinedFailures 不得超过 ID 数；`aggregate-v1` 按子任务求和计数、ID 去重，不同目标可重复计入同一 ID，允许 quarantinedFailures 大于去重后 ID 数，其余计数一致规则（终态计数和、PASSED/WARN/BLOCKED 语义、PENDING 上限）保持不变。
- 新增行为测试：legacy WARN 载荷判不可用、legacy 带非空 ID 或隔离失败判不可用、缺失/重复/空白/非字符串/非数组/超 total 的 ID 集判不可用、单运行 quarantinedFailures 超过 ID 数判不可用且少于等于 ID 数时放行、aggregate-v1 两个目标同一 ID 计 2 次隔离失败（quarantinedFailures2 / uniqueID1）判可用、aggregate ID 重复或畸形仍判不可用；原有矛盾成功与矩阵拒绝负向测试全部保持通过，未回退。
- 数据不可用时门户仍显示“门禁数据不可用，仅展示原始执行结果，不推断为通过”，渲染层（`gate.jsx`）无改动。

二次复审后真实检查结果（取代上方第一轮与复审后的数字）：

- `npm test --prefix frontend`：退出 0，25/25 通过（utils 7 + matrixUtils 9 + gateUtils 9），duration ≈61ms。
- `npm run build --prefix frontend`：退出 0，vite v6.4.4，1594 modules transformed，dist 正常产出（index CSS 51.90 kB / JS 352.14 kB）。

## 状态与未验收事项

- implement 状态：implemented（代码 + 单测 + 构建完成）。
- 尚未验证：本 worktree 未连接真实后端 gate 字段做端到端渲染验证（backend/CLI 由其他执行者在独立 worktree 按同一 contract v1 并行实现）；未启动或占用 8080 服务；未做真实浏览器视觉、交互与 390px 移动端检查——`npm run build` 成功不代替独立验收，待主控与独立 Codex 使用真实 HTTP 页面和 Chromium 验收。
- 规格疑问：无；按已确定 contract v1 实现，普通组件选择（计数网格布局、图标、说明条样式）自行完成。
