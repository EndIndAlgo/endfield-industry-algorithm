# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

明日方舟：终末地（Arknights: Endfield）的网页版基建规划工具，用于规划工厂布局、管理蓝图、生成分享链接。

**当前阶段：快速开发阶段** — 允许破坏性变更，无需考虑向后兼容。旧格式兼容代码可直接删除，数据结构可自由调整。

## 常用命令

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器 (Vite)
npm run build        # 类型检查 + 生产构建 (tsc -b && vite build)
npm run lint         # ESLint 检查
npm run preview      # 预览生产构建
```

## 技术栈

- **React 19** + **TypeScript 5.9** (strict 模式) + **Vite 7**
- **Chakra UI v3** 组件库 + **Emotion** CSS-in-JS
- **Zustand 5** 状态管理（切片模式，细粒度 selector 避免过度重渲染）
- **SCSS** 组件级样式 + **lucide-react** + @iconify/react 图标 + **classnames**
- 路径别名: `@` → `src/`

## 完整项目结构（每个文件均经过审查）

```
src/
├── main.tsx                          # 入口：StrictMode + ChakraProvider(defaultSystem) + <App/>
├── App.tsx                           # 根组件：uiView 条件路由 + 全局 Ctrl+Z/Y/S 快捷键
├── App.css                           # #root flex column 布局, .app-content flex:1
├── index.css                         # CSS 变量(--grid-size等), .gray-btn/.yellow-btn, 简中系统字体栈
├── types.ts                          # 共享类型 + 掩码常量: MASK_SOLID/LIQUID, portTypeToMask, MASK_*_MACHINE
├── types/
│   └── opencc-js.d.ts               # opencc-js 类型声明（Converter, ConverterOptions）
├── store/
│   ├── gameStore.ts                  # Zustand thin wrapper (17行)：组合6个切片创建 useGameStore
│   ├── settingsStore.ts             # 独立 persist store：language ('zh-TW'|'zh-CN'), localStorage key='settings-storage'
│   └── slices/
│       ├── types.ts                  # 6个切片接口定义 + HistorySnapshot + GameState 交集类型
│       ├── canvasSlice.ts           # zoom(默认1), pan({0,0}), gridWidth/Height(默认24), setZoom/setPan/setGridSize
│       ├── machinesSlice.ts         # machines[], mode, selectedMachineId, previewRotation, movingMachineBackup; addMachine(碰撞+连线网格双重检测)/removeMachine(级联删连线)/setMode/selectMachine/rotatePreview + pickupMachine(长按拾取) + cancelOperation(统一Escape)
│       ├── connectionSlice.ts       # connections[], isConnecting, isValidPath, availablePorts[], previewPath, lShapeMode, portType, activeStartPos, activeTailFacing, previewHeadFacing, isContinuing, continueSourceId; startConnecting/updatePreview/commitConnection/cancelConnection/toggleLShape + splitConnectionAt(从grid导入)
│       ├── selectionSlice.ts        # selectionStart/End, selectedMachineIds/selectedConnectionIds, moveAnchor, movingMachinesSnapshot/ConnectionsSnapshot, isCopying; 框选/批量移动/复制/删除
│       ├── historySlice.ts          # history: { past: HistorySnapshot[], future: HistorySnapshot[] }, takeSnapshot/undo/redo; 上限50步
│       └── blueprintSlice.ts       # uiView, blueprintListMode, currentBlueprintId/Name; loadGame/resetGame/setUiView/setBlueprintListMode/setCurrentBlueprint/startInsertBlueprint/startInsertBlueprintOnNewMap
├── config/
│   ├── machines.ts                   # MACHINES: 43 种机器 MachineConfig[] + getMachineConfig(id) 查找函数
│   ├── materials.ts                  # MATERIALS: 76 种材料 Record<string, Material>
│   ├── constants.ts                  # GRID_SIZE=40, GRID_PRESETS: 6 种网格尺寸, DEFAULT_CONTENT_PADDING, MAX_MEMBERS_DISPLAY, PORT_ARROW_ROTATION
│   ├── memberInfo.ts                 # memberInfo: 团队成员数组 [{name,avatar,message,tags,mail,...}]
│   └── zIndex.ts                     # Z_INDEX: 3段式 z-index 常量表(常态100/批量700/Ghost1300) + connZ()/machineZ()辅助函数
├── utils/
│   ├── grid/
│   │   ├── index.ts                     # barrel 文件(20行)：重新导出 grid/ 下全部函数
│   │   ├── collision.ts              # getBoundingBox, getMachineRect, isOverlapping, checkCollision, calculateContentDimensions
│   │   ├── direction.ts              # getVectorFromSide, dirFromPoints, computeHeadFacing
│   │   ├── occupancy.ts              # buildConnectionGrid, buildMergedGrid(掩码合并网格), buildExistingCornerGrid
│   │   ├── pathfinding.ts            # routeManhattan(双L形), trySingleLRoute
│   │   ├── port.ts                   # getCornerPoints, getMachinePortCheckPositions, splitConnectionAt, getPortOuterCells, getInputPortOuterCells, findPortOuterCellAt, findMachineAt, pickClosestPort
│   │   └── routeValidation.ts        # validateRouteConflicts, findRouteForMachine, findRouteToGround — updatePreview 拆分出的纯函数
│   ├── machineUtils.ts               # getRotatedDimensions, getRotatedPorts, buildPowerGrid, getMachineMask(物流掩码查表)
│   ├── portPosition.ts               # getPortStyle(机器端口定位), getGhostArrowPosition, pathToPoints/extendPoint(SVG渲染工具)
│   ├── shareUtils.ts                 # toBase64Url/fromBase64Url, encode/decode (V3二进制: 3字节ID+3字节位置), generateShareUrl, parseShareUrl, captureBlueprintScreenshot(html2canvas)
│   ├── storage.ts                    # Blueprint 接口, getBlueprints/saveBlueprint/deleteBlueprint/loadBlueprint/getLastBlueprintId/setLastBlueprintId
│   └── toaster.ts                    # createToaster({placement:'bottom-end'}) 单例
├── styles/
│   └── cssCustomProps.ts             # machinePositionStyle: CSS自定义属性 --x/--y/--w/--h 的类型安全工厂函数
├── hooks/
│   ├── useChineseConverter.ts        # 繁/简热切换：动态 import('opencc-js') + 遍历文本节点 + MutationObserver 监听增量变更 + cn→tw 回转换
│   ├── useGridEvents.ts              # 画布事件调度层(~126行)：组合 usePanZoom/useWireMode/useSelectionMode/useKeyboardShortcuts 四个子hook，按 GameMode 分发DOM事件
│   └── grid/
│       ├── usePanZoom.ts             # 平移/缩放/坐标转换：中键平移 + 滚轮缩放(锚定鼠标) + getGridPos 屏幕→网格坐标
│       ├── useWireMode.ts            # CONVEYOR/PIPE 连线模式：单击开始/提交连线 + 鼠标移动实时预览
│       ├── useSelectionMode.ts       # DEVICE_SELECT 框选 + MOVE_SELECTION/BLUEPRINT_PLACE 批量移动确认
│       └── useKeyboardShortcuts.ts   # 全局快捷键：E/Q/R/X/F/F1/M/Ctrl+C/Escape 监听 window keydown
├── __tests__/
│   ├── setup.ts                       # jsdom mock (ResizeObserver + scrollTo)
│   ├── testWrapper.tsx                # ChakraProvider 包裹器
│   ├── pureFunctions.test.ts          # 纯函数测试：碰撞检测/寻路/掩码/端口
│   ├── store.test.ts                  # Zustand store 切片测试：machines/connections/selection/history
│   ├── useChineseConverter.test.tsx   # 繁简转换 hook 测试
│   ├── Machine.test.tsx               # Machine 组件渲染测试
│   └── Toolbar.test.tsx               # Toolbar 组件渲染测试
├── components/
│   ├── Grid.tsx                      # 核心画布(~116行，纯渲染外壳)：委托useGridEvents处理输入，组合 ConnectionSVGLayer + Machine×N + GhostPreview + SelectionBox + BatchMovePreview
│   ├── Grid.scss                     # 网格背景(background-image linear-gradient)、连线/管道双线样式(outline+fill)、预影动画(@keyframes dash)、选中高亮、框选样式
│   ├── ConnectionSVGLayer.tsx         # SVG连线图层组件(React.memo)：统一渲染已确认连线+预览路径，复用 pathToPoints() 消除重复
│   ├── Machine.tsx                   # 已放置机器(~201行, React.memo + 细粒度selector)：端口渲染(输入/输出/双端口菱形)、长按500ms拾取、供电不足警告图标(@iconify uil:battery-bolt)、hover标签(机器名+操作提示)、端口碰撞检测缩容(getPortClasses: shrink-depth/shrink-length)
│   ├── Machine.scss                  # 机器容器定位(CSS --x,--y,--w,--h)、端口尺寸/方向/缩容规则(.shrink-depth/.shrink-length)、输入/输出箭头旋转方向、clickable/active状态
│   ├── GhostPreview.tsx              # BUILD模式机器放置预览(React.memo)：ghost占位 + 供电范围虚线框 + 端口方向箭头
│   ├── GhostPreview.scss             # ghost虚线边框动画(@keyframes dash)、invalid红色标记
│   ├── SelectionBox.tsx              # DEVICE_SELECT模式框选矩形(React.memo)
│   ├── BatchMovePreview.tsx          # MOVE_SELECTION/BLUEPRINT_PLACE批量移动预览(React.memo)：半透明机器虚影 + 半透明连线SVG
│   ├── Header.tsx                    # 顶部栏：logo、Chakra Select(Root)网格尺寸选择(handleValueChange: takeSnapshot+setGridSize)、保存/蓝图列表/分享/设置/关于/重置视图6个IconButton
│   ├── Header.scss                   # flex布局，center-actions右对齐，actions按钮hover效果
│   ├── Toolbar.tsx                   # 底部面板：Chakra Tabs(6分类: 核心/物流/仓储存取/基础生产/合成制造/电力) + 模式切换(BUILD/CONVEYOR/PIPE/DEVICE_SELECT) + 机器按钮列表(按分类筛选)
│   ├── Toolbar.scss                  # 固定底部居中、毛玻璃背景、机器按钮hover上浮动画(translateY(-16px))
│   ├── About.tsx                     # 关于页面：版权声明 + 成员卡片列表(作者+贡献者，含头像/标签/联系方式复制)
│   ├── BlueprintList.tsx             # 蓝图管理：新建卡片 + 蓝图网格(名称/日期/尺寸) + Chakra Drawer详情(创建日期/尺寸/标签) + 插入模式(贴到当前/新建地图放置)
│   ├── Settings.tsx                  # 设置页面：Chakra Tabs语言切换(zh-TW/zh-CN)
│   ├── ShareModal.tsx                # 分享弹窗：generateShareUrl + captureBlueprintScreenshot(requestAnimationFrame等DOM稳定) + 复制链接/下载图片
│   ├── SaveDialog.tsx                # Chakra Dialog保存命名(Enter确认)
│   ├── IconButton.tsx                # 通用IconButton：@iconify/react Icon + CSS tooltip(绝对定位+箭头伪元素)
│   ├── IconButton.scss              # 圆形36px按钮、tooltip淡入动画、::before箭头
│   ├── OperationHints.tsx            # 操作提示面板：根据mode/hasSelection/selectedMachineId动态显示快捷键组合(含鼠标图标)
│   ├── OperationHints.scss          # 绝对定位右侧居中、JetBrains Mono字体、键盘图标样式
│   ├── LoadingScreen.tsx             # 启动画面：纯 CSS 动画（黄条填充→展开→淡出），无网络依赖
│   ├── LoadingScreen.scss           # 暗底+黄色竖条展开动画(cubic-bezier)、左下角百分比+右上角loading图
│   ├── ErrorBoundary.tsx             # React 错误边界类组件：包裹所有路由页面，捕获渲染错误并显示回退 UI
│   └── ui/
│       ├── tooltip.tsx               # Chakra Tooltip封装：支持showArrow/portalled/portalRef/contentProps，disabled时直接返回children
│       └── About.scss               # .member-icon-btn hover变黄
├── assets/
│   ├── logo-header.png               # Header 用的 96px 高 logo（2x retina）
│   ├── members/                      # 团队成员头像 (eddy3721.gif, tata.png)
│   └── machines/                     # 机器图标 .webp (以machine.id命名, 如pco.webp)
├── _archive/                         # 已移除的旧资产（fonts/, items/, logo.png）
```

## 核心架构

### 组件树 & 数据流

```
main.tsx (ChakraProvider)
└─ App.tsx (uiView 路由)
    ├─ [editor]
    │   ├─ Header.tsx          → useGameStore (gridWidth/gridHeight/uiView)
    │   │   └─ ShareModal.tsx  → generateShareUrl + captureBlueprintScreenshot
    │   ├─ Grid.tsx            → useGameStore（核心画布，约10个细粒度selector）
    │   │   ├─ ConnectionSVGLayer  → useGameStore（已确认连线 + 预览路径 SVG）
    │   │   ├─ Machine.tsx ×N      → useGameStore（mode/isConnecting/availablePorts/zoom）
    │   │   ├─ GhostPreview        → useGameStore（BUILD模式放置预览+供电虚线框+端口箭头）
    │   │   ├─ SelectionBox        → useGameStore（DEVICE_SELECT框选矩形）
    │   │   └─ BatchMovePreview    → useGameStore（MOVE_SELECTION/BLUEPRINT_PLACE批量移动虚影）
    │   ├─ Toolbar.tsx         → useGameStore (mode/machines/selectedMachineId)
    │   ├─ OperationHints.tsx  → useGameStore (mode + 选区状态)
    │   └─ SaveDialog.tsx      → 纯UI，回调由App.tsx管理
    ├─ [list]     → BlueprintList.tsx  → useGameStore (startInsertBlueprint/startInsertBlueprintOnNewMap)
    ├─ [about]    → About.tsx          → useGameStore (setUiView)
    └─ [settings] → Settings.tsx       → useSettingsStore (language, setLanguage)
