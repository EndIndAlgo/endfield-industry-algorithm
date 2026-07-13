# 蓝图树重构计划

## 概述

将当前扁平蓝图列表重构为**蓝图树**模型。每个节点是蓝图（BlueprintSnapshot），节点间通过 `children` 构成树形关系。蓝图不可变——编辑 = fork，保存 = 新 snapshot 替换 viewing 指向。

---

## 核心概念

- **BlueprintSnapshot**：不可变蓝图快照。包含本节点机器/连接、子蓝图引用列表、三层掩码。`nodeId` 跨版本唯一，`blueprintId` 跨版本稳定。
- **BlueprintRegistry**：`Record<nodeId, BlueprintSnapshot>` 扁平注册表。所有快照存在此表，通过 nodeId 引用。
- **Fork 模型**：编辑时操作的是当前 viewing 快照的复制品（store 中的 machines/connections）。保存时生成新 snapshot（新 nodeId），旧 snapshot 保留给其他引用者。
- **不可变引用**：子蓝图以 `BlueprintChildRef { childNodeId, x, y }` 挂载，零碰撞约束——子蓝图总掩码与父蓝图总掩码不得有任何重叠（含同类型传送带交叉，不生成桥）。
- **复制**：深拷贝目标蓝图的机器/连接（新 UUID），子蓝图仍按不可变引用处理。

---

## 数据模型

### 新增类型 (`src/types.ts`)

```typescript
// ── 蓝图快照（不可变）──
export interface BlueprintSnapshot {
  nodeId: string;            // 每次保存生成新 UUID，跨版本唯一
  blueprintId: string;       // 跨版本稳定，标识"同一个蓝图"
  name: string;
  version: number;           // 每次保存 +1
  machines: PlacedMachine[]; // 仅本节点直接拥有的机器
  connections: Connection[]; // 仅本节点直接拥有的连接
  children: BlueprintChildRef[];
  mask: Mask;                // ownMask：本节点机器+连接的包围盒掩码
  childrenMask: Mask;        // 所有子节点 totalMask 按偏移 OR
  totalMask: Mask;           // mask OR childrenMask（快速总查询）
  bbox: { width: number; height: number; minX: number; minY: number };
  refCount: number;          // 被多少个其他 snapshot.children 引用
  createdAt: number;
  updatedAt: number;
}

export interface BlueprintChildRef {
  childNodeId: string;       // → BlueprintSnapshot.nodeId
  x: number; y: number;      // 子蓝图在父坐标系中的偏移
}

export type BlueprintRegistry = Record<string, BlueprintSnapshot>;
```

### PlacedMachine / Connection 扩展

```typescript
interface PlacedMachine {
  // ... 现有字段不变
  blueprintNodeId: string;   // NEW: 归属节点
}

interface Connection {
  // ... 现有字段不变
  blueprintNodeId: string;   // NEW: 归属节点
}
```

### 不变式

1. Registry 中 `nodeId` 全局唯一；`blueprintId` 可重复（同蓝图多版本）
2. `refCount` = registry 中所有其他 snapshot 的 `children` 引用此 nodeId 的次数
3. 子蓝图 totalMask 与父蓝图 totalMask（不含该子蓝图）在任何坐标下 `HasCollision === false`
4. Store 中的 machines/connections 是当前 viewing 节点及其所有后代的展平结果

---

## Store 变更

### BlueprintSlice 重写 (`src/store/slices/blueprintSlice.ts`)

**State 新增：**
```
blueprintRegistry: BlueprintRegistry     // 所有快照注册表
currentViewingNodeId: string | null      // 当前编辑的节点
currentAncestorPath: string[]            // 根→当前节点的 nodeId 链（面包屑导航）
```

