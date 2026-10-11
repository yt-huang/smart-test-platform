# 浏览器矩阵独立验收

状态：最终本地矩阵功能验收通过。下列独立发现已由原实现者修复，并在更新后的实际服务中复核；本报告范围内无未关闭问题。

独立验收执行者：Codex 子 Agent `/root/matrix_acceptance`，独立于后端、CLI 与真实 Kimi 门户实现者。工具为本机 Node、Java 21/Maven、项目安装的 Playwright Chromium；运行地址 `http://127.0.0.1:8080`。凭据仅在执行进程内从忽略提交的 `.env` 读取并用于本地登录，未进入输出或证据文件。本报告不把实现者自评或 OpenSpec 校验当作验收。

## 输入与实际执行

- 初始规格提交 `86724c5f2a7ade2c035216e626f46a6cb33a63d3`；完整 delta spec 已归档到 `openspec/changes/archive/2026-10-11-add-browser-regression-matrix/specs/browser-regression-matrix/spec.md`。
- 首次运行后端基于集成候选 `2ef0dc0`，门户打包内容为 `a80612c`；独立 CLI 检查使用 `38bfbc7` 中的原提交 `24582ba294d406557254ba298537fc067534c85f`。
- 最终实际应用输入为 `ebe904dd4c60431e716a3b25bde4c98627b9cb3a`，包含原后端修复 `2ae576cd43acf39e95bd794d70238c8e15de26f9` 与真实 Kimi 门户修复 `7b431e1`、`3216bf0`。独立最终请求与截图来自更新后的本地服务，不以源码构建成功代替运行确认。
- `node .data/matrix-independent/api.mjs`：退出 0，43 项独立真实 API 检查通过，另发现 1 项能力正规化遗漏。
- `JAVA_HOME=tools/java/jdk-21.0.12.1+1`，Maven `-Dtest=MatrixIntegrationTest test`：独立执行退出 0，20 项测试，0 失败、0 错误、0 跳过。涵盖提交回滚无分配、提交后传输失败的新事务恢复、清理失败 JUnit 基础设施错误、跨环境质量历史、权限与取消；这些使用隔离 H2 和程序化 Agent 测试消息，不称为真实浏览器执行。
- `node .data/matrix-independent/cli.mjs`：退出 0，13 项独立检查。畸形 API 数据使用明确的 synthetic fixture；真实平台等待超时另行实测。
- `node .data/matrix-independent/ui.mjs`：退出 0，28 项门户/直接报告检查；实际访问并下载 10 份全通过批次的真实证据，校验非空与 SHA-256；1440×1000 与 390×844 视口实测。
- `node .data/matrix-independent/persistence.mjs baseline` / `check`：均退出 0；主控重启中心和 Agent 并更新最终应用后，4 个终态批次、8 个子任务结果元数据、聚合 JUnit 哈希与 20 份实际证据字节 SHA-256 逐项一致。
- `node .data/matrix-independent/final.mjs`：退出 0，最终版本 45 项针对修复的独立检查；含 16 个空/空白可选约束及继承值组合、精确可访问名称、角色文案、统计 CSS 与移动布局。
- `node .data/matrix-independent/partial.mjs`：退出 0，最终版本 14 项额外真实行为检查；独立发起实际 Chromium 执行，检查部分完成、审批快照、取消与跨浏览器质量指标。

## 行为证据

独立 API 检查覆盖后续目标无效、标签大小写重复、标签顺序及数值版本正规化后的重复能力、平台改写、缺失浏览器、非法版本、目标数量上下界、超长名称与 commit，以及用例编辑后的审批失效。拒绝请求未留下相应批次、子任务或创建审计。数据库提交失败时不发送分配由独立执行的事务测试确认。

匿名的列表、详情、导出、创建和取消均返回 401。真实 VIEWER 可读，创建/取消返回 403，批次仍为 QUEUED，终态可导出。实际不可用版本 `0` 保持排队；活跃 JUnit 返回 409。取消队列批次、重复取消的详情与审计保持幂等；终态墙钟固定。创建后编辑/删除用例和删除计划不改变已有终态详情与 JUnit。

独立复现并验收 CLI 的原虚假成功问题：`36b1dc3` 对 `status=PASSED` 但 `summary.failed>0` 的 synthetic 响应返回 0。原实现者后续提交 `24582ba` 已修复，独立复核返回 2；空 PASSED 和汇总计数矛盾也返回 2。`ASSIGNED`/`CLEANING` 可继续轮询；基础设施 FAILED 但用例全部通过仍返回 1。真实 CLI 等待 1 秒后返回 1，远程批次 `matrix-a5e4f69a-5a6c-4bd5-82da-5ec703213e23` 仍为 QUEUED，随后由验收脚本明确取消。