```

**数据流方向**: 用户交互 → 组件调用 store action → `set()` 更新状态 → React 重渲染受影响组件。
**持久化**: 仅 explicit save → `storage.ts` → localStorage，无自动保存、无云端同步。
**分享解析**: URL query param `?bp=` → `parseShareUrl()` → decode二进制 → `loadGame()` 或 `startInsertBlueprint*()`。

### 状态管理：Zustand 切片模式

`gameStore.ts` 是 thin wrapper（17 行），通过 Zustand 切片模式组合 6 个子切片：

```typescript
export const useGameStore = create<GameState>()((...a) => ({
    ...createCanvasSlice(...a),
    ...createMachinesSlice(...a),
    ...createConnectionSlice(...a),
    ...createSelectionSlice(...a),
    ...createHistorySlice(...a),
    ...createBlueprintSlice(...a),
}));
```

每个切片是一个 `StateCreator<GameState, [], [], SliceName>` 函数，**切片间可跨调用**（通过 `get()` 访问其它切片方法）。

| 切片 | 文件 | 状态字段 | 关键方法 |
|------|------|----------|----------|
| Canvas | `canvasSlice.ts` | `zoom`, `pan`, `gridWidth`, `gridHeight` | `setZoom`, `setPan`, `setGridSize` |
| Machines | `machinesSlice.ts` | `machines`, `mode`, `selectedMachineId`, `previewRotation`, `movingMachineBackup` | `addMachine`(含碰撞+连线网格双重检测), `removeMachine`(含级联删除端口连线), `setMode`/`selectMachine`/`rotatePreview`, `pickupMachine`(长按拾取), `cancelOperation`(统一Escape) |
| Connection | `connectionSlice.ts` | `connections`, `isConnecting`, `isValidPath`, `availablePorts[]`, `portType`, `activeStartPos`, `activeTailFacing`, `previewPath`, `previewHeadFacing`, `lShapeMode`, `isContinuing`, `continueSourceId`, `previewTargetIsMachine` | `startConnecting`, `updatePreview`(含多端口同格方向选择+L形三态切换+输入端口吸附+自动续接), `commitConnection`(交叉检测+桥生成+连线分割+合并衔接), `cancelConnection`, `toggleLShape`(auto→垂直→同向 三态循环) |
| Selection | `selectionSlice.ts` | `selectionStart/End`, `selectedMachineIds`/`selectedConnectionIds`, `moveAnchor`, `movingMachinesSnapshot`/`ConnectionsSnapshot`, `isCopying` | `commitBoxSelection`(shift=toggle), `deleteSelected`(含级联删连线), `startBatchMove`, `startCopySelection`, `commitBatchMove` |
| History | `historySlice.ts` | `history: { past: HistorySnapshot[], future: HistorySnapshot[] }` | `takeSnapshot`, `undo`, `redo`（上限50步，超出丢弃最旧快照） |
| Blueprint | `blueprintSlice.ts` | `uiView`, `blueprintListMode`, `currentBlueprintId/Name` | `loadGame`, `resetGame`, `setUiView`, `setBlueprintListMode`, `setCurrentBlueprint`, `startInsertBlueprint`, `startInsertBlueprintOnNewMap`(自选网格尺寸) |

**切片间交互关键路径**：
- `machinesSlice.cancelOperation()` 调用 `get().cancelConnection()` 和读取 `get().movingMachinesSnapshot`
- `selectionSlice.commitBatchMove()` / `deleteSelected()` 内部调用 `get().takeSnapshot()` 创建历史快照
- `historySlice.undo()/redo()` 调用 `get().cancelOperation()` 清理中间状态
- `blueprintSlice.startInsertBlueprint*()` 复用 `selectionSlice` 的 `moveAnchor`/`movingMachinesSnapshot`/`movingConnectionsSnapshot` 字段

### GameMode 状态机

```typescript
// src/types.ts:65-73
export const GameMode = {
  BUILD: 'BUILD',
  CONVEYOR: 'CONVEYOR',
  PIPE: 'PIPE',
  DEVICE_SELECT: 'DEVICE_SELECT',
  MOVE_SELECTION: 'MOVE_SELECTION',
  BLUEPRINT_PLACE: 'BLUEPRINT_PLACE'
} as const;
```

代码中使用 `GameMode.BUILD`（字面量常量对象）而非裸字符串。

| 模式 | 触发方式 | 鼠标操作 | 渲染差异 |
|------|----------|----------|----------|
| BUILD | R键/工具栏指针按钮 | 单击放置机器、长按500ms拾取 | 机器虚影(.machine-ghost) + 供电范围虚线框 + 端口箭头 |
| CONVEYOR | E键/工具栏传送带按钮 | 点击输出口开始、点击输入口完成 | 传送带预览SVG(虚线动画/实线)，无效时变红 |
| PIPE | Q键/工具栏管道按钮 | 点击输出口开始、点击输入口完成 | 管道预览SVG(虚线动画/实线)，无效时变红 |
| DEVICE_SELECT | X键/工具栏框选按钮 | 拖拽框选 | 蓝色选择矩形(.selection-box) + Shift反选 |
| MOVE_SELECTION | M键(有选区时)/拖拽已选中项 | 移动坐标系 | 批量半透明机器虚影 + 批量连线SVG(0.5透明度) |
| BLUEPRINT_PLACE | 蓝图插入 | 单击确认放置 | 同MOVE_SELECTION预览效果 |

`cancelOperation()` (Escape/右键) 统一处理各模式返回干净状态：
- CONVEYOR/PIPE 模式(连线中) → `cancelConnection()`；CONVEYOR/PIPE 模式(未连线) → 回到 BUILD
- 长按拾取中 → 归还机器到原位置
- DEVICE_SELECT → 清除选择框+选中的ID列表
- MOVE_SELECTION → 还原快照(isCopying=false) 或 丢弃复制(isCopying=true)
- BLUEPRINT_PLACE → 同MOVE_SELECTION逻辑

### 画布系统（基于 DOM，非 `<canvas>`）

| 层 | 实现方式 | 关键参数 |
|----|----------|----------|
| 网格线 | CSS `background-image` 双渐变 | `var(--grid-size)` = 40px, opacity 0.5 |
| 机器 | 绝对定位 `div`，CSS 自定义属性 `--x`/`--y`/`--w`/`--h` | z-index = base + mask×2 + 1 (3段: 常态100/批量700/Ghost1300) |
| 传送带连线 | SVG `<polyline>` 双线效果(outline描边+fill填充)，按 portType 分 SVG 层 | Solid=104, Liquid=108 (base=100) |
| 平移/缩放 | CSS `transform: translate(panX, panY) scale(zoom)` | zoom范围0.18~3.0 |
| 坐标转换 | `worldX = floor((screenX - panX) / (GRID_SIZE * zoom))` | GRID_SIZE硬编码为40 |

**缩放锚定鼠标位置**：缩放前后鼠标下的世界坐标保持不变，通过调整 `pan` 补偿。
**GRID_SIZE**: 40px，定义在 `constants.ts`，`main.tsx` 启动时同步到 CSS 变量 `--grid-size`。

### 寻路系统（L 形曼哈顿路由 + 掩码碰撞）

`routeManhattan()` 不是 A*，而是**双 L 形路由**算法：
1. 计算 `|dx|` 和 `|dy|`，确定主导轴（`|dx| >= |dy|` → 水平优先）
2. 尝试主导轴优先的 L 形路径（恰好 1 个转弯）
3. 若碰撞，尝试另一条 L 形（次轴优先）
4. 两者均失败则返回 null——用户需手动点击添加锚点绕过障碍

**占用网格（掩码系统）**：
- `buildMergedGrid(machines, connections, gw, gh, portType)` — 机器掩码 OR + 异类型连线掩码 OR
- 同类型连线不进入网格（可通过，交叉点放桥）
- 阻挡判断：`(grid[i] & connMask) !== 0`
- 桥冲突判断：`(bridgeMask & cellMask) !== connMask`
- 拐弯不进网格，作为独立约束在 `updatePreview`/`commitConnection` 中检查
- `routeManhattan` 和 `trySingleLRoute` 直接接受掩码参数（默认 0xFF 保持向后兼容）
- 性能：O(path length)，每次寻路需重建占用网格 O(n)

### 撤销/重做

- 快照粒度为完整 `{ machines, connections }` 浅拷贝
- `takeSnapshot()` 在 mutation 前由各切片内部调用，推入 `history.past`，清空 `history.future`
- `undo()` 先将当前状态推入 `future`，再恢复 `past.pop()`，同时调用 `cancelOperation()` 清理活跃操作
- `redo()` 对称处理
- **上限 50 步**，超出上限时自动丢弃最旧快照，防止内存无限增长

### 分享编码（V3 二进制格式）

- 自定义紧凑二进制编码：每台机器 3 字节 ID(ascii) + 1字节x + 1字节y + 1字节rotation
- 连线用 2-bit 打包方向(0=Up,1=Right,2=Down,3=Left)，1字节存4步
- base64url 编码为 URL query param `?bp=`，生成的链接极短
- `captureBlueprintScreenshot()` 使用 html2canvas 克隆 `.zoom-content` DOM 截图（先设 transform:none 再截）

### 连线创建流程（完整链路）

1. 按 E 键(CONVEYOR/传送带)或 Q 键(PIPE/管道)进入对应连线模式 → 点击机器输出端口或端口外侧格子
2. `startConnecting(ports, portType)` — 初始化连接状态，保存端口类型及可用端口列表（含 facing 信息）
3. 鼠标移动 → `updatePreview(pos)` — 实时计算到鼠标的 L 形路径，检测输入端吸附（多端口同格时按接近方向选择正确的side）；路径不合法时显示红色虚线预览
4. 可选按 R 键 → `toggleLShape()` — 在 auto / 垂直优先 / 同向 三态间切换
5. 点击目标输入端口或地面 → `commitConnection()`:
   - 从目标输入端口反推 `headFacing` 方向
   - 检测与已有同类型连线的交叉点
   - 交叉点自动放置物流桥 (`lbr` for Solid, `pbr` for Liquid)
   - 分裂被交叉的连线 (`splitConnectionAt` 工具函数，从 grid 导入，递归处理多重交叉)
   - 若新连线起点 = 已有连线终点（或反之），合并为一条长连线
   - 若点击地面（非机器输入端口），自动进入续接状态（`isContinuing`），可从终点继续拉线
6. 按 Escape/右键 → `cancelConnection()` → 回到 BUILD 模式

### 关键类型（src/types.ts）

```typescript
type MachineId = string;
type Point = { x: number; y: number }
type Direction = 0 | 1 | 2 | 3  // 上右下左（顺时针）
type Side = 'top' | 'right' | 'bottom' | 'left'
type PortType = 'Solid' | 'Liquid' | 'Gas'
type GameMode = typeof GameMode[keyof typeof GameMode]

