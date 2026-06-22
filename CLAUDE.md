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
├── types.ts                          # 共享类型：PlacedMachine/Connection/PortConfig + ModeState 判别联合 + 掩码常量(MASK_SOLID/LIQUID + portTypeToMask + MASK_*_LOGISTICS/REGULAR_MACHINE)
├── types/
│   └── opencc-js.d.ts               # opencc-js 类型声明（Converter, ConverterOptions）
├── store/
│   ├── gameStore.ts                  # Zustand thin wrapper (21行)：组合 7 个切片 + devtools 中间件
│   ├── settingsStore.ts             # 独立 persist store：language ('zh-TW'|'zh-CN'), localStorage key='settings-storage'
│   ├── selectors.ts                  # 类型窄化 selector (134行)：selectIsBuildMode/selectPlacing/selectSelectedMachineId/selectIsConnecting/selectHasSelection 等 25+ 个，含稳定空数组引用 EMPTY_ARRAY
│   └── slices/
│       ├── types.ts                  # 7 个切片接口定义 + HistorySnapshot + GameState 交集类型
│       ├── canvasSlice.ts           # zoom(默认1), pan({0,0}), gridWidth/Height(默认24), hoverPosFrac(鼠标分数坐标); setZoom/setPan/setGridSize(含越界清理)/setHoverPosFrac
│       ├── modeSlice.ts             # modeState(ModeState 判别联合), setMode(BUILD/WIRE_SOLID/WIRE_LIQUID/DEVICE_SELECT), cancelOperation(统一 Escape：按 variant 分发→cancelConnection/还原拾取/清除选区/还原快照)
│       ├── machinesSlice.ts         # machines[]; selectMachine(切换到 BUILD placing)/rotatePreview/addMachine(碰撞+连线网格双重检测,支持连续放置)/removeMachine(级联删连线)/pickupMachine(长按拾取→BUILD placing+backup)
│       ├── connectionSlice.ts       # connections[]; startConnecting/updatePreview(含多端口同格方向选择+L形三态切换+输入端口吸附+自动续接)/commitConnection(交叉检测+桥生成+连线分割+合并衔接)/cancelConnection/toggleLShape(auto→垂直→同向 三态循环); + 模块级 _gridCache 缓存
│       ├── selectionSlice.ts        # setBoxSelection/commitBoxSelection(shift=toggle)/clearSelection/deleteSelected(含级联删连线)/startBatchMove(过渡到 MOVE_SELECTION)/startCopySelection/commitBatchMove(碰撞+桥生成+连线分割)
│       ├── historySlice.ts          # history: { past: HistorySnapshot[], future: HistorySnapshot[] }, takeSnapshot/undo/redo; 上限50步
│       └── blueprintSlice.ts       # uiView, blueprintListMode, currentBlueprintId/Name; loadGame/resetGame/setUiView/setBlueprintListMode/setCurrentBlueprint/startInsertBlueprint/startInsertBlueprintOnNewMap(自选网格尺寸)
├── config/
│   ├── machines.ts                   # MACHINES: 43 种机器 MachineConfig[] + getMachineConfig(id) 查找函数
│   ├── materials.ts                  # MATERIALS: 76 种材料 Record<string, Material>
│   ├── constants.ts                  # GRID_SIZE=40, GRID_PRESETS: 6 种网格尺寸, DEFAULT_CONTENT_PADDING, MAX_MEMBERS_DISPLAY, PORT_ARROW_ROTATION
│   ├── memberInfo.ts                 # memberInfo: 团队成员数组 [{name,avatar,message,tags,mail,...}]
│   └── zIndex.ts                     # Z_INDEX: 3段式 z-index 常量表(常态100/批量700/Ghost1300) + connZ()/machineZ()辅助函数
├── utils/
│   ├── grid/
│   │   ├── index.ts                     # barrel 文件(20行)：重新导出 grid/ 下全部函数 + 类型
│   │   ├── collision.ts              # getBoundingBox, checkPlacementCollision, calculateContentDimensions
│   │   ├── direction.ts              # getVectorFromSide, dirFromPoints, computeHeadFacing
│   │   ├── occupancy.ts              # buildConnectionGrid, buildMergedGrid(掩码合并网格), buildExistingCornerGrid
│   │   ├── pathfinding.ts            # routeManhattan(双L形), trySingleLRoute
│   │   ├── port.ts                   # getCornerPoints, getMachinePortCheckPositions, splitConnectionAt, getPortOuterCells, getInputPortOuterCells, findPortOuterCellAt, findMachineAt, pickClosestPort
│   │   └── routeValidation.ts        # validateRouteConflicts, findRouteForMachine, findRouteToGround, checkStartOverlap — updatePreview/commitConnection 拆出的纯函数
│   ├── machineUtils.ts               # getRotatedDimensions, getRotatedPorts, buildPowerGrid, getMachineMask(物流掩码查表), getMachineCellMask
│   ├── portPosition.ts               # getPortStyle(机器端口定位), getGhostArrowPosition, pathToPoints/extendPoint(SVG渲染工具)
│   ├── shareUtils.ts                 # toBase64Url/fromBase64Url, encode/decode (V3二进制: 3字节ID+3字节位置), generateShareUrl, parseShareUrl, captureBlueprintScreenshot(html2canvas)
│   ├── storage.ts                    # Blueprint 接口, getBlueprints/saveBlueprint/deleteBlueprint/loadBlueprint/getLastBlueprintId/setLastBlueprintId
│   └── toaster.ts                    # createToaster({placement:'bottom-end'}) 单例
├── styles/
│   └── cssCustomProps.ts             # machinePositionStyle: CSS自定义属性 --x/--y/--w/--h 的类型安全工厂函数
├── hooks/
│   ├── useChineseConverter.ts        # 繁/简热切换：动态 import('opencc-js') + 遍历文本节点 + MutationObserver 监听增量变更 + cn→tw 回转换
│   ├── useGridEvents.ts              # 画布事件调度层(130行)：组合 usePanZoom/useWireMode/useSelectionMode/useKeyboardShortcuts 四个子hook，按 ModeState.kind 分发DOM事件
│   └── grid/
│       ├── usePanZoom.ts             # 平移/缩放/坐标转换：中键平移 + 滚轮缩放(锚定鼠标) + getGridPos 屏幕→网格坐标
│       ├── useWireMode.ts            # WIRE 模式连线：单击开始/提交连线 + 鼠标移动实时预览
│       ├── useSelectionMode.ts       # DEVICE_SELECT 框选 + MOVE_SELECTION 批量移动确认
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
│   ├── Grid.tsx                      # 核心画布(纯渲染外壳)：委托useGridEvents处理输入，组合 ConnectionSVGLayer + Machine×N + GhostPreview + SelectionBox + BatchMovePreview
│   ├── Grid.scss                     # 网格背景(background-image linear-gradient)、连线/管道双线样式(outline+fill)、预影动画(@keyframes dash)、选中高亮、框选样式
│   ├── ConnectionSVGLayer.tsx         # SVG连线图层组件(React.memo)：统一渲染已确认连线+预览路径，复用 pathToPoints() 消除重复
│   ├── Machine.tsx                   # 已放置机器(React.memo + 细粒度selector)：端口渲染(输入/输出/双端口菱形)、长按500ms拾取、供电不足警告图标(@iconify uil:battery-bolt)、hover标签(机器名+操作提示)、端口碰撞检测缩容(getPortClasses: shrink-depth/shrink-length)
│   ├── Machine.scss                  # 机器容器定位(CSS --x,--y,--w,--h)、端口尺寸/方向/缩容规则(.shrink-depth/.shrink-length)、输入/输出箭头旋转方向、clickable/active状态
│   ├── GhostPreview.tsx              # BUILD 模式机器放置预览(React.memo)：ghost占位 + 供电范围虚线框 + 端口方向箭头
│   ├── GhostPreview.scss             # ghost虚线边框动画(@keyframes dash)、invalid红色标记
│   ├── SelectionBox.tsx              # DEVICE_SELECT 模式框选矩形(React.memo)
│   ├── BatchMovePreview.tsx          # MOVE_SELECTION 批量移动预览(React.memo)：半透明机器虚影 + 半透明连线SVG
│   ├── Header.tsx                    # 顶部栏：logo、Chakra Select(Root)网格尺寸选择(handleValueChange: takeSnapshot+setGridSize)、保存/蓝图列表/分享/设置/关于/重置视图6个IconButton
│   ├── Header.scss                   # flex布局，center-actions右对齐，actions按钮hover效果
│   ├── Toolbar.tsx                   # 底部面板：Chakra Tabs(6分类: 核心/物流/仓储存取/基础生产/合成制造/电力) + 模式切换按钮(BUILD/WIRE_SOLID/WIRE_LIQUID/DEVICE_SELECT) + 机器按钮列表(按分类筛选)；使用 selectors.ts 的窄 selector
│   ├── Toolbar.scss                  # 固定底部居中、毛玻璃背景、机器按钮hover上浮动画(translateY(-16px))
│   ├── About.tsx                     # 关于页面：版权声明 + 成员卡片列表(作者+贡献者，含头像/标签/联系方式复制)
│   ├── BlueprintList.tsx             # 蓝图管理：新建卡片 + 蓝图网格(名称/日期/尺寸) + Chakra Drawer详情(创建日期/尺寸/标签) + 插入模式(贴到当前/新建地图放置)
│   ├── Settings.tsx                  # 设置页面：Chakra Tabs语言切换(zh-TW/zh-CN)
│   ├── ShareModal.tsx                # 分享弹窗：generateShareUrl + captureBlueprintScreenshot(requestAnimationFrame等DOM稳定) + 复制链接/下载图片
│   ├── SaveDialog.tsx                # Chakra Dialog保存命名(Enter确认)
│   ├── IconButton.tsx                # 通用IconButton：@iconify/react Icon + CSS tooltip(绝对定位+箭头伪元素)
│   ├── IconButton.scss              # 圆形36px按钮、tooltip淡入动画、::before箭头
│   ├── OperationHints.tsx            # 操作提示面板：根据 modeState+hasSelection 动态显示快捷键组合(含鼠标图标)
│   ├── OperationHints.scss          # 绝对定位右侧居中、JetBrains Mono字体、键盘图标样式
│   ├── LoadingScreen.tsx             # 启动画面：纯 CSS 三阶段动画（fill 进度条 0→100% rAF 200ms → expand 展开 250ms → fade 淡出 200ms），无网络依赖
│   ├── LoadingScreen.scss           # 暗底+黄色竖条展开动画(cubic-bezier)、左下角百分比+右上角logo(logo.svg)+"终末地牛逼"
│   ├── ErrorBoundary.tsx             # React 错误边界类组件：包裹所有路由页面，捕获渲染错误并显示回退 UI
│   └── ui/
│       ├── tooltip.tsx               # Chakra Tooltip封装：支持showArrow/portalled/portalRef/contentProps，disabled时直接返回children
│       └── About.scss               # .member-icon-btn hover变黄
├── assets/
│   ├── logo-header.png               # Header 用的 96px 高 logo（2x retina）
│   ├── loading.png                   # 368KB（未使用，待清理）
│   ├── members/                      # 团队成员头像 (eddy3721.gif, tata.png)
│   └── machines/                     # 机器图标 .webp (以machine.id命名, 如pco.webp)
├── _archive/                         # 已移除的旧资产（fonts/NaikaiFont-Bold.woff2, items/132张.webp, logo.png）
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
    │   │   ├─ Machine.tsx ×N      → useGameStore（通过 selectors.ts 的窄 selector 读取 modeState 子状态）
    │   │   ├─ GhostPreview        → useGameStore（BUILD 模式放置预览+供电虚线框+端口箭头）
    │   │   ├─ SelectionBox        → useGameStore（DEVICE_SELECT 框选矩形）
    │   │   └─ BatchMovePreview    → useGameStore（MOVE_SELECTION 批量移动虚影）
    │   ├─ Toolbar.tsx         → useGameStore (selectIsBuildMode/selectIsDeviceSelectMode/selectSelectedMachineId 等 selector + inline WIRE 模式判断 + selectMachine/setMode actions)
    │   ├─ OperationHints.tsx  → useGameStore (modeState + 选区状态)
    │   └─ SaveDialog.tsx      → 纯UI，回调由App.tsx管理
    ├─ [list]     → BlueprintList.tsx  → useGameStore (startInsertBlueprint/startInsertBlueprintOnNewMap)
    ├─ [about]    → About.tsx          → useGameStore (setUiView)
    └─ [settings] → Settings.tsx       → useSettingsStore (language, setLanguage)
