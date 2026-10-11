# Delta Spec: remote-streaming

## ADDED Requirements

### Requirement: 浏览器内实时投屏操控
平台 SHALL 在远程调试会话中提供浏览器内实时投屏与操控（触控/滑动/键盘/按键注入），首版经 WSS 中转 H.264 流，局域网操作延迟 MUST ≤ 300ms。

#### Scenario: 跟手性验收
- **WHEN** 用户在局域网内操作 1080p Android 设备
- **THEN** 端到端延迟 ≤ 300ms，连续操作无丢帧卡顿

### Requirement: WebRTC 升级路径
平台 SHALL 预留 WebRTC 投屏通道（P2P/SFU、DTLS-SRTP 加密），与 WSS 方案 MUST 可灰度切换。

#### Scenario: 跨网段低延迟
- **WHEN** 用户跨网段调试且 WebRTC 通道启用
- **THEN** 端到端延迟 ≤ 500ms，媒体流全程 DTLS-SRTP 加密

### Requirement: 远程 adb 鉴权中转
平台 SHALL 提供 `platform adb connect <session>` 命令，经平台网关鉴权中转 adb 流；任何环境 MUST NOT 暴露裸 ADB TCP 端口。

#### Scenario: 本地 IDE 调试
- **WHEN** 研发在本地执行 connect 命令并通过平台鉴权
- **THEN** Android Studio 可 attach 到远程设备，全部命令会话记入审计日志

### Requirement: 实时日志与导出
调试会话 SHALL 提供实时设备日志流（logcat/syslog 过滤）与截图/录屏导出，导出文件 MUST 带会话水印。

#### Scenario: 日志延迟
- **WHEN** 设备产生新日志
- **THEN** 浏览器端 2 秒内可见过滤后的日志行
