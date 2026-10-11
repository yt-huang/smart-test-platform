# -*- coding: utf-8 -*-
"""智能测试平台调研报告 - 图表生成脚本"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager

# 中文字体
for name in ["Microsoft YaHei", "SimHei", "Noto Sans CJK SC"]:
    if any(name.lower() in f.name.lower() for f in font_manager.fontManager.ttflist):
        plt.rcParams["font.sans-serif"] = [name]
        break
plt.rcParams["axes.unicode_minus"] = False

# 统一配色
C_MAIN = "#2E6FB7"
C_ACC = "#E8843C"
C_GREY = "#8A97A6"
C_LIGHT = "#A8C8E8"
PALETTE = ["#2E6FB7", "#E8843C", "#5BA55B", "#8A97A6", "#C0504D", "#7B6BA8"]

import os
os.makedirs(r"D:\code\ai-test\charts", exist_ok=True)

# ---------------- 图1：AI 测试市场规模（Fortune Business Insights 口径） ----------------
years = np.arange(2025, 2035)
size_2025 = 1.01
cagr = 0.183
sizes = size_2025 * (1 + cagr) ** (years - 2025)

fig, ax = plt.subplots(figsize=(9, 4.8), dpi=150)
bars = ax.bar(years, sizes, color=C_MAIN, width=0.62)
bars[0].set_color(C_ACC)
bars[-1].set_color(C_ACC)
for y, v in [(2025, sizes[0]), (2026, sizes[1]), (2034, sizes[-1])]:
    ax.text(y, v + 0.08, f"${v:.2f}B", ha="center", fontsize=10, fontweight="bold")
ax.set_title("全球 AI 测试市场规模预测（2025–2034，CAGR 18.3%）", fontsize=13, fontweight="bold", pad=12)
ax.set_xlabel("年份")
ax.set_ylabel("市场规模（十亿美元）")
ax.spines[["top", "right"]].set_visible(False)
ax.set_ylim(0, 5.4)
fig.tight_layout()
fig.savefig(r"D:\code\ai-test\charts\market-growth.png")
plt.close(fig)

# ---------------- 图2：海外设备云入门价格对比 ----------------
platforms = ["LambdaTest\n(TestMu AI)", "AWS Device Farm\n(包月)", "Sauce Labs\nRDC", "BrowserStack\nApp Automate", "Kobiton\n(1000分钟)", "Perfecto"]
prices = [159, 250, 199, 199, 83, 300]
colors = [C_MAIN] * len(platforms)
colors[4] = C_GREY  # Kobiton 计费模式不同，灰显区分

fig, ax = plt.subplots(figsize=(9.5, 4.8), dpi=150)
bars = ax.bar(platforms, prices, color=colors, width=0.55)
for b, p in zip(bars, prices):
    ax.text(b.get_x() + b.get_width() / 2, p + 6, f"${p}", ha="center", fontsize=10, fontweight="bold")
ax.set_title("海外移动设备云平台入门价格对比（美元/月，年付价）", fontsize=13, fontweight="bold", pad=12)
ax.set_ylabel("入门价（美元/月）")
ax.spines[["top", "right"]].set_visible(False)
ax.set_ylim(0, 340)
ax.text(0.99, 0.97, "注：Kobiton 按分钟计费（灰色），其余按并发/槽位计费；\n均为公开入门档位，企业合同价差异大", transform=ax.transAxes,
        ha="right", va="top", fontsize=8.5, color="#555555")
fig.tight_layout()
fig.savefig(r"D:\code\ai-test\charts\device-cloud-pricing.png")
plt.close(fig)

# ---------------- 图3：Web 自动化框架采用率 ----------------
fw = ["Playwright", "Selenium", "Cypress", "其他"]
share = [45.1, 22.1, 14.0, 18.8]
fig, ax = plt.subplots(figsize=(8.6, 4.6), dpi=150)
bars = ax.barh(fw[::-1], share[::-1], color=[C_GREY, PALETTE[2], C_ACC, C_MAIN], height=0.55)
for b, s in zip(bars, share[::-1]):
    ax.text(s + 0.8, b.get_y() + b.get_height() / 2, f"{s}%", va="center", fontsize=10, fontweight="bold")
ax.set_title("Web 自动化测试框架采用率（QA 从业者，2026 年调查）", fontsize=13, fontweight="bold", pad=12)
ax.set_xlabel("采用率（%）")
ax.spines[["top", "right"]].set_visible(False)
ax.set_xlim(0, 55)
fig.tight_layout()
fig.savefig(r"D:\code\ai-test\charts\web-framework-adoption.png")
plt.close(fig)

# ---------------- 图4：目标平台分层架构 ----------------
fig, ax = plt.subplots(figsize=(11, 7.2), dpi=150)
ax.set_xlim(0, 10)
ax.set_ylim(0, 10)
ax.axis("off")

def layer(y, h, title, boxes, color):
    ax.add_patch(plt.Rectangle((0.3, y), 9.4, h, facecolor=color, alpha=0.12, edgecolor=color, lw=1.2))
    ax.text(0.55, y + h - 0.28, title, fontsize=11, fontweight="bold", color=color, va="top")
    n = len(boxes)
    bw = 8.6 / n
    for i, b in enumerate(boxes):
        x = 0.7 + i * bw + 0.08
        ax.add_patch(plt.Rectangle((x, y + 0.18), bw - 0.16, h - 0.85, facecolor="white",
                                   edgecolor=color, lw=1.0, zorder=3))
        ax.text(x + (bw - 0.16) / 2, y + 0.18 + (h - 0.85) / 2, b, ha="center", va="center",
                fontsize=9.5, color="#222222", zorder=4)

layer(8.3, 1.6, "L5 接入层（用户入口）",
      ["统一门户 /\n测试工作台", "OpenAPI /\nCLI", "CI/CD 插件\n(Jenkins/GitLab)", "IM 通知\n(飞书/钉钉)"], "#7B6BA8")
layer(6.5, 1.6, "L4 能力层（测试服务）",
      ["测试用例/计划管理", "UI 自动化\n(Web/App)", "接口/性能测试", "兼容性测试", "AI 用例生成\n与自愈"], "#2E6FB7")
layer(4.7, 1.6, "L3 调度与执行层",
      ["任务调度\n(分片/优先级)", "执行引擎\n(Playwright/Appium)", "AI Agent 执行\n(Midscene)", "报告与证据\n采集"], "#E8843C")
layer(2.9, 1.6, "L2 资源层（设备与环境）",
      ["自建真机池\n(STF/Sonic)", "公有云真机\n(优测/WeTest)", "浏览器网格\n(Selenium Grid)", "虚拟化环境\n(模拟器/容器)"], "#5BA55B")
layer(1.1, 1.6, "L1 基础设施层",
      ["K8s / 容器运行时", "对象存储\n(录像/截图)", "消息队列 /\n任务总线", "可观测性\n(日志/监控)"], "#8A97A6")

# 右侧 AI 引擎纵贯
ax.add_patch(plt.Rectangle((9.78, 1.1), 0.02, 8.8, visible=False))
ax.annotate("", xy=(9.9, 9.9), xytext=(9.9, 1.1),
            arrowprops=dict(arrowstyle="<->", color="#C0504D", lw=1.6))
ax.text(9.62, 5.5, "AI 引擎（大模型：用例生成 / 视觉定位 / 失败归因 / 自愈）纵贯全层",
        rotation=90, fontsize=9.5, color="#C0504D", ha="center", va="center")

ax.set_title("智能测试平台目标分层架构（手机端 + Web 全覆盖）", fontsize=14, fontweight="bold", pad=8)
fig.tight_layout()
fig.savefig(r"D:\code\ai-test\charts\target-architecture.png")
plt.close(fig)

print("OK - 4 charts generated")
