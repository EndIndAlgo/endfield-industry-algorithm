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
- **Zustand 5** 状态管理（切片模式）
- **SCSS** 组件级样式 + **lucide-react** 图标库 + **classnames** 辅助
- 路径别名: `@` → `src/`

## 项目结构

```
src/
├── main.tsx                       # 入口，ChakraProvider + StrictMode
├── App.tsx                        # 根组件，uiView 条件路由 + 键盘快捷键
├── App.css                        # 根布局样式
├── index.css                      # 全局 CSS 变量、字体、.gray-btn/.yellow-btn
├── types.ts                       # 共享类型 + GameMode/Side 常量映射
├── types/
│   └── opencc-js.d.ts             # opencc-js 环境类型声明
├── store/
│   ├── gameStore.ts               # Zustand store 入口（17 行，组合各切片）
│   ├── settingsStore.ts           # 语言偏好，persist 到 localStorage
│   └── slices/
│       ├── types.ts               # 各切片接口定义 + GameState 组合类型
│       ├── canvasSlice.ts         # 画布缩放/平移/网格尺寸
│       ├── machinesSlice.ts       # 机器 CRUD、模式切换、取消操作
│       ├── wiringSlice.ts         # 布线状态、路径预览、提交（含桥梁/分割逻辑）
│       ├── selectionSlice.ts      # 框选、批量移动、复制选区
│       ├── historySlice.ts        # 撤销/重做快照
│       └── blueprintSlice.ts      # UI 视图切换、蓝图加载/插入
├── config/
│   ├── machines.ts                # 24 种机器定义（MachineConfig[] + getMachineConfig()）
│   ├── materials.ts               # 83 种材料定义（Record<string, Material>）
│   ├── constants.ts               # 网格尺寸预设（24×24 ~ 70×70）
│   └── memberInfo.ts              # 团队成员信息（关于页面）
├── utils/
│   ├── gridUtils.ts               # L 形路由寻路、碰撞检测、占用网格、包围盒计算
│   ├── machineUtils.ts            # 旋转数学、供电范围计算
│   ├── shareUtils.ts              # V3 二进制分享编码/解析 + html2canvas 截图
│   ├── storage.ts                 # 蓝图 localStorage CRUD
│   └── toaster.ts                 # Chakra UI toaster 单例
├── hooks/
│   └── useChineseConverter.ts     # opencc-js 繁/简热切换（MutationObserver）
├── components/
│   ├── Grid.tsx                   # 核心画布（鼠标/键盘事件、平移/缩放、SVG 连线层）
│   ├── Grid.scss
│   ├── Machine.tsx                # 已放置机器（端口渲染、长按拾取、供电指示）
│   ├── Machine.scss
│   ├── Header.tsx                 # 顶部栏（网格尺寸选择、保存、分享、关于）
│   ├── Header.scss
│   ├── Toolbar.tsx                # 底部面板（模式切换 + 机器分类标签页）
│   ├── Toolbar.scss
│   ├── About.tsx                  # 关于/鸣谢页面
│   ├── BlueprintList.tsx          # 蓝图管理列表（卡片 + 抽屉详情）
│   ├── Settings.tsx               # 语言切换设置
│   ├── ShareModal.tsx             # 分享弹窗（URL 生成 + 截图预览）
│   ├── SaveDialog.tsx             # 保存命名对话框
│   ├── IconButton.tsx             # 可复用图标按钮 + CSS tooltip
│   ├── IconButton.scss
│   ├── OperationHints.tsx         # 上下文快捷键提示面板
│   ├── OperationHints.scss
│   ├── LoadingScreen.tsx          # 资源预加载启动画面（import.meta.glob eager）
│   ├── LoadingScreen.scss
│   └── ui/
│       ├── tooltip.tsx            # Chakra UI Tooltip 封装
│       └── About.scss             # About/Settings 共享样式
└── assets/
    ├── logo.png
    ├── loading.png
    ├── members/                   # 团队成员头像
    ├── machines/                  # 机器图标 .webp
    └── items/                     # 材料图标（LoadingScreen 预加载，item_0~item_131）
```

## 核心架构

### 组件树 & 数据流

