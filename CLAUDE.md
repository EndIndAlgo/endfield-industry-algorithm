# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

明日方舟：终末地（Arknights: Endfield）的网页版基建规划工具，用于规划工厂布局、管理蓝图、生成分享链接。

**当前阶段：快速开发阶段** — 允许破坏性变更，无需考虑向后兼容。旧格式兼容代码可直接删除，数据结构可自由调整。

2026-07-16 完成**架构收敛重构**（P0 数据安全 → P1 领域收敛 → P2 画布集成 → P4 展平复制，P3 性能收尾见 ROADMAP）：
- 架构基准与决策记录见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- 重构修复记录见 [bugs.md](./bugs.md) 顶部「架构收敛重构」小节
- 开发历史见 [CHANGELOG.md](./CHANGELOG.md) Sprint 13
- 后续计划见 [ROADMAP.md](./ROADMAP.md)

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
- **PixiJS v8** WebGL 画布（场景图 + 事件 + 纹理）
- **SCSS** 组件级样式 + **lucide-react** + @iconify/react 图标 + **classnames**
- 路径别名: `@` → `src/`

## 完整项目结构（每个文件均经过审查）

```
src/
├── main.tsx                          # 入口：StrictMode + ChakraProvider(defaultSystem) + <App/>；同步 --grid-size/--z-* CSS 变量
├── App.tsx                           # 根组件：uiView 条件路由 + 全局 Ctrl+Z/Y/S 快捷键 + 启动加载(findRoots[0]/分享解析)
├── App.css                           # #root flex column 布局, .app-content flex:1
├── index.css                         # CSS 变量(--grid-size等), .gray-btn/.yellow-btn, 简中系统字体栈
├── opencc-js.d.ts                    # opencc-js 类型声明（Converter, ConverterOptions）
├── types.ts                          # 共享类型：PlacedMachine/Connection(含 blueprintNodeId)/PortConfig + BlueprintSummary + ModeState 判别联合 + 虚拟机器(sin/sot/lin/lot) + 掩码常量(MASK_SOLID/LIQUID + portTypeToMask + MASK_*_LOGISTICS/REGULAR_MACHINE)
├── domain/                           # 领域层（纯函数，零框架依赖；依赖方向 store → domain → persist）
│   ├── doc.ts                        # FactoryDoc 唯一持久真相源：CommittedNode/ChildRef/BlueprintSummary + 纯函数 createEmptyDoc/createNodeWithContent/commitNode/forkCommit/addChild/removeChild/moveChild/deleteNode/findRoots/refCount/findAncestorPath/canInsertChild/flattenNode/flattenDescendants/isContentEqual
│   └── persist.ts                    # loadDoc/saveDoc：唯一 key 'zmd_doc_v1'，校验 version===1；旧格式(zmd_registry 等)直接废弃
├── store/
│   ├── gameStore.ts                  # Zustand thin wrapper (20行)：组合 7 个切片 + devtools 中间件
│   ├── settingsStore.ts             # 独立 persist store：language ('zh-TW'|'zh-CN'), localStorage key='settings-storage'
│   ├── selectors.ts                  # 类型窄化 selector (184行, 37 个)：selectIsBuildMode/selectPlacing/selectSelectedMachineId/selectIsConnecting/selectHasSelection 等，含稳定空数组引用 EMPTY_ARRAY
│   └── slices/
│       ├── types.ts                  # 7 个切片接口定义 + HistorySnapshot{machines,connections,doc} + GameState 交集类型
│       ├── canvasSlice.ts           # zoom(默认1), pan({0,0}), gridWidth/Height(默认24), hoverPosFrac(鼠标分数坐标); setZoom/setPan/setGridSize(含越界清理)/setHoverPosFrac
│       ├── modeSlice.ts             # modeState(ModeState 判别联合), setMode(BUILD/WIRE_SOLID/WIRE_LIQUID/DEVICE_SELECT/BLUEPRINT_SELECT), cancelOperation(统一 Escape：按 variant 分发→cancelConnection/还原拾取/清除选区/还原或丢弃移动快照/丢弃或取消蓝图移动)
│       ├── machinesSlice.ts         # machines[]; selectMachine(切换到 BUILD placing)/rotatePreview/addMachine(碰撞+连线网格双重检测,支持连续放置,保留拾取时的UUID,标注 blueprintNodeId)/removeMachine(级联删连线,isViewingOwn 守卫)/pickupMachine(长按拾取→BUILD placing+backup)
│       ├── connectionSlice.ts       # connections[]; startConnecting(越界/归属过滤)/updatePreview(含多端口同格方向选择+L形三态切换+输入端口吸附+自动续接)/commitConnection(交叉检测+桥生成+连线分割+合并衔接)/cancelConnection/toggleLShape(auto→垂直→同向 三态循环); + 模块级 _gridCache 缓存
│       ├── selectionSlice.ts        # setBoxSelection/commitBoxSelection(shift=toggle)/clearSelection/deleteSelected(含级联删连线,后代只读过滤)/startBatchMove(过渡到 MOVE_SELECTION)/startCopySelection/commitBatchMove(碰撞+桥生成+连线分割, TryMergeInPlace 零分配)
│       ├── historySlice.ts          # history: { past: HistorySnapshot[], future: HistorySnapshot[] }, takeSnapshot/undo/redo; 上限50步; undo/redo 恢复后 saveDoc 落盘
│       └── blueprintSlice.ts       # uiView, doc: FactoryDoc(唯一持久真相源), currentViewingNodeId/currentAncestorPath; 检出式蓝图树操作(createBlueprint/saveCurrentBlueprint(共享则 forkCommit)/loadBlueprint/startInsertChild/startFlattenCopy/commitInsert/commitMove/removeChild/deleteBlueprint/navigateInto/navigateToParent/syncStoreFromViewing/isCheckoutDirty) + 兼容旧接口(loadGame/resetGame/setUiView)
├── config/
│   ├── machines.ts                   # MACHINES: 43 种机器 MachineConfig[] + 4 种虚拟机器(sin/sot/lin/lot 接口引脚) + getMachineConfig(id) O(n) 查找；machineUtils.getMachineConfigById(id) 为 O(1) Map 版本
│   ├── materials.ts                  # MATERIALS: 76 种材料 Record<string, Material>
│   ├── constants.ts                  # GRID_SIZE=40, GRID_PRESETS: 6 种网格尺寸, DEFAULT_CONTENT_PADDING, MAX_MEMBERS_DISPLAY, PORT_ARROW_ROTATION
│   ├── colors.ts                     # PixiJS 渲染颜色常量：与 index.css CSS 变量一一对应（GRAY/SELECTION_BLUE/GHOST_FILL/BLUEPRINT_OUTLINE 等）
│   ├── memberInfo.ts                 # memberInfo: 团队成员数组 [{name,avatar,message,tags,mail,...}]
│   └── zIndex.ts                     # Z_INDEX: 分段式 z-index 常量表(基础0-99/常态100-699/批量700-1299/Ghost1300-1899/UI1900+) + connZ()/machineZ()辅助函数
├── utils/
│   ├── grid/
│   │   ├── index.ts                     # barrel 文件(25行)：重新导出 grid/ 下全部函数 + 类型 + Mask
│   │   ├── collision.ts              # getBoundingBox, checkPlacementCollision, calculateContentDimensions
│   │   ├── direction.ts              # getVectorFromSide, dirFromPoints, computeHeadFacing
│   │   ├── occupancy.ts              # buildConnectionGrid(连线占用), buildExistingCornerGrid(已有线拐弯点)
│   │   ├── pathfinding.ts            # trySingleLRoute(单 L 形；双 L 形 routeManhattan 已删除)
│   │   ├── port.ts                   # getCornerPoints, getMachinePortCheckPositions, splitConnectionAt, getPortOuterCells, getInputPortOuterCells, findPortOuterCellAt, findMachineAt, pickClosestPort
│   │   ├── routeValidation.ts        # validateRouteConflicts, findRouteForMachine, findRouteToGround, checkStartOverlap — updatePreview/commitConnection 拆出的纯函数
│   │   └── viewport.ts               # clampPan: 限制平移范围，防止无限滚入空白区域
│   ├── mask.ts                       # Mask 类：封装二维掩码存储(Uint8Array)+碰撞检测+合并操作；工厂方法 Uniform/FromMask(旋转映射)/FromConnection/FromOccupancy(机器+连线组合入口,取代旧 buildMergedGrid)/FromCornerPoints + WriteValue/TryMergeInPlace/ClearRegion
│   ├── machineUtils.ts               # getMachineConfigById(O(1) Map查找), getRotatedDimensions, getRotatedPorts, buildPowerGrid, resolveMachineMasks(→MachineMaskEntry[]); 内含 REQUIRED_IDS 启动校验
│   ├── machineIcons.ts              # getMachineIconUrl: 机器图标静态 URL 映射（import.meta.glob 保证全部 webp 进产物，替代动态 new URL 拼接）
│   ├── blueprintGuard.ts             # isViewingOwn/isDescendant: 按 blueprintNodeId 判断实体是否属于当前 viewing 节点（蓝图嵌套时限制修改范围，后代只读）
│   ├── portPosition.ts               # getPortCenter(机器端口像素定位，被 MachineRenderer 复用)
│   ├── shareUtils.ts                 # toBase64Url/fromBase64Url, encode/decode (V3二进制: 3字节ID+1字节x+1字节y+1字节rotation), generateShareUrl, parseShareUrl, captureBlueprintScreenshot(Pixi canvas 白底合成)
│   └── toaster.ts                    # createToaster({placement:'bottom-end'}) 单例
├── pixi/
│   ├── CanvasController.ts           # 画布控制器（无框架 TS 类）：Application 生命周期(attach/detach 幂等状态机+attachGen 令牌)、事件归一化(唯一接触坐标差异处)、Zustand subscribe → diff → 增量更新；机器/连线对象池 + powerGrid WeakMap 缓存
│   ├── modeHandlers.ts               # 纯函数模式处理器：createModeHandlers(ctx)，按 modeState.kind 分发 onDown/onUp/onMove/onTap，只接收归一化指针事件(NormalizedPointer)
│   ├── TextureLoader.ts              # 机器图标纹理批量预加载 (Assets.load + skip 策略)，缺失标记 null 降级文字
│   ├── layers/
│   │   └── GridLayer.ts              # 网格背景：TilingSprite 平铺 40×40 纹理 + Graphics 4px 边框
│   └── renderers/
│       ├── MachineRenderer.ts        # 机器渲染：Container 创建/更新（机身、图标、端口、标签、供电图标、选中高亮、hover 标签反缩放），静态三件套+动态子元素两段式
│       ├── ConnectionRenderer.ts     # 连线渲染：Graphics 双线效果（outline+fill 一对 Graphics），预览连线，后代连线 alpha 0.5
│       └── OverlayRenderer.ts        # 叠加层：Ghost 放置预览、供电范围、端口箭头、选框、批量移动预览、子蓝图轮廓/移动预览
├── hooks/
│   ├── useChineseConverter.ts        # 繁/简热切换（opencc-js 延迟加载 + MutationObserver）
│   └── grid/
│       ├── useKeyboardShortcuts.ts   # 全局快捷键 (E/Q/R/X/B/F/F1/M/Ctrl+C/Escape)，注入 getHoverGridPos（由 CanvasController 提供）
│       └── useWASDPan.ts             # WASD 动量平移（rAF + 惯性衰减 + clampPan）
├── __tests__/
│   ├── setup.ts                       # jsdom mock
│   ├── testWrapper.tsx                # ChakraProvider 包裹器
│   ├── pureFunctions.test.ts          # 纯函数测试
│   ├── store.test.ts                  # Zustand store 切片测试
│   ├── useChineseConverter.test.tsx   # 繁简转换测试
│   └── Toolbar.test.tsx               # Toolbar 组件测试
├── components/
│   ├── PixiGrid.tsx                  # PixiJS 画布组件：useEffect 只做 attach/detach（幂等，StrictMode 安全）+ classNames(.grid-container/.wiring-mode/.panning)；controller useState 惰性创建；事件全在 CanvasController
│   ├── Grid.scss                     # grid-container 容器样式（.grid-container, .wiring-mode 等；.panning 由 PixiGrid 驱动类名）
│   ├── Header.tsx                    # 顶部栏：logo、网格尺寸选择、重置视图/保存/蓝图列表/分享/设置/关于
│   ├── Header.scss                   # flex 布局
│   ├── Toolbar.tsx                   # 底部面板：6 分类 Tabs + 模式切换按钮 + 机器按钮列表（MACHINE_GROUPS）
│   ├── Toolbar.scss                  # 固定底部居中、毛玻璃背景
│   ├── About.tsx                     # 关于页面：版权声明 + 成员卡片
│   ├── BlueprintList.tsx             # 蓝图管理：doc 树形列表（全部/根 过滤，refCount 徽标）+ 每节点 4 操作(编辑/引用导入/展平复制/删除，删除需 refCount===0) + isCheckoutDirty 离开确认
│   ├── Settings.tsx                  # 设置页面：语言切换
│   ├── ShareModal.tsx                # 分享弹窗: generateShareUrl + captureBlueprintScreenshot
│   ├── SaveDialog.tsx                # Chakra Dialog 保存命名
│   ├── IconButton.tsx + .scss       # 通用 IconButton + tooltip
│   ├── OperationHints.tsx + .scss   # 操作提示面板
│   ├── LoadingScreen.tsx + .scss    # 启动加载动画
│   ├── ErrorBoundary.tsx             # React 错误边界
│   ├── BreadcrumbNav.tsx             # 蓝图嵌套面包屑导航（祖先路径点击导航，isCheckoutDirty 离开确认）
│   └── ui/
│       ├── tooltip.tsx               # Chakra Tooltip 封装
│       └── About.scss               # .member-icon-btn hover 效果
├── assets/
│   ├── logo-header.png               # Header 用的 96px 高 logo（2x retina）
│   ├── members/                      # 团队成员头像 (eddy3721.gif, tata.png)
│   └── machines/                     # 机器图标 .webp (以machine.id命名, 如pco.webp)
```

## 核心架构

### 组件树 & 数据流

```
main.tsx (ChakraProvider)
└─ App.tsx (uiView 路由 + Ctrl+Z/Y/S + 启动加载 findRoots[0] / 分享解析)
    ├─ [editor]
    │   ├─ Header.tsx          → useGameStore (gridWidth/gridHeight/setGridSize/setPan/setZoom/setUiView)
    │   │   └─ ShareModal.tsx  → generateShareUrl + captureBlueprintScreenshot
    │   ├─ BreadcrumbNav.tsx   → useGameStore (doc/currentViewingNodeId/currentAncestorPath) + isCheckoutDirty 离开确认
    │   ├─ PixiGrid.tsx        → useEffect 仅 attach/detach CanvasController + classNames
    │   │   ├─ CanvasController (命令式 TS 类，非 React) → 事件归一化 + Zustand subscribe → diff → 增量更新
    │   │   │   ├─ GridLayer            → TilingSprite 网格背景
    │   │   │   ├─ machineLayer         → MachineRenderer (机器 Container 池)
    │   │   │   ├─ connectionSolidLayer / connectionLiquidLayer → ConnectionRenderer (连线 Graphics 池)
    │   │   │   └─ overlayLayer         → OverlayRenderer (Ghost/选框/批量移动/蓝图轮廓)
    │   │   ├─ modeHandlers.ts  → 纯函数模式处理器（按 modeState.kind 分发）
    │   │   ├─ useKeyboardShortcuts.ts → 注入 controller.getLastHoverGridPos()
    │   │   └─ useWASDPan.ts    → WASD 动量平移
    │   ├─ Toolbar.tsx         → useGameStore (selector + actions)
    │   ├─ OperationHints.tsx  → useGameStore (modeState + 选区状态)
    │   └─ SaveDialog.tsx      → 纯UI，回调由App.tsx管理
    ├─ [list]     → BlueprintList.tsx  → useGameStore (doc/startInsertChild/startFlattenCopy/loadBlueprint/deleteBlueprint)
    ├─ [about]    → About.tsx          → useGameStore (setUiView)
    └─ [settings] → Settings.tsx       → useSettingsStore (language, setLanguage)
```

**数据流方向**: 用户交互 → store action（modeHandlers 或组件调用）→ `set()` 更新状态 → React 重渲染受影响组件 + CanvasController 订阅 diff 增量更新场景图。

**持久化**: 唯一持久化对象是 `doc: FactoryDoc`（`src/domain/persist.ts`，唯一 key `zmd_doc_v1`）。工作视图编辑本身**不落盘**；只有 doc 变更（createBlueprint/saveCurrentBlueprint/commitInsert/commitMove/removeChild/deleteBlueprint/undo/redo/loadGame）才立即 saveDoc。离开蓝图前 `isCheckoutDirty()` + confirm 丢弃未保存修改。

**分享解析**: URL query param `?bp=` → `parseShareUrl()` → decode二进制 → `loadGame()` 创建为新蓝图节点。

### 状态管理：Zustand 切片模式

`gameStore.ts` 是 thin wrapper（20 行），通过 Zustand 切片模式组合 7 个子切片：

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
| Mode | `modeSlice.ts` | `modeState: ModeState`(判别联合，6 种 variant) | `setMode(BUILD\|WIRE_SOLID\|WIRE_LIQUID\|DEVICE_SELECT\|BLUEPRINT_SELECT)`, `cancelOperation`(统一Escape：按 variant 分发→cancelConnection/还原拾取机器/清除选区/还原或丢弃移动快照/丢弃或取消蓝图移动) |
| Machines | `machinesSlice.ts` | `machines[]`（工作视图实体，带 `blueprintNodeId` 归属） | `selectMachine`(切换到 BUILD placing + 还原拾取中的机器), `rotatePreview`, `addMachine`(碰撞+连线网格双重检测,支持连续放置,保留拾取时的UUID,标注当前 viewing 归属), `removeMachine`(级联删除端口连线), `pickupMachine`(长按→移出 machines[] + BUILD placing + backup) |
| Connection | `connectionSlice.ts` | `connections[]` | `startConnecting`(越界端口过滤+isViewingOwn 守卫), `updatePreview`(含多端口同格方向选择+L形三态切换+输入端口吸附+自动续接;模块级 _gridCache 以引用相等检测命中), `commitConnection`(交叉检测+桥生成+连线分割+合并衔接), `cancelConnection`, `toggleLShape`(auto→垂直→同向 三态循环) |
| Selection | `selectionSlice.ts` | （无顶层字段，全部内嵌于 modeState） | `setBoxSelection`, `commitBoxSelection`(shift=toggle), `clearSelection`, `deleteSelected`(含级联删连线+后代只读过滤), `startBatchMove`(→MOVE_SELECTION), `startCopySelection`(→MOVE_SELECTION+isCopying), `commitBatchMove`(碰撞检测+桥生成+连线分割, TryMergeInPlace 零分配) |
| History | `historySlice.ts` | `history: { past: HistorySnapshot[], future: HistorySnapshot[] }`（快照 = `{ machines, connections, doc }`，结构共享） | `takeSnapshot`, `undo`, `redo`（上限50步；恢复后 `saveDoc()` 落盘，保证 doc 与历史一致） |
| Blueprint | `blueprintSlice.ts` | `uiView`, `doc: FactoryDoc`(唯一持久真相源，初始化 loadDoc ?? createEmptyDoc), `currentViewingNodeId`(当前编辑节点), `currentAncestorPath`(祖先路径) | `createBlueprint`, `saveCurrentBlueprint`(检出式：refCount≤1 原地 commitNode / 共享 forkCommit+父链 childRef 重指), `loadBlueprint`(用已提交内容替换工作视图+清空历史), `startInsertChild`(引用导入→BLUEPRINT_MOVE), `startFlattenCopy`(展平复制→MOVE_SELECTION), `commitInsert`(canInsertChild 环防护), `commitMove`, `removeChild`(引用归零联动 deleteNode), `deleteBlueprint`(取代旧 removeChild 误用), `navigateInto`, `navigateToParent`, `syncStoreFromViewing`(自有内容+后代展平), `isCheckoutDirty` + 兼容旧接口 `loadGame`/`resetGame`/`setUiView` |

**切片间交互关键路径**：
- `modeSlice.cancelOperation()` 按 `modeState.kind` 分发：BUILD→还原拾取机器/清空placing；WIRE→`get().cancelConnection()` 或退回 BUILD；DEVICE_SELECT→清空选区并回 BUILD；MOVE_SELECTION→还原/丢弃移动快照；BLUEPRINT_SELECT→回 BUILD；BLUEPRINT_MOVE→丢弃插入(isInserting)或取消移动(回到BLUEPRINT_SELECT保持选中)
- `machinesSlice.selectMachine()` / `rotatePreview()` / `pickupMachine()` 直接读写 `modeState.placing`
- 编辑切片（machines/connection/selection）新增实体标注 `blueprintNodeId = currentViewingNodeId`；`isViewingOwn` 限制只能改自有内容（后代只读）
- `selectionSlice.commitBatchMove()` / `deleteSelected()` 内部调用 `get().takeSnapshot()`；`blueprintSlice.commitInsert()`/`commitMove()`/`removeChild()`/`deleteBlueprint()` 同样先 takeSnapshot
- `historySlice.undo()/redo()` 调用 `get().cancelOperation()` 清理中间状态，恢复 `{ machines, connections, doc }` 并 `saveDoc()` 落盘
- `blueprintSlice.startInsertChild()` 直接设置 `modeState` 为 BLUEPRINT_MOVE variant；`startFlattenCopy()` 设置 MOVE_SELECTION + isCopying
- `blueprintSlice.saveCurrentBlueprint()` 按 `refCount(doc, nodeId)` 决定原地 `commitNode`（≤1）或 `forkCommit`（>1，旧节点不动）

### ModeState 判别联合

`modeState` 是单一状态字段，通过判别联合的 `kind` 属性区分当前模式。CONVEYOR 和 PIPE 合并为 WIRE（用 `portType` 区分子类型），BLUEPRINT_PLACE 合并为 MOVE_SELECTION（用 `isCopying` 区分子类型）。蓝图树引入后新增 BLUEPRINT_SELECT 和 BLUEPRINT_MOVE。

```typescript
// src/types.ts:131-188
export type ModeState =
  // BUILD：placing 判 null 区分 idle/placing/pickup
  | { kind: 'BUILD'; placing: { ... } | null; }

  // WIRE：CONVEYOR+PIPE 合并，portType 区分物流类型
  | { kind: 'WIRE'; portType: 'Solid' | 'Liquid'; connecting: ConnectingFields | null; }

  // DEVICE_SELECT
  | { kind: 'DEVICE_SELECT'; selectionStart/End: Point | null; selectedMachineIds/ConnectionIds: string[]; }

  // MOVE_SELECTION：M键移动+Ctrl+C复制+展平复制合并
  | { kind: 'MOVE_SELECTION'; moveAnchor: Point; movingMachinesSnapshot: PlacedMachine[]; movingConnectionsSnapshot: Connection[]; isCopying: boolean; originSelectedMachineIds/ConnectionIds: string[]; }

  // BLUEPRINT_SELECT：B 键进入，点击子蓝图内机器选中整个子蓝图
  | { kind: 'BLUEPRINT_SELECT'; selectedChildNodeId: string | null; }

  // BLUEPRINT_MOVE：拖拽放置子蓝图（引用导入或移动已有子蓝图）
  | { kind: 'BLUEPRINT_MOVE'; childNodeId: string; childSummary: BlueprintSummary; moveAnchor: Point; previewOffset: Point | null; isCopying: boolean; isInserting: boolean; isValidPosition: boolean; };
```

> 旧 `BlueprintSnapshot` / `BlueprintRegistry` / `BlueprintChildRef` 类型已随引擎删除；BLUEPRINT_MOVE 只携带只读摘要 `BlueprintSummary { nodeId, name, gridW, gridH }`（定义于 `src/domain/doc.ts` 与 `src/types.ts`）。

| variant | 触发方式 | 鼠标操作 | 渲染差异 |
|------|----------|----------|----------|
| BUILD(placing=null) | R键/工具栏指针按钮 | 空闲，等待选机 | — |
| BUILD(placing≠null) | 点击工具栏机器/长按拾取 | 单击放置机器、移动鼠标预览 | Ghost 机器虚影(OverlayRenderer.createGhostMachine) + 供电范围 + 端口箭头 |
| WIRE(portType='Solid') | E键/工具栏传送带按钮 | 点击输出口开始、点击输入口/地面完成 | 传送带预览连线(虚线动画/实线)，无效时变红 |
| WIRE(portType='Liquid') | Q键/工具栏管道按钮 | 点击输出口开始、点击输入口/地面完成 | 管道预览连线(虚线动画/实线)，无效时变红 |
| DEVICE_SELECT | X键/工具栏框选按钮 | 拖拽框选 | 蓝色选择矩形 + Shift反选 |
| MOVE_SELECTION | M键(有选区时)/拖拽已选中项/Ctrl+C/蓝图展平复制 | 移动坐标系→单击放置 | 批量半透明机器虚影 + 批量连线(createBatchMovePreview) |
| BLUEPRINT_SELECT | B键/工具栏蓝图选择按钮 | 点击子蓝图机器选中整个子蓝图 | 选中子蓝图的黄色虚线轮廓框(createSubBlueprintOutline) |
| BLUEPRINT_MOVE | B键选中后拖拽 / 蓝图列表引用导入 | 移动坐标系→单击放置/取消 | 子蓝图摘要矩形轮廓(createBlueprintMovePreview，按 childSummary.gridW/gridH) |

`cancelOperation()` (Escape/右键) 统一处理各模式返回干净状态（实现在 `modeSlice.ts`）：
- BUILD(placing≠null, backup≠null) → 归还机器到 `machines[]`，回到 BUILD(idle)
- BUILD(placing≠null, backup=null) → 清空选机，回到 BUILD(idle)
- WIRE(connecting≠null) → `cancelConnection()`，回到 WIRE(idle)
- WIRE(connecting=null) → 回到 BUILD(idle)
- DEVICE_SELECT → 回到 BUILD(idle)
- MOVE_SELECTION(isCopying=true) → 丢弃复制/展平副本，回到 DEVICE_SELECT(空选区)
- MOVE_SELECTION(isCopying=false) → 还原 `machines[]`/`connections[]` + 原选区，回到 DEVICE_SELECT
- BLUEPRINT_SELECT → 回到 BUILD(idle)
- BLUEPRINT_MOVE(isInserting=true) → 丢弃插入，回到 BUILD(idle)
- BLUEPRINT_MOVE(isInserting=false) → 取消移动，回到 BLUEPRINT_SELECT(保持选中)

### Selector 层 (selectors.ts)

`src/store/selectors.ts` (184 行, 37 个) 提供类型窄化的 Zustand selector，从 `modeState` 判别联合中安全提取子状态：

```typescript
// 模式判别
selectIsBuildMode(s)             // s.modeState.kind === 'BUILD'
selectIsWireMode(s)              // s.modeState.kind === 'WIRE'
selectIsDeviceSelectMode(s)      // s.modeState.kind === 'DEVICE_SELECT'
selectIsMoveSelectionMode(s)     // s.modeState.kind === 'MOVE_SELECTION'
selectIsBlueprintSelectMode(s)   // s.modeState.kind === 'BLUEPRINT_SELECT'
selectIsBlueprintMoveMode(s)     // s.modeState.kind === 'BLUEPRINT_MOVE'

// WIRE 子类型判别
selectIsWireSolid(s)             // WIRE 且 portType === 'Solid'
selectIsWireLiquid(s)            // WIRE 且 portType === 'Liquid'

// BUILD 子状态
selectPlacing(s)                 // modeState.placing (窄类型)
selectIsPlacing(s)               // placing !== null
selectSelectedMachineId(s)       // placing.selectedMachineId
selectPreviewRotation(s)         // placing.previewRotation
selectBuildOffset(s)             // placing.buildOffset
selectIsPickup(s)                // placing?.movingMachineBackup !== null

// WIRE 子状态
selectWirePortType(s)            // modeState.portType
selectIsConnecting(s)            // connecting !== null
selectConnecting(s)              // modeState.connecting (窄类型)
selectAvailablePorts(s)          // connecting.availablePorts
selectLShapeMode(s)              // connecting.lShapeMode
selectIsContinuing(s)            // connecting.isContinuing

// DEVICE_SELECT / MOVE_SELECTION 子状态
selectSelectionStart/End(s)      // modeState.selectionStart/End
selectSelectedMachineIds(s)      // DEVICE_SELECT/MOVE_SELECTION 下分别取
selectHasSelection(s)            // 直接读 modeState 避免创建中间数组
selectMoveAnchor(s)              // modeState.moveAnchor
selectMovingMachinesSnapshot(s)
selectMovingConnectionsSnapshot(s)
selectIsCopying(s)               // modeState.isCopying

// BLUEPRINT_SELECT / BLUEPRINT_MOVE 子状态
selectSelectedChildNodeId(s)     // modeState.selectedChildNodeId
selectBlueprintMoveChildNodeId(s)// modeState.childNodeId
selectBlueprintMovePreviewOffset(s)
selectBlueprintMoveIsValid(s)    // modeState.isValidPosition

// 蓝图树导航（工作视图已含展平后代，此处只做归属过滤）
selectViewingNodeId(s)           // 当前编辑的蓝图节点 ID
selectViewingAncestorPath(s)     // 祖先节点 ID 路径
selectDescendantMachines(s)      // 工作视图中 blueprintNodeId ≠ viewing 的机器（后代展平实体）
selectDescendantConnections(s)   // 工作视图中 blueprintNodeId ≠ viewing 的连线（后代展平实体）
```

`EMPTY_ARRAY` 常量提供稳定的空数组引用，避免 selector 每次返回新 `[]` 导致 Zustand 误判状态变更。

### 画布系统（基于 PixiJS v8 WebGL）

画布渲染已于 2026-07-16 从 DOM/CSS/SVG 迁移至 PixiJS v8 (WebGL)；生命周期、事件与状态同步全部收敛到 `CanvasController`（P2 架构收敛）。

| 层 | 实现方式 | 关键参数 |
|----|----------|----------|
| 网格线 | `GridLayer`：TilingSprite 平铺 40×40 纹理（1px 线）+ Graphics 4px 边框 | GRID_SIZE=40, alpha 0.5 |
| 机器 | `MachineRenderer`：Container + Graphics 机身 + Sprite 图标 + Text 标签 | zIndex = base + mask×2 + 1；`cullArea` 本地裁剪；对象池按 id 复用 |
| 传送带连线 | `ConnectionRenderer`：Graphics 双线 [outline, fill]，按 portType 分两图层 | Solid=黄, Liquid=蓝；后代连线 alpha 0.5 |
| 平移/缩放 | `world.position` / `world.scale` | zoom 范围 0.18~3.0，clampPan 约束 |
| 坐标转换 | `screenToGrid = world.toLocal(global) / GRID_SIZE`（整数格） | PixiJS 原生 transform |

**事件架构**（P2 完成）：事件全部在 `CanvasController` 内绑定到 `app.stage`（pointerdown/up/upoutside/globalpointermove/wheel/click/tap/pointertap + canvas 原生 contextmenu）。`toNormalized(e)` 是**唯一接触坐标差异的位置**——统一把 PixiJS `e.global`（画布空间像素）换算为网格坐标，产出 `NormalizedPointer { x, y, grid, gridFrac, button, buttons, shiftKey, ctrlKey }`。平台语义补齐：中键平移、滚轮锚定缩放、click 仅 button===0（中键不触发提交）、tap/pointertap 映射统一提交入口、右键 contextmenu preventDefault → `cancelOperation()`、指针越界清空 hover。

**CanvasController**（`src/pixi/CanvasController.ts`）：无框架 TS 类，命令式同步模式。
- 生命周期：`attach(el)` / `detach()` 幂等状态机 + `attachGen` 代数令牌，StrictMode 双挂载安全（不产生双实例/双订阅/双 canvas）；attach 提前订阅 store，`fullSync` 在末尾保证首帧完整性
- 同步契约：`useGameStore.subscribe()` → `onStoreChange(state, prevState)` 按**引用 diff** 增量更新场景图
- diff 粒度：zoom/pan → viewport；gridW/H → 网格层；machines/connections 引用变化 → 全量重同步，否则仅选中高亮（`selectionIdsChanged` 轻量判断，框选拖拽不触发高亮重绘）；modeState 变化时 WIRE 仅 connecting 字段变化 → 只重画预览线（`previewOnly`）；hoverPosFrac → Ghost/批量移动预览跟随鼠标
- 缓存：机器 Container 对象池（machinePool）、连线 Graphics 池（connectionPool: id → [outline, fill]）、`buildPowerGrid` 结果 WeakMap（按 machines 引用命中）

**modeHandlers.ts**（`src/pixi/modeHandlers.ts`）：纯函数模式处理器（`createModeHandlers(ctx)`），从 useWireMode / useSelectionMode / useBlueprintSelectMode 逐条搬移，只接收已归一化事件，按 `modeState.kind` 分发 onDown/onUp/onMove/onTap；BLUEPRINT_SELECT 命中通过 doc 树递归（`isInSubtree` / `findDirectChildContaining`，环防护）。

**PixiGrid.tsx**：只做 `useEffect` attach/detach（幂等）+ `classNames`（.grid-container/.wiring-mode/.panning）；controller 用 `useState` 惰性创建（只随组件生命周期存活）；`useKeyboardShortcuts({ getHoverGridPos })` 与 `useWASDPan()` 作为普通 hook 组合。

### 寻路系统（单 L 形路由 + 掩码碰撞）

`trySingleLRoute()` 是**单 L 形路由**：沿 firstAxis 走第一段到拐点，再垂直走到终点，任一段碰撞即返回 null。
- 双 L 形 `routeManhattan` 已删除（无调用方，2026-07 重构）
- `lShapeMode` 三态：auto（先主方向，失败换垂直方向）/ perpendicular（垂直优先）/ same-dir（同向）
- `findRouteForMachine` / `findRouteToGround` 遍历输入端/目标点尝试 L 形；真实路径被阻挡时返回**忽略障碍的视觉 fallback 路径**（isValid=false，预览变红）

**占用网格（掩码系统）**：
- `Mask.FromOccupancy({ machines, connections, gridW, gridH, excludePortType })` — 机器掩码 MergeInPlace + 连线 WriteValue；`excludePortType` 使同类型连线不进网格（可通过，交叉点放桥）；取代旧 `buildMergedGrid`
- `buildConnectionGrid`（同类型连线占用）/ `buildExistingCornerGrid`（已有线拐弯点，桥不能放）
- 阻挡判断：`IsBlocked(x, y, connMask)` → `(grid & connMask) !== 0`
- 桥冲突判断：`(bridgeMask & cellMask) !== connMask`
- 拐弯不进网格，作为独立约束在 `validateRouteConflicts` 中检查
- `resolveMachineMasks(machines)` 把 PlacedMachine[] 解析为 `MachineMaskEntry[]`（复用 cfg.mask4 旋转缓存）
- 性能：O(path length)；每帧三网格重建由 connectionSlice 的模块级 `_gridCache`（引用相等命中）消除

### 撤销/重做

- 快照粒度 = `{ machines, connections, doc }`（doc 不可变更新，快照保留旧引用 → **结构共享零拷贝**）
- `takeSnapshot()` 在 mutation 前由各切片内部调用，推入 `history.past`，清空 `history.future`
- `undo()` / `redo()` 先调用 `cancelOperation()` 清理活跃操作，再恢复快照，最后 `saveDoc()` 落盘（doc 是唯一持久真相源，必须与历史同步）
- 导航/加载（`loadBlueprint` / `createBlueprint` / `loadGame` / `resetGame`）清空历史
- **上限 50 步**，超出上限时自动丢弃最旧快照，防止内存无限增长

### 分享编码（V3 二进制格式）

- 自定义紧凑二进制编码：每台机器 3 字节 ID(ascii) + 1字节x + 1字节y + 1字节rotation
- 连线用 2-bit 打包方向(0=Up,1=Right,2=Down,3=Left)，1字节存4步
- base64url 编码为 URL query param `?bp=`，生成的链接极短
- `captureBlueprintScreenshot()` 从活动 CanvasController 的 PixiJS canvas 白底合成 PNG（`activeCanvasController` 模块级引用；截图范围为当前视口含缩放/平移）；html2canvas 已移除

### 连线创建流程（完整链路）

1. 按 E 键(WIRE_SOLID/传送带)或 Q 键(WIRE_LIQUID/管道)进入 WIRE 模式 → 点击机器输出端口或端口外侧格子
2. `startConnecting(ports, portType)` — 初始化连接状态（越界端口过滤 + isViewingOwn 守卫），保存端口类型及可用端口列表（含 facing 信息），`modeState` 进入 WIRE(connecting≠null)
3. 鼠标移动 → `updatePreview(pos)` — 实时计算到鼠标的 L 形路径，检测输入端吸附（多端口同格时按接近方向选择正确的side）；路径不合法时显示红色预览
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
  mask: Mask;            // 未旋转掩码（rot=0），封装在 src/utils/mask.ts
  mask4?: Mask[];        // 4 种旋转后的掩码缓存 [rot0,rot1,rot2,rot3]，模块加载时填充
}

interface PortConfig {
  x: number; y: number; // 相对机器左上角
  side: Side;           // 端口所在边
  type: PortType;       // 物流类型
  autoConnect: boolean; // 是否自动吸附物流器(桥/分流器等1x1设备)
}

interface PlacedMachine { id: MachineId; machineId: string; x: number; y: number; rotation: Direction; blueprintNodeId?: string }  // blueprintNodeId = 归属蓝图节点（展平/新建时标注）
interface Connection { id: string; tailFacing: Direction; path: Point[]; headFacing: Direction; portType: PortType; blueprintNodeId?: string }

// 子蓝图只读摘要（BLUEPRINT_MOVE 预览用）
interface BlueprintSummary { nodeId: string; name: string; gridW: number; gridH: number }

// 虚拟机器（蓝图接口引脚，掩码 0x00，展平时过滤）
type VirtualMachineId = 'sin' | 'sot' | 'lin' | 'lot';

// Side → Direction 映射常量
const sideToDir: Record<Side, Direction> = { top: 0, right: 1, bottom: 2, left: 3 };
```

## 机器配置完整清单

`config/machines.ts` 定义 43 种机器 + 4 种虚拟机器（`sin`/`sot`/`lin`/`lot`，蓝图接口引脚，掩码 0x00，`flattenNode`/展平时过滤，`isVirtualMachine()` 判断）。`Toolbar.tsx` 的 `MACHINE_GROUPS` 按定义顺序分组展示。

| 分类 | Tab | 数量 | 机器 |
|------|-----|------|------|
| 核心 | core | 1 | pco |
| 物流 | logistics | 12 | lbr, spl, mrg, iip, pbr, psp, pmg, pip, cpe, cpx, mce, mcx |
| 仓储存取 | storage | 6 | pst, wsp, wpp, ltk, wss, wsl |
| 基础生产 | production | 9 | ref, rfl, cru, asm, mol, shv, pln, pll, wwt |
| 合成制造 | processing | 10 | cas, fil, fll, sel, grn, rea, era, tyh, pur, dis |
| 电力 | power | 5 | sup, xrs, rpt, xrr, thp |

**图标覆盖**：43 台机器中仅 24 台有 `.webp` 图标；图标 URL 统一走 `utils/machineIcons.ts`（`import.meta.glob` 静态映射，打包行为确定——小文件如 pco.webp 会被 Vite 内联为 data URL 进 JS，大文件走 assets/ 哈希文件名）；`TextureLoader` 用 `Assets.load` + skip 策略批量预加载，缺失的标记为 null，`MachineRenderer` 降级为文字标签。

详细开发历史见 [CHANGELOG.md](./CHANGELOG.md)。

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

- `Mask` 类（`src/utils/mask.ts`）— 封装二维占用掩码：`get(x,y)` / `IsBlocked(x,y,mask)` / `HasCollision(other,ox,oy)` / `Merge` / `MergeInPlace` / `TryMerge` / `TryMergeInPlace` / `ClearRegion` / `WriteValue`，使用一维 `Uint8Array` 存储
- `Mask.Uniform(w, h, value)` — 创建全同值掩码
- `Mask.FromMask(cfgMask, rotation)` — 从配置掩码 + 旋转创建新掩码（4 方向旋转映射）
- `Mask.FromConnection(path, portType)` — 从连线路径创建掩码（包围盒尺寸）
- `Mask.FromOccupancy({ machines, connections, gridW, gridH, excludePortType })` — 机器 + 连线组合构建入口（取代旧 `buildMergedGrid`；`excludePortType` 排除同类型连线）
- `Mask.FromCornerPoints(corners, gw, gh)` / `buildExistingCornerGrid` — 已有连线拐弯点网格
- `connZ(base, mask)` / `machineZ(base, mask)` — 渲染 z-index 计算

### 渲染分层

| 层 | 基底 | 公式 |
|------|:---:|------|
| 常态 | 100 | 连线 = 100 + mask×2，机器 = 100 + mask×2 + 1 |
| 批量移动 | 700 | 同上 |
| Ghost 放置 | 1300 | 同上 |

---

## 设计决策与已知限制

以下为刻意为之的设计决策，非待修复项。改进方向见 [ROADMAP.md](./ROADMAP.md)。

- **单一真相源（FactoryDoc）** — 蓝图的"已提交"状态只存在于 `doc`；store 的 `machines[]/connections[]` 是检出式工作视图（自有内容 + 后代展平），不是第二份真相，掩码等派生数据不持久化、用时现算
- **共享蓝图检出式语义** — 编辑发生在工作视图，保存（`saveCurrentBlueprint`）才 commit；`refCount > 1` 的共享节点保存时 `forkCommit`（旧节点不动，新节点承载内容，当前父链 childRef 重指），其他调用方保持旧版本，减少用户心智负担
- **历史快照含 doc** — undo/redo 需要同时恢复已提交状态，故快照 = `{ machines, connections, doc }`（结构共享，开销≈引用）
- **旧 localStorage 数据直接丢弃** — 唯一 key `zmd_doc_v1`；旧格式（`zmd_registry` / `zmd_blueprints` / `zmd_last_blueprint_id`）不迁移、无清理逻辑（快速开发阶段）
- **撤销历史不捕获视图状态**（zoom/pan）— 撤销只还原数据，保留用户当前视口位置
- **历史快照不去重** — 去重引入比较开销，50 步上限已足够防止内存问题
- **`Gas` 端口类型** — 为游戏未来内容保留，暂不实现渲染路径
- **分享格式版本字节** — 当前编码无版本号，未来重新设计分享格式时一并处理

---

## 部署

- GitHub Pages（`.github/workflows/deploy.yml` 手动触发；GitHub Pages 不支持 SPA 路由回退，部署时把 `index.html` 复制为 `404.html` 处理未知路径）


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
- **颜色**：优先使用 CSS 变量（`var(--gray-light)` 等）或 `config/colors.ts` 常量（PixiJS 侧），避免硬编码 hex
- **样式**：SCSS 嵌套语法，不另建 CSS module
- **类名拼接**：`classNames()` 辅助动态类名
- **撤销支持**：store 中 mutation 前调 `get().takeSnapshot()`
- **领域层约束**：`src/domain/` 只放纯函数（零框架依赖），禁止反向订阅 store/组件；doc 变更后由调用方负责 `saveDoc()`
- **非组件取 store**：`useGameStore.getState()` 用于事件回调、非组件函数等 React 上下文之外的场景
- **import 顺序**：React → 第三方库 → 项目内部（`@/` 别名）
- **Commit 粒度**：一个 commit = 一个可独立理解的变化，git log --oneline 能一眼看懂，git show 能 30 秒审完。多文件同一概念可合为一个，无关改动拆开。**同类小改进（如多个待办清单项的清理）合为一个 commit**，方便查找回顾。不用 "WIP" 类中间态 commit，push 前 rebase squash。
