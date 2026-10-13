# 证据时间轴独立验收

状态：本地范围 verified。最终修复版已完成独立真实门户验收，录像解码后重试恢复问题已关闭；本地 API、真实回放、权限和重启保留的历史验收记录保留。CI/Codespaces 不计入本报告独立验证范围。

## 身份与输入

- 初轮独立验收者：Codex 原生子 Agent `/root/timeline_acceptance`；可观测具体模型元数据未提供。
- 初轮输入提交：`921b5d0fa5ae5b26d210d8c5e2ed87ebb1792575`；绝对工作目录：`D:/code/ai-test`。
- 最终修复独立验收者：新上下文 Codex 原生子 Agent `/root/timeline_final_acceptance`，非实现作者；可观测具体模型元数据未提供。
- 最终输入提交：`10714614cbb66251da580333f690b0921e804a09`，应用修复提交 `9ef151173f27980820a391cf070c9b5f88a1ecef`（真实 Kimi 原提交 `7c7d38c`）。主控完成前端静态资源重包和本地 8080 启动后才运行本轮 UI；本验收者未启动、停止或重启服务。
- 依据：`AGENTS.md`、`.agents/skills/saas-multi-agent/SKILL.md`、`references/runtime.md`、`openspec/changes/archive/2026-10-13-add-evidence-timeline/design.md` Contract v1 与 delta spec。
- 允许写入：本报告及忽略提交的 `.data/timeline-independent/`；不修改实现、规格或其他报告，不 push，不管理用户/主控 8080 或 Agent 进程。
- 已读规则、规格、既有验收报告与公开 API/Agent 协议；只读命令退出 0。原应用 `228194f` 未被当作时间轴功能已就绪。

## 独立验收范围

真实 Chromium/Firefox 运行的 case、step 与截图/录像/trace/log 时间来源、顺序、归属和非空媒体；上传 MIME 与 paired offset ISO、窗口、逆序、审批快照归属的拒绝及无文件/上传审计副作用；done 全量验证后写入、step 包含与跨 case 引用拒绝；旧协议保留且不能由 duration/createdAt 产生时间轴。

门户实际点击首个失败步骤，测量视频 `currentTime`、`paused`、真实 `metadata.duration` 与采集起点偏移的 clamp，核对最近 PNG 与 ISO 日志；检查 VIEWER 回放/写入 403、匿名证据 401、媒体加载/错误/重试、切换 case 的旧请求和 Blob 释放、桌面与 390px 视口、未捕获 JavaScript 错误。trace 只作原附件下载。

程序化上传、WebSocket 完成和替换响应只能称为 contract fixtures；实际浏览器运行及 live portal 操作单独记录。实现者组件测试不计为本独立验收。CI/Codespaces 由主控另验。

## 规格风险与验收方法

1. case 完成包含采集与 context cleanup，才能容纳 video/trace 的终点；视频起点是 Agent 页面录制启动近似时刻，验收偏移时以浏览器 metadata 上界为准，不承诺逐帧。
2. 日志只有原字符串的严格 ISO 前缀可成为时间事件，且只取选中 case 区间；无时间的历史报告需要明确 fallback。
3. WebSocket 的 403 拒绝会关闭连接并清理活动租约。原子性检查区分连接清理状态变化与部分 results/summary/logs 写入；上传拒绝另核对该任务上传审计与磁盘中独立标记字节。
4. 真实执行证明须保留运行 ID、资源版本、元数据和原始媒体 SHA256；programmatic fixtures 与真实运行分开，重启由主控执行后独立重新登录比较。

## 当前限制

本轮实际门户应用修复版 `9ef1511` 在主控 `1071461` 的本地 8080 打包服务中运行。CI/Codespaces、外部访问和云端 PostgreSQL 重启由主控另验，不计入本报告独立范围。手机检查为 390×844 浏览器视口，不是真机。真实归档来源为 10 月 12 日浏览器运行，最终回放验收执行于 10 月 13 日；未把旧采集声称为本轮新采集。费用未知。

## 已实际执行

