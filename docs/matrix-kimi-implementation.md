# 矩阵回归门户实施报告（Kimi）

## 输入与执行身份

- 任务包：`.data/task/matrix-handoff.md`，阶段 implement，输入提交 `86724c5`，接口版本 design v1（`openspec/changes/add-browser-regression-matrix/design.md`）。
- 执行者：真实 Kimi Code CLI 0.29.0，provider `managed:kimi-code` / type kimi / host api.kimi.com，核验别名 `kimi-code/kimi-for-coding` → model `kimi-for-coding`。
- 工作目录：`C:/Users/admin/.codex/worktrees/platform-frontend/ai-test`，分支 `codex/matrix-portal`。

## 变更范围（仅授权文件）

- 新增 `frontend/src/matrixUtils.js`：`buildMatrixPayload` 按 design v1 精确构造 `POST /api/matrices` 请求体（`{planId, name?, commitSha?, variants:[{label, capabilities:{browser}}]}`，可选字段留空省略）；校验计划存在、目标 2–8 个、label 去空白 1–80 且大小写无关唯一、browser 仅 chromium/firefox/webkit、名称 ≤150、commitSha ≤128；`isMatrixActive`（批次活跃仅 QUEUED/RUNNING）与批次状态说明文案。
- 新增 `frontend/src/matrixUtils.test.js`：Node 行为测试覆盖上述边界（顺序保留、能力只发 browser、可选字段省略、数量/长度/重复/非法浏览器拒绝、活跃判定、文案）。
- 新增 `frontend/src/pages/Matrices.jsx`：列表页（轮询 7s，搜索、真实批次状态、完成目标数、用例通过/失败、耗时、进入详情）；详情页（轮询 4s 直到终态，批次状态面板、目标完成/通过/失败、用例 total/passed/failed/durationMs、每个目标的 label/状态/通过失败/实际资源指纹/`message`/原报告 `#/runs/{runId}` 链接、取消按钮、聚合 JUnit 下载且活跃时禁用并提示 409）；`MatrixLaunch` 弹窗（默认 Chromium+Firefox、可勾选 WebKit、少于两种禁用提交、名称与 commitSha 可填、显示继承的计划资源来源/标签/排队与执行超时、排队调度说明，提交成功跳转 `#/matrices/{id}`）。
- 修改 `frontend/src/App.jsx`：导航新增“矩阵回归”（Layers 图标），路由 `#/matrices` / `#/matrices/{id}`，面包屑补“详情”。
- 修改 `frontend/src/pages/Plans.jsx`：Web 计划卡片增加“矩阵回归”入口（仅写入角色可见可用，非 Web 计划不显示）。
- 修改 `frontend/src/styles.css`：矩阵指标网格、浏览器勾选、JUnit 提示、指纹行内显示等样式与 1250/800px 移动端适配。
- 修改 `frontend/package.json`：test 脚本并入 `src/matrixUtils.test.js`。

## 实际命令与退出结果

- `npm ci --prefix frontend`：退出 0（found 0 vulnerabilities）。
- `npm test --prefix frontend`：退出 0，14/14 通过（utils 7 + matrixUtils 7）。
- `npm run build --prefix frontend`：退出 0，vite v6.4.4，1592 modules，dist 正常产出。

## 契约落实说明

- POST 体精确按 design v1：仅发送 browser 能力，平台/来源/标签由服务端继承；不因本地 UI 预判审批结果，错误按服务端 message 展示（403 提示角色无权）。
- 列表与详情使用既有 `api/useResource/Badge/ErrorNotice/Empty/Loading/ConfirmButton/downloadFile`；失败可重试，加载/空/禁用/忙碌态齐全；只读角色（VIEWER）在计划卡片无入口、详情无取消按钮，并显示只读说明。
- 聚合 JUnit：活跃期按钮禁用 + 文案说明服务端 409；下载失败时 409 给出明确提示。
- 未显示任何虚构浏览器可用性或伪造数据；资源未获取时指纹显示“尚未获取”。

## 状态与未验收事项

- implement 状态：implemented（代码 + 单测 + 构建完成）。
- 未验收：未连接真实后端做端到端提交/轮询/取消/JUnit 下载验证（backend 由其他执行者并行实现）；未做真实浏览器视觉与移动端截图验收——`npm run build` 成功不代替独立视觉验收，待主控本地与云端浏览器检查。
- 规格疑问：无；按已确定 design v1 实现。
- 耗时：约 35 分钟；费用：未知（managed:kimi-code 配额未暴露计费数据）。
