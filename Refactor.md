# 蓝图树重构计划

## 核心理念

**蓝图 = 集成电路。** 一个蓝图封装一组机器和连线，对外表现为一台"大机器"——有固定空间占用、有接口引脚、可被选中/移动/删除。内部实现对外部透明。蓝图可以嵌套（子蓝图 = 子组件），形成树形结构。

---

## 数据模型

### BlueprintSnapshot（不可变）

```typescript
interface BlueprintSnapshot {
  nodeId: string;               // 每次保存生成新 UUID，全局唯一
  blueprintId: string;          // 跨版本稳定，标识"同一个蓝图"
  name: string;
  version: number;              // 每次保存 +1
  machines: PlacedMachine[];    // 仅本节点直接拥有（含虚拟机器）
  connections: Connection[];    // 仅本节点直接拥有
  children: BlueprintChildRef[];
  ownMask: Mask;                // 本节点机器+连接
  childrenMask: Mask;           // 所有子节点 totalMask 的 OR
  totalMask: Mask;              // ownMask | childrenMask（不持久化，加载时重算）
  createdAt: number;
  updatedAt: number;
}

interface BlueprintChildRef {
  childNodeId: string;          // → BlueprintSnapshot.nodeId
  x: number; y: number;         // 子蓝图在父坐标系中的偏移
}

type BlueprintRegistry = Record<string, BlueprintSnapshot>;
```

- `PlacedMachine` / `Connection` 新增 `blueprintNodeId: string` 字段。
- 四个 Mask 字段**不持久化**（含 `Uint8Array`，不可 JSON 序列化），加载时由 `Mask.FromOccupancy` 重建。
- 旧 `storage.ts` 的 `Blueprint` 接口（`id/name/data`）整体替换。

### 虚拟机器（接口引脚）

四种，掩码均为 `0x00`（物理上不存在）：

| ID | 名称 | 流向 |
|----|------|------|
| `sin` | Solid 输入 | 物流进入 |
| `sot` | Solid 输出 | 物流离开 |
| `lin` | Liquid 输入 | 物流进入 |
| `lot` | Liquid 输出 | 物流离开 |

- 可放在任何格上——空地、传送带上、机器上、甚至叠在其它虚拟机器上，不产生任何阻挡。
- 方向字段表示物流朝向。
- 只表示**本层级**的对外接口。父蓝图只能连直属子蓝图的虚拟机器，不能穿透到孙子层级。
- 展平/模拟时直接丢弃，内部外部连线自然对接。

---

## 不变式

### 零重叠

子蓝图 `totalMask` 与父蓝图（不含该子蓝图）在任何坐标下 `HasCollision === false`。

**后果**：
- `totalMask = ownMask | childrenMask`（每位最多一个贡献源）
- `ClearRegion(childMask, ox, oy)` = `data[p] &= ~childMask[p]`，无需通用减法
- 碰撞检测时无需区分位源

### 层级可见性

- 父蓝图可连接直属子蓝图的虚拟机器接口
- 不能穿透：A 的子蓝图 B 内部有子蓝图 C → A 看不到 C 的虚拟机器
- 自己的虚拟机器自己不用（只给上级用）

---

## 展平

展平 = 递归展开所有后代到同一层，移除虚拟机器，拼接跨层级连线。结果是一份纯 `machines[] + connections[]`。

**仅在以下场景使用**：
1. 克隆/复制：深拷贝为独立蓝图
2. 未来模拟系统：计算整个工厂的物流网络

正常编辑模式不展平。

---

## Store 策略：全量进入 store

`syncStoreFromViewing` 将 viewing 节点及其所有后代展平写入 `store.machines/connections`。每台机器/连线带 `blueprintNodeId` 标记归属。

### 理由

| 维度 | 全量进入 store | 只存 viewing 自有 |
|------|:-------------:|:---------------:|
| 渲染 | Grid 一个循环 | Grid 两个循环（store + registry walk） |
| 模拟 | 直接读 store，零额外步骤 | 每次展平 → 计算 → 丢弃 |
| 数据源 | store 是唯一运行时真相 | store 和 registry 两个源需同步 |
| mutation guard | 需要 | 不需要 |