- `node --check .data/timeline-independent/api.mjs`、`provenance.mjs`、`ui.mjs`：退出 0。
- `TIMELINE_RUNTIME_READY=true node .data/timeline-independent/api.mjs`：退出 0，122/122 独立检查通过、0 发现，约 3.15 秒。真实 HTTP/WebSocket，但上传字节和完成结果明确是 synthetic fixtures；没有实际浏览器采集。19 类 capture 拒绝同时核对标记文件不存在与该任务 UPLOAD_EVIDENCE 审计数量不增加；11 类无效 done 同时核对 results/summary/logs 未部分更新。跨 case 403 的连接清理与旧协议兼容另验。自有 key 已撤销，WS 已关闭，cases/plan 已删除。
- `TIMELINE_REAL_RUN_IDS=[三条实际运行] TIMELINE_REAL_MATRIX_IDS=[实际矩阵] node .data/timeline-independent/provenance.mjs baseline`：退出 0，297/297 独立检查通过、0 发现，约 0.40 秒。实际重新登录、读取三条主控真实浏览器记录和矩阵，下载 27 份真实证据；已核对 UTC offset、顺序、case/step/capture 包含、原始 PASS/断言 FAIL、真实 Chromium/Firefox 版本、非空/大小、匿名 401、gate 和两份 JUnit 可读。
- 独立重新下载的 27 份证据 bytes/capture/SHA256、三条运行原始 JUnit 和 gate JUnit SHA256 与主控 `.data/timeline-local-result.json` 的实际记录逐项比较：退出 0，30/30 一致。记录于 `.data/timeline-independent/harness-comparison.json`。
- `TIMELINE_UTILS_PATH=C:/Users/admin/.codex/worktrees/platform-frontend/ai-test/frontend/src/timelineUtils.js node .data/timeline-independent/frontend-boundaries.mjs`：预审首次退出 1，3 项中 1 通过、2 失败。不存在的 `2026-02-30` 被 Date.parse 归一为事件，以及无 case window 时显示共享 ISO 日志；已交主控转原 Kimi 作者。损坏 PNG 无 onError 为同期静态风险。`1bb354e` 修复后独立复测通过；追加 log 对象 createdAt 不能作源时间、旧报告只有共享 ISO 日志不能生成 case 时间线，共 5/5。主目录最终该版独立执行退出 0。
- 主控重启本地中心及 Agent 后，运行相同真实 IDs 的 `node .data/timeline-independent/provenance.mjs check`：退出 0，300/300、0 发现。三条运行的 results/timing/logs/summary/gate 与两份 JUnit SHA、27 份证据 capture/大小/SHA、矩阵字段与两份 XML，均与本验收者此前 baseline 完全相同。运行时进程操作由主控执行，本验收者只重新登录与比较。
- `node .data/timeline-independent/legacy-retention.mjs`：最终退出 0，18/18、0 发现，读取旧 gate 基线中 6 个 PASSED/WARN/BLOCKED 运行/矩阵，旧 gate JSON SHA 与冻结 gate JUnit SHA 不变，原 JUnit 仍为可读 XML。包括旧真实矩阵 `matrix-3bfc14e7-db0f-4210-8295-8d09281cd5a6`、`matrix-5bdf7505-2b29-4f89-89d7-7c2222af9eee`。这是历史兼容只读核对，不声称重跑旧完整 harness。初次因验收脚本误读旧基线字段含义退出 1；阅读原保存脚本后纠正，未归为产品问题。
- `TIMELINE_PORTAL_READY=true TIMELINE_REAL_RUN_IDS=[三条实际运行] node .data/timeline-independent/ui.mjs`：有效复现轮退出 1，146 项中 145 通过、1 产品发现，11 次真实回放位置检查，10 张截图，0 未捕获 JavaScript 错误，约 6.02 秒。之前两轮验收脚本自身遇到 CSP 禁止 fetch Blob URL、同 hash 导航没有新媒体请求、下载 Blob 被误纳入 case 媒体释放和 React 状态尚未落 DOM 等问题；均修正仪器方式，未将这些归为产品缺陷。原有效结果保存 `ui-results.json`，较早轮记录为 `ui-first-complete-results.json`。