interface MachineConfig {
  id: string;           // 3字母缩写 e.g. 'pco', 'lbr', 'ref'
  name: string;         // 中文名
  power: number;        // 耗电量(0=不耗电)
  width/height: number; // 原始尺寸(格子数)
  inputs: PortConfig[]; // 输入端口(相对坐标)
  outputs: PortConfig[];// 输出端口
  color: string;        // 背景色(rgba)
  supplyDistance: number;// 供电延伸格数(0=不供电)
}

interface PortConfig {
  x: number; y: number; // 相对机器左上角
  side: Side;           // 端口所在边
  type: PortType;       // 物流类型
  autoConnect: boolean; // 是否自动吸附物流器(桥/分流器等1x1设备)
}

interface PlacedMachine { id: MachineId; machineId: string; x: number; y: number; rotation: Direction }
interface Connection { id: string; tailFacing: Direction; path: Point[]; headFacing: Direction; portType: PortType }

// Side → Direction 映射常量
const sideToDir: Record<Side, Direction> = { top: 0, right: 1, bottom: 2, left: 3 };
```

## 机器配置完整清单

`config/machines.ts` 定义 43 种机器，`Toolbar.tsx` 的 `MACHINE_GROUPS` 按定义顺序分组展示。

| 分类 | Tab | 数量 | 机器 |
|------|-----|------|------|
| 核心 | core | 1 | pco |
| 物流 | logistics | 12 | lbr, spl, mrg, iip, pbr, psp, pmg, pip, cpe, cpx, mce, mcx |
| 仓储存取 | storage | 6 | pst, wsp, wpp, ltk, wss, wsl |
| 基础生产 | production | 9 | ref, rfl, cru, asm, mol, shv, pln, pll, wwt |
| 合成制造 | processing | 10 | cas, fil, fll, sel, grn, rea, era, tyh, pur, dis |
| 电力 | power | 5 | sup, xrs, rpt, xrr, thp |

**图标覆盖**：43 台机器中仅 24 台有 `.webp` 图标，无图标时 `<img onError>` 自动隐藏仅显示文字。

## 已解决历史问题（Sprint 1–9，2026-06-10 ~ 2026-06-13）

20 个已知问题全部修复，关键里程碑：
- **Sprint 1–2** (06-10)：性能止血 — 细粒度 selector + React.memo + useCallback + getBoundingBox 去重 + ErrorBoundary
- **Sprint 3** (06-11)：功能修复 — 43 台机器补全 / commitBatchMove 连线碰撞 / 网格越界清除 / 历史上限 50 步 / 平移约束
- **Sprint 4–5** (06-13)：类型安全 + 测试 — any 清零 / 繁→简收尾 / 5 文件 100+ 测试用例 / CI/CD
- **Sprint 6** (06-13)：架构瘦身 — Grid.tsx 拆出 ConnectionSVGLayer + useGridEvents + GhostPreview + SelectionBox + BatchMovePreview；gridUtils 拆为 5 模块
- **Sprint 7–8** (06-13)：技术债清尾 — ESLint 25→0 / framer-motion 移除 / `any` 清零
- **Sprint 9** (06-13)：项目清理 — 垃圾文件 / 许可证修正 / 文档重写 / 数据结构化

🔵 **仍搁置**：
- `commitConnection` 重构 — 逻辑仍在快速变化
- 重复材料图标 — 需游戏数据人工对照
- E2E 测试 / a11y / 移动端 / 国际化 — 不在当前范围内

---

---

## 掩码系统（2026-06-15 完成）

### 8-bit 掩码

```
Bit : 7──2   2         1         0
      │      │         │         └─ 机器实体位
      │      │         └─ Solid 层
      │      └─ Liquid 层
      └─ 普通机器 (全 1)
