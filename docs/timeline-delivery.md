# 证据时间轴交付

日期：2026-10-13（Asia/Shanghai）。时间轴已集成、独立验收并实际部署到已有 Codespaces。应用代码 `9ef1511`，完整CI输入 `10714614cbb66251da580333f690b0921e804a09`；后续交付文本与规格归档不改变应用代码。原M1/M2/M3整个平台仍未整体验收。

## 实际分工与实现

按仓库 [协作 skill](../.agents/skills/saas-multi-agent/SKILL.md) 和 [执行接入约定](../.agents/skills/saas-multi-agent/references/runtime.md)，主控负责 OpenSpec、接口 v1、集成和部署；Codex `/root/timeline_backend` 和 `/root/timeline_agent` 分别负责后端与运行端，门户由真实 Kimi Code CLI 在独立 worktree 实现。独立上下文 `/root/timeline_acceptance` 执行初轮验收，恢复工作后 `/root/timeline_final_acceptance` 重新验最终UI。

Kimi Code CLI 0.29.0 的配置核验为 alias `kimi-code/kimi-for-coding` → model `kimi-for-coding`、provider `managed:kimi-code`、type kimi、host api.kimi.com。复用本机登录，认证不进入仓库或 Codespaces。门户工作目录 `C:/Users/admin/.codex/worktrees/platform-frontend/ai-test`，允许修改 `frontend/` 和自身实施报告。

| Kimi 实际调用 | 输入 → 原提交 | 退出与可观测墙钟 |
| --- | --- | --- |
| 四轨门户实施 | `921b5d0` → `c3b5a2f` | 0，431 秒，37项测试和构建通过 |
| 严格源时间、日志边界与截图重试修复 | `c3b5a2f` → `1bb354e` | 0，533 秒，42项测试和构建通过 |
| 真实验收发现的录像重试恢复修复 | `1bb354e` → `7c7d38c` | 0，435 秒，43项测试与构建通过，随后独立实际恢复验收通过 |

Codex 后端原提交 `8ed2196`，运行端原提交 `6960f5f`；原生执行环境未暴露具体模型别名或费用，记未知。各组件报告为 implemented：[后端](timeline-backend-implementation.md)、[Agent](timeline-agent-implementation.md)、[Kimi 门户](timeline-kimi-implementation.md)。

## 已实际验证

集成组件：后端 Java21 Maven verify71项、Agent协议18项、真实Chromium执行器3项、门户43项（时间轴源函数18项）及构建均退出0。最终仅更新门户静态资源重包，完整CI再从源码测试构建。

`scripts/verify-timeline.mjs` 本地与Codespaces各实际通过11个场景：实际审批用例在Chromium与Firefox执行，3条运行归档27份真实截图、录像、trace和日志；验证源时间、区间/归属、匿名401、媒体大小/SHA、原始FAILED与门禁BLOCKED及两份JUnit。受控测试页面8094在finally关闭，不是长期演示站点。

初轮独立API/WS边界fixtures122项、真实来源297项及主控记录比较30项、重启保留300项、旧门禁兼容18项、时间源负向5项通过；程序化边界与真实执行来源分开记录。初轮真实门户146项中145通过，发现录像重试恢复缺陷，由原Kimi修复。

最终独立实际门户178/178、13次真实seek、10张截图、0未捕获JS错误，桌面和390px检查通过。损坏单次WebM响应明确是synthetic；移除拦截后重试GET200实际38912字节与归档SHA一致，metadata5.04秒、seek3.141秒且paused=true，旧Blob释放，原P2关闭。初轮发现与测量修正保留于 [独立验收](timeline-independent-acceptance.md)。手机视口不是物理手机。

完整 [GitHub Actions 38406737650](https://github.com/yt-huang/smart-test-platform/actions/runs/38406737650) 对应 `1071461`，实际completed/success，包含原端到端、矩阵、隔离门禁、新时间轴实际执行与持久性检查。

录像起点是Agent启动录制操作的时刻，不是精确首帧；回放按源时间相对偏移并以实际媒体duration限制，明确标注近似位置。历史无时间的数据不从上传时间或duration回填。Android目前没有本轮真机时间轴验收。

## 云端实际记录、重启与访问

升级前保存29条运行、5条用例、6个计划、8份通过报告及40份证据基线，新镜像启动后逐项保留。云端实际资源Chromium156.0.8078.4、Firefox157.0：

| 场景 | 真实记录 |
| --- | --- |
| Chromium单运行 | `run-6bde3f54-411d-4285-8bd4-8eb051837c91` |
| Chromium/Firefox矩阵 | `matrix-755cc1de-2e33-4291-9c72-5d6f80a7e1c9` |
| Chromium子运行 | `run-8b538c59-c526-434b-85ad-a1bef9677197` |
| Firefox子运行 | `run-18c4bd11-5792-4e35-aa56-2b07d884df0a` |

新增验收后实际停止Agent/平台、重启PostgreSQL、重新启动并登录：三条新运行results/timing/capture元数据、27份媒体长度/SHA与两份JUnit保持一致，矩阵gate和两份JUnit一致；32条运行、7条用例、7个计划保留，8份通过报告40份原证据SHA一致，原Chromium/Firefox资源恢复IDLE、Agent ONLINE。此前38条run/matrix的gate与冻结门禁JUnit哈希不变，其中9条WARN，旧警告运行4份媒体完整。

安全结果保存于云端 `.data/timeline-cloud-result.json`、`timeline-retention-check-result.json`、`timeline-persistence-check-result.json`、`timeline-gate-retention-check-result.json`。这是服务/数据库重启保留检查，不替代异地恢复演练。

主控通过Chrome以有权限的GitHub账号访问private端口，重新登录既有VIEWER并查看上述单运行报告，实际录像currentTime15.302秒、duration17.2秒、paused=true、readyState4且无解码错误。云端截图为 `.data/acceptance/cloud-timeline-final.png`。截图中的失败是验收脚本有意触发的真实断言失败。

[平台](https://smart-test-platform-7r7vvpp6gqqhp96j-8080.app.github.dev) · [Codespaces工作区](https://smart-test-platform-7r7vvpp6gqqhp96j.github.dev)。8080保持private，使用有权限的GitHub账号访问；管理员密码只通过工作区 `node scripts/admin-password.mjs` 读取。工作区停止时先恢复运行。

项目skill、runtime说明、交接模板和AGENTS.md随GitHub代码同步；本机Kimi登录未随仓库同步，其他环境必须分别核验执行能力。真机、预约、投屏、通知、私有模型及原M2/M3现场业务验收继续保留未完成状态，接入须有真实设备/服务。