**Actions：**
| Action | 说明 |
|--------|------|
| `createBlueprint()` | 新建空根节点 → registry |
| `saveBlueprint(name)` | 固化当前工作副本 → 新 snapshot，旧版 refCount 不变，viewing 切换到新 nodeId |
| `startImportToCurrent(nodeId, mode)` | 进入 BLUEPRINT_MOVE 定位，`mode: 'reference' \| 'copy'` |
| `commitImport(ox, oy)` | 确认导入：碰撞检查通过后展平机器/连接，更新子蓝图引用计数 |
| `startMoveChild(nodeId)` | 进入 BLUEPRINT_MOVE 移动已有子蓝图 |
| `commitMoveChild(ox, oy)` | 确认移动位置 |
| `removeChildBlueprint(nodeId)` | 从 children 移除，移除展平机器/连接，refCount-- |
| `deleteBlueprintNode(nodeId)` | 从 registry 删除（仅 refCount=0 时可操作） |
| `navigateIntoChild(nodeId)` | 切换 viewing 为子节点（进入子蓝图编辑） |
| `navigateToParent()` | ancestorPath 回退，恢复父节点为 viewing |
| `syncStoreFromViewing()` | 内部方法：根据 viewing 节点递归展平 → store.machines/connections |

**Fork / Save 流程：**
1. 用户打开 blueprint → fork：展平快照到 store，`currentViewingNodeId = snapshot.nodeId`
2. 用户在编辑器中操作 → 正常修改 store.machines/connections
3. 保存 → 从 store 筛选 `blueprintNodeId === viewingNodeId` 的数据
4. 计算 ownMask/childrenMask/totalMask → 构建新 BlueprintSnapshot（新 nodeId，version++）
5. 旧 snapshot refCount 不变（仍被其他引用者持有）
6. 新 snapshot 写入 registry
7. `currentViewingNodeId` 更新为新 nodeId
8. **其他引用旧版本的节点保持不变**（= fork 成功）

**不可变引用导入流程：**
1. 从 registry 取 childSnapshot
2. 进入 BLUEPRINT_MOVE → 用户拖拽定位
3. 实时 `HasCollision(viewingTotalMask, child.totalMask, ox, oy)` → 必须 false
4. 确认：viewing 快照 children 新增 `{ childNodeId, ox, oy }`
5. childSnapshot.refCount++
6. 递归展平 child 机器/连接（blueprintNodeId 用 child 及后代的各自 nodeId，坐标加累积偏移）
7. 追加到 store.machines/connections

**复制导入流程：**
1. 深拷贝 childSnapshot 的本节点机器/连接（新 UUID，blueprintNodeId = viewingNodeId）
2. childSnapshot.children 列表的引用保留（同 childNodeId），各 child refCount++
3. 碰撞检查用**正常规则**（同类型交叉允许生成桥）
4. 展平复制品及其子蓝图到 store

### HistorySlice 扩展 (`src/store/slices/historySlice.ts`)

```typescript
interface HistorySnapshot {
  machines: PlacedMachine[];
  connections: Connection[];
  blueprintRegistry: BlueprintRegistry;  // 浅拷贝（snapshot 本身不可变）
}
```

撤销/重做时恢复 registry 引用，同步 store。

### ModeSlice 新增 variant (`src/store/slices/modeSlice.ts`)

```typescript
// BLUEPRINT_SELECT — 子蓝图选择（快捷键 B）
| {
    kind: 'BLUEPRINT_SELECT';
    selectedChildNodeId: string | null;   // 选中的子节点
  }

// BLUEPRINT_MOVE — 子蓝图移动/导入
| {
    kind: 'BLUEPRINT_MOVE';
    childNodeId: string;
    startOffset: Point;
    currentOffset: Point;
    isValidPlacement: boolean;
    isImporting: boolean;                 // true=导入中，false=移动已有
    importMode?: 'reference' | 'copy';
  }
```

Escape 处理：
- BLUEPRINT_SELECT → 清空选中，回到 BUILD
- BLUEPRINT_MOVE(isImporting=true) → 取消导入，丢弃加载的机器/连接
- BLUEPRINT_MOVE(isImporting=false) → 还原子蓝图位置

### Selector 新增 (`src/store/selectors.ts`)

```
selectIsBlueprintSelectMode(s)     // modeState.kind === 'BLUEPRINT_SELECT'
selectIsBlueprintMoveMode(s)       // modeState.kind === 'BLUEPRINT_MOVE'
selectSelectedChildNodeId(s)       // modeState.selectedChildNodeId
selectViewingNode(s)               // registry[currentViewingNodeId]
selectViewingChildren(s)           // viewing 节点的 children 列表
selectChildSnapshot(s, nodeId)     // registry[nodeId]
```

---

## 掩码系统 (`src/utils/grid/blueprintMask.ts` — 新增文件)