```

| 实体 | 掩码 | 值 |
|------|:---:|:---:|
| Solid 连线 | `0b00000010` | 2 |
| Solid 物流器 (lbr,spl,mrg,iip) | `0b00000011` | 3 |
| Liquid 连线 | `0b00000100` | 4 |
| Liquid 物流器 (其余物流) | `0b00000111` | 7 |
| 普通机器 | `0b11111111` | 255 |

### 可通过性

- `(mergedGrid[cell] & connMask) !== 0` → 阻挡
- Liquid 连线可穿过 Solid 物流器下方（`7 & 4 = 4` ≠0 → 阻挡；`3 & 4 = 0` → 可通过）

### 桥冲突检查

- `(bridgeMask & cellMask) !== connMask` → 冲突，不放桥
- lbr(3) 可放在 Liquid 线上（`3 & 4 = 0`），pbr(7) 不能放在 Solid 线上（`7 & 2 = 2 ≠ 4`）

### 核心函数

- `buildMergedGrid(machines, connections, gw, gh, portType)` — 机器掩码 OR + 异类型连线掩码 OR，同类型不进网格
- `getMachineMask(machineId)` — 硬编码 12 种物流器返回 3/7，其余返回 255
- `connZ(base, mask)` / `machineZ(base, mask)` — 渲染 z-index 计算

### 渲染分层

| 层 | 基底 | 公式 |
|------|:---:|------|
| 常态 | 100 | 连线 = 100 + mask×2，机器 = 100 + mask×2 + 1 |
| 批量移动 | 700 | 同上 |
| Ghost 放置 | 1300 | 同上 |

---

## 当前改进方向（2026-06-15 更新）

### 🔴 高优先级（影响正确性 / 可维护性的实际问题）

**✅ 1. 占用网格代码重复 ~~（3 处）~~ — 已完成 (2026-06-15)**
掩码系统 + `buildMergedGrid()` 统一三处网格构建，同时修复异类型连线阻断/拐弯漏拦/桥放异类型线上等 Bug。

**✅ 2. `useGridEvents`（248 行）承载过多职责 — 已完成 (2026-06-19)**
拆为 `usePanZoom` / `useWireMode` / `useSelectionMode` / `useKeyboardShortcuts` 四个子 hook + 调度层，`Grid.tsx` 零改动。

**3. `connectionSlice.updatePreview()`（206 行）难以独立测试 — ✅ 已完成 (2026-06-19)**
已拆分为 5 个纯函数：`pickClosestPort`(port.ts)、`buildExistingCornerGrid`(occupancy.ts)、`validateRouteConflicts`/`findRouteForMachine`/`findRouteToGround`(新建 routeValidation.ts)，updatePreview 瘦身为 50 行编排函数。

### 🟡 中优先级（质量 / 开发者体验）

**✅ 4. ~~Zustand devtools~~ — 已完成 (2026-06-19)**
`gameStore.ts` 已包裹 `devtools()` 中间件，支持 Redux DevTools 时间旅行调试。

**5. ~~`findPath()` 签名臃肿~~ — 已删除（2026-06-19）**
该函数为零调用者死代码，直接移除而非重构。

**✅ 6. ~~桶文件位置不一致~~ — 已完成 (2026-06-19)**
`utils/gridUtils.ts` 已移为 `utils/grid/index.ts`。

**✅ 7. ~~非编辑器路由未做懒加载~~ — 已完成 (2026-06-19)**
BlueprintList、About、Settings 改用 `React.lazy()` + `Suspense`，减少编辑器首屏 bundle 体积。

### 🟢 低优先级（锦上添花）

**✅ 8. ~~连线时占用网格无缓存~~ — 已完成 (2026-06-19)**
`connectionSlice.ts` 添加模块级 `_gridCache`，缓存 `mergedGrid`/`sameConnGrid`/`existingCornerGrid`，以 Zustand 数组引用相等检测命中（零成本），连线模式帧间缓存命中率接近 100%。

**✅ 9. ~~`selectionSlice.ts` eslint-disable~~ — 已完成 (2026-06-19)**
`startBatchMove` 和 `startCopySelection` 移除无用参数，删除 eslint-disable 注释。涉及文件：`selectionSlice.ts`、`types.ts`、`useKeyboardShortcuts.ts`、`store.test.ts`。

**✅ 10. ~~寻路/占用网格边界情况缺少测试~~ — 已完成 (2026-06-19)**
新增 33 个测试用例（131 total）：`trySingleLRoute`（4方向+越界+mask）、`routeManhattan`（mask+边缘）、`buildMergedGrid`/`buildConnectionGrid`/`buildExistingCornerGrid`、`validateRouteConflicts`（拐弯/桥冲突/续接豁免）、`findRouteForMachine`/`findRouteToGround`（合法路径+视觉 fallback）。

### 🔵 搁置

- **分享格式版本字节** — 当前未上线，未来会重新设计分享格式，届时一并处理。
- **撤销历史不捕获视图状态** — 设计决策：撤销只还原数据，保留用户当前视口位置。
- **历史快照不去重** — 设计决策：去重引入比较开销，50 步上限已足够防止内存问题。
- **`Gas` 端口类型** — 为游戏未来内容保留，暂不实现渲染路径。
- **`UseSelectionModeDeps` 中 `hoverPosRef` 未使用** — `useSelectionMode` 接口声明了 `hoverPosRef` 但实现仅解构 `getGridPos`，为未来扩展预留，暂不清理。
- **连线前端显示优化** — 优化 Connection 的前端显示逻辑，具体方向待进一步明确（2026-06-20 口述）。

### 建议执行顺序（按依赖关系，2026-06-19 更新）

```
Phase 1 ─ 零依赖（可并行）
  #4   Zustand devtools              5min    gameStore.ts ✅ 已完成 (2026-06-19)
  #6   桶文件归位                     5min    gridUtils.ts → grid/index.ts ✅ 已完成 (2026-06-19)