上述 API 运行时后端/Agent 已集成到主控 `90cd2a7`（后端 `c4e2d75`/原作者 `8ed2196`，Agent `8b82320`/原作者 `6960f5f`）；未将尚未部署的门户源码构建当作 UI 通过。

## 真实运行标识

- 直接运行：`run-e68a9dea-5b5b-4032-9e30-48c4d966c29e`。
- 矩阵：`matrix-3e89d9ad-f69e-4f52-9619-2dec8a40df78`；子运行 `run-073bd43e-ebe4-433c-bacf-2077a28918db`、`run-23f3b142-160f-483f-8166-65a230f132e9`。
- 真实资源版本：Chromium `156.0.8078.4`、Firefox `157.0`。三条运行均保留实际通过用例和实际 expectText 断言失败用例；原始运行与矩阵仍 FAILED。
- 主控真实已审批 HTTP harness 的临时 8094 页面已经 finally 关闭，不称为长期在线演示。本验收者独立重读它们的归档记录与媒体，没有冒称由自己创建这些真实运行。

## 初轮门户实测与历史发现

实际点击失败步骤后，三份真实 Chromium/Firefox 录像分别暂停于 `3.141`、`3.131`、`3.260` 秒，等于失败步骤 finishedAt 减录制 capture.startedAt，metadata.duration 分别 `5.04`、`5.04`、`4.24` 秒。较早通过步骤、截图采集时点、恢复首个失败点、通过 case 和切换 case 后均按真实时刻定位，显示“约”。真实视频 controls 可键盘空格播放/暂停。

显示 PNG 的实际 Blob 字节 SHA 与最近归档 PNG 一致；日志只显示所选 case 区间的原 ISO 行，近邻高亮与原日志一致。四条区域分离，桌面 1440×1000 与 390×844 无页面横向溢出；截图已实际打开观察。原三个报告 tab、原始 JUnit、gate JUnit 和 trace 下载保留且字节 SHA 与 API 一致。

切换 case 释放旧媒体 Object URL；显式延迟实际证据响应的竞态 fixture 证明旧请求中止，完成后的媒体仍属于新 case。VIEWER 实际回放成功、无取消控制、创建/取消 403，匿名证据请求 401。明确 synthetic 的损坏 PNG/video 上传显示损坏错误与重试，两个重试均实际重新请求媒体；显式 HTTP403 媒体响应 fixture 显示错误并可在解除拦截后恢复截图。fixture 的媒体从不计入真实浏览器采集。

历史发现 `[P2] VideoTrack 解码错误后的重试不恢复`（最终版独立复测已关闭）：初轮只拦截真实 `evidence-c135d798-8ff0-4d09-bc3c-a4ab3fc96b5c` 首次 HTTP200，返回明确 synthetic 损坏 WebM 字节；实际页面显示损坏错误。解除该单响应拦截并点击“重试”，平台重新返回有效录像 Blob，但 `<video>` 数量仍 0，错误状态持续。`frontend/src/timeline.jsx` 的 onRetry 当时只更新 fetch reloadKey；decodeError 未清且阻止 `<video>` 渲染，所以新录像不能触发 loadedmetadata 清错。该发现交主控转原 Kimi 作者修复，验收者未代改实现。

可复现证据：`.data/timeline-independent/synthetic-video-decode-before-retry.png`、`synthetic-video-decode-after-retry.png` 及 `ui-results.json`。其余截图为 `real-failure-desktop.png`、`real-failure-mobile.png`、`real-firefox-failure-*.png`、`viewer-real-failure-mobile.png`、`legacy-fallback.png`、`synthetic-damaged-media.png`、`synthetic-media-403.png`。

## 最终修复独立验收

本轮先只读核对规格、历史脚本与结果、`9ef1511` 实际 diff，再等主控确认最终 8080 已就绪。修复将录像解码错误绑定到其 Object URL，重试同时清理旧 metadata 和 seek 提示；独立验收针对其实际浏览器行为执行，没有修改生产代码或放宽规格。原 `ui.mjs`、`ui-results.json` 和历史截图均保留；本轮使用 `ui-final.mjs`、`ui-final-results.json` 与 `final-*.png`。

