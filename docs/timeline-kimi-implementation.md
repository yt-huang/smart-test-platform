# add-evidence-timeline — Kimi 门户实现报告

## 身份与输入

- 执行者：真实 Kimi Code CLI 0.29.0，alias/provider `kimi-code/kimi-for-coding`（managed:kimi-code，host api.kimi.com，model kimi-for-coding）。
- 输入：`921b5d0fa5ae5b26d210d8c5e2ed87ebb1792575`，contract v1（`openspec/changes/add-evidence-timeline/design.md`）。
- 工作目录：`C:/Users/admin/.codex/worktrees/platform-frontend/ai-test`，分支 `codex/timeline-portal`。
- 写入范围：仅 `frontend/` 与本文档；未写 backend/agent/规格/其他报告。Codex 后端与 runtime 在独立 worktree 并行实现 timing/capture 采集与归档。
- 追加修复轮次（本 commit）：基线 `1bb354e`，仅改 `frontend/src/timeline.jsx`、`frontend/src/timelineUtils.js`、`frontend/src/timelineUtils.test.js` 与本文档；修复上述独立 Codex 真实 Portal 复核发现的 VideoTrack 重试恢复死锁，浏览器恢复复核交由独立 Agent 复测。

## 改动

- `frontend/src/timelineUtils.js`（新增）：纯函数。严格 ISO（带 offset）解析 `parseIso`——形状匹配后仍按日历（含闰年/每月天数，拒绝 2 月 30 日这类 Date.parse 会静默归一化的日期）、时刻（时≤23/分秒≤59）、offset（时≤23/分≤59）数值范围校验；`normalizeTiming`/`caseWindow`/`stepTiming` 只接受成对有序真实时刻，缺失/逆序返回 `null`；`evidenceCapture` 兼容归档对象与 JSON 字符串、仅保留白名单 kind/caseId/startedAt/finishedAt；`clampSeek(event, captureStart, metadata.duration)` 计算录像秒数上界；`nearestScreenshot` 选包含焦点时刻或区间距离最近的截图；`logsInWindow` 对字符串按严格 ISO 前缀解析，仅保留 case 窗口内日志并计数无时间行，无有效窗口时不生成任何 case 日志事件（共享 run 日志无法证明属于所选用例）；`logEntryTime` 对象日志只认 `timestamp`，`createdAt` 等上传属性不作为源时间；`screenshotDecodeState`/`SCREENSHOT_DECODE_ERROR_MESSAGE` 记录截图解码错误所属的 Object URL，换图/重试拿到新 URL 时旧错误自动失效；`videoDecodeState`/`VIDEO_DECODE_ERROR_MESSAGE` 为录像提供同样的按 Object URL 键控解码错误规则；`defaultCaseId`（首个 FAILED → 首个有 timing → 首个）、`defaultFocusTime`（首个失败步骤 finishedAt，否则无定位）；`hasTimelineData` 只认 case/step timing 或 evidence capture 这类可关联采集时间——仅有可解析 ISO 前缀的共享日志而无 case/step/capture 关联时间的 legacy 报告不算已有同步数据，不会被误选为时间轴。无任何由 createdAt/duration 推断时刻的逻辑。
- `frontend/src/timeline.jsx`（新增）：`TimelinePanel`（用例选择器，case 失效时回落默认；`hasTimelineData` 为假时显示“未记录采集时间，仍可在原报告查看证据”，不产生虚构事件）+ `CaseTimeline`（按 caseId key 重挂载，切换 case 即回到该 case 默认失败点）。四轨：步骤（有 timing 为可键盘聚焦的 button，无 timing 明确标“未记录时刻”）、截图（事件按钮 + 焦点时刻最近截图预览，标注距焦点偏移或“包含焦点时刻”；img `onError` 把解码失败（fetch 200 但 PNG 损坏）转为明确可重试提示，错误按 Object URL 记录、换图/重试自动复位）、录像（真实 Blob URL，`metadata.duration` 为 seek 上界，seek 后暂停并显示“约 X 秒（近似位置）”，注明首帧延迟限制；多段时说明并指引证据 tab；录像解码错误按 Object URL 记录，重试按钮同时清解码错误与旧 metadata/seek 结果后重新拉取，拿到有效 Blob 即重新挂载，换来源旧错误不污染新录像）、日志（窗口内行、焦点 ±5 秒高亮、无 ISO 时间行计数说明；用例无窗口时明确提示无法圈定日志窗口）。trace 显示为下载按钮并注明非录像。媒体加载/403/解码损坏经 `ErrorNotice` 可见可重试；`useObjectUrl` 在切换/unmount 时 abort 旧请求并 revoke Object URL，防止旧 case 媒体覆盖。
- `frontend/src/pages/Runs.jsx`：报告新增“时间轴”tab（原用例/日志/证据 tab、JUnit/门禁 JUnit/Allure 入口保持不变）；终态且存在 FAILED 且有真实时间数据时自动选中时间轴（用户手动点 tab 后不再强制）。
- `frontend/src/api.js`：`authenticatedBlob(url, signal)` 增加可选 AbortSignal，向后兼容。
- `frontend/src/styles.css`：追加 timeline 样式块；轨道 grid `minmax(250px,1fr)` + ≤540px 单列、`max-width:100%` 媒体、日志/文本 `overflow-wrap:anywhere`，390px 无页面横溢。
- `frontend/package.json`：test 脚本纳入 `timelineUtils.test.js`。
- `frontend/src/timelineUtils.test.js`（新增）：19 个用例覆盖严格 ISO（含 2 月 30 日/非闰年 2 月 29 日/越界月日时分秒/越界 offset 等日历归一化负例与闰年、+0800 正例）、逆序/缺失拒绝、capture 白名单与 JSON 字符串、clampSeek 三界、最近截图选择、日志窗口过滤与未定位计数、无窗口不生成日志事件、`logEntryTime` 拒绝日历无效前缀与 createdAt 上传属性、`hasTimelineData` 拒绝仅 ISO 日志+createdAt 的 legacy 历史、截图/录像解码错误随 Object URL 复位、默认 case/失败点选择、标签格式。