Phase 2 ─ 可开始
  #7   路由懒加载                    15min    App.tsx ✅ 已完成 (2026-06-19)
  #9   eslint-disable 清理          10min    selectionSlice.ts ✅ 已完成 (2026-06-19)

Phase 3 ─ 依赖 Phase 2
  #3   updatePreview 拆分             2h     connectionSlice.ts — 最大单函数重构 ✅ 已完成 (2026-06-19)

Phase 4 ─ 依赖 Phase 3（同文件，等模块边界划清再加缓存）
  #8   占用网格缓存                   1h     connectionSlice.ts 内部优化 ✅ 已完成 (2026-06-19)

Phase 5 ─ 依赖 Phase 3+4 代码稳定
  #10  寻路/占用网格边界测试          1h     routeManhattan + trySingleLRoute + occupancy ✅ 已完成 (2026-06-19)
```

**关键路径**：`#3 → #8 → #10` = ✅ 全部完成。

| # | 方向 | 影响范围 | 估计 | 状态 |
|---|------|----------|------|------|
| 1 | 占用网格去重 | connectionSlice + pathfinding + selectionSlice | — | ✅ 已完成 |
| 2 | useGridEvents 拆分 | hooks/ | — | ✅ 已完成 |
| 5 | findPath 死代码 | pathfinding.ts | — | ✅ 已删除 |
| 4 | Zustand devtools | gameStore.ts | 5min | ✅ 已完成 |
| 6 | 桶文件归位 | utils/grid/ | 5min | ✅ 已完成 |
| 7 | 路由懒加载 | App.tsx | 15min | ✅ 已完成 |
| 9 | eslint-disable 清理 | selectionSlice.ts | 10min | ✅ 已完成 |
| 3 | updatePreview 拆分 | connectionSlice | 2h | ✅ 已完成 |
| 8 | 占用网格缓存 | connectionSlice | 1h | ✅ 已完成 |
| 10 | 寻路边界测试 | __tests__/ | 1h | ✅ 已完成 |

