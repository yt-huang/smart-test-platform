# Figma 与 UI 交接

先根据业务场景确定核心页面、动作和状态，再出代表页面，沿用已确认组件系统滚动推进。UI 与接口设计可并行；不要求整个产品全部设计完才实现。

## 连接与能力

有已连接 Figma 工具时检查实际暴露能力，按其技能和访问规则操作。缺连接时先发现可用插件，不重复建议已安装或正在连接的插件。用户要求实际 Figma 稿而连接未就绪时，继续规格等独立工作并说明所需连接；有替代预览授权时可先提供本地预览，但明确产物类型。

官方 remote MCP 可读取精确节点的上下文、截图、variables；支持的 `use_figma` 能创建／修改原生 Frame、组件、variables 和 Auto Layout，写入需要合适 seat 与目标文件权限。实际环境可能有资源等限制，按暴露工具核验。[Figma 写画布](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/)

从代码捕获网页到画布需要真实运行的页面，不能视为直接从 PRD 出稿。Figma Make 可生成交互原型；复制到 Design 传递当前视觉状态，交互与代码不自动同步。只有任务需要原型时再使用，避免多出一套重复代码。[Make 交接](https://help.figma.com/hc/en-us/articles/35710574222487-Beyond-the-basics-Using-Figma-Make)

## 最小 UI 任务包

- 精确 Figma 文件／frame／node、确认版本；必要截图、资源和变量快照。
- 页面、路由与主要动作；关联行为规格中的场景。
- 正常、加载、空、错误、成功、无权限／禁用等适用状态。
- 复用组件路径、props、tokens 和桌面／移动布局规则。
- 视觉要求与项目惯例发生冲突时，需要协调决定的内容。

写入 ui-handoff.md 并与同一 OpenSpec change 关联。读取精确目标节点，避免整份大文件耗尽上下文；视觉信息由 Codex 整理成本地可读包，让 Kimi 复用，不假定 Kimi 已直连 Figma。

默认设计角色不改生产代码；用户分配生产 UI 时明确代码归属和业务接入接口，复用成熟成果。MCP 返回的参考代码适配现有仓库模式，不另外生成并行设计系统。[Codex 设计交接](https://learn.chatgpt.com/use-cases/figma-designs-to-code)

验收检查浏览器中的实际视觉和交互，覆盖必要视口及状态。截图相似不能证明权限、持久化和错误处理正确。
