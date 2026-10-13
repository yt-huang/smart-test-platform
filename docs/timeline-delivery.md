# 证据时间轴实施进度

更新：2026-10-13（Asia/Shanghai）。本轮继续开发 `add-evidence-timeline`；代码已集成，最终录像重试恢复、CI、Codespaces 升级与重启验收尚待完成，因此没有归档或宣称整体项目完成。

## 实际分工与实现

按仓库 [协作 skill](../.agents/skills/saas-multi-agent/SKILL.md) 和 [执行接入约定](../.agents/skills/saas-multi-agent/references/runtime.md)，主控负责 OpenSpec、接口 v1、集成和部署；真实 Codex 子 Agent 分别负责后端、浏览器执行端与独立验收，门户由真实 Kimi Code CLI 在独立 worktree 实现。

Kimi Code CLI 0.29.0 的配置核验为 alias `kimi-code/kimi-for-coding` → model `kimi-for-coding`、provider `managed:kimi-code`、type kimi、host api.kimi.com。复用本机登录，认证不进入仓库或 Codespaces。门户工作目录 `C:/Users/admin/.codex/worktrees/platform-frontend/ai-test`，允许修改 `frontend/` 和自身实施报告。

| Kimi 实际调用 | 输入 → 原提交 | 退出与可观测墙钟 |
| --- | --- | --- |
| 四轨门户实施 | `921b5d0` → `c3b5a2f` | 0，431 秒 |
| 严格源时间、日志边界与截图重试修复 | `c3b5a2f` → `1bb354e` | 0，533 秒 |
| 真实验收发现的录像重试恢复修复 | `1bb354e` → `7c7d38c` | 0，435 秒；作者43项测试与构建通过，实际恢复待独立复核 |

Codex 后端原提交 `8ed2196`，运行端原提交 `6960f5f`；原生执行环境未暴露具体模型别名或费用，记未知。各组件报告为 implemented：[后端](timeline-backend-implementation.md)、[Agent](timeline-agent-implementation.md)、[Kimi 门户](timeline-kimi-implementation.md)。

## 已实际验证

后端 Java21 Maven verify 71 项、Agent 协议18项、真实 Chromium执行器3项通过。前一集成门户42项与构建通过；最新录像修复尚待主控和独立运行复核。

`scripts/verify-timeline.mjs` 本地通过11个场景：实际审批用例在 Chromium 与 Firefox 执行，3条运行归档27份真实截图、录像、trace和日志；验证源时间、区间/归属、匿名401、媒体大小/SHA、原始 FAILED 与门禁 BLOCKED及两份JUnit。受控测试页面8094在finally关闭，不是长期演示站点。

独立验收已执行 API/WS边界fixtures122项、源数据核对297项、重启后数据保留300项与旧门禁兼容18项；程序化边界与真实执行来源分开记录。真实门户146项有145项通过，11次实际视频seek及390px布局通过，剩余录像解码失败后重试不能恢复已交Kimi修复。详细过程和未完成状态见 [独立验收](timeline-independent-acceptance.md)。不把作者单测替代实际浏览器恢复验收。

录像起点是Agent启动录制操作的时刻，不是精确首帧；回放按源时间相对偏移并以实际媒体duration限制，明确标注近似位置。历史无时间的数据不从上传时间或duration回填。Android目前没有本轮真机时间轴验收。

## 后续验收与访问

升级前已在已有Codespaces保存29条运行、5条用例、6个计划、8份通过报告及40份证据基线。当前已部署应用仍是此前门禁版本 `228194f`，时间轴代码的云端部署和PostgreSQL重启验收尚未完成。

[平台](https://smart-test-platform-7r7vvpp6gqqhp96j-8080.app.github.dev) · [Codespaces工作区](https://smart-test-platform-7r7vvpp6gqqhp96j.github.dev)。8080保持private，使用有权限的GitHub账号访问；管理员密码只通过工作区 `node scripts/admin-password.mjs` 读取。工作区停止时先恢复运行。

下一步完成录像恢复复核、完整CI与云端保留验收，再更新并归档OpenSpec。真机、预约、投屏、通知与私有模型等原M2/M3范围继续保留未完成状态，接入须有真实设备/服务。