---

## 当前改进方向（2026-06-19 扫描更新）

9 个新问题（`4dcba4e` 已完成 #1 和 #3 的部分）。

### 🔴 高优先级（影响性能 / 正确性）

**✅ #1 — logo 压缩 — 已完成 (2026-06-19)**
`public/logo.png` 1.5MB → 删除未使用的 `src/assets/logo.png`，新建 3 个优化文件：
- `public/favicon.png` 2.4KB（48×48，palette+压缩等级9）
- `src/assets/logo-header.png` 7.8KB（96px高，2x retina）
- `public/logo.svg` 156KB（从 git 历史恢复，LoadingScreen 使用）
- 附带修复 `index.html`：`lang="en"` → `lang="zh"`、`type="image/svg+xml"` 指向 PNG 的 MIME 矛盾
- 2026-06-19：`public/logo.png`（遗留死文件，无引用）移至 `_archive/`

**✅ #2 — NaikaiFont-Bold.woff2 17MB — 已完成 (2026-06-19)**
`public/fonts/NaikaiFont-Bold.woff2` 完整 CJK 字体，实际只用于 LoadingScreen 一句装饰文案（5 个汉字"终末地牛逼"）。
- 采用方案B：移除 `@font-face` 声明，`.sub-text` 改用系统字体栈，woff2 文件保留备用
- 改动：`src/index.css`（删 @font-face）、`src/components/LoadingScreen.scss`（改 font-family）
- 效果：首次加载免去 17MB 字体下载，LoadingScreen 文字用系统中文字体渲染
- 2026-06-19：woff2 移至 `_archive/fonts/`，dist 从 24MB → 5MB

### 🟡 中优先级（质量 / 开发者体验）

**✅ #4 — `body` 引用了从未加载的 'Inter' 字体 — 已完成 (2026-06-19)**
`src/index.css:28`：删掉 `'Inter'`，直接 `font-family: system-ui, ...`

**#5 — `connectionSlice.ts`（385 行）仍有拆分空间**
`updatePreview` 已拆出 5 个纯函数，但 `commitConnection`（交叉检测+桥生成+连线分割+合并+续接）仍是一个 100+ 行函数耦合在 store action 里。
- 修法：抽 `findCrossings` / `generateBridgeAt` / `splitAndMerge` 三个纯函数，`commitConnection` 瘦身为编排层
- 注意：CLAUDE.md 搁置区已标注"逻辑仍在快速变化"，当前继续搁置

**✅ #6 — 2 处可消除的 eslint-disable — 已完成 (2026-06-19)**
① `App.tsx` — 删除 `handleTriggerSaveRef` ref 中转，`handleTriggerSave`/`handleSaveAs` 改用 `getState()` 读取最新状态（稳定引用、空依赖）；组件减少 7 个 selector 订阅。
② `ShareModal.tsx` — 改用 key-remount 模式（弹窗打开=组件挂载），`handleGenerate` 通过 `getState()` 读取 store；保留一处 `set-state-in-effect` disable（挂载初始化数据获取是 effect 的正当用途）。
附加收益：`App.tsx:95` 初始化 effect 保留 disable 并加注释说明。