```typescript
// 计算本节点自己的掩码
computeBlueprintOwnMask(machines, connections): { mask: Mask; bbox: BoundingBox }
  → 遍历所有机器和连接，在包围盒尺寸下构建 Mask

// 计算所有子蓝图的合并掩码
computeBlueprintChildrenMask(children, registry): { mask: Mask; bbox: BoundingBox }
  → 遍历 children，从 registry 读取 child.totalMask，MergeInPlace at offset

// 计算总掩码
computeBlueprintTotalMask(ownResult, childrenResult): { mask: Mask; bbox: BoundingBox }
  → ownMask.Clone().MergeInPlace(childrenMask, 0, 0) with proper coordinate alignment
```

**掩码更新时机：**
- 保存（saveBlueprint）→ 每次更新 snapshot 的三个 mask
- 导入/移除子蓝图 → 重新计算 childrenMask 和 totalMask
- 机器放置/连线提交 → 运行时使用 totalMask 做碰撞检测（无需每次重建）

**碰撞检测适配：**
- `checkPlacementCollision` → 接受预计算 `totalMask` 参数替代每次重建
- `buildMergedGrid` / `updatePreview` → 同上
- 子蓝图导入碰撞 → `viewingTotalMask.HasCollision(childTotalMask, ox, oy)`（零重叠）
- 子蓝图移动碰撞 → `(viewingTotalMask 排除该子节点).HasCollision(childTotalMask, ox, oy)`

---

## 渲染变更

### Machine.tsx

子蓝图机器（`blueprintNodeId !== currentViewingNodeId`）：
- 边框色改为半透明蓝色（CSS 类 `.machine-readonly`）
- 端口隐藏
- 长按拾取禁用
- 选中禁用（不在 DEVICE_SELECT 范围内）
- hover 标签底部追加子蓝图名称行（小字灰色，从 registry 读 snapshot.name）
- 供电范围虚线不渲染

### GhostPreview.tsx

只在 viewing 蓝图区域渲染预览。子蓝图机器格 → 不渲染预览。

### ConnectionSVGLayer.tsx

子蓝图的连线正常渲染。连线创建时起点/终点检查 `machine.blueprintNodeId === viewingNodeId`。

### BLUEPRINT_SELECT 选中高亮

选中子蓝图时绘制包围盒矩形（CSS 类 `.blueprint-selection-box`，区别于 `.selection-box`）：
- 黄色粗虚线边框
- 读取 childSnapshot.bbox 计算屏幕尺寸

### BLUEPRINT_MOVE 预览

复用或扩展 `BatchMovePreview.tsx` 变体：显示子蓝图整体虚影（半透明机器 + 连线），实时碰撞无效时变红。

---

## BlueprintList 重构 (`src/components/BlueprintList.tsx`)

### 布局

从扁平网格改为**树形列表**：

```
[新建蓝图] 按钮

根节点列表（registry 中不被任何 children 引用的快照）
  ├─ 蓝图A (v3, 2台机器, 3连线, 被1处引用)
  │   ├─ 子蓝图B (v2, 0台, 0连线, ref:0)
  │   └─ 子蓝图C (v1, 5台, 8连线, ref:0)
  ├─ 蓝图D (v5, 10台, 15连线, 被2处引用)
  └─ ...
```

### 三种操作

每个节点提供三个操作：
| 操作 | 说明 | 结果 |
|------|------|------|
| **编辑** | Fork 为 viewing 蓝图 | 导航到编辑器，关闭列表 |
| **导入(引用)** | 不可变引用导入 | 若已有 viewing 蓝图 → BLUEPRINT_MOVE；否则提示先打开蓝图 |
| **导入(复制)** | 复制导入 | 同上，走 copy 逻辑 |

若当前不在编辑器（无 viewing 蓝图），"导入"按钮 disabled + tooltip 提示。

"删除"按钮仅 `refCount === 0` 时可用。

---

## 交互流程

### 快捷键

| 键 | 模式 | 行为 |
|----|------|------|
| B | 任意模式 | 进入 BLUEPRINT_SELECT（仅当 viewing 有 children） |
| M | BLUEPRINT_SELECT(有选中) | 进入 BLUEPRINT_MOVE（移动当前选中子蓝图） |
| Delete / F | BLUEPRINT_SELECT(有选中) | 删除选中子蓝图引用 |
| Escape | BLUEPRINT_SELECT | 回到 BUILD |
| Escape | BLUEPRINT_MOVE | 取消移动/导入，回 BLUEPRINT_SELECT |

### 子蓝图操作流程

1. **选中**：B 键 → 光标变十字 → 单击子蓝图内任意机器 → 选中整个子蓝图（包围盒高亮）
2. **移动**：选中后按 M 或直接拖拽选中框 → BLUEPRINT_MOVE → 跟随鼠标预览新位置
3. **放置**：单击确认新位置 → 更新子蓝图偏移 → 重新计算掩码
4. **删除**：选中后按 Delete → 确认弹窗 → 级联移除容器和所有后代机器/连接

### 面包屑导航

编辑器顶部（Header 下方）显示面包屑：
```
[根蓝图名称] > [子蓝图A] > [当前编辑的蓝图名]
```
点击面包屑节点 → `navigateIntoChild` 或 `navigateToParent`。

---

## 工具栏变更 (`src/components/Toolbar.tsx`)

新增按钮：
- **B 按钮** → BLUEPRINT_SELECT（仅当 viewing 有 children 时可用/显示）

---

## 实施顺序

| # | 阶段 | 文件 | 预估 |
|---|------|------|------|
| 1 | 数据模型 | `types.ts`, `store/slices/types.ts` | 新增 BlueprintSnapshot/Registry/ChildRef 类型；PlacedMachine/Connection 加 `blueprintNodeId` 字段；ModeState 加 BLUEPRINT_SELECT/BLUEPRINT_MOVE variant；BlueprintSlice 接口重写；HistorySnapshot 扩展 |
| 2 | Mask 计算 | `utils/grid/blueprintMask.ts` (新文件) | computeBlueprintOwnMask、computeBlueprintChildrenMask、computeBlueprintTotalMask |
| 3 | BlueprintSlice 核心 | `store/slices/blueprintSlice.ts` | registry + fork/save/load/flatten/sync + insertChild/removeChild + navigateInto/ToParent |
| 4 | HistorySlice 扩展 | `store/slices/historySlice.ts` | 快照加 blueprintRegistry |
| 5 | ModeState + Selector | `store/slices/modeSlice.ts`, `store/selectors.ts` | 新 variant + cancelOperation 处理 + 新 selector |
| 6 | Machine 只读渲染 | `components/Machine.tsx`, `components/Machine.scss` | `.machine-readonly` 样式 + 端口隐藏 + 子蓝图名显示 |
| 7 | GhostPreview 适配 | `components/GhostPreview.tsx` | 子蓝图区域跳过预览 |
| 8 | BLUEPRINT_SELECT 交互 | `hooks/grid/useBlueprintSelectMode.ts` (新文件), `SelectionBox.tsx` | B 键监听 + 单击选中子蓝图 + 包围盒高亮 |
| 9 | BLUEPRINT_MOVE 交互 | hooks 同上, `BatchMovePreview.tsx` | 拖拽移动 + 实时碰撞检测 + 确认/取消 |
| 10 | Connection 适配 | `store/slices/connectionSlice.ts` | 连线端点检查 blueprintNodeId；碰撞检测用预计算 mask |
| 11 | Machines 适配 | `store/slices/machinesSlice.ts` | 碰撞检测用预计算 mask；blueprintNodeId 处理 |
| 12 | BlueprintList 重构 | `components/BlueprintList.tsx` | 树形列表 + 三种操作 |
| 13 | 面包屑导航 | `components/Header.tsx` 或新组件 | 路径显示 + 点击导航 |
| 14 | Toolbar 按钮 | `components/Toolbar.tsx` | B 按钮 |

**依赖关系**：
- 1 → 全部
- 2, 5 → 3
- 3 → 8, 9, 10, 11, 12
- 5 → 8, 9
- 6, 7 可与 3 并行开发
- 12, 13 独立性强，可在 3 完成后并行
- 10, 11 可与 3 并行（只需知道蓝图节点 id 如何获取）

---

## 暂不纳入本期范围

- 子蓝图旋转（数据结构保留，实现延后）
- 分享格式重设计
- Git 式 diff/merge 两个版本
- 跨蓝图供电
