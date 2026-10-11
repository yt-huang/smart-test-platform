# -*- coding: utf-8 -*-
"""架构设计文档配图：总体架构图 + 会话/设备状态机"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

plt.rcParams["font.family"] = "Microsoft YaHei"
plt.rcParams["axes.unicode_minus"] = False

PRIMARY = "#2E6FB7"
ACCENT = "#E8843C"
GREEN = "#4C9F70"
GRAY = "#8A8F98"
LIGHT = "#EAF1F9"
LIGHT2 = "#FDF0E4"


def box(ax, x, y, w, h, text, fc=LIGHT, ec=PRIMARY, fs=10, bold=False, tc="#1a1a1a"):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.06",
                       linewidth=1.4, edgecolor=ec, facecolor=fc)
    ax.add_patch(p)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs,
            color=tc, fontweight="bold" if bold else "normal", linespacing=1.5)
    return p


def arrow(ax, x1, y1, x2, y2, color=GRAY, style="-|>", lw=1.6, ls="-", label=None,
          lfs=8.5, lcolor=None, rad=0.0):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=14,
                        linewidth=lw, color=color, linestyle=ls,
                        connectionstyle=f"arc3,rad={rad}")
    ax.add_patch(a)
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.12, label, ha="center", fontsize=lfs,
                color=lcolor or color)


# ============ 图 1：平台 + Agent 总体架构 ============
fig, ax = plt.subplots(figsize=(13.5, 9.2))
ax.set_xlim(0, 13.5); ax.set_ylim(0, 9.2); ax.axis("off")
ax.set_title("智能测试平台总体架构：控制面 / 数据面分离（平台 + Agent 远端运行）",
             fontsize=15, fontweight="bold", pad=14)

# 用户侧
box(ax, 0.4, 7.7, 3.2, 1.0, "用户侧\nWeb 门户 · CLI · CI 插件\n(Jenkins / GitLab CI)", fc="#F3F5F7", ec=GRAY, fs=10)
# 中心平台外框
ax.add_patch(FancyBboxPatch((4.2, 3.3), 5.0, 5.4, boxstyle="round,pad=0.05,rounding_size=0.1",
             linewidth=2.0, edgecolor=PRIMARY, facecolor="#FAFCFE"))
ax.text(6.7, 8.45, "中心平台（控制面 + 数据面）", ha="center", fontsize=12.5,
        fontweight="bold", color=PRIMARY)

box(ax, 4.5, 7.5, 4.4, 0.75, "接入网关：认证鉴权 · OpenAPI · WebSocket 接入 · 流量路由", fs=9.5)
box(ax, 4.5, 6.45, 2.1, 0.85, "调度器\n会话队列 · 能力匹配\n占用锁 · 超时回收", fc=LIGHT2, ec=ACCENT, fs=9.5)
box(ax, 6.8, 6.45, 2.1, 0.85, "会话管理\n远程调试会话\n任务编排 · 预约", fc=LIGHT2, ec=ACCENT, fs=9.5)
box(ax, 4.5, 5.35, 2.1, 0.85, "测试管理\n用例 · 计划 · 缺陷\n质量度量看板", fs=9.5)
box(ax, 6.8, 5.35, 2.1, 0.85, "AI 引擎\n用例生成 · 视觉自愈\n失败归因 · flaky 隔离", fs=9.5)
box(ax, 4.5, 4.25, 2.1, 0.85, "报告与证据\nAllure · 截图录像\ntrace · 日志", fs=9.5)
box(ax, 6.8, 4.25, 2.1, 0.85, "基础设施\nPostgreSQL · Redis\n对象存储 MinIO", fs=9.5)
box(ax, 4.5, 3.5, 4.4, 0.55, "可观测性：OpenTelemetry · Prometheus · 审计日志", fc="#F3F5F7", ec=GRAY, fs=9)

# Agent 执行机外框
ax.add_patch(FancyBboxPatch((10.0, 3.3), 3.1, 5.4, boxstyle="round,pad=0.05,rounding_size=0.1",
             linewidth=2.0, edgecolor=ACCENT, facecolor="#FFFBF6"))
ax.text(11.55, 8.45, "Agent 执行机（可横向扩容 N 台）", ha="center", fontsize=12.5,
        fontweight="bold", color=ACCENT)

box(ax, 10.3, 7.5, 2.5, 0.75, "连接器 Connector\nAgentKey 鉴权 · 心跳\n断线重连 · 任务拉取", fc=LIGHT2, ec=ACCENT, fs=9)
box(ax, 10.3, 6.35, 2.5, 0.9, "设备接入层\nAndroid: ADB + scrcpy\niOS: WDA + go-ios\n浏览器: 容器化 Playwright", fs=9)
box(ax, 10.3, 5.05, 2.5, 1.05, "执行运行时\nAppium Server\nMaestro / 脚本沙箱\n证据采集（截图/录像/日志）", fs=9)
box(ax, 10.3, 3.6, 2.5, 1.15, "挂载资源\nAndroid 真机 ×n（USB Hub）\niOS 真机（Mac 节点）\n浏览器容器池", fc="#FFF", ec=GREEN, fs=9)

# 连接关系
arrow(ax, 3.6, 8.2, 4.5, 8.2, color=PRIMARY, label="HTTPS / WSS", lfs=9)
arrow(ax, 10.3, 7.9, 8.9, 7.9, color=ACCENT, lw=2.2,
      label="Agent 主动出站长连接（WSS）", lfs=9.5, lcolor=ACCENT, rad=0.15)
ax.text(9.6, 7.15, "NAT / 防火墙友好\n无需内网穿透", ha="center", fontsize=8.5, color=GRAY)
arrow(ax, 9.2, 4.7, 10.3, 4.7, color=GREEN, ls="--",
      label="证据上传（对象存储预签名 URL）", lfs=8.5, lcolor=GREEN)

# 底部：云真机预留
box(ax, 0.4, 5.9, 3.2, 1.2, "云真机（后续接入）\n优测 / WeTest / BrowserStack\n经同一 Execution Target 抽象\nprovider=cloud 适配器接入", fc="#F3F5F7", ec=GRAY, fs=9)
arrow(ax, 3.6, 6.5, 4.5, 6.6, color=GRAY, ls="--", label="预留适配器", lfs=8.5)

# 图例
legend_items = [
    mpatches.Patch(color=PRIMARY, label="控制面：认证 / 调度 / 管理"),
    mpatches.Patch(color=ACCENT, label="数据面：执行 / 设备 / 证据"),
    mpatches.Patch(color=GREEN, label="资源与存储"),
    mpatches.Patch(color=GRAY, label="外部系统 / 预留"),
]
ax.legend(handles=legend_items, loc="lower left", fontsize=9, frameon=False,
          bbox_to_anchor=(0.02, 0.02))
plt.tight_layout()
plt.savefig("charts/platform-agent-architecture.png", dpi=160, bbox_inches="tight")
plt.close()

# ============ 图 2：会话生命周期 + 设备状态机 ============
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.5, 5.6))

# 左：会话状态机
ax1.set_xlim(0, 7); ax1.set_ylim(0, 6); ax1.axis("off")
ax1.set_title("测试会话生命周期", fontsize=13, fontweight="bold")
states = {
    "已提交": (0.6, 4.6), "排队中": (2.8, 4.6), "匹配设备": (5.0, 4.6),
    "执行中": (5.0, 2.6), "清机回收": (2.8, 2.6), "已归档": (0.6, 2.6),
    "已超时": (2.8, 0.9),
}
for name, (x, y) in states.items():
    fc = LIGHT2 if name in ("匹配设备", "执行中", "清机回收") else LIGHT
    ec = ACCENT if name in ("匹配设备", "执行中", "清机回收") else PRIMARY
    if name == "已超时":
        fc, ec = "#F3F5F7", GRAY
    box(ax1, x, y, 1.55, 0.75, name, fc=fc, ec=ec, fs=10.5, bold=(name == "执行中"))
arrow(ax1, 2.15, 4.98, 2.8, 4.98, color=PRIMARY)
arrow(ax1, 4.35, 4.98, 5.0, 4.98, color=PRIMARY)
arrow(ax1, 5.78, 4.6, 5.78, 3.35, color=ACCENT, label="占用锁+心跳")
arrow(ax1, 5.0, 2.98, 4.35, 2.98, color=ACCENT, label="强制清机")
arrow(ax1, 2.8, 2.98, 2.15, 2.98, color=PRIMARY, label="证据入库")
arrow(ax1, 3.58, 4.6, 3.58, 1.65, color=GRAY, ls="--", label="队列超时", lfs=8.5)
arrow(ax1, 5.2, 2.6, 4.3, 1.4, color=GRAY, ls="--", label="执行超时", lfs=8.5, rad=0.2)
ax1.text(3.5, 0.35, "任一异常路径都必须回落到「清机回收」，设备不带着上一个会话的状态离开",
         ha="center", fontsize=9, color=GRAY)

# 右：设备状态机
ax2.set_xlim(0, 7); ax2.set_ylim(0, 6); ax2.axis("off")
ax2.set_title("设备状态机（Agent 上报，平台裁决）", fontsize=13, fontweight="bold")
dstates = {
    "离线": (0.6, 4.6), "空闲": (2.9, 4.6), "占用中": (5.1, 4.6),
    "清机中": (5.1, 2.5), "维护中": (0.6, 2.5),
}
for name, (x, y) in dstates.items():
    fc = LIGHT2 if name == "占用中" else LIGHT
    if name == "空闲":
        fc = "#EAF6EF"
    box(ax2, x, y, 1.5, 0.75, name, fc=fc, ec=PRIMARY if name != "维护中" else GRAY,
        fs=10.5, bold=(name == "占用中"))
arrow(ax2, 2.1, 4.98, 2.9, 4.98, color=GREEN, label="心跳+自检", lfs=8.5)
arrow(ax2, 4.4, 4.98, 5.1, 4.98, color=ACCENT, label="调度命中", lfs=8.5)
arrow(ax2, 5.85, 4.6, 5.85, 3.25, color=ACCENT, label="会话结束")
arrow(ax2, 5.1, 2.88, 3.9, 2.88, color=GREEN, ls="-", label="清机通过→空闲", lfs=8.5)
arrow(ax2, 3.65, 3.25, 3.65, 4.6, color=GREEN, ls="--")
arrow(ax2, 5.1, 2.5, 2.1, 2.6, color=GRAY, ls="--", label="清机失败→隔离维护", lfs=8.5)
arrow(ax2, 1.35, 3.25, 1.35, 4.6, color=GRAY, ls="--", label="人工恢复", lfs=8.5)
ax2.text(3.5, 0.35, "清机内容：卸载被测应用 · 清账号/缓存 · 重置网络 · 重启 ADB/WDA · 截屏比对基线",
         ha="center", fontsize=9, color=GRAY)

plt.tight_layout()
plt.savefig("charts/session-device-lifecycle.png", dpi=160, bbox_inches="tight")
plt.close()

print("done")