### 🟢 低优先级（锦上添花）

**✅ #7 — `assets/items/` 132 个图标 vs 76 种材料 — 已完成 (2026-06-22)**
图标已移至 `_archive/items/`（git 历史可恢复），LoadingScreen 移除预加载逻辑。

**✅ #8 — `index.html` 缺 meta 标签 — 已完成 (2026-06-19)**
已添加 `description`、`og:title/description/image/type`、`theme-color` meta 标签

**❌ #9 — `vite.config.ts` 无生产分包策略 — 不采用**
项目体积极小，完整重部署即可，分包增加复杂度无实际收益。

### 🔵 继续搁置

- `commitConnection` 重构（#5）— 逻辑仍在快速变化
- 分享格式版本字节 — 当前未上线，未来重新设计分享格式时一并处理
- 重复材料图标（#7 之外）— 需游戏数据人工对照

### 建议执行顺序（2026-06-19）

```
第一波 随手清 ✅ 已完成
  #4  删掉幽灵 'Inter'               30s  ✅
  #8  补 meta 标签                    5min  ✅

第二波 质量收尾 ✅ 已完成
  #6  消除 2 处 eslint-disable        30min  ✅

**搁置**：#5（connectionSlice 拆分，等逻辑稳定）、#7（图标清理，需游戏数据人工对照）

| # | 方向 | 影响范围 | 估计 | 状态 |
|---|------|----------|------|------|
| 1 | logo 压缩 + lang 修复 | index.html + Header + LoadingScreen | 15min | ✅ 已完成 |
| 2 | 字体子集化 | public/fonts/ | 30min | ✅ 已完成 |
| 4 | 删幽灵 Inter | index.css | 30s | ✅ 已完成 |
| 6 | eslint-disable 消除 | App.tsx + ShareModal.tsx | 30min | ✅ 已完成 |
| 7 | 多余图标清理 | assets/items/ | 20min | ✅ 已完成 |
| 8 | 补 meta 标签 | index.html | 5min | ✅ 已完成 |
| 9 | vite 分包 | vite.config.ts | 10min | ❌ 不采用 |

## 部署

- Cloudflare Pages（`public/_redirects` 配置 SPA 回退：`/* /index.html 200`）
- Docker 多阶段构建（`node:20-slim` 构建 → `nginx:stable-alpine` 运行）

## TypeScript 约束

`tsconfig.app.json` 开启严格检查：
- `noUnusedLocals` / `noUnusedParameters` — 未使用变量编译报错
- `erasableSyntaxOnly` — 不允许运行时语义的 TS 语法（如 enum、namespace）
- `verbatimModuleSyntax` — import 必须保留原样（与 ES 模块兼容）
- `noUncheckedSideEffectImports` — 导入必须有副作用或类型导入标记
- `noFallthroughCasesInSwitch` — switch 不能穿透

## 编码约定

- **语言**：代码注释、UI 文案、变量命名统一使用**简体中文**。当前代码中存在大量繁体中文，是因为前作者为台湾人——新增代码和修改到的周边代码应顺便改为简体中文。
- **机器 ID**：3 字母缩写（pco, lbr, ref...）
- **颜色**：优先使用 CSS 变量（`var(--gray-light)` 等），避免硬编码 hex
- **样式**：SCSS 嵌套语法，不另建 CSS module
- **类名拼接**：`classNames()` 辅助动态类名
- **撤销支持**：store 中 mutation 前调 `get().takeSnapshot()`
- **非组件取 store**：`useGameStore.getState()` 用于事件回调、非组件函数等 React 上下文之外的场景
- **import 顺序**：React → 第三方库 → 项目内部（`@/` 别名）
- **Commit 粒度**：一个 commit = 一个可独立理解的变化，git log --oneline 能一眼看懂，git show 能 30 秒审完。多文件同一概念可合为一个，无关改动拆开。**同类小改进（如多个待办清单项的清理）合为一个 commit**，方便查找回顾。不用 "WIP" 类中间态 commit，push 前 rebase squash。
