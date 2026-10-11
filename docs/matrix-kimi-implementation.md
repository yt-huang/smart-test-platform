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
- 未验收：未连接真实后端做端到端提交/轮询/取消/JUnit 下载验证（backend 由其他执行者并行实现）；未做真实浏览器视觉与移动端截图验收——`npm run build` 成功不代替独立视觉验收，待主控本地与云端浏览器检查；复选框可访问名称与实际浏览器勾选操作未在本环境执行浏览器验证，待主控/独立 Codex 实际浏览器检查确认。
- 规格疑问：无；按已确定 design v1 实现。

## 主控审查修复（第二轮）

主控审查提交 `1c1f6c4` 后要求三项门户修复，本轮完成：

1. 默认批次名称：`defaultMatrixName` 截断计划名，保证初始值（含“ 矩阵回归”后缀）≤150 字符；输入超长仍由 `buildMatrixPayload` 明确拒绝；新增默认长名称与超长拒绝行为测试。
2. 目标指纹：`matrixFingerprintLines` 明确显示实际浏览器、真实版本（version，缺省回退 os）、来源与资源标识（名称/ID），缺失项显示“尚未获取”；详情页以多行定义列表展示，小屏降为单列保证可读。
3. 界面文案：移除 HTTP 409 与服务端/原子事务实现说明；活跃期 JUnit 提示改为“批次结束后可下载聚合报告”；提交说明改为实际排队调度与各目标原始报告；列表空状态按角色区分，只读成员不再显示“前往测试计划”入口，避免误导必须可创建。

第二轮实际命令与退出结果：`npm test --prefix frontend` 退出 0（16/16 通过）；`npm run build --prefix frontend` 退出 0（vite 6.4.4）。

## 独立验收修复（第三轮）

独立门户验收提出两项小修复，本轮完成：

1. 矩阵列表顶部按钮按角色区分：写入角色显示「从计划发起」，只读角色（VIEWER）显示「查看测试计划」，链接均指向 `#/plans`，不再误导只读成员必须可创建。
2. `MatrixLaunch` 目标浏览器分组由 `Field`（渲染外层 `<label>`）改为 `fieldset + legend`，清除 fieldset 默认边框并沿用现有小间距视觉；每个浏览器 checkbox 保持独立 `<label>`，可访问名称精确为 Chromium / Firefox / WebKit，消除非法嵌套 label 与名称污染。

第三轮实际命令与退出结果：`npm test --prefix frontend` 退出 0（16/16 通过）；`npm run build --prefix frontend` 退出 0（vite 6.4.4）。

## 独立验收修复（第四轮）

独立真实截图（`desktop-passed.png`）发现矩阵统计卡「用例通过 / 失败」中 strong 内的 `<span>` 被既有 `.report-metrics span` 标签选择器命中，变成小字号浅色块级，与「/」分隔符视觉不一致。本轮仅修改 `frontend/src/styles.css`：新增 `.matrix-metrics strong>span` 覆盖为 inline、继承 strong 的大字号与字重，并单独恢复 pass-text / fail-text 颜色；选择器限定在 `.matrix-metrics` 内，不影响执行记录（runs）报告的既有标签样式。

第四轮实际命令与退出结果：`npm test --prefix frontend` 退出 0（16/16 通过）；`npm run build --prefix frontend` 退出 0（vite 6.4.4）。修复后的视觉效果未在本环境截图复核，最终浏览器复核由独立 Codex 完成，未执行的截图验证不声称已做。

## 耗时

- 首轮：首次实际外部 CLI metadata 为 405 秒（以主控核验为准，此前报告中“约 35 分钟”为错误估算，作废）。
- 本轮（审查修复）：未知，不估算。
- 费用：未知（managed:kimi-code 配额未暴露计费数据）。