门户直接检查全通过批次 `matrix-3bfc14e7-db0f-4210-8295-8d09281cd5a6`：Chromium `156.0.8078.4`、Firefox `157.0`；子任务实际结果均通过，资源版本可见。下载使用浏览器 DOMParser 确认合法 `<testsuites>`，2 个独立 suite、2 个 testcase、0 failure/error，并区分目标标签。混合结果批次 `matrix-5bdf7505-2b29-4f89-89d7-7c2222af9eee` 在页面保持失败。

实际门户默认选 Chromium/Firefox，WebKit 未选；单个目标时提交禁用。UI 创建版本 `0` 的排队批次 `matrix-eabc4f9c-a3cc-4170-990b-b9702f40dff9`，禁用活跃 JUnit，确认取消后 API 状态确实为 CANCELLED。弹窗打开后由 API 编辑用例，确认提交收到服务端 `needs human approval`，保留弹窗错误。真实无匹配搜索、实际不存在 ID 的 404、手机导航和 VIEWER 的只读计划/详情已检查。未发现未捕获的浏览器应用错误。

最终版本另由验收者独立创建批次 `matrix-a2eaa9b5-4d84-4148-aca1-273ac7789581`。实际 Chromium `156.0.8078.4` 完成已审批页面断言并产生证据；Firefox 因独有不可用标签保持 QUEUED。批次保持 RUNNING，JUnit 返回 409。创建后立即把用例改为包含不存在选择器的 DRAFT，真实 Chromium 仍按原审批快照通过，结果保留原用例名称。取消只使排队的 Firefox 变为 CANCELLED，已完成 Chromium 详情不变，重复取消详情一致。另直接读取实际混合浏览器批次的用例质量指标：Chromium PASSED、Firefox FAILED，EWMA 为 0、未隔离，跨浏览器稳定差异未被当成 flaky。

## 已关闭的独立发现

1. 能力去重遗漏：同一计划下 `{browser:'chromium'}` 与 `{browser:'chromium',brand:''}` 被接受为不同目标；调度忽略空 brand，因此能力实际相同。复现批次 `matrix-edcc0636-7203-4678-bb2a-285793b718e7` 已取消。原后端作者提交 `2ae576cd43acf39e95bd794d70238c8e15de26f9` 修复；最终实际服务的 16 个 brand/model/version 空串、空白及继承组合均返回 400，无对应批次、子任务或创建审计。
2. 门户通过/失败统计：既有 `.report-metrics span` 样式同时作用于 `strong` 内的通过/失败数字，使数字小且上下分行，分隔斜杠却保持大号。原真实 Kimi 作者提交 `3216bf0` 修复。最终桌面与移动截图显示清晰的 `2 / 0`；实际 computed style 中两个数字均为 24px、display:inline，与 strong 一致。
3. VIEWER 矩阵列表顶部曾显示“从计划发起”，与角色能力不一致。原真实 Kimi 作者提交 `7b431e1` 修复。最终真实 VIEWER 页面显示“查看测试计划”，没有“从计划发起”链接。
4. 浏览器选择器原先使用外层 Field `<label>` 包含多个内层 `<label>`，形成非法嵌套；三个精确可访问名称无法用于定位。原真实 Kimi 作者提交 `7b431e1` 改用 fieldset/legend。最终实际弹窗内没有嵌套 label，Chromium/Firefox/WebKit 的精确 checkbox 名称各匹配 1 个，默认选择正确。

## 证据位置与限制

安全执行脚本、JSON 结果和截图保存在忽略提交的 `.data/matrix-independent/`。修复前截图：`desktop-passed.png`、`desktop-mixed.png`、`mobile-passed.png`、`mobile-reports.png`；最终视觉截图：`final-desktop.png`、`final-mobile.png`、`final-viewer.png`。移动截图在布局过渡完成后重拍并实际观察。

本报告已执行范围为本地独立验收。云端部署、GitHub CI 与外部浏览器访问由主控单独验证，未由本验收者独立执行，不计入本报告通过范围。真实全通过/混合双浏览器批次由主控实际创建，本验收者从实际 API、门户、报告下载与证据字节独立核验；另由验收者亲自创建真实 Chromium 部分完成批次。上述覆盖均不声称真机、投屏或 AI 已接入。
