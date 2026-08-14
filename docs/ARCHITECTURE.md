# 架构基准文档

> 本文档是 2026-07 架构收敛重构的基准与决策记录。
> 重构前的审查报告见对话历史（蓝图树重构 + PixiJS 迁移审查）。

## 1. 总体原则

1. **一个 Doc，一处真相**：`FactoryDoc` 是唯一持久化对象，蓝图的"已提交"状态只存在于它之中。
2. **检出式编辑（checkout）**：用户编辑发生在 store 工作视图；保存（commit）才写回 Doc。
   共享节点保存时 fork（写时复制），其他调用方保持旧版本；调用方需要自行进入蓝图适配。
3. **变更经过显式转移**：Doc 只在 commit/fork/child 操作时变化，不存在隐式双向同步。
4. **事件在边界一次性归一化**：client/global/screen 坐标差异只允许出现在事件归一化层。
5. **渲染 = 派生 + 身份 diff**：渲染层只消费明确的 RenderInput，diff 清单完整。
6. **依赖方向单向**：`store → domain（纯函数）→ persist / render`，domain 不反向订阅任何框架。

## 2. 数据模型

### 2.1 FactoryDoc（`src/domain/doc.ts`）

```ts
interface FactoryDoc {
  version: 1;
  nodes: Record<string, CommittedNode>;
}

interface CommittedNode {
  nodeId: string;
  name: string;
  version: number;          // 每次 commit +1（展示用）
  gridW: number;
  gridH: number;
  machines: PlacedMachine[];
  connections: Connection[];
  children: ChildRef[];     // { childNodeId, x, y }
  createdAt: number;
  updatedAt: number;
}
```

- 机器/连线的归属字段是 `PlacedMachine.blueprintNodeId`（展平时由 `flattenNode` 标注）。
- 掩码不再持久化：占用/碰撞需要时用 `buildMergedGrid` 等现算（`Mask` 类保留）。
- 虚拟机器（sin/sot/lin/lot）只在展平时过滤。

### 2.2 工作视图（store 中的 `machines[]` / `connections[]`）

- 是**派生视图**：`当前节点自有内容 + 全部后代展平`（`flattenDescendants`）。
- 编辑切片（machines/connection/selection）继续读写该视图，新实体标记 `blueprintNodeId = currentViewingNodeId`。
- `isCheckoutDirty()` 用内容 JSON 比较判断"工作视图 vs Doc 已提交内容"。

## 3. 关键转移（transitions）

| 操作 | Doc 行为 | 持久化时机 |
|---|---|---|
| `createBlueprint` / `loadGame` | 新建节点（version 1） | 立即 saveDoc |
| `saveCurrentBlueprint(name)` | `refCount <= 1` → 原地 `commitNode`（nodeId 不变，version+1）；`refCount > 1` → `forkCommit`（旧节点不动，新节点承载内容），当前父链 childRef 重指新节点（保留 x/y） | 立即 |
| `commitInsert` / `commitMove` / `removeChild` / `deleteBlueprint` | child 操作（`canInsertChild` 环防护：拒绝自引用/祖先引用） | 立即 |
| `loadBlueprint(nodeId)` | 用节点已提交内容替换工作视图；**离开前由 UI 调用 `isCheckoutDirty()` 确认** | — |
| `undo` / `redo` | 恢复历史快照 `{ machines, connections, doc }` 并 saveDoc | 立即 |

**历史**：快照 = `{ machines, connections, doc }`（结构共享，50 步上限）。
`loadBlueprint`/`createBlueprint`/`loadGame` 清空历史；commit 不产生孤儿根（原地保存 nodeId 不变）。

## 4. 持久化（`src/domain/persist.ts`）

- 唯一 key：`zmd_doc_v1`；`loadDoc()` 校验 `version === 1`。
- 旧格式（`zmd_registry` / `zmd_blueprints` / `zmd_last_blueprint_id`）**不迁移、直接废弃**（决策：2026-07，快速开发阶段）。

## 5. 画布集成层（P2）

### 5.1 CanvasController（`src/pixi/CanvasController.ts`）

- 无框架 TS 类：Application 生命周期 + 场景图 + 对象池 + 唯一 Zustand 订阅。
- `attach(el)` 幂等 / `detach()` 先退订再销毁（StrictMode 双挂载安全）。
- 事件归一化只此一处：

```ts
// 唯一允许接触 client/global/screen 差异的位置
normalize(e) → { x: e.global.x, y: e.global.y, button, buttons, shiftKey, ctrlKey }
```

- 模式处理器表（`src/pixi/modeHandlers.ts`）：纯函数，按 `ModeState['kind']` 分发 onDown/onUp/onMove/onClick/onWheel。
- 平台语义补齐：canvas 原生 `contextmenu` preventDefault；click 仅 button===0；`tap`/`pointertap` 映射提交逻辑；指针越界清空 hover；平移/缩放统一 `clampPan`。

### 5.2 同步契约（RenderInput 身份 diff）

```ts
interface RenderInput {
  visible: { machines; connections };
  view: { zoom; pan };
  grid: { w; h };
  mode: ModeState;
  hoverFrac: Point | null;      // ← 必须进 diff（Ghost 跟随鼠标）
  selection: { machineIds; connIds };
  powerGrid: Uint8Array;        // ← 按 machines 引用缓存
}
```

- 机器池按 id 复用，但 `update()` **无条件同步 position/rotation/尺寸**（undo、导航、loadGame 后必须一致）。
- modeState 细分 diff：仅 `connecting` 变化 → 只重画预览；仅 selection 变化 → 只更新高亮。
- MOVE_SELECTION 有专属预览分支（BATCH_BASE 基底半透明虚影 + 批量连线）。

## 6. 决策记录

| # | 决策 | 结论 |
|---|---|---|
| 1 | 是否回退 PixiJS | 不回退；修复集成缺陷 |
| 2 | 共享蓝图编辑语义 | **检出式（B）**：保存时 fork，其他调用方保持旧版本；减少用户心智负担 |
| 3 | Copy 按钮语义 | 实现真正的展平复制（P4） |
| 4 | 旧 localStorage 数据 | 直接丢弃（快速开发阶段） |
| 5 | 执行顺序 | P0 止血 → P1 领域收敛 → P2 画布集成 → P3 性能 → P4 功能补全 |
| 6 | 历史粒度 | `{ machines, connections, doc }`；导航/加载清空历史 |

## 7. 已知欠账（后续阶段）

- P3：预览/选中细粒度更新收尾、Text 复用、cullArea + isRenderGroup、机器 hover 标签显示、端口中心 8px 偏移。
- P4：展平复制实现、commitInsert 碰撞校验（isValidPosition 真实计算）、触屏验证、Playwright 冒烟、bugs.md 更新。
- 远期：Gas 端口类型、分享格式版本字节、蓝图 merge（三路合并，若产品需要）。