模拟是明确的需求，全量进入 store 避免了重复展平。

### Guard 工具函数

所有 mutation 通过工具函数收敛写保护：

```typescript
isViewingOwn(machineOrConn, viewingNodeId): boolean   // blueprintNodeId === viewingNodeId
isDescendant(machineOrConn, viewingNodeId): boolean    // blueprintNodeId !== viewingNodeId
```

mutation 前置 guard 模式：

```typescript
if (!isViewingOwn(m, get().currentViewingNodeId)) return;
```

需 guard 的位置：
- `machinesSlice`: `addMachine`, `removeMachine`, `pickupMachine`
- `connectionSlice`: `startConnecting`(findMachineAt), `updatePreview`(findMachineAt)
- `selectionSlice`: `deleteSelected`, `commitBatchMove`

### undo/redo

`HistorySnapshot` 新增 `blueprintRegistry` 字段。快照体积增大，50 步上限继续兜底。

---

## Store 变更

### BlueprintSlice 重写

```
状态:
  blueprintRegistry: BlueprintRegistry
  currentViewingNodeId: string | null
  currentAncestorPath: string[]            // 面包屑导航

方法:
  createBlueprint()
  saveBlueprint(name)                      // fork: 新 nodeId，旧版保留
  loadBlueprint(nodeId)                    // 设为 viewing，展平到 store
  startInsertChild(nodeId)                 // → BLUEPRINT_MOVE
  commitInsert(ox, oy)                     // 碰撞通过，children.push
  moveChild(nodeId)                        // → BLUEPRINT_MOVE
  commitMove(ox, oy)                       // 新位置碰撞通过
  removeChild(nodeId)                      // 删引用
  navigateInto(nodeId)                     // 进入子蓝图编辑
  navigateToParent()
  syncStoreFromViewing()                   // 内部：展平到 store
```

### HistorySnapshot 扩展

```typescript
interface HistorySnapshot {
  machines: PlacedMachine[];
  connections: Connection[];
  blueprintRegistry: BlueprintRegistry;   // NEW（浅拷贝引用）
}
```

### ModeState 新增

```
BLUEPRINT_SELECT:
  进入 (B键) → 单击子蓝图内机器 → 选中整个子蓝图
  Escape → BUILD
  有选中 + M → BLUEPRINT_MOVE
  有选中 + Delete → 删引用

BLUEPRINT_MOVE:
  拖拽实时 HasCollision(totalMask, childTotalMask, ox, oy)
  Escape(导入) → 取消，清理
  Escape(移动) → 还原原位
```

### Selector 新增

```
selectIsBlueprintSelectMode(s)
selectIsBlueprintMoveMode(s)
selectSelectedChildNodeId(s)
selectViewingNode(s)
selectViewingChildren(s)
selectChildSnapshot(s, nodeId)
selectDescendantMachines(s)       // store 中所有非 viewing 自有机器
selectDescendantConnections(s)    // store 中所有非 viewing 自有连线
```

---

## 渲染

### 数据流程

```
registry + viewingNodeId
        │
        ▼
syncStoreFromViewing()
        │
        ▼
store.machines[] + store.connections[]     ← 全量展平，每项带 blueprintNodeId
        │
        ▼
Grid.tsx: 一个 map 渲染全部机器
  └─ Machine.tsx: blueprintNodeId !== viewingNodeId → 只读样式
ConnectionSVGLayer.tsx: 一个 map 渲染全部连线
  └─ 后代连线: 半透明样式
```

### 只读样式（子蓝图机器）

- 蓝边（CSS `.machine-readonly`）
- 端口不渲染
- 长按拾取禁用
- DEVICE_SELECT 不可选
- 供电范围不绘制
- hover 标签底部追加所属子蓝图名称

### 虚拟机器渲染

特殊图标/颜色区分四种类型，方向箭头指示物流流向。

### BLUEPRINT_SELECT 高亮

读取 `childSnapshot.totalMask` 的包围盒，黄色虚线圈选。

### BLUEPRINT_MOVE 预览

子蓝图虚影：半透明包围盒 + 内部机器/连线。碰撞无效变红。

### 面包屑导航

Header 下方：

```
[根蓝图名] > [子蓝图A] > [当前编辑的蓝图名]
```

点击节点跳转。

---

## BlueprintList 重构

扁平方格 → 树形列表。根节点 = registry 中不被任何 `children` 引用的 snapshot。

每个节点三种操作：

| 操作 | 行为 |
|------|------|
| 编辑 | Fork → viewing → 导航到编辑器 |
| 导入(引用) | BLUEPRINT_MOVE，需先有 viewing 蓝图 |
| 导入(复制) | 同上，走 copy 逻辑 |

删除仅当 `refCount === 0` 时可用。

---

## 掩码系统协作

### 使用 Mask 现有方法

| 场景 | 调用的 Mask 方法 |
|------|-----------------|
| 保存时计算 ownMask | `FromOccupancy({ machines, connections, ... })` |
| childrenMask | 遍历 children，`MergeInPlace(child.totalMask, ox, oy)` |
| totalMask | `ownMask.Clone().MergeInPlace(childrenMask, 0, 0)` |
| 插入/移动碰撞 | `totalMask.HasCollision(childTotalMask, ox, oy)` |
| 移除子蓝图 | `totalMask.ClearRegion(childTotalMask, ox, oy)` |
| 加载时重建 | `FromOccupancy` ×3 |

### 待新增：ClearRegion

```typescript
// 从 this 中清除 other 在 (ox, oy) 处的掩码位
// 依赖零重叠不变式：每位只有一个贡献源
ClearRegion(other: Mask, ox: number, oy: number): this
```

不改 `_dirty`（maxMask 偏大不影响正确性），位与补码。

### 碰撞检测适配

`checkPlacementCollision` 接受预计算 `totalMask` 替代每次从 machines/connections 重建。受影响的调用方：

- `machinesSlice.addMachine`
- `connectionSlice.updatePreview`
- `selectionSlice.commitBatchMove`

---

## 实施顺序

| # | 阶段 | 涉及文件 |
|---|------|---------|
| 1 | 数据模型 | `types.ts` — BlueprintSnapshot/BlueprintChildRef/BlueprintRegistry/虚拟机器 config；PlacedMachine + Connection 加 `blueprintNodeId`；`config/machines.ts` — 四种虚拟机器定义 |
| 2 | Mask.ClearRegion | `mask.ts` — 位与补码 |
| 3 | BlueprintSlice + History | `blueprintSlice.ts` 重写；`historySlice.ts` 扩展；`storage.ts` 适配 registry |
| 4 | Guard 工具函数 | `machineUtils.ts` 或新文件 — `isViewingOwn` / `isDescendant` |
| 5 | ModeState + Selector | `modeSlice.ts` 新增 variant + B键映射；`selectors.ts` 新增 selector |
| 6 | 渲染适配 | `Machine.tsx/scss` 只读样式；`Grid.tsx` 单循环；`ConnectionSVGLayer.tsx` 后代连线半透明 |
| 7 | BLUEPRINT_SELECT 交互 | `useBlueprintSelectMode.ts`（新）；选中高亮；选中后 M/Delete |
| 8 | BLUEPRINT_MOVE 交互 | `useBlueprintMoveMode.ts`（新）；虚影复用 BatchMovePreview |
| 9 | 连线适配 | `connectionSlice.ts` — 端点识别虚拟机器；`checkPlacementCollision` 接受 totalMask |
| 10 | 碰撞适配 | `machinesSlice.ts` / `selectionSlice.ts` — 使用 totalMask + guard |
| 11 | BlueprintList 重构 | `BlueprintList.tsx` — 树形视图 + 三操作 |
| 12 | 面包屑 + 导航 | 新组件；`navigateInto` / `navigateToParent` |
| 13 | 展平工具 | 独立工具函数（克隆/模拟用） |

1 → 全部；2 独立；3 依赖 1；4-5 依赖 1；6-10 依赖 1-5。

---

## 暂不纳入

- 子蓝图旋转
- 分享格式重设计
- 蓝图 diff/merge
- 跨蓝图供电
- 真实模拟系统
