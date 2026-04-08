macOS 磁盘 SMART 工具规划文档
1. 目标

基于 Tauri + React + Tailwind 开发一款 macOS 磁盘 SMART 可视化工具，重点是：

提供简洁、现代的磁盘健康 UI
正确识别 内置硬盘 和 外接硬盘
支持常见 SATA、NVMe、USB、Thunderbolt 场景
区分“设备识别成功”和“SMART 可读成功”
适合快速迭代和 vibe coding
2. 技术方案
前端：React + Tailwind
桌面壳：Tauri
后端：Rust
SMART 读取：smartctl
设备识别：diskutil / system_profiler
3. 核心设计

整体分四层：

设备发现：扫描系统磁盘
设备识别：判断内置/外接、协议、型号等信息
SMART 读取：调用 smartctl 获取健康数据
UI 展示：统一展示状态、温度、寿命和错误信息

设计原则：

前端只使用统一数据模型
允许部分字段缺失
失败时必须展示明确原因，不能直接等同于“硬盘异常”
4. 功能范围
MVP
扫描 whole disk
区分内置盘 / 外接盘
显示名称、容量、协议、健康状态、温度
读取并展示 SMART 基本信息
对不可读场景展示原因
后续增强
SMART 原始属性表
兼容更多 USB / NVMe 外接盒
历史趋势
导出诊断报告
5. 推荐架构
React UI
  ↓
Tauri invoke
  ↓
Rust service
  ├─ device discovery
  ├─ device normalize
  ├─ smartctl runner
  └─ parser / compatibility
6. 数据模型
DiskDevice
id
bsdName
displayName
vendor / model / serial
sizeBytes
isInternal
transport
smartSupported
smartAccess
SmartReport
diskId
readable
healthStatus
temperatureC
powerOnHours
percentageUsed
availableSpare
error counters
failureReason
7. 实现思路
设备识别

优先通过：

diskutil list -plist
diskutil info -plist
system_profiler -json

目的：

找到 whole disk
判断内置 / 外接
判断 SATA / NVMe / USB / Thunderbolt
SMART 读取

优先通过 smartctl：

内置盘直接读
外接盘按类型尝试不同方式
失败时记录原因并在 UI 中解释
8. UI 规划
列表页

展示：

设备名称
内置 / 外接标签
协议标签
容量
温度
健康状态
SMART 是否可读
详情页

展示：

基本信息
健康摘要
关键 SMART 指标
不可读原因或兼容性提示

风格建议：

深色模式优先
卡片化布局
默认简洁，专业信息折叠展示
9. 开发阶段
Phase 1
初始化 Tauri + React + Tailwind
调通 diskutil 和 smartctl
简单展示设备列表
Phase 2
建立统一数据模型
完成列表页和详情页
加入错误处理
Phase 3
优化外接盘兼容性
增强 UI 细节
增加诊断提示
10. 风险
USB 外接盒兼容性差异大
部分场景 SMART 需要更高权限
不同设备返回的数据字段可能不完整
11. 结论

最合适的路线是：

用 Tauri + React + Tailwind 快速完成高质量 UI
用 Rust 做统一后端服务层
用 smartctl 作为 SMART 引擎
用系统信息做设备识别
用兼容性提示解释失败原因

先完成 MVP，再逐步增强外接盘兼容性和高级功能。