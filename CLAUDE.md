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
├── index.css                         # @font-face NaikaiFont-Bold, CSS 变量(--grid-size等), .gray-btn/.yellow-btn, 简中字体回退
├── types.ts                          # 共享类型：Point, Direction(0|1|2|3), Side, PortType, MachineConfig, PlacedMachine, Connection, GameMode, sideToDir 常量
├── types/
│   └── opencc-js.d.ts               # opencc-js 类型声明（Converter, ConverterOptions）
├── store/
│   ├── gameStore.ts                  # Zustand thin wrapper (17行)：组合6个切片创建 useGameStore
│   ├── settingsStore.ts             # 独立 persist store：language ('zh-TW'|'zh-CN'), localStorage key='settings-storage'
│   └── slices/
│       ├── types.ts                  # 6个切片接口定义 + HistorySnapshot + GameState 交集类型
│       ├── canvasSlice.ts           # zoom(默认1), pan({0,0}), gridWidth/Height(默认24), setZoom/setPan/setGridSize
│       ├── machinesSlice.ts         # machines[], mode, selectedMachineId, previewRotation, movingMachineBackup; addMachine(碰撞+连线网格双重检测)/removeMachine(级联删连线)/setMode/selectMachine/rotatePreview + pickupMachine(长按拾取) + cancelOperation(统一Escape)
│       ├── connectionSlice.ts       # connections[], isConnecting, isValidPath, availablePorts[], previewPath, lShapeMode, portType, activeStartPos, activeTailFacing, previewHeadFacing, isContinuing, continueSourceId; startConnecting/updatePreview/commitConnection/cancelConnection/toggleLShape + splitConnectionAt(从gridUtils导入)
│       ├── selectionSlice.ts        # selectionStart/End, selectedMachineIds/selectedConnectionIds, moveAnchor, movingMachinesSnapshot/ConnectionsSnapshot, isCopying; 框选/批量移动/复制/删除
│       ├── historySlice.ts          # history: { past: HistorySnapshot[], future: HistorySnapshot[] }, takeSnapshot/undo/redo; 上限50步
│       └── blueprintSlice.ts       # uiView, blueprintListMode, currentBlueprintId/Name; loadGame/resetGame/setUiView/setBlueprintListMode/setCurrentBlueprint/startInsertBlueprint/startInsertBlueprintOnNewMap
├── config/
│   ├── machines.ts                   # MACHINES: 43 种机器 MachineConfig[] + getMachineConfig(id) 查找函数
│   ├── materials.ts                  # MATERIALS: 76 种材料 Record<string, Material>
│   ├── constants.ts                  # GRID_SIZE=40, GRID_PRESETS: 6 种网格尺寸, DEFAULT_CONTENT_PADDING, MAX_MEMBERS_DISPLAY, PORT_ARROW_ROTATION
│   └── memberInfo.ts                 # memberInfo: 团队成员数组 [{name,avatar,message,tags,mail,...}]
├── utils/
│   ├── gridUtils.ts                  # barrel 文件(15行)：重新导出 grid/ 下全部函数
│   ├── grid/
│   │   ├── collision.ts              # getBoundingBox, getMachineRect, isOverlapping, checkCollision, calculateContentDimensions
│   │   ├── direction.ts              # getVectorFromSide, dirFromPoints, computeHeadFacing
│   │   ├── occupancy.ts              # buildOccupancyGrid, buildConnectionGrid
│   │   ├── pathfinding.ts            # routeManhattan(双L形), findPath, trySingleLRoute
│   │   └── port.ts                   # getCornerPoints, getMachinePortCheckPositions, splitConnectionAt, getPortOuterCells, findPortOuterCellAt, findMachineAt
│   ├── machineUtils.ts               # getRotatedDimensions, getRotatedPorts, buildPowerGrid, isMachinePowered
│   ├── shareUtils.ts                 # toBase64Url/fromBase64Url, encode/decode (V3二进制: 3字节ID+3字节位置), generateShareUrl, parseShareUrl, captureBlueprintScreenshot(html2canvas)
│   ├── storage.ts                    # Blueprint 接口, getBlueprints/saveBlueprint/deleteBlueprint/loadBlueprint/getLastBlueprintId/setLastBlueprintId
│   └── toaster.ts                    # createToaster({placement:'bottom-end'}) 单例
├── hooks/
│   ├── useChineseConverter.ts        # 繁/简热切换：动态 import('opencc-js') + 遍历文本节点 + MutationObserver 监听增量变更 + cn→tw 回转换
│   └── useGridEvents.ts              # 从 Grid.tsx 提取的鼠标/键盘事件处理 hook（handleMouseDown/Move/Up, handleKeyDown, handleWheel）
├── components/
│   ├── Grid.tsx                      # 核心画布(~276行，已拆出useGridEvents+ConnectionSVGLayer)：鼠标事件委托useGridEvents、键盘快捷键、机器预影+供电范围+端口箭头、框选矩形、批量移动虚影
│   ├── Grid.scss                     # 网格背景(background-image linear-gradient)、连线/管道双线样式(outline+fill)、预影动画(@keyframes dash)、选中高亮、框选样式
│   ├── ConnectionSVGLayer.tsx         # SVG连线图层组件：统一渲染已确认连线+预览路径+批量移动预览，复用 pathToPoints() 消除3处重复
│   ├── Machine.tsx                   # 已放置机器(~237行, React.memo + 细粒度selector)：端口渲染(输入/输出/双端口菱形)、长按500ms拾取、供电不足警告图标(@iconify uil:battery-bolt)、hover标签(机器名+操作提示)、端口碰撞检测缩容(getPortClasses: shrink-depth/shrink-length)
│   ├── Machine.scss                  # 机器容器定位(CSS --x,--y,--w,--h)、端口尺寸/方向/缩容规则(.shrink-depth/.shrink-length)、输入/输出箭头旋转方向、clickable/active状态
│   ├── Header.tsx                    # 顶部栏：logo、Chakra Select(Root)网格尺寸选择(handleValueChange: takeSnapshot+setGridSize)、保存/蓝图列表/分享/设置/关于5个IconButton
│   ├── Header.scss                   # flex布局，center-actions右对齐，actions按钮hover效果
│   ├── Toolbar.tsx                   # 底部面板：Chakra Tabs(6分类: 核心/物流/仓储存取/基础生产/合成制造/电力) + 模式切换(BUILD/WIRE/DEVICE_SELECT) + 机器按钮列表(按分类筛选)
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
│   ├── LoadingScreen.tsx             # 启动画面：延迟动态 import assets/items 所有图片→进度条→黄色展开动画→淡出
│   ├── LoadingScreen.scss           # 暗底+黄色竖条展开动画(cubic-bezier)、左下角百分比+右上角loading图
│   ├── ErrorBoundary.tsx             # React 错误边界类组件：包裹所有路由页面，捕获渲染错误并显示回退 UI
│   └── ui/
│       ├── tooltip.tsx               # Chakra Tooltip封装：支持showArrow/portalled/portalRef/contentProps，disabled时直接返回children
│       └── About.scss               # .member-icon-btn hover变黄
├── assets/
│   ├── logo.png                      # 48px logo
│   ├── loading.png                   # 加载画面右侧图(240px)
│   ├── members/                      # 团队成员头像 (author.gif, tata.png)
│   ├── machines/                     # 机器图标 .webp (以machine.id命名, 如pco.webp)
│   └── items/                        # 材料图标 (item_0~item_131, 延迟加载不阻塞启动)
```

## 核心架构

### 组件树 & 数据流

```
main.tsx (ChakraProvider)
└─ App.tsx (uiView 路由)
    ├─ [editor]
    │   ├─ Header.tsx          → useGameStore (gridWidth/gridHeight/uiView)
    │   │   └─ ShareModal.tsx  → generateShareUrl + captureBlueprintScreenshot
    │   ├─ Grid.tsx            → useGameStore（核心画布，解构约30个字段）
    │   │   └─ Machine.tsx ×N  → useGameStore (mode/isConnecting/availablePorts/zoom…)
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
| Connection | `connectionSlice.ts` | `connections`, `isConnecting`, `isValidPath`, `availablePorts[]`, `previewPath`, `lShapeMode`, `portType`, `isContinuing`, `continueSourceId` | `startConnecting`, `updatePreview`(含多端口同格方向选择), `commitConnection`(交叉检测+桥生成+连线分割+状态合并), `cancelConnection`, `toggleLShape` |
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
  WIRE: 'WIRE',
  DEVICE_SELECT: 'DEVICE_SELECT',
  MOVE_SELECTION: 'MOVE_SELECTION',
  BLUEPRINT_PLACE: 'BLUEPRINT_PLACE'
} as const;
```

代码中使用 `GameMode.BUILD`（字面量常量对象）而非裸字符串。

| 模式 | 触发方式 | 鼠标操作 | 渲染差异 |
|------|----------|----------|----------|
| BUILD | R键/工具栏指针按钮 | 单击放置机器、长按500ms拾取 | 机器虚影(.machine-ghost) + 供电范围虚线框 + 端口箭头 |
| WIRE | E键/工具栏闪电按钮 | 点击输出口开始、点击输入口完成 | 连线预览SVG(虚线动画/实线)，无效时变红 |
| DEVICE_SELECT | X键/工具栏框选按钮 | 拖拽框选 | 蓝色选择矩形(.selection-box) + Shift反选 |
| MOVE_SELECTION | M键(有选区时)/拖拽已选中项 | 移动坐标系 | 批量半透明机器虚影 + 批量连线SVG(0.5透明度) |
| BLUEPRINT_PLACE | 蓝图插入 | 单击确认放置 | 同MOVE_SELECTION预览效果 |

`cancelOperation()` (Escape/右键) 统一处理各模式返回干净状态：
- WIRE模式 → `cancelConnection()`
- 长按拾取中 → 归还机器到原位置
- DEVICE_SELECT → 清除选择框+选中的ID列表
- MOVE_SELECTION → 还原快照(isCopying=false) 或 归还原机器(isCopying=true)
- BLUEPRINT_PLACE → 同MOVE_SELECTION逻辑

### 画布系统（基于 DOM，非 `<canvas>`）

| 层 | 实现方式 | 关键参数 |
|----|----------|----------|
| 网格线 | CSS `background-image` 双渐变 | `var(--grid-size)` = 40px, opacity 0.5 |
| 机器 | 绝对定位 `div`，CSS 自定义属性 `--x`/`--y`/`--w`/`--h` | 3px padding, border: 3px solid var(--gray-dark) |
| 传送带连线 | SVG `<polyline>` 双线效果(outline描边+fill填充) | Solid=yellow-light(16px)/Liquid=#7cc4f0(16px), outline统一20px |
| 平移/缩放 | CSS `transform: translate(panX, panY) scale(zoom)` | zoom范围0.18~3.0, clampPan限制平移范围(-1~+2倍网格) |
| 坐标转换 | `worldX = floor((screenX - panX) / (GRID_SIZE * zoom))` | GRID_SIZE硬编码为40 |

**缩放锚定鼠标位置**：缩放前后鼠标下的世界坐标保持不变，通过调整 `pan` 补偿。
**GRID_SIZE**: 40px，定义在 `constants.ts`，`main.tsx` 启动时同步到 CSS 变量 `--grid-size`。

### 寻路系统（L 形曼哈顿路由）

`routeManhattan()` 不是 A*，而是**双 L 形路由**算法：
1. 计算 `|dx|` 和 `|dy|`，确定主导轴（`|dx| >= |dy|` → 水平优先）
2. 尝试主导轴优先的 L 形路径（恰好 1 个转弯）
3. 若碰撞，尝试另一条 L 形（次轴优先）
4. 两者均失败则返回 null——用户需手动点击添加锚点绕过障碍

**占用网格**：
- `buildOccupancyGrid(machines)` → 机器占用 `Uint8Array`
- `buildConnectionGrid(connections, portType?)` → 连线占用 `Uint8Array`
- `findPath()` 中合并规则：同类型连线允许直穿(后续放桥)、异类型连线阻断、拐弯格一律标记阻断
- 性能：O(path length)，无 open/closed 集合，每次 `findPath` 需重建占用网格 O(n)

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

1. 切换到 WIRE 模式 → 点击机器输出端口
2. `startConnecting(portType, availablePorts)` — 初始化连接状态，保存端口类型及可用端口列表（含 facing 信息）
3. 鼠标移动 → `updatePreview(pos)` — 实时计算到鼠标的 L 形路径，检测输入端吸附（多端口同格时按接近方向选择正确的side）
4. 可选按 F 键 → `toggleLShape()` — 在水平和垂直优先 L 形之间切换
5. 点击目标输入端口 → `commitConnection()`:
   - 从目标输入端口反推 `headFacing` 方向
   - 检测与已有同类型连线的交叉点
   - 交叉点自动放置物流桥 (`lbr` for Solid, `pbr` for Liquid)
   - 分裂被交叉的连线 (`splitConnectionAt` 工具函数，从 gridUtils 导入，递归处理多重交叉)
   - 分裂新连线并合并到 store

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

## 已知问题（按严重程度排序）

### 🔴 高优先级

1. ~~**Zustand 大范围解构导致过度重渲染**~~ ✅ **已修复 (2026-06-10)**
   - `Grid.tsx` 改为细粒度 selector（每个字段独立 `useGameStore(s => s.field)`）+ 事件处理器用 `useCallback(getState)` 模式
   - `Machine.tsx` 添加 `React.memo` + 细粒度 selector（只订阅 mode/isConnecting/availablePorts/zoom）
   - `App.tsx` 键盘 effect 依赖改为稳定的 Zustand action 引用 + `handleTriggerSaveRef` 模式

2. ~~**isMachinePowered 每次渲染重建供电网格**~~ ✅ **已修复 (2026-06-10)**
   - `Grid.tsx` 用 `useMemo` 一次计算 `poweredMachineIds: Set<string>`，通过 `isPowered` prop 传给 `Machine`
   - `Machine` 不再订阅 `machines` 字段，减少重渲染触发源

3. ~~**LoadingScreen eager 预加载全部 132 张图片**~~ ✅ **已修复 (2026-06-11)**
   - `LoadingScreen.tsx` 改用 `{ eager: false }` 延迟动态 import，每张图独立 chunk，不阻塞启动

4. ~~**零 React 缓存：无 `React.memo`、`useMemo`、`useCallback`**~~ ✅ **已修复 (2026-06-10)**
   - `Grid.tsx`：全部事件处理器用 `useCallback`，`poweredMachineIds` 用 `useMemo`，`extendPoint`/`pathToPoints` 提取为模块级函数
   - `Machine.tsx`：用 `React.memo` 包裹，事件处理器用 `useCallback` + `getState()`，`getPortStyle`/`getPortClasses` 用 `useCallback`
   - `App.tsx`：`extractSelectionData`/`handleTriggerSave`/`handleSaveAs` 等用 `useCallback`

### 🟡 中优先级

5. ~~**包围盒计算重复 7 处**~~ ✅ **已修复 (2026-06-10)**
   - 提取 `getBoundingBox()` 到 `gridUtils.ts`，替换全部 7 处重复（App.tsx, selectionSlice ×2, blueprintSlice ×2, gridUtils, shareUtils）

6. ~~**extendPoint 函数重复 3 次**~~ ✅ **已修复 (2026-06-10)** — 提取为模块级 `extendPoint()` + `pathToPoints()`，3 处 SVG 渲染统一复用
7. ~~**SVG polyline 渲染逻辑重复 3 次**~~ ✅ **已修复 (2026-06-10)** — 通过 `pathToPoints()` 统一

8. **commitConnection 单体函数过大** 🔵 **搁置** — 逻辑会快速变化，`splitConnectionAt` 已提取为纯函数；重构时机未到

9. ~~**零测试**~~ ✅ **已修复 (2026-06-13)** — 5 个测试文件 100+ 用例：`pureFunctions.test.ts`(纯函数), `Machine.test.tsx`(端口渲染/旋转/拾取), `Toolbar.test.tsx`(分类/模式/按钮), `store.test.ts`(切片集成), `useChineseConverter.test.tsx`(繁简转换)

10. ~~**无 Error Boundary**~~ ✅ **已修复 (2026-06-10)** — 添加 `ErrorBoundary` 类组件，包裹所有路由页面，捕获渲染错误并显示回退 UI

11. ~~**15 种机器定义但工具栏不可见**~~ ✅ **已修复 (2026-06-11)** — `MACHINE_GROUPS` 补全全部 43 台机器，无图标时自动显示文字

### 🟢 低优先级

12. ~~**commitBatchMove 未检查连线碰撞**~~ ✅ **已修复 (2026-06-11)** — 增加机器占用 + 异类型连线 + 同类型拐弯点三重检测
13. ~~**网格尺寸切换不验证越界**~~ ✅ **已修复 (2026-06-11)** — `setGridSize` 自动清除越界机器及关联连线，`takeSnapshot` 先于清除可撤销恢复
14. ~~**history 快照无容量上限**~~ ✅ **已修复 (2026-06-11)** — 上限 50 步，超出丢弃最旧快照
15. ~~**平移无约束 + 无重置按钮**~~ ✅ **已修复 (2026-06-11)** — 添加 `clampPan` 限制平移范围（-1~+2 倍网格），Header 添加重置视图按钮
16. **重复材料图标** — `materials.ts` 中 4 种液体材料共用 `icon: 44`（需游戏数据人工对照）
17. ~~**端口偏移硬编码**~~ ✅ **已修复 (2026-06-11)** — `Machine.tsx` 改用 `GRID_SIZE` 常量 + 注释说明偏移来源
18. ~~**GRID_SIZE 双重硬编码**~~ ✅ **已修复 (2026-06-11)** — 提取到 `constants.ts`，`main.tsx` 启动时同步到 CSS 变量 `--grid-size`
19. ~~**ShareModal 截图时机不可靠**~~ ✅ **已修复 (2026-06-11)** — `setTimeout(100)` → `requestAnimationFrame`
20. ~~**BlueprintList 删除后重新读取 localStorage**~~ ✅ **已修复 (2026-06-11)** — 改为 `setBlueprints(prev => prev.filter(...))` 本地过滤

## 下一步行动计划

### 🔴 Sprint 1：性能止血 ✅ **已完成 (2026-06-10)**

- [x] **Grid.tsx**：细粒度 selector + useCallback 事件处理器 + extendPoint/pathToPoints 模块级提取
- [x] **Machine.tsx**：`React.memo` + 细粒度 selector + `isPowered` prop 替代 `isMachinePowered` 内部调用
- [x] **machineUtils.ts**：供电网格在 Grid.tsx 用 `useMemo` 一次计算，通过 `isPowered` prop 下发
- [x] **App.tsx**：键盘 effect 依赖精简为稳定引用 + `handleTriggerSaveRef` 模式
- [x] **Grid.tsx**：全部事件处理器 useCallback + useGameStore.getState() 读取最新状态

### 🟡 Sprint 2：消除重复、补测试 ✅ **已完成 (2026-06-10)**

- [x] **提取 `getBoundingBox(machines, connections)`** 到 `gridUtils.ts`，替换全部 7 处重复
- [x] **提取 `extendPoint`** 到独立工具函数（Sprint 1 顺手完成）
- [x] **提取 `<ConnectionSVG>` 组件**，统一 3 处 SVG polyline 渲染逻辑（Sprint 1 通过 `pathToPoints()` 完成）
- [x] **添加测试**：38 个 vitest 纯函数测试覆盖 `getBoundingBox`/`getRotatedDimensions`/`getRotatedPorts`/`routeManhattan`/`getCornerPoints`/`dirFromPoints`/`splitConnectionAt`（后续 Sprint 5 扩展至 5 文件 100+ 用例）
- [x] **添加 Error Boundary 组件**：`src/components/ErrorBoundary.tsx`，包裹所有路由页面

### 🟢 Sprint 3：功能修复 + 体验 ✅ **已完成 (2026-06-11)**

- [x] **补全 `MACHINE_GROUPS`**：43 台机器全部可见，按 `machines.ts` 定义顺序排列；无图标时 `onError` 隐藏裂图显示文字
- [x] **`commitBatchMove`** 增加连线路径碰撞检测（机器占用 + 异类型连线 + 同类型拐弯点三重检测）
- [x] **网格尺寸切换时** 自动清除越界机器及关联连线（takeSnapshot 先于清除，可撤销恢复）
- [x] **history 快照** 设置上限 50 步
- [x] 添加视图重置按钮（Header fit-screen 图标）+ 平移范围限制（`clampPan`：-1~+2 倍网格范围）
- [ ] 修复重复材料图标 — **跳过**：需游戏数据人工对照，不可猜测
- [x] GRID_SIZE 提取到 `constants.ts`，`main.tsx` 启动时同步到 CSS 变量 `--grid-size`
- [x] `axisOffset` 改用 `GRID_SIZE` 常量 + 注释说明偏移来源（补偿 padding+border+port border）
- [x] `ShareModal` 截图 `setTimeout(100)` → `requestAnimationFrame`
- [x] **LoadingScreen 延迟加载**：`eager: true` → `eager: false`，132 张图片异步 import，不阻塞启动
- [x] **BlueprintList 删除优化**：`setBlueprints(prev.filter(...))` 本地过滤，不重读 localStorage

### 🔵 搁置 / 跳过

- [ ] **commitConnection 重构** — 搁置：逻辑仍在快速变化，时机未到
- [ ] **重复材料图标** — 跳过：需游戏数据人工对照，不可猜测
- [ ] **蓝图相关 `any` 类型** — ✅ **已修复 (2026-06-13 Sprint 7)**：全部 12 处 `any` 已消除，`shareUtils.ts` 新增 `DecodedBlueprint` 接口
- [ ] **MAX_BLUEPRINTS 常量化** — 搁置：与蓝图模块同批处理

---

## 下一步行动计划（2026-06-13 梳理，蓝图相关搁置）

### 现状总结

| 维度 | 状态 |
|------|------|
| 源文件 | 60 个（27 .ts + 17 .tsx + 8 .scss + 2 .css + 5 test + 1 .d.ts），~8,000 行 |
| 测试 | 5 个文件 100+ 用例（pureFunctions/Machine/Toolbar/store/useChineseConverter） |
| `any` 类型 | 0 处（非测试代码已清零，Sprint 7 完成） |
| 大文件 | connectionSlice.ts(~466) / Machine.tsx(~237) / Grid.tsx(~276) |
| 依赖 | 全部最新，@types/html2canvas 已移入 devDependencies |
| 语言 | 繁→简已全部完成（Sprint 7 收尾 ~70 处） |
| 魔法数字 | 已常量化：DEFAULT_CONTENT_PADDING / MAX_MEMBERS_DISPLAY / PORT_ARROW_ROTATION |

### 🔴 Sprint 4：类型安全 + 语言统一 ✅ **已完成 (2026-06-13 Sprint 7)**

- [x] **消除非蓝图的 `any` 类型**（1 处）：`src/components/Header.tsx:27` — `(e: any)` → `{ value: string[] }`
- [x] **繁→简中文转换收尾**：`Settings.tsx` + `connectionSlice.ts` + 所有文件批量检查替换
- [x] **@types/html2canvas → devDependencies**：从 dependencies 移到 devDependencies

### 🟡 Sprint 5：测试覆盖 ✅ **已完成 (2026-06-13)**

- [x] **组件单元测试**：`Machine.test.tsx`（端口渲染/旋转/拾取/供电警告）、`Toolbar.test.tsx`（分类切换/模式切换/按钮渲染）
- [x] **Store 切片集成测试**：`store.test.ts` 覆盖 machinesSlice（碰撞检测/级联删连线/pickupMachine）、connectionSlice（commitConnection 完整链路）、selectionSlice（框选/批量移动/复制粘贴）、historySlice（undo/redo）
- [x] **Hook 测试**：`useChineseConverter.test.tsx`（繁→简 DOM 文本节点转换）

### 🟢 Sprint 6：架构瘦身 ✅ **已完成 (2026-06-13)**

- [x] **拆分 Grid.tsx**（584 → 276 行，-53%）：提取 `<ConnectionSVGLayer>` + `useGridEvents` hook
- [x] **拆分 gridUtils.ts**（501 → 15 行 barrel）：按职责分为 5 个模块（direction / collision / occupancy / pathfinding / port）
- [x] **魔法数字常量化**：`DEFAULT_CONTENT_PADDING=4` / `MAX_MEMBERS_DISPLAY=999` / `PORT_ARROW_ROTATION`

### 🔵 长期展望（全部清空）

- [x] **CI/CD**：GitHub Actions 跑 lint + typecheck + test ✅ **已完成 (2026-06-13 Sprint 7)**
- [x] **繁→简中文转换收尾**：全部 UI 文案已统一为简体中文 ✅ **已完成 (2026-06-13 Sprint 7)**
- [x] **全部 `any` 类型消除**：非测试代码中 `any` 已清零 ✅ **已完成 (2026-06-13 Sprint 7)**
- [x] **Lint 清零**：ESLint 25 → 0 ✅ **已完成 (2026-06-13 Sprint 8)**
- [~] **E2E 测试**：~~Playwright 测试完整用户流程~~ — **搁置 (2026-06-14)**，等核心逻辑稳定后再补
- [~] **无障碍（a11y）**：~~键盘导航、ARIA 标签~~ — **不考虑**，专业工具面向重度玩家，桌面端优先
- [~] **移动端适配**：~~工具栏/Header 响应式~~ — **不考虑**，移动端用户直接用官方编辑器
- [~] **英文国际化**：~~useChineseConverter 扩展 i18n~~ — **暂不考虑**，目标用户为中文玩家

### 🟣 Sprint 7：技术债清尾 + CI/CD ✅ **已完成 (2026-06-13)**

- [x] **繁→简中文转换收尾**（6 个文件 ~70 处）：OperationHints / About / ShareModal / BlueprintList / SaveDialog / Toolbar / LoadingScreen
- [x] **移除未使用的 `framer-motion` 依赖**
- [x] **`any` 类型全面消除**：types.ts / App.tsx / shareUtils.ts / blueprintSlice.ts — 非测试代码 `any` 清零
- [x] **CI/CD**：`.github/workflows/ci.yml` — push/PR 触发 lint + typecheck + test 三个独立 Job
- [x] **Toolbar 测试修正**：Tab 标签 `倉儲存取` → `仓储存取`

### ⚪ Sprint 8：Lint 清零 ✅ **已完成 (2026-06-13)**

- [x] **ESLint 错误清零**：25 → 0，覆盖全部源文件

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