```

**数据流方向**: 用户交互 → 组件调用 store action → `set()` 更新状态 → React 重渲染受影响组件。
**持久化**: 仅 explicit save → `storage.ts` → localStorage，无自动保存、无云端同步。
**分享解析**: URL query param `?bp=` → `parseShareUrl()` → decode二进制 → `loadGame()` 或 `startInsertBlueprint*()`。

### 状态管理：Zustand 切片模式

`gameStore.ts` 是 thin wrapper（21 行），通过 Zustand 切片模式组合 7 个子切片：

```typescript
export const useGameStore = create<GameState>()(devtools((...a) => ({
    ...createCanvasSlice(...a),
    ...createModeSlice(...a),
    ...createMachinesSlice(...a),
    ...createConnectionSlice(...a),
    ...createSelectionSlice(...a),
    ...createHistorySlice(...a),
    ...createBlueprintSlice(...a),
}), { name: 'EndfieldGame' }));
```

每个切片是一个 `StateCreator<GameState, [], [], SliceName>` 函数，**切片间可跨调用**（通过 `get()` 访问其它切片方法）。

| 切片 | 文件 | 状态字段 | 关键方法 |
|------|------|----------|----------|
| Canvas | `canvasSlice.ts` | `zoom`, `pan`, `gridWidth`, `gridHeight`, `hoverPosFrac` | `setZoom`, `setPan`, `setGridSize`(含越界机器/连线清理), `setHoverPosFrac` |
| Mode | `modeSlice.ts` | `modeState: ModeState`(判别联合) | `setMode(BUILD\|WIRE_SOLID\|WIRE_LIQUID\|DEVICE_SELECT)`, `cancelOperation`(统一Escape：按 variant 分发→cancelConnection/还原拾取机器/清除选区/还原或丢弃移动快照) |
| Machines | `machinesSlice.ts` | `machines[]` | `selectMachine`(切换到 BUILD placing + 还原拾取中的机器), `rotatePreview`, `addMachine`(碰撞+连线网格双重检测,支持连续放置,保留拾取时的UUID), `removeMachine`(级联删除端口连线), `pickupMachine`(长按→移出 machines[] + BUILD placing + backup) |
| Connection | `connectionSlice.ts` | `connections[]` | `startConnecting`, `updatePreview`(含多端口同格方向选择+L形三态切换+输入端口吸附+自动续接;模块级 _gridCache 以引用相等检测命中), `commitConnection`(交叉检测+桥生成+连线分割+合并衔接), `cancelConnection`, `toggleLShape`(auto→垂直→同向 三态循环) |
| Selection | `selectionSlice.ts` | （无顶层字段，全部内嵌于 modeState） | `setBoxSelection`, `commitBoxSelection`(shift=toggle), `clearSelection`, `deleteSelected`(含级联删连线), `startBatchMove`(→MOVE_SELECTION), `startCopySelection`(→MOVE_SELECTION+isCopying), `commitBatchMove`(碰撞检测+桥生成+连线分割) |
| History | `historySlice.ts` | `history: { past: HistorySnapshot[], future: HistorySnapshot[] }` | `takeSnapshot`, `undo`, `redo`（上限50步，超出丢弃最旧快照） |
| Blueprint | `blueprintSlice.ts` | `uiView`, `blueprintListMode`, `currentBlueprintId/Name` | `loadGame`, `resetGame`, `setUiView`, `setBlueprintListMode`, `setCurrentBlueprint`, `startInsertBlueprint`, `startInsertBlueprintOnNewMap`(自选网格尺寸) |

**切片间交互关键路径**：
- `modeSlice.cancelOperation()` 按 `modeState.kind` 分发：BUILD→还原拾取机器/清空placing；WIRE→`get().cancelConnection()` 或退回 BUILD；DEVICE_SELECT→清空选区并回 BUILD；MOVE_SELECTION→还原/丢弃移动快照
- `machinesSlice.selectMachine()` / `rotatePreview()` / `pickupMachine()` 直接读写 `modeState.placing`
- `selectionSlice.commitBatchMove()` / `deleteSelected()` 内部调用 `get().takeSnapshot()` 创建历史快照
- `historySlice.undo()/redo()` 调用 `get().cancelOperation()` 清理中间状态
- `blueprintSlice.startInsertBlueprint*()` 直接设置 `modeState` 为 MOVE_SELECTION variant

### ModeState 判别联合

`modeState` 是单一状态字段，通过判别联合的 `kind` 属性区分当前模式。CONVEYOR 和 PIPE 合并为 WIRE（用 `portType` 区分子类型），BLUEPRINT_PLACE 合并为 MOVE_SELECTION（用 `isCopying` 区分子类型）。

```typescript
// src/types.ts:83-122
export type ModeState =
  // BUILD：placing 判 null 区分 idle/placing/pickup
  | {
      kind: 'BUILD';
      placing: {
        selectedMachineId: string;
        previewRotation: Direction;
        buildOffset: Point;          // 放置偏移（工具栏选机=中心，拾取=鼠标在机器内的精确位置）
        movingMachineBackup: PlacedMachine | null;  // null=工具栏选的，object=从画布拾取的
      } | null;                       // null=空闲
    }

  // WIRE：CONVEYOR+PIPE 合并，portType 区分物流类型
  | {
      kind: 'WIRE';
      portType: 'Solid' | 'Liquid';  // Solid=传送带(E键), Liquid=管道(Q键)
      connecting: ConnectingFields | null;  // null=空闲, object=连线中
    }

  // DEVICE_SELECT
  | {
      kind: 'DEVICE_SELECT';
      selectionStart: Point | null;   // null=空闲, object=拖拽中
      selectionEnd: Point | null;
      selectedMachineIds: string[];
      selectedConnectionIds: string[];
    }

  // MOVE_SELECTION：M键移动+Ctrl+C复制+蓝图插入合并
  | {
      kind: 'MOVE_SELECTION';
      moveAnchor: Point;
      movingMachinesSnapshot: PlacedMachine[];
      movingConnectionsSnapshot: Connection[];
      isCopying: boolean;             // false=移动, true=复制/蓝图插入
      originSelectedMachineIds: string[];
      originSelectedConnectionIds: string[];
    };
