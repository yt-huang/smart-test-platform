# 浏览器矩阵后端实现交付

- 状态：implemented；独立验收与集成由主控执行。
- 输入提交：`86724c5f2a7ade2c035216e626f46a6cb33a63d3`，REST 契约 v1；采用主控追加的提交后分配和按真实执行环境比较质量要求。
- 实现者：原生 Codex 子 Agent `/root/matrix_backend`；运行时为 Codex/OpenAI，精确模型别名未在本任务元数据中暴露。未调用或冒充 Kimi。
- 工作目录：`C:/Users/admin/.codex/worktrees/platform-backend/ai-test`；分支：`codex/matrix-backend`。
- 写入范围：`backend/` 与本文；无 push、部署或其他实现者目录修改。

## 实际差异

新增 `/api/matrices` 创建/列表、`/{id}` 详情、`/{id}/cancel` 幂等取消、`/{id}/junit` 聚合导出。权限沿用 runs：登录可读，ADMIN/TESTER/DEVELOPER 可创建及取消，VIEWER 403，匿名 401。创建、取消、聚合导出及拒绝的写入权限均进入相应审计。

全部计划、审批、Web 用例、2–8 个目标、标签、能力、敏感 cloud、名称和提交输入在任何写入及调度前验证。一次事务保存 matrix 和全部 run，每个 run 保留相同已审批快照、计划优先级/超时、commit、matrixId 和 matrixLabel，最后单次 tick。继承计划名截断至150字符；用户显式名称超长仍拒绝。子任务名截断至200字符并完整保留标签。

能力继承计划；标签大小写无关去重，目标能力使用标签集合排序与数值版本范围规范化去重。敏感用例 cloud 请求拒绝，Agent 自报 trusted 不生效，仍依靠管理员授予的本地 trusted 资源调度。

实际 assign/cancel 发送延迟到事务 afterCommit；提交拒绝时不会发送。原 ServiceSerialization 锁持续包围提交及 afterCommit。发送异常以 REQUIRES_NEW 事务执行现有 disconnect/资源隔离流程，避免在已提交事务中写数据库。

matrix 仅持久化批次元数据和子任务引用，查询实时派生状态、真实用例计数、目标指纹与消息。终态前不能判定全通过；终态失败优先于取消。墙钟 durationMs 在終态固定为最后一个 finishedAt 减批次 createdAt。删除计划、编辑及删除用例后快照、批次与报告引用保留。

聚合 XML 使用各目标独立 testsuite，名称保留标签；活动批次返回409。根和子套件的 tests/failures/errors 与实际 testcase/failure/error 数一致。取消、超时、无结果失败，以及断言全部通过但资源清理失败，均保留 infrastructure error。统一 XML 转义移除 XML 1.0 非法字符，并将此修复复用于原 run JUnit。

质量统计保留每用例总计及全局 EWMA，按实际 deviceFingerprint 的 platform/browser/version/provider/brand/model 生成无歧义环境签名。内部 `_environmentHistory` 保留最近64种环境各自的最后 commit/verdict，避免 Chromium PASS → Firefox FAIL 被判为同环境抖动，也支持 A/B/A 交错后对 A 的同环境翻转进行比较。请求的版本范围不代替实际版本；内部历史不出现在公开质量响应中。旧质量记录首次遇到环境时建立历史，不使用未知环境的旧 verdict 比较。

## 真实检查

在上述独立工作目录的 `backend/` 执行，仅在当前命令进程设置 JAVA_HOME/PATH，未修改用户或系统配置：

```powershell
$env:JAVA_HOME='D:/code/ai-test/tools/java/jdk-21.0.12.1+1'
$env:PATH="$env:JAVA_HOME/bin;$env:PATH"
& 'D:/code/ai-test/tools/java/apache-maven-3.9.9/bin/mvn.cmd' -B verify
```

2026-10-11 23:11:44 Asia/Shanghai 完成，退出码0，BUILD SUCCESS；Java 21.0.12.1、Maven 3.9.9。37个测试全部通过：MatrixIntegrationTest 20个，原 PlatformIntegrationTest 17个；0 failures/errors/skipped。产出 `backend/target/platform-1.0.0.jar`。Surefire 证据在 `backend/target/surefire-reports/`（忽略提交的构建输出）。此前 `mvn -B test` 亦退出0，35个测试通过；最终 verify 包含新增边界测试。

行为覆盖后续目标无效及重复输入无任何记录/审计/分配、审批失效、非 Web、敏感 cloud、继承能力、trusted 管理边界、最长名称/标签、8目标上限、创建前批次全部保存、排队与部分完成、活动导出409、全部通过、混合用例失败和队列超时、清理失败、幂等取消与清理、角色权限、合法 XML/计数、固定墙钟时间及时间精度排序、历史快照与新 service 实例加载、发送异常隔离、跨浏览器/实际版本质量比较。

提交原子性测试通过 TransactionSynchronization 的 beforeCommit 抛异常模拟提交拒绝，确认 matrix/run/audit/租约全回滚、assign为0。序列化测试在保存 run 时注册提交闩锁，验证第二调度调用一直等到第一个事务提交完毕；不再依赖提交前的 transport 副作用。

## 未验证项

测试使用 H2 PostgreSQL mode、MockMvc 和模拟 Agent 报文，未宣称真实浏览器执行、PostgreSQL 服务故障注入或真实进程重启验收。历史测试用同一持久 store 建立新 PlatformService 实例验证加载；完整中心/Agent 重启、真实 Chromium/Firefox/WebKit 资源执行、门户和 CLI 联调、最终集成版本检查由主控继续验证。费用及精确模型用量未暴露。

## 独立验收后续修复：空白能力去重

输入后端提交 `9878f7eb220ed78d14f24b6fed5bbea8045a133a`。独立 API 验收发现 brand/model 为空时调度器忽略该约束，但去重身份仍保留字段，导致同一 Chromium 目标可以重复创建。此修复新增后续提交，不 amend 原提交。

在构造目标去重身份前，将 version/brand/model 的空白值从已继承及覆盖后的能力中移除。这样实际调度语义与去重语义一致，并使响应能力也采用缺失字段表示无约束。

新增 `blankBrandAndModelConstraintsNormalizeToMissingIncludingInheritedValues` 行为回归。先在原实现执行该测试，真实退出1，MockMvc 证明应为400的请求实际返回200；随后修复并执行上述相同 Java21 环境的 `mvn -B verify`，2026-10-11 23:19:28 Asia/Shanghai 退出0/BUILD SUCCESS，38项通过（矩阵21＋原回归17），0 failures/errors/skipped。新增测试覆盖空字符串、空格、tab/newline、Unicode 空白的 brand/model 组合、继承空白值及空白 version 组合，并确认请求400且 matrix/run/audit/Agent发送均无副作用。`git diff --check` 通过。未新增真实浏览器或云端验证结论。