## 实际执行的检查

- `node --version` → v24.19.0（Node24 已在 PATH）。
- `npm test`（frontend）→ exit 0，43 pass / 0 fail（含 `timelineUtils.test.js` 19 个用例；首版 13 个用例中 1 个失败为测试夹具自身顺序错误，修正夹具后通过，非实现缺陷）。
- `npm run build`（frontend，vite 6.4.4）→ exit 0，1596 modules transformed，`dist` 产物正常。
- 未运行 `npm ci`（node_modules 已就绪，依赖无变更）。
- 独立 Codex 源码 guard 复现（`D:/code/ai-test/.data/timeline-independent/frontend-boundaries.mjs` 只读参考，按其断言内联复现、未写其文件）→ 3/3 PASS：2 月 30 日日历无效日志不生成事件（`logEntryTime` 返回 `null`）；无 case 窗口时共享日志不生成事件（`lines.length` 为 0）；legacy 仅 duration/createdAt 不产生源时间（`hasTimelineData` 为 `false`）。

## implemented

- 四轨关联报告（步骤/截图/视频/日志）按真实 timing/capture/日志 ISO 时间渲染，事件含真实时刻、相对用例起点偏移与结果。
- 默认定位首个失败步骤 finishedAt；点击步骤/截图事件重定位；截图显示焦点时刻最近的真实截图；视频按 `clamp((eventTime-capture.startedAt)/1000, 0, metadata.duration)` seek 并暂停，显示“约 X 秒”近似位置并注明首帧延迟限制。
- legacy 无时间：明确说明无法同步定位、原报告证据仍可查看；不生成占位媒体或虚构时间；仅含可解析 ISO 共享日志但无 case/step/capture 关联时间的历史报告不会误选时间轴（`hasTimelineData` 为假，自动选中逻辑同样不触发）。
- ISO 严格解析：2 月 30 日/非闰年 2 月 29 日/越界月日时分秒/越界 offset 一律无效（Date.parse 的静默归一化被拦截），无时区后缀或非 T 分隔同样无效。
- 日志事件只来自所选用例真实窗口内的行；用例无有效窗口时不生成 case 日志事件；`createdAt` 等上传属性不作为任何事件源时间。
- 截图 fetch 200 但 PNG 损坏时给出明确可重试提示（`ErrorNotice` 重试按钮），错误按 Object URL 记录、换图/重试自动复位；录像 fetch 200 但 WebM 损坏同样给出明确可重试提示，解码错误按 Object URL 记录，重试同时清解码错误与旧 metadata/seek 结果，新 Blob 有效即重新挂载并重新定位，换来源旧错误不污染新录像；真实失败（重试后仍损坏/再次 403）仍照常报错，错误未被隐藏；媒体加载/403 错误同样可见可重试；切换 case/unmount 中止旧请求并释放 Object URL；trace 保持原下载、不当作录像。
- VIEWER 只读可回放（仅 GET 证据接口，无新增写能力）；事件为原生 button 带可访问名称、视频原生 controls 可键盘操作；390px 无横向溢出（样式约束，见未验证项）。
- 原结果/日志/证据 tab、JUnit/门禁 JUnit、Allure 下载、矩阵导航未改动。