```

| variant | 触发方式 | 鼠标操作 | 渲染差异 |
|------|----------|----------|----------|
| BUILD(placing=null) | R键/工具栏指针按钮 | 空闲，等待选机 | — |
| BUILD(placing≠null) | 点击工具栏机器/长按拾取 | 单击放置机器、移动鼠标预览 | 机器虚影(.machine-ghost) + 供电范围虚线框 + 端口箭头 |
| WIRE(portType='Solid') | E键/工具栏传送带按钮 | 点击输出口开始、点击输入口/地面完成 | 传送带预览SVG(虚线动画/实线)，无效时变红 |
| WIRE(portType='Liquid') | Q键/工具栏管道按钮 | 点击输出口开始、点击输入口/地面完成 | 管道预览SVG(虚线动画/实线)，无效时变红 |
| DEVICE_SELECT | X键/工具栏框选按钮 | 拖拽框选 | 蓝色选择矩形(.selection-box) + Shift反选 |
| MOVE_SELECTION | M键(有选区时)/拖拽已选中项/Ctrl+C/蓝图插入 | 移动坐标系→单击放置 | 批量半透明机器虚影 + 批量连线SVG |

`cancelOperation()` (Escape/右键) 统一处理各模式返回干净状态（实现在 `modeSlice.ts`）：
- BUILD(placing≠null, backup≠null) → 归还机器到 `machines[]`，回到 BUILD(idle)
- BUILD(placing≠null, backup=null) → 清空选机，回到 BUILD(idle)
- WIRE(connecting≠null) → `cancelConnection()`，回到 WIRE(idle)
- WIRE(connecting=null) → 回到 BUILD(idle)
- DEVICE_SELECT → 回到 BUILD(idle)
- MOVE_SELECTION(isCopying=true) → 丢弃复制/蓝图，回到 DEVICE_SELECT(空选区)
- MOVE_SELECTION(isCopying=false) → 还原 `machines[]`/`connections[]` + 原选区，回到 DEVICE_SELECT

### Selector 层 (selectors.ts)

`src/store/selectors.ts` (134 行) 提供类型窄化的 Zustand selector，从 `modeState` 判别联合中安全提取子状态：

```typescript
// 模式判别
selectIsBuildMode(s)           // s.modeState.kind === 'BUILD'
selectIsWireMode(s)            // s.modeState.kind === 'WIRE'
selectIsDeviceSelectMode(s)    // s.modeState.kind === 'DEVICE_SELECT'
selectIsMoveSelectionMode(s)   // s.modeState.kind === 'MOVE_SELECTION'

