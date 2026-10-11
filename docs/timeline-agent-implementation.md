# Evidence timeline — browser Agent implementation

状态：`implemented`。本报告记录实现者实际执行的检查；独立验收与最终集成由主控完成。

## 执行身份与范围

- 执行者：Codex 原生子 Agent `/root/timeline_agent`，通过 `collaboration.spawn_agent` 分派，实际实现/检查使用 `functions.exec`、`exec_command` 和 `apply_patch`。
- Provider：Codex/OpenAI 原生执行环境；当前工具未暴露具体模型别名，记录为未知，不使用模型自述替代配置元数据。本任务未调用 Kimi，前端 Kimi 分工由主控协调。
- 输入 SHA：`921b5d0fa5ae5b26d210d8c5e2ed87ebb1792575`；接口：`openspec/changes/add-evidence-timeline/design.md` Contract v1 及对应 delta spec。
- 绝对工作目录：`C:/Users/admin/.codex/worktrees/platform-runtime/ai-test`；分支：`codex/timeline-agent`，开始时工作树干净。
- 允许修改：`agent/` 与本报告。实际修改 browser executor、client、platform 与两份 Agent 测试；未修改 backend/frontend/CLI/规格或 Android adapter。
- 实际运行环境：Windows PowerShell，Node `v22.11.0`、npm `10.9.0`，已有依赖与 Playwright Chromium 配置直接复用。

## 已实现行为

浏览器 case 和实际开始执行的 step 在操作前后直接读取 `new Date().toISOString()`，提供完整 `timing`。case 终点在本用例截图、trace、context cleanup 与 video 路径收集之后。启动前失败的未执行用例继续没有 timing；没有从 duration 或上传时间回填。

截图的 `capture` 包住实际页面/locator screenshot 操作，只在操作成功后登记。trace 起点在 tracing.start 之前，终点在 tracing.stop 成功后。video 起点在 newPage 之前，终点在 context.close 成功 resolve 时读取；取消时提前关闭 context 也使用该实际完成时刻。context 关闭失败时不声明已完成录像 capture。

共享 `execution.log` 的采集区间从 assignment 开始到实际 writeFile 完成，无 caseId，并保持引用首个 result。上传沿 `evidenceFiles.capture` → `upload(file, capture)` → AgentClient → `uploadEvidence(..., capture)` → multipart 的 capture JSON 字符串传递。未传 capture 的旧调用仍不添加该表单字段。结果 evidence 使用中心返回值，失败采集/失败上传不产生公开证据引用。

原有失败消息、基础设施故障分类、取消清理、资源隔离、重复任务重放与成功上传后清理工件的条件保持。没有新增假媒体或远程成功状态。

## 实际检查

| 命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| `npm test --prefix agent` | 0 | 18/18 通过、0 skipped；原 15 项协议检查加 3 项时间/采集/上传检查 |
| `npm run test:browser --prefix agent` | 0 | 原 3/3 真实 Chromium 检查通过、0 skipped，增加时间与实际 multipart 断言 |
| `git diff --check` | 0 | 无 whitespace error；现有 Git CRLF 转换提示不影响检查 |

新增协议检查令 duration 时钟固定为零而使用实际 wall-clock 操作区间，确认 timing/capture 不来源于 duration；检查截图、trace/newPage/context-close 的前后界限与共享日志范围。失败截图与失败 trace fixture 检查不存在的文件不会进入上传，原始截图失败仍保留。此类 fixture 的文件明确是软件数据，未声称真实录像。

真实 Chromium 检查通过 outbound WebSocket、实际 DOM 操作与断言失败，验证 live callback/multipart/capture 回传一致、case/step 区间与用例归属、失败截图发生在失败步骤之后、实际日志 ISO 原时间及跨 case 区间；取消/超时清理与证据上传故障分类继续通过。没有停止主控 8080 或用户进程。

## 局限与后续验收

video 起点是 Agent 记录的新页面录制操作起点，**不是精确首帧时钟**。浏览器录制启动延迟、事件调度和媒体编码会影响近似回放定位，不能承诺逐帧同步。case/step/capture 使用本机 UTC wall-clock，不自行修正时钟偏差；中心按 Contract v1 校验窗口。

本分支只验证 Agent 层真实 Chromium、协议与上传链；Firefox、实际中心持久化/归属校验、门户 video metadata/seek、Codespaces 与重启后媒体哈希由主控/独立验收覆盖。Android 保留旧无 timestamps 协议；其现有软件 W3C fixture 不构成真机验证。
