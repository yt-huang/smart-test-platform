# Contract v1 — evidence timeline

输入：已验证门禁应用228194f，归档源码902b03a。主控写本工件、真实验收/CI/交付；Codex后端写backend/src及docs/timeline-backend-implementation.md；Codex运行时写agent及docs/timeline-agent-implementation.md；真实Kimi写frontend及docs/timeline-kimi-implementation.md。独立验收只写自身报告和ignored证据。隔离worktree，不互改。

## Source time and upload

浏览器case result与每个实际step可增加 `timing:{startedAt,finishedAt}`，实际执行器在对应操作前后读取UTC ISO时间，不能从duration回填历史时间。case结束包含其采集和context cleanup。已有durationMs、status、steps、evidence与gate不改原义。

证据上传 multipart 可增加字段 `capture`，值为JSON字符串：

```json
{"kind":"screenshot","caseId":"case-ID","startedAt":"2026-10-12T00:00:01.000Z","finishedAt":"2026-10-12T00:00:01.030Z"}
```

kind为 screenshot/video/trace/log。screenshot/trace/video必须有审批快照中的caseId；log可省略caseId（共享运行日志）。screenshot区间在实际截图操作前后读取；video在newPage创建之前记录起点、context关闭之后记录终点；trace在实际start/stop前后，log从运行开始到写文件结束。调用链 `upload(file,capture)` → uploadEvidence(...,capture) → form.capture；不伪造未成功生成的采集。返回的公开evidence增加capture，createdAt仍是上传时间。Agent源码owner更新browser executor/client/platform及测试；Android可继续不提供timing/capture，不能声称Android时间轴已验证。

video起点是Agent记录的新页面录制启动时刻，不是精确首帧时钟；首帧启动延迟影响定位精度。回放按区间偏移近似定位，实际视频metadata.duration决定seek上界。产品用“约”说明近似位置，不承诺逐帧同步。

## Center validation

已有uploadEvidence三参数测试兼容，新增可选capture处理。解析/校验必须在磁盘复制和索引保存之前进行，capture JSON最多4000字符，只保留上述白名单字段。kind需与文件contentType匹配（image/video/zip/text）；caseId必须属于本任务审批快照。完整paired ISO时刻必须有效、有offset，finish>=start，位于assignedAt减5分钟到服务器当前时刻加5分钟之间；这是容许Agent时钟偏差的窗口，不生成或修正源时间。未提供capture按旧上传流程。

done timing为可选完整对象，未知字段忽略；有timing时必须满足上述真实窗口与顺序。step有timing时要求case有timing，step区间包含于case区间。确认结果引用capture带caseId的证据时必须与结果caseId相同；screenshot/video/trace区间应包含于该case.timing（有case timing时），log可以跨case。错误400/403，不能遗留部分结果或未验证capture文件/索引。晚到结果、门禁冻结及敏感证据鉴权保持已有语义。

公开run.results保留timing/step.timing，evidence.capture归档并持久化。原JUnit/门禁JUnit冻结格式不因时间轴更改，Allure可保留原导出语义。无需新fake数据API：门户使用既有run接口与鉴权证据URL。

## Portal

RunDetail报告新增“时间轴”tab（优先失败时可自动选择时间轴），复用UI tokens与现有authenticatedBlob/证据组件。case选择器默认首个FAILED，其次首个有timing的结果；四条轨道/区域分别显示步骤、截图、视频、日志，事件有真实时间/相对起点/结果，互相不遮挡。

点击失败步骤/截图/时间点：选择该case，按事件finishedAt（失败点）或对应时刻定位，自动显示该时刻最近的实际截图、附近日志，video若有capture与媒体metadata加载成功，seek到clamp((eventTime-video.capture.startedAt)/1000,0,duration)并暂停，显示约几秒的位置。默认首个失败步骤finishedAt，不用上传时间冒充采集时间。只有case timing、证据capture或日志ISO原时间实际存在才显示时间事件。

使用真实image/video Blob URL；加载/损坏/403错误可见可重试，切换case/unmount释放Object URL与未完成fetch，避免旧case媒体覆盖当前case。只读角色可回放，不增加写能力。视频控制可键盘操作，事件button可访问名称，390px无页面横溢。原用例/日志/证据tab与两份JUnit入口保留。

旧报告缺时间时明确说明“未记录采集时间，仍可在原报告查看证据”，不能以createdAt/duration推断同步位置；没有某条媒体说明真实缺失，无数据不创建占位fake图/视频。日志原字符串以严格ISO前缀解析，只取当前case区间内日志；不能用当前时间填空。trace继续原下载，不当作录像。

## Acceptance

主控与独立验收用真实Chromium/Firefox已审批HTTP页面，PASS及实际断言FAIL，检查case/step时间顺序、capture归属、视频非空可加载metadata、实际点击失败点seek与相近截图/log，VIEWER只读与匿名证据401、历史无时间fallback、切换/错误/手机布局。程序化时间/上传/Agent消息只用于边界fixtures，不声称真浏览器。

最终完整CI、Codespaces更新与真实执行、重启元数据/媒体SHA保留后归档。根旧门禁与矩阵的实际harness都必须继续通过。