// BUILD 子状态
selectPlacing(s)               // modeState.placing (窄类型)
selectIsPlacing(s)             // placing !== null
selectSelectedMachineId(s)     // placing.selectedMachineId
selectPreviewRotation(s)       // placing.previewRotation
selectBuildOffset(s)           // placing.buildOffset
selectIsPickup(s)              // placing?.movingMachineBackup !== null

// WIRE 子状态
selectWirePortType(s)          // modeState.portType
selectIsConnecting(s)          // connecting !== null
selectConnecting(s)            // modeState.connecting (窄类型)
selectAvailablePorts(s)        // connecting.availablePorts
selectLShapeMode(s)            // connecting.lShapeMode
selectIsContinuing(s)          // connecting.isContinuing

// DEVICE_SELECT / MOVE_SELECTION 子状态
selectSelectionStart/End(s)    // modeState.selectionStart/End
selectSelectedMachineIds(s)    // DEVICE_SELECT/MOVE_SELECTION 下分别取
selectHasSelection(s)          // 直接读 modeState 避免创建中间数组
selectMoveAnchor(s)            // modeState.moveAnchor
selectMovingMachinesSnapshot(s)
selectMovingConnectionsSnapshot(s)
selectIsCopying(s)             // modeState.isCopying
```

`EMPTY_ARRAY` 常量提供稳定的空数组引用，避免 selector 每次返回新 `[]` 导致 Zustand 误判状态变更。

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

1. 按 E 键(WIRE_SOLID/传送带)或 Q 键(WIRE_LIQUID/管道)进入 WIRE 模式 → 点击机器输出端口或端口外侧格子
2. `startConnecting(ports, portType)` — 初始化连接状态，保存端口类型及可用端口列表（含 facing 信息），`modeState` 进入 WIRE(connecting≠null)
3. 鼠标移动 → `updatePreview(pos)` — 实时计算到鼠标的 L 形路径，检测输入端吸附（多端口同格时按接近方向选择正确的side）；路径不合法时显示红色虚线预览
4. 可选按 R 键 → `toggleLShape()` — 在 auto / 垂直优先 / 同向 三态间切换
5. 点击目标输入端口或地面 → `commitConnection()`:
   - 从目标输入端口反推 `headFacing` 方向
   - 检测与已有同类型连线的交叉点
   - 交叉点自动放置物流桥 (`lbr` for Solid, `pbr` for Liquid)
   - 分裂被交叉的连线 (`splitConnectionAt` 工具函数，递归处理多重交叉)
   - 若新连线起点 = 已有连线终点（或反之），合并为一条长连线
   - 若点击地面（非机器输入端口），自动进入续接状态（`isContinuing`），可从终点继续拉线
6. 按 Escape/右键 → `cancelConnection()` → 回到 WIRE(idle)；再按 Escape → 回到 BUILD

### 关键类型（src/types.ts）

```typescript
type MachineId = string;
type Point = { x: number; y: number }
type Direction = 0 | 1 | 2 | 3  // 上右下左（顺时针）
type Side = 'top' | 'right' | 'bottom' | 'left'
type PortType = 'Solid' | 'Liquid' | 'Gas'

