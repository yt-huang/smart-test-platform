# add-evidence-timeline — Kimi 门户实现报告

## 身份与输入

- 执行者：真实 Kimi Code CLI 0.29.0，alias/provider `kimi-code/kimi-for-coding`（managed:kimi-code，host api.kimi.com，model kimi-for-coding）。
- 输入：`921b5d0fa5ae5b26d210d8c5e2ed87ebb1792575`，contract v1（`openspec/changes/add-evidence-timeline/design.md`）。
- 工作目录：`C:/Users/admin/.codex/worktrees/platform-frontend/ai-test`，分支 `codex/timeline-portal`。
- 写入范围：仅 `frontend/` 与本文档；未写 backend/agent/规格/其他报告。Codex 后端与 runtime 在独立 worktree 并行实现 timing/capture 采集与归档。

## 改动

- `frontend/src/timelineUtils.js`（新增）：纯函数。严格 ISO（带 offset）解析 `parseIso`；`normalizeTiming`/`caseWindow`/`stepTiming` 只接受成对有序真实时刻，缺失/逆序返回 `null`；`evidenceCapture` 兼容归档对象与 JSON 字符串、仅保留白名单 kind/caseId/startedAt/finishedAt；`clampSeek(event, captureStart, metadata.duration)` 计算录像秒数上界；`nearestScreenshot` 选包含焦点时刻或区间距离最近的截图；`logsInWindow` 对字符串按严格 ISO 前缀解析、仅保留 case 窗口内日志并计数无时间行；`defaultCaseId`（首个 FAILED → 首个有 timing → 首个）、`defaultFocusTime`（首个失败步骤 finishedAt，否则无定位）；`hasTimelineData` 判定是否存在任何真实时间元数据。无任何由 createdAt/duration 推断时刻的逻辑。
- `frontend/src/timeline.jsx`（新增）：`TimelinePanel`（用例选择器，case 失效时回落默认；`hasTimelineData` 为假时显示“未记录采集时间，仍可在原报告查看证据”，不产生虚构事件）+ `CaseTimeline`（按 caseId key 重挂载，切换 case 即回到该 case 默认失败点）。四轨：步骤（有 timing 为可键盘聚焦的 button，无 timing 明确标“未记录时刻”）、截图（事件按钮 + 焦点时刻最近截图预览，标注距焦点偏移或“包含焦点时刻”）、录像（真实 Blob URL，`metadata.duration` 为 seek 上界，seek 后暂停并显示“约 X 秒（近似位置）”，注明首帧延迟限制；多段时说明并指引证据 tab）、日志（窗口内行、焦点 ±5 秒高亮、无 ISO 时间行计数说明）。trace 显示为下载按钮并注明非录像。媒体加载/403/解码损坏经 `ErrorNotice` 可见可重试；`useObjectUrl` 在切换/unmount 时 abort 旧请求并 revoke Object URL，防止旧 case 媒体覆盖。
- `frontend/src/pages/Runs.jsx`：报告新增“时间轴”tab（原用例/日志/证据 tab、JUnit/门禁 JUnit/Allure 入口保持不变）；终态且存在 FAILED 且有真实时间数据时自动选中时间轴（用户手动点 tab 后不再强制）。
- `frontend/src/api.js`：`authenticatedBlob(url, signal)` 增加可选 AbortSignal，向后兼容。
- `frontend/src/styles.css`：追加 timeline 样式块；轨道 grid `minmax(250px,1fr)` + ≤540px 单列、`max-width:100%` 媒体、日志/文本 `overflow-wrap:anywhere`，390px 无页面横溢。
- `frontend/package.json`：test 脚本纳入 `timelineUtils.test.js`。
- `frontend/src/timelineUtils.test.js`（新增）：13 个用例覆盖严格 ISO、逆序/缺失拒绝、capture 白名单与 JSON 字符串、clampSeek 三界、最近截图选择、日志窗口过滤与未定位计数、默认 case/失败点选择、legacy 无时间判定、标签格式。

## 实际执行的检查

- `node --version` → v24.19.0（Node24 已在 PATH）。
- `npm test`（frontend）→ exit 0，37 pass / 0 fail（含新增 13 个 timelineUtils 用例；首次运行 1 个失败为测试夹具自身顺序错误，修正夹具后通过，非实现缺陷）。
- `npm run build`（frontend，vite 6.4.4）→ exit 0，1596 modules transformed，`dist` 产物正常。
- 未运行 `npm ci`（node_modules 已就绪，依赖无变更）。

## implemented

- 四轨关联报告（步骤/截图/视频/日志）按真实 timing/capture/日志 ISO 时间渲染，事件含真实时刻、相对用例起点偏移与结果。
- 默认定位首个失败步骤 finishedAt；点击步骤/截图事件重定位；截图显示焦点时刻最近的真实截图；视频按 `clamp((eventTime-capture.startedAt)/1000, 0, metadata.duration)` seek 并暂停，显示“约 X 秒”近似位置并注明首帧延迟限制。
- legacy 无时间：明确说明无法同步定位、原报告证据仍可查看；不生成占位媒体或虚构时间。
- 媒体加载/损坏/403 错误可见可重试；切换 case/unmount 中止旧请求并释放 Object URL；trace 保持原下载、不当作录像。
- VIEWER 只读可回放（仅 GET 证据接口，无新增写能力）；事件为原生 button 带可访问名称、视频原生 controls 可键盘操作；390px 无横向溢出（样式约束，见未验证项）。
- 原结果/日志/证据 tab、JUnit/门禁 JUnit、Allure 下载、矩阵导航未改动。

## 未验证项（如实记录）

- 未做真实浏览器端到端验收：根 8080 为旧版本服务（root 管理），按要求未启动/停止/占用/更改，亦未在其上宣称新 UI 已验收；与 Codex 新后端（timing/capture 字段）的联调、真实 Chromium/Firefox 点击失败点 seek 与截图/日志邻近断言、匿名证据 401、重启后回放归主控/独立验收阶段。
- 视觉与 390px 布局仅经样式与构建静态验证，未经真实视口渲染确认（未用构建代替视觉验收，如实标注为未验证）。
- 键盘可操作性经原生控件与 aria-label 静态保证，未经辅助技术实测。
- capture 字段的真实服务端格式（对象 vs JSON 字符串）以后端归档实现为准，门户两种形态均兼容，但与真实归档数据的匹配未联调验证。
