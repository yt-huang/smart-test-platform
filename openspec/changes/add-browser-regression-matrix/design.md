# 接口与职责 v1

输入代码基线：9ceb4282447e6df64b5a4b7fa005e069a326340a。沿用单中心进程的事务序列化、已审批用例快照和按资源的现有租约。新增数据库 document kind `matrix`，持久化批次信息及子任务引用，查询时从子任务派生状态，不复制证据。

## REST 契约

- `POST /api/matrices`：`{planId, name?, commitSha?, variants:[{label, capabilities:{browser, provider?, tags?, version?}}]}`。必须存在 Web 计划，全部用例仍已审批且属于 Web；至少 2、最多 8 个目标。label 去空白后 1–80 字符、大小写无关唯一；browser 必填，chromium/firefox/webkit 三选一。其余能力字段继承计划，无字段就按原计划默认值。不得改变 platform，传非 web 必须拒绝；敏感用例的 cloud 目标必须拒绝，本地资源仍须经过管理员授予 trusted 才会调度。正规化后能力相同的目标拒绝，标签顺序不产生新目标。名称最多 150、commitSha 最多 128 字符。
- 所有输入先验证，再在同一事务建立全部 run 和 matrix，最后统一 tick 分配。失败不得遗留批次、子任务、审计或向 Agent 发送任何分配。子任务共享同一批已审批快照、commitSha、计划超时与优先级；每个子任务添加 `matrixId`、`matrixLabel`，子任务名包含目标标签且不超过原 run 长度上限。创建响应与详情一致。
- `GET /api/matrices` 返回详情对象数组，按创建时间倒序；`GET /api/matrices/{id}` 返回详情。对象字段：`id,name,planId,commitSha,createdBy,createdAt,status,summary,variants`。variants 为 `{label,capabilities,runId,status,summary,deviceFingerprint?,message}`，保留请求顺序；summary 为 `{totalVariants,completedVariants,passedVariants,failedVariants,total,passed,failed,durationMs}`，failedVariants 统计 FAILED/TIMED_OUT，用例计数取真实子任务 summary，durationMs 为批次墙钟时间。
- 有任何非终态子任务时，全部 QUEUED 则批次 QUEUED，否则 RUNNING；全部终态后：任一 FAILED/TIMED_OUT 则 FAILED；否则任一 CANCELLED 则 CANCELLED；否则 PASSED。部分目标完成时不能宣称全批通过。资源不足时现有队列/超时照常生效。
- `POST /api/matrices/{id}/cancel` 取消仍活跃的子任务，完成任务不变；重复调用幂等，返回最新详情。按现有取消/清理流程处理占用资源。
- `GET /api/matrices/{id}/junit` 仅终态可下载，活跃时 HTTP 409。返回合法 `<testsuites>` 包含各目标独立 testsuite；名称包含目标标签，可区分同一用例的多个浏览器执行。保留基础设施失败，汇总 tests/failures 等计数与 XML 内容一致。
- 权限同 runs：登录用户可读与导出；ADMIN/TESTER/DEVELOPER 可创建和取消，VIEWER 403，匿名 401。各新敏感行为记录审计。

默认名称来自计划时截取到 150 字符；明确提供的名称超过上限则拒绝。子任务名必须保留目标标签并保证总长不超过 200。终态墙钟以最晚 finishedAt 固定，查询不能延长历史耗时。即使用例结果全部 PASSED，只要 run 因资源清理等基础设施原因 FAILED，JUnit 仍必须增加独立 infrastructure error。

质量分数仍汇总各用例执行次数；同 commit 的 verdict flip 比较必须同时具有相同执行环境签名（platform/browser/version/provider/brand/model），记录 lastEnvironment。不同浏览器的稳定差异不能当作 flaky，不贡献 flip/EWMA；相同环境的既有 EWMA 与人工解除语义保持有效。本次不扩展完整多环境 flaky 仓库。

## 门户契约

导航新增“矩阵回归”，路由 `#/matrices` / `#/matrices/{id}`。测试计划卡片增加“矩阵回归”入口，只允许写入角色发起 Web 计划。弹窗默认 Chromium + Firefox，可选 WebKit，允许至少两个浏览器；提交上述接口，不根据本地 UI 判断最终审批。页面清晰显示继承的来源/标签、排队说明、加载/空/失败/禁用状态；详情轮询直到终态，展示每个目标状态、真实通过/失败数、指纹和原 run 详情链接。支持取消与聚合 JUnit；复用现有组件与 tokens，适配移动端。不显示虚构可用浏览器或成功数据。

## CLI 契约

新增 `platform matrix --plan ID --browsers chromium,firefox[,webkit]`，浏览器去空白、严格验证、去重后要求 2–3 个；仅 matrix 允许 --browsers，不允许 --suite/--browser/--platform。复用 --junit/--timeout/--poll-interval/--name/--commit 和 PLATFORM_URL/PLATFORM_TOKEN。label 固定浏览器名；轮询 /matrices/{id}；显示批次报告 URL 与各目标结果；终态下载 /junit。退出码 0 仅全通过，1 失败/超时/取消，2 参数/API 错误；等待超时不假装取消远程批次。

## 并行文件归属

Codex 后端：backend/ 与 docs/matrix-backend-implementation.md；Codex CLI：cli/ 与 docs/matrix-cli-implementation.md；真实 Kimi CLI 门户：frontend/ 与 docs/matrix-kimi-implementation.md。主控：规格、compose、CI、scripts/verify-matrix.mjs、共享交付说明与部署；独立 Codex 验收只读实现代码，单独输出 docs/matrix-independent-acceptance.md。各实现者在隔离 worktree 提交，不推送、部署或修改其他范围。源码与状态以提交和实际退出结果确认。