interface MachineConfig {
  id: string;           // 3字母缩写 e.g. 'pco', 'lbr', 'ref'
  name: string;         // 中文名
  power: number;        // 耗电量(0=不耗电)
  width/height: number; // 原始尺寸(格子数)
  inputs: PortConfig[]; // 输入端口(相对坐标)
  outputs: PortConfig[];// 输出端口
  color: string;        // 背景色(rgba)
  supplyDistance: number;// 供电延伸格数(0=不供电)
  mask: MachineMask;     // 每格掩码 (number=全同, number[][]=差异)
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

## 已解决历史问题（Sprint 1–9，2026-06-10 ~ 2026-06-22）

20+ 个已知问题全部修复，关键里程碑：
- **Sprint 1–2** (06-10)：性能止血 — 细粒度 selector + React.memo + useCallback + getBoundingBox 去重 + ErrorBoundary
- **Sprint 3** (06-11)：功能修复 — 43 台机器补全 / commitBatchMove 连线碰撞 / 网格越界清除 / 历史上限 50 步 / 平移约束
- **Sprint 4–5** (06-13)：类型安全 + 测试 — any 清零 / 繁→简收尾 / 5 文件 100+ 测试用例 / CI/CD
- **Sprint 6** (06-13)：架构瘦身 — Grid.tsx 拆出 ConnectionSVGLayer + useGridEvents + GhostPreview + SelectionBox + BatchMovePreview；gridUtils 拆为 5 模块
- **Sprint 7–8** (06-13)：技术债清尾 — ESLint 25→0 / framer-motion 移除 / `any` 清零
- **Sprint 9** (06-13)：项目清理 — 垃圾文件 / 许可证修正 / 文档重写 / 数据结构化
- **Sprint 10** (06-19)：占用网格重构 — 掩码系统 + buildMergedGrid 统一三处网格构建；useGridEvents 拆为 4 子hook；updatePreview 拆为 5 纯函数；路由懒加载；Zustand devtools；占用网格缓存；寻路边界测试(131 total)
- **Sprint 11** (06-19)：资产瘦身 — logo 压缩(1.5MB→10KB) / 17MB 字体移除 / 幽灵 Inter 删除 / eslint-disable 消除(2处) / meta 标签补全
- **Sprint 12** (06-19→06-22)：GameMode → ModeState 判别联合重构 — 5 个 commit(c1443a3→f59961a)：扁平字符串替换为带子状态的判别联合，CONVEYOR+PIPE→WIRE，BLUEPRINT_PLACE→MOVE_SELECTION，新增 modeSlice + selectors.ts；`_archive/items/` 132张死图归档 + opencc-js 延迟加载 + LoadingScreen 瘦身

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
- `getMachineCellMask(machineId, localX, localY)` — 逐格掩码查询（支持差异模式 `number[][]`）

### 渲染分层

| 层 | 基底 | 公式 |
|------|:---:|------|
| 常态 | 100 | 连线 = 100 + mask×2，机器 = 100 + mask×2 + 1 |
| 批量移动 | 700 | 同上 |
| Ghost 放置 | 1300 | 同上 |

---

## 当前改进方向（2026-06-22 更新）

### 🔵 搁置

- **`commitConnection` 重构** — 当前耦合在 store action 内（交叉检测+桥生成+连线分割+合并约 230 行），等待 ModeState 重构稳定后再拆为纯函数
- **`selectionSlice.commitBatchMove` 重构** — 约 245 行，交叉检测+桥生成+连线分割全交织在 store action 中，与 `commitConnection` 逻辑高度重复，应提取为共享纯函数
- **分享格式版本字节** — 当前未上线，未来重新设计分享格式时一并处理
- **撤销历史不捕获视图状态** — 设计决策：撤销只还原数据，保留用户当前视口位置
- **历史快照不去重** — 设计决策：去重引入比较开销，50 步上限已足够防止内存问题
- **`Gas` 端口类型** — 为游戏未来内容保留，暂不实现渲染路径
- **连线前端显示优化** — 优化 Connection 的前端显示逻辑，具体方向待进一步明确（2026-06-20 口述）
- **重复材料图标** — 需游戏数据人工对照
- **E2E 测试 / a11y / 移动端 / 国际化** — 不在当前范围内
### 🟢 低优先级（锦上添花）

- `src/assets/loading.png` 368KB 无引用，待确认后移至 `_archive/`
- `connectionSlice.ts` 402 行（`commitConnection` 内部 230 行），仍可拆为纯函数，等逻辑稳定后处理
- `Header.tsx:20` `useGameStore()` 无 selector 解构 → 订阅整个 store，应改用单独 `useGameStore(s => s.xxx)` 调用
- `BatchMovePreview.tsx:54` 冗余守卫 — `show` 已判 `kind === 'MOVE_SELECTION'`，第 54 行再判一次
- `selectors.ts:51` `selectIsPickup` 用 `?.movingMachineBackup !== undefined` 代理 `placing !== null` 检查，语义不直观
- `BlueprintList.tsx:63` `zIndex="2000"` 硬编码绕过 `zIndex.ts` 常量系统
- `machineUtils.ts` `getMachineMask`/`getMachineCellMask` 每次 `MACHINES.find()` O(n)，应预建 `Map`
- `IconButton.scss:29` `.icon-svg { transform: scale(3); }` CSS 缩放导致低分辨率，应改用原生尺寸
- `Header.tsx:16-17` import 语句在组件函数体下方，应移到文件顶部

---

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