```
main.tsx (ChakraProvider)
└─ App.tsx (uiView 路由)
    ├─ [editor]
    │   ├─ Header.tsx          → useGameStore (gridWidth/gridHeight/uiView/save…)
    │   │   └─ ShareModal.tsx  → generateShareUrl + captureBlueprintScreenshot
    │   ├─ Grid.tsx            → useGameStore（核心画布，约 30 字段）
    │   │   └─ Machine.tsx ×N  → useGameStore (mode/machines/wiringSource/zoom…)
    │   ├─ Toolbar.tsx         → useGameStore (mode/machines/selectedMachineId…)
    │   ├─ OperationHints.tsx  → useGameStore (mode)
    │   └─ SaveDialog.tsx
    ├─ [list]     → BlueprintList.tsx
    ├─ [about]    → About.tsx
    └─ [settings] → Settings.tsx → useSettingsStore
```

**数据流方向**: 用户交互 → 组件调用 store action → `set()` 更新状态 → React 重渲染受影响组件。  
**持久化**: 仅 explicit save → `storage.ts` → localStorage，无自动保存。  
**分享解析**: URL query param → `parseShareUrl()` → `loadGame()` 或 `startInsertBlueprint*()`。

### 状态管理：Zustand 切片模式

`gameStore.ts` 是 thin wrapper（17 行），通过 Zustand 切片模式组合 6 个子切片：

```typescript
export const useGameStore = create<GameState>()((...a) => ({
    ...createCanvasSlice(...a),
    ...createMachinesSlice(...a),
    ...createWiringSlice(...a),
    ...createSelectionSlice(...a),
    ...createHistorySlice(...a),
    ...createBlueprintSlice(...a),
}));
```

每个切片是一个 `StateCreator<GameState, [], [], SliceName>` 函数，**切片间可跨调用**（通过 `get()` 访问其它切片方法）。

| 切片 | 文件 | 职责 |
|------|------|------|
| Canvas | `canvasSlice.ts` | `zoom`, `pan`, `gridWidth/gridHeight`, `setZoom`, `setPan`, `setGridSize` |
| Machines | `machinesSlice.ts` | `machines`, `mode`, `selectedMachineId`, `previewRotation`, `movingMachineBackup`; CRUD、旋转预览、长按拾取、`cancelOperation` |
| Wiring | `wiringSlice.ts` | `connections`, `isWiring`, `isWiringValid`, `wiringSource`, `wiringFixedPath`, `wiringPreviewPath`; `startWiring`/`updateWiringPreview`/`addWiringAnchor`/`commitWiring`/`cancelWiring` |
| Selection | `selectionSlice.ts` | `selectionStart/End`, `selectedMachineIds`, `selectedConnectionIds`, `moveAnchor`, `movingMachinesSnapshot`, `isCopying`; 框选、批量移动、复制选区、删除 |
| History | `historySlice.ts` | `history: { past: HistorySnapshot[], future: HistorySnapshot[] }`; `takeSnapshot`/`undo`/`redo` |
| Blueprint | `blueprintSlice.ts` | `uiView`, `blueprintListMode`, `currentBlueprintId/Name`; `loadGame`/`resetGame`/`setUiView`/蓝图插入 |

**切片间交互关键路径**：
- `machinesSlice.cancelOperation()` 调用 `get().cancelWiring()` 和读取 `get().movingMachinesSnapshot`
- `selectionSlice.commitBatchMove()` 调用 `get().takeSnapshot()` 创建历史快照
- `historySlice.undo()/redo()` 调用 `get().cancelOperation()` 清理中间状态

### GameMode 状态机

```typescript
// src/types.ts
export const GameMode = {
  BUILD: 'BUILD',
  WIRE: 'WIRE',
  DEVICE_SELECT: 'DEVICE_SELECT',
  MOVE_SELECTION: 'MOVE_SELECTION',
  BLUEPRINT_PLACE: 'BLUEPRINT_PLACE'
} as const;
export type GameMode = typeof GameMode[keyof typeof GameMode];
```

代码中使用 `GameMode.BUILD`（字面量常量对象）而非裸字符串。

| 模式 | 触发方式 | 鼠标操作 | 渲染差异 |
|------|----------|----------|----------|
| BUILD | R 键 / 工具栏 | 单击放置机器、长按拾取 | 机器虚影 + 供电范围 + 端口箭头 |
| WIRE | E 键 / 工具栏 | 点击输出口开始、点击网格添加锚点、点击输入口完成 | 连线预览 SVG（虚线/实线） |
| DEVICE_SELECT | X 键 / 工具栏 | 拖拽框选 | 选择矩形 div |
| MOVE_SELECTION | 拖拽已选中项（或 M 键） | 移动坐标系 | 批量虚影 + 批量连线 SVG |
| BLUEPRINT_PLACE | 蓝图插入 | 单击确认放置 | 蓝图轮廓虚影 |

`cancelOperation()` (Escape) 统一处理各模式返回干净状态。

### 画布系统（基于 DOM，非 `<canvas>`）

| 层 | 实现方式 |
|----|----------|
| 网格线 | CSS `background-image` 渐变 |
| 机器 | 绝对定位 `div`，CSS 自定义属性 `--x`/`--y`/`--w`/`--h` 定位 |
| 传送带连线 | SVG `<polyline>` 叠加层（描边 + 填充双线效果） |
| 平移/缩放 | CSS `transform: translate(panX, panY) scale(zoom)` |
| 坐标转换 | `worldX = floor((screenX - panX) / (GRID_SIZE * zoom))` |

**缩放锚定鼠标位置**：缩放前后鼠标下的世界坐标保持不变，通过调整 `pan` 补偿。  
**GRID_SIZE**: 40px（硬编码在 `index.css` 的 `--grid-size` 和 `Grid.tsx` 中保持同步）。

### 寻路系统（L 形曼哈顿路由）

`routeManhattan()` 不是 A*，而是**双 L 形路由**算法：
1. 计算 `|dx|` 和 `|dy|`，确定主导轴
2. 尝试主导轴优先的 L 形路径（恰好 1 个转弯）
3. 若碰撞，尝试另一条 L 形（次轴优先）
4. 两者均失败则返回 null——用户需手动点击添加锚点绕过障碍

**占用网格**：`Uint8Array` 类型化数组，`buildOccupancyGrid(machines)` + `buildConnectionGrid(connections)` 合并为单一碰撞网格。  
**性能**：O(path length)，无 open/closed 集合，每次 `findPath` 需重建占用网格 O(n)。

### 撤销/重做

- 快照粒度为完整 `{ machines, connections }` 浅拷贝
- `takeSnapshot()` 在 mutation 前由各切片内部调用（如 `commitBatchMove`、`addMachine`），推入 `history.past`，清空 `history.future`
- `undo()` 先将当前状态推入 `future`，再恢复 `past.pop()`，同时调用 `cancelOperation()` 清理活跃操作
- `redo()` 对称处理
- 容量无上限

### 分享编码（V3 二进制格式）

- 自定义紧凑二进制编码：每台机器 3 字节 ID + 3 字节位置/旋转，连线用 2-bit 打包方向
- base64url 编码为 URL query param，生成的链接极短
- 第一字节为版本号（`3` = V3），兼容 V1/V2 旧格式（pako 解压 JSON）
- `captureBlueprintScreenshot()` 使用 html2canvas 克隆 DOM 截图

### 连线创建流程（完整链路）

1. 切换到 WIRE 模式 → 点击机器输出端口
2. `startWiring(tailPos, tailFacing, srcMachineId, portIndex)` — 初始化布线状态
3. 鼠标移动 → `updateWiringPreview(pos)` — 实时计算到鼠标的 L 形路径，检测输入端吸附
4. 可选点击网格 → `addWiringAnchor(pos)` — 固定路径锚点
5. 点击目标输入端口 → `commitWiring()`:
   - 计算 headFacing 方向
   - 检测与已有连线的交叉点
   - 交叉点自动放置物流桥 (`lbr`)
   - 分裂被交叉的连线 (`splitConnectionAt`)
   - 分裂新连线并合并到 store

### 关键类型（src/types.ts）

```typescript
type MachineId = string;
type Point = { x: number; y: number }
type Direction = 0 | 1 | 2 | 3  // 上右下左（顺时针）
type Side = 'top' | 'right' | 'bottom' | 'left'
type PortType = 'Solid' | 'Liquid' | 'Gas'
type GameMode = 'BUILD' | 'WIRE' | 'DEVICE_SELECT' | 'MOVE_SELECTION' | 'BLUEPRINT_PLACE'
type PlacedMachine = { id: string; machineId: string; x: number; y: number; rotation: Direction }
type Connection = { id: string; tailFacing: Direction; path: Point[]; headFacing: Direction }
type MachineConfig = { id, name, power, width, height, inputs: PortConfig[], outputs: PortConfig[], color, supplyRange?, autoConnect? }

// Side → Direction 映射常量（定义在 types.ts）
const sideToDir: Record<Side, Direction> = { top: 0, right: 1, bottom: 2, left: 3 };
```

## 已知问题

### 性能

- **零组件缓存**：无 `React.memo`、`useMemo`、`useCallback`——每次 store 变更触发 `Grid` 及全部 `Machine` 子组件重渲染
- **isMachinePowered 重复计算**：每个 `Machine` 渲染时重建整个供电网格 `Uint8Array`，复杂度 O(机器数 × 网格面积)
- **无空间索引**：`checkCollision` 和 `findPath` 每次遍历全部机器/连线
- **LoadingScreen eager 预加载全部物品图片**（`import.meta.glob` eager 模式）

### 代码质量

- **重复代码**：
  - 包围盒计算（minX/minY/maxX/maxY）在 `App.tsx`、`selectionSlice.ts`、`blueprintSlice.ts`、`shiftUtils.ts`、`gridUtils.ts` 等多处重复
  - `extendPoint` 函数在 `Grid.tsx` 内联定义 3 次（连接线 SVG、布线预览、批量移动预览）
  - SVG 连线 polyline 渲染逻辑在 3 处重复
- **无测试**：零测试文件、零测试依赖
- **无 Error Boundary**：任何组件崩溃即白屏

### 边界情况

- `findPath` 在 `machines` 为空时 `Math.max()` 返回 `-Infinity`，依赖 fallback `|| 60` 兜底
- `commitBatchMove` 碰撞检测未检查 `connections` 路径
- 网格尺寸切换不验证是否有机器超出新边界（超出网格的机器不可见但仍在 state 中）
- 平移无上下限，无"重置视图"按钮
- 4 种液体材料共用 `icon: 44`（`WATER_BOTTLE`、`JIN_CAO_SOLUTION_BOTTLE` 等）
- `Machine.tsx` 端口偏移量硬编码 `axisOffset = -4`

## 下一步改进计划

### 第一阶段：性能优化（高优先级）
- [ ] `Grid` 和 `Machine` 组件添加 `React.memo`
- [ ] 机器列表渲染用 `useMemo` 缓存
- [ ] `isMachinePowered` 结果缓存（供电网格仅机器变更时重建）
- [ ] `Grid.tsx` 中用 `useCallback` 稳定事件处理器引用

### 第二阶段：代码质量（中优先级）
- [ ] 提取重复的包围盒计算为 `getBoundingBox(machines, connections)` 工具函数
- [ ] 提取重复的 `extendPoint` 和 SVG 连线渲染为独立组件/函数
- [ ] 为核心逻辑添加单元测试（`routeManhattan`、`splitConnectionAt`、`commitWiring`、旋转数学）
- [ ] 添加 React Error Boundary 组件
- [ ] 修复 `commitBatchMove` 漏检连线碰撞
- [ ] 网格尺寸切换时验证机器是否越界

### 第三阶段：体验完善（低优先级）
- [ ] 添加视图重置按钮、平移范围限制
- [ ] 修复重复材料图标（icon: 44）
- [ ] 端口偏移量改为 CSS 计算而非魔术数字

## 部署

- Cloudflare Pages（`public/_redirects` 配置 SPA 回退：`/* /index.html 200`）
- Docker 多阶段构建（`node:20-slim` 构建 → `nginx:stable-alpine` 运行）

## TypeScript 约束

`tsconfig.app.json` 开启严格检查：
- `noUnusedLocals` / `noUnusedParameters` — 未使用变量编译报错
- `erasableSyntaxOnly` — 不允许运行时语义的 TS 语法（如 enum、namespace）
- `verbatimModuleSyntax` — import 必须保留原样（与 ES 模块兼容）
- `noUncheckedSideEffectImports` — 导入必须有副作用或类型导入标记