- `node --check .data/timeline-independent/ui-final.mjs`：退出 0。
- `node --test frontend/src/utils.test.js frontend/src/matrixUtils.test.js frontend/src/gateUtils.test.js frontend/src/timelineUtils.test.js`：本轮独立退出 0，43/43 源函数测试通过，包括新增录像解码状态按 URL 失效的场景；实际 TAP 保存为 `frontend-final-tests.txt`。这组函数测试与实际媒体恢复分别记录。
- `TIMELINE_PORTAL_READY=true TIMELINE_REAL_RUN_IDS=[.data/timeline-local-result.json 的三个实际 runId] node .data/timeline-independent/ui-final.mjs`：最终退出 0，178/178、0 发现、13 次真实视频位置检查、10 张截图、0 未捕获 JavaScript 错误，约 5.75 秒。旧有效 UI 146 项的场景名称全部包含在本轮检查内。本轮增加实际原生 media error/loadedmetadata/seeked 事件、重试响应与显示 Blob 的字节哈希、旧 Blob 释放等检查。
- 首轮新增网络测量退出 1，178 项中 176 通过：Playwright `response.body()` 返回 0 字节，而同次页面实际显示 Blob 的 38912 字节与归档 SHA 已一致，metadata、seek 和 paused 均恢复。保留 `ui-final-first-results.json`；改为筛选 GET 并记录应用真实 fetch 的克隆响应后，以上相同字节检查全部通过。没有修改实现，也未把该测量问题归为产品缺陷。

本轮明确 synthetic 的一次损坏 WebM 响应共 71 字节、只拦截 1 次 HTTP200，触发真实原生 `MediaError.code=4`，错误与重试控件可见，损坏视频卸载且没有旧 duration/seek 提示。解除该响应拦截后实际点击“重试”，应用 GET200 克隆响应及显示视频 Blob 都为 38912 字节，SHA256 均为 `0517187c22a81a1705b44e59a1334578ed003062013379665832ad664db81700`，与本轮独立重新下载的实际归档一致。新 Blob 触发 `loadedmetadata.duration=5.04`、`seeked.currentTime=3.141`，`paused=true`、`readyState=4`、`controls=true`、`error=null`；实际位置等于失败步骤 finishedAt 减录像 capture.startedAt，错误控件消失，旧损坏 Blob URL 已释放。此证据关闭原 `[P2]`。

完整复跑也核对首个 FAILED 默认选择、实际失败/通过步骤与截图点击、切换 case 与延迟响应取消、原三个报告 tab、两份 JUnit 和 trace 字节、原生键盘播放/暂停、真实 Chromium/Firefox 归档、历史无时间 fallback、空媒体/损坏 PNG 和录像/HTTP403 fixtures、VIEWER 回放与写入 403。三份实际失败录像仍分别定位 `3.141`、`3.131`、`3.260` 秒，duration 为 `5.04`、`5.04`、`4.24` 秒；近邻截图 SHA 和 case 窗口内原 ISO 日志匹配。

桌面 1440×1000 与 390×844 的实际页面宽度检查通过，四轨互不覆盖；本验收者实际打开 `final-real-failure-desktop.png`、原分辨率 `final-real-failure-mobile.png` 及 `final-synthetic-video-decode-after-retry.png` 核对截图。所有 10 张本轮图片与原生事件/媒体状态保存在 `ui-final-results.json`，执行、退出、输入提交与文件 SHA 记录在 `final-execution.json`。

原 122 API fixtures、297 来源、300 重启、18 旧门禁兼容结果是前轮实际记录，本轮只读复核其存在与计数，没有因门户修复重跑未变化的 API 全套。最终 verified 仅覆盖上述本地独立范围；CI、Codespaces 发布及云端保留由主控分别验证。交接完成后由主控提交本报告，本验收者不提交、不 push。