## 边界修复来源

独立 Codex 源码 guard（`D:/code/ai-test/.data/timeline-independent/frontend-boundaries.mjs`，只读参考）实际发现的四个问题及本修复：

1. `logEntryTime("2026-02-30T00:00:00.000Z ...")` 曾返回有效 time（JS `Date.parse` 把不存在日期归一化）→ `parseIso` 改为形状匹配后按日历/时刻/offset 数值范围严格校验。
2. `logsInWindow([其他 case ISO 日志], null)` 曾仍返回该行 → 无有效 case 窗口时不生成任何 case 日志事件。
3. `hasTimelineData` 曾仅凭 run.logs 有可解析 ISO 即视为可关联时间 → 改为必须有 case/step timing 或 evidence capture，createdAt 等上传属性从不作为源时间（`logEntryTime` 对象分支同步移除 createdAt 回退）。
4. `ScreenshotTrack` 的 img 无 `onError`，fetch 200 但损坏 PNG 只显示 broken image → 解码失败转为明确可重试提示，错误按 Object URL 记录，换图/重试正确复位。

独立 Codex 真实 Portal 复核（root 3379387，146 项检查 145 通过）的唯一实际发现及本修复：

5. `VideoTrack` 解码错误曾是裸字符串：fetch 200 但 WebM 损坏触发 video `error` 后 video 卸载，重试取回真实有效 Blob 后旧 `decodeError` 仍滞留，`!decodeError` 条件使 video 永不重新挂载、`onLoadedMetadata` 永不清错（恢复死锁；真实记录 run-e68a9dea-5b5b-4032-9e30-48c4d966c29e，录像证据 c135d798-8ff0-4d09-bc3c-a4ab3fc96b5c，root 证据 `.data/timeline-independent/ui-results.json` 与 `synthetic-video-decode-before-retry.png`/`after-retry.png` 只读参考）→ 解码错误改为按 Object URL 记录（`{url, message}`）并由纯函数 `videoDecodeState` 判定，新 URL 生效即旧错误自动失效；`ErrorNotice` 的 `onRetry` 换为 `handleRetry`，点击即清解码错误、旧 `meta`、`seekHint` 再触发新 fetch，新 Blob 有效则重新挂载并重新定位；`useObjectUrl` 的 403 重试/Abort/Object URL 释放逻辑未改动。

## 未验证项（如实记录）

- 未做真实浏览器端到端验收：根 8080 为旧版本服务（root 管理），按要求未启动/停止/占用/更改，亦未在其上宣称新 UI 已验收；与 Codex 新后端（timing/capture 字段）的联调、真实 Chromium/Firefox 点击失败点 seek 与截图/日志邻近断言、匿名证据 401、重启后回放归主控/独立验收阶段。
- 视觉与 390px 布局仅经样式与构建静态验证，未经真实视口渲染确认（未用构建代替视觉验收，如实标注为未验证）。
- 键盘可操作性经原生控件与 aria-label 静态保证，未经辅助技术实测。
- capture 字段的真实服务端格式（对象 vs JSON 字符串）以后端归档实现为准，门户两种形态均兼容，但与真实归档数据的匹配未联调验证。
- 截图 img 解码失败的 onError 与换图/重试复位规则经纯函数单测（`screenshotDecodeState`）覆盖；真实浏览器中损坏 PNG 触发 img error 事件、重试重新拉取新 Blob 的端到端行为未验证。
- 录像解码错误的按 URL 键控与重试复位经纯函数单测（`videoDecodeState`）覆盖；组件层 `handleRetry` 清状态、新 Blob 重新挂载、onLoadedMetadata 重新定位的浏览器端到端恢复行为未经本实现实测，留待独立 Agent 按真实记录复核，本实现不宣称已浏览器验证。
