# 模式状态改为判别联合（最终版）

## 背景

当前 `mode: GameMode` 是扁平字符串，20+ 个瞬态字段散落在 3 个切片中。类型系统无法阻止不可能状态组合（如 `mode='BUILD'` + `isConnecting=true`）。cancelOperation 靠手工 if-else 链保证一致性。

**目标**：用一个 `modeState: ModeState` 判别联合字段替换 ~20 个扁平字段，使不可能状态在类型层面不可表达。

---

## 核心原则

1. **字段集合不同 + cancel/commit 行为不同 → 拆 variant**
2. **字段用 nullable 已表达有无 → 不拆，nullable 就是微型判别**
3. **字段拆开/cancel 相同/只是参数不同 → 不拆，加字段区分即可**
4. **跨模式存活的字段 → 不放 union，保留顶层**

---

## 最终 4 个 variant

```ts
// src/types.ts 新增

interface ConnectingFields {
  availablePorts: { pos: Point; facing: Direction }[];
  activeStartPos: Point;
  activeTailFacing: Direction;
  previewPath: Point[];
  previewHeadFacing: Direction;
  isValidPath: boolean;
  lShapeMode: 'auto' | 'perpendicular' | 'same-dir';
  isContinuing: boolean;
  continueSourceId: string | null;
  previewTargetIsMachine: boolean;
}

type ModeState =
  // ── BUILD：placing 判 null 区分 idle/placing/pickup ──
  | {
      kind: 'BUILD';
      placing: {
        selectedMachineId: string;
        previewRotation: Direction;
        /** 放置偏移：鼠标到机器原点的距离。工具栏选机 = 中心，拾取 = 鼠标在机器内的精确位置 */
        buildOffset: Point;
        /** null = 从工具栏选的，object = 从画布拾取的，撤销时需要还原 */
        movingMachineBackup: PlacedMachine | null;
      } | null;                                    // null=空闲
    }

  // ── WIRE：CONVEYOR+PIPE 合并，portType 区分物流类型，connecting null 区分子状态 ──
  | {
      kind: 'WIRE';
      portType: 'Solid' | 'Liquid';             // Solid=传送带(E键), Liquid=管道(Q键)
      connecting: ConnectingFields | null;       // null=空闲, object=连线中
    }

  // ── DEVICE_SELECT：selectionStart/End 的 null 区分空闲/拖拽 ──
  | {
      kind: 'DEVICE_SELECT';
      selectionStart: Point | null;             // null=空闲, object=拖拽中
      selectionEnd: Point | null;
      selectedMachineIds: string[];             // 框选结果（持久，供后续移动/复制/删除）
      selectedConnectionIds: string[];
    }

  // ── MOVE_SELECTION：M+Ctrl+C+蓝图插入合并，isCopying 区分来源 ──
  | {
      kind: 'MOVE_SELECTION';
      moveAnchor: Point;
      movingMachinesSnapshot: PlacedMachine[];
      movingConnectionsSnapshot: Connection[];
      isCopying: boolean;                       // false=移动, true=复制/蓝图
      originSelectedMachineIds: string[];       // 取消移动时还原原选区
      originSelectedConnectionIds: string[];
    };
```

### 顶层保留字段（不放 union）

```ts
hoverPosFrac: Point | null;  // 输入状态，每帧更新，非模式状态（迁入 canvasSlice）
```

**注意**：`selectedMachineIds` / `selectedConnectionIds` 已归入 DEVICE_SELECT variant，取消移动时通过 MOVE_SELECTION 的 `originSelected*Ids` 还原。不再有任何游离的扁平瞬态字段。

### 4 variant 覆盖 10 种有效状态

| variant | 子状态数 | 判别机制 | 字段数 |
|---------|:---:|---|---|
| BUILD | 3 | placing 判 null, movingMachineBackup 判 null | 1 + 4 |
| WIRE | 4 | portType + connecting 判 null | 2 + 12 |
| DEVICE_SELECT | 2 | selectionStart 判 null | 6 |
| MOVE_SELECTION | 3 | isCopying | 6 |

---

## 各 variant 的状态转换

### BUILD

```ts
{
  kind: 'BUILD';
  placing: {
    selectedMachineId: string;
    previewRotation: Direction;
    buildOffset: Point;                       // 放置偏移，鼠标→机器原点
    movingMachineBackup: PlacedMachine | null; // null=工具栏选的, object=画布拾取的
  } | null;                                    // null=空闲
}
```

**产生 3 种子状态**：

| 子状态 | placing | movingMachineBackup | buildOffset 来源 |
|--------|:---:|:---:|---|
| 空闲 | null | — | — |
| 放置中 | object | null | 中心 (=宽高/2) |
| 拾取中 | object | object | hoverPosFrac - machine.pos (鼠标精确定位) |

**统一放置公式**：`pos = Math.round(mousePos - buildOffset)`
无论是工具栏选机（offset=中心）还是拾取（offset=精确偏移），handleClick 都走同一行代码，不再区分。

```ts
// 空闲：
modeState = { kind: 'BUILD', placing: null }

// 放置中：
modeState = { kind: 'BUILD', placing: { selectedMachineId: 'ref', previewRotation: 2, buildOffset: {x:1.5,y:1.5}, movingMachineBackup: null } }

// 拾取中：
modeState = { kind: 'BUILD', placing: { selectedMachineId: 'ref', previewRotation: 2, buildOffset: {x:0.3,y:-0.1}, movingMachineBackup: {...} } }
```

**转换路径**：

```
空闲   ── selectMachine('ref')  ──→ 放置中(placing: {selectedMachineId, previewRotation: 0, buildOffset: 中心, backup: null})
空闲   ── pickupMachine(id)     ──→ 拾取中(从 machines[] 移入 placing.movingMachineBackup, buildOffset: 鼠标精确定位)
放置中 ── selectMachine(null)   ──→ 空闲(placing: null)
拾取中 ── addMachine            ──→ 放置中(placing.movingMachineBackup: null, 保留 selectedMachineId+buildOffset)
拾取中 ── cancelOperation       ──→ 空闲(还原机器到 machines[], placing: null)
放置中 ── cancelOperation       ──→ 空闲(placing: null)
空闲   ── cancelOperation       ──→ 空闲(无事发生)
```

### WIRE

```
BUILD        ── setMode(WIRE, Solid)    ──→ WIRE(空闲)
WIRE(空闲)    ── startConnecting(ports) ──→ WIRE(connecting: {portType, 12字段...})
WIRE(连线中)  ── commitConnection       ──→ WIRE(空闲) 或 WIRE(连线中, isContinuing=true)
WIRE(连线中)  ── cancelConnection       ──→ WIRE(空闲)
WIRE(空闲)    ── cancelOperation / 再按E ──→ BUILD
WIRE(连线中)  ── cancelOperation        ──→ cancelConnection → WIRE(空闲)
```

### DEVICE_SELECT

```
BUILD          ── setMode(DEVICE_SELECT)      ──→ DEVICE_SELECT(空闲)
DEVICE_SELECT  ── setBoxSelection(s, e)       ──→ DEVICE_SELECT(拖拽中)
DEVICE_SELECT  ── commitBoxSelection          ──→ DEVICE_SELECT(空闲, selectedMachineIds写入)
DEVICE_SELECT  ── cancelOperation / 再按X     ──→ BUILD(清 selectedMachineIds)
```

### MOVE_SELECTION

```
DEVICE_SELECT  ── startBatchMove             ──→ MOVE_SELECTION(isCopying=false)
DEVICE_SELECT  ── startCopySelection         ──→ MOVE_SELECTION(isCopying=true)
蓝图列表        ── startInsertBlueprint       ──→ MOVE_SELECTION(isCopying=true)
MOVE_SELECTION ── commitBatchMove            ──→ DEVICE_SELECT(新机器选中)
MOVE_SELECTION ── cancelOperation(isCopying) ──→ DEVICE_SELECT(复制: 丢弃; 移动: 还原)
```

---

## 切片重组

| 切片 | 拥用字段 | 变化 |
|------|---------|------|
| **modeSlice** (新) | `modeState`, `setMode`, `cancelOperation` | 新建，模式判别 + 统一退出 |
| canvasSlice | zoom, pan, gridWidth, gridHeight, hoverPosFrac, setHoverPosFrac | hoverPosFrac 迁入 |
| machinesSlice | machines[], addMachine, removeMachine, pickupMachine, selectMachine, rotatePreview | 删 6 个扁平字段 + cancelOperation |
| connectionSlice | connections[], startConnecting, updatePreview, toggleLShape, commitConnection, cancelConnection | 删 12 个扁平字段 |
| selectionSlice | setBoxSelection, commitBoxSelection, clearSelection, deleteSelected, startBatchMove, startCopySelection, commitBatchMove | 删 8 个自有字段（归入 DEVICE_SELECT + MOVE_SELECTION variant），动作改为读/写 modeState |
| historySlice | history, takeSnapshot, undo, redo | **快照不含 modeState** |
| blueprintSlice | uiView, blueprintListMode, currentBlueprintId/Name, loadGame, resetGame, setUiView, setBlueprintListMode, startInsertBlueprint, startInsertBlueprintOnNewMap | startInsert* 改为写 modeState |

### `setMode` 签名

```ts
setMode: (kind: 'BUILD' | 'WIRE_SOLID' | 'WIRE_LIQUID' | 'DEVICE_SELECT') => void
// WIRE_SOLID → portType='Solid' (E键), WIRE_LIQUID → portType='Liquid' (Q键)
```

### `cancelOperation` 伪代码

```ts
cancelOperation: () => {
    const ms = get().modeState;
    switch (ms.kind) {
        case 'BUILD':
            if (ms.placing) {
                if (ms.placing.movingMachineBackup) {
                    // 拾取中 → 还原机器到 machines[]，回到空闲
                    set({ machines: [...get().machines, ms.placing.movingMachineBackup], modeState: { kind: 'BUILD', placing: null } });
                } else {
                    // 放置中 → 清空选机，回到空闲
                    set({ modeState: { kind: 'BUILD', placing: null } });
                }
            }
            // 空闲 → 无事发生
            break;
        case 'WIRE':
            if (ms.connecting) {
                get().cancelConnection();  // → WIRE(空闲)
            } else {
                set({ modeState: { kind: 'BUILD', placing: null } });  // → BUILD
            }
            break;
        case 'DEVICE_SELECT':
            set({ modeState: { kind: 'BUILD', placing: null } });
            break;
        case 'MOVE_SELECTION':
            if (ms.isCopying) {
                // 复制/蓝图 → 直接丢弃
                set({ modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: [], selectedConnectionIds: [] } });
            } else {
                // 移动 → 还原快照 + 原选区
                set({ 
                    machines: [...get().machines, ...ms.movingMachinesSnapshot], 
                    connections: [...get().connections, ...ms.movingConnectionsSnapshot], 
                    modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: ms.originSelectedMachineIds, selectedConnectionIds: ms.originSelectedConnectionIds } 
                });
            }
            break;
    }
}
```

注意：`case 'MOVE_SELECTION'` 在 `isCopying=false` 时还原 `originSelectedMachineIds` 而非清空，保持取消移动后原选区不丢。`cancelConnection()` 内部设为 WIRE(空闲)，不再调 `setMode`。

---

## 实施顺序

### 第 1 步：类型定义
- `src/types.ts`：新增 `ConnectingFields`、`ModeState`
- `src/store/slices/types.ts`：重构 7 个 slice 接口

### 第 2 步：创建 modeSlice.ts
- 新建 `src/store/slices/modeSlice.ts`
- `setMode(kind)` + `cancelOperation()`（switch 实现）

### 第 3 步：重写三个切片
- **machinesSlice**：删 6 个字段 + cancelOperation，动作改为读/写 modeState
- **connectionSlice**：删 12 个扁平字段，动作改为读/写 modeState.WIRE.connecting
- **selectionSlice**：删 8 个自有字段（归入 DEVICE_SELECT + MOVE_SELECTION variant），动作改为读/写 modeState

### 第 4 步：gameStore + blueprintSlice
- `gameStore.ts`：加入 `createModeSlice`
- `blueprintSlice`：startInsert* 改为写 `modeState: { kind: 'MOVE_SELECTION', isCopying: true, originSelectedMachineIds: [], originSelectedConnectionIds: [], moveAnchor, movingMachinesSnapshot, movingConnectionsSnapshot }`

### 第 5 步：辅助 selector
- `src/store/selectors.ts`：`selectPlacing`、`selectConnecting`、`selectIsWireMode`、`selectLShapeMode`、`selectSelectedMachineIds`、`selectSelectedConnectionIds`、`selectMoveAnchor` 等类型安全 selector

### 第 6 步：hooks + 组件适配
- hooks（4 个）：`s.mode === GameMode.X` → `s.modeState.kind === 'X'`，`s.isConnecting` → `s.modeState.connecting !== null`
- 组件（8 个）：选择器改为读 modeState.kind 或使用 helper selector

### 第 7 步：测试更新
- `store.test.ts`：resetStore 改用 modeState
- `Toolbar.test.tsx`：断言改为 modeState.kind
- `Machine.test.tsx`：resetStore 更新

---

## 受影响的文件（共 18 个）

**新增**：`src/store/slices/modeSlice.ts`、`src/store/selectors.ts`

**重写**：`src/types.ts`、`src/store/slices/types.ts`、machinesSlice.ts、connectionSlice.ts、selectionSlice.ts、blueprintSlice.ts、`gameStore.ts`

**适配**：
- `src/hooks/useGridEvents.ts`、useWireMode.ts、useSelectionMode.ts、useKeyboardShortcuts.ts
- `src/components/` Grid.tsx、Machine.tsx、ConnectionSVGLayer.tsx、GhostPreview.tsx、SelectionBox.tsx、BatchMovePreview.tsx、Toolbar.tsx、OperationHints.tsx
- `src/__tests__/` store.test.ts、Toolbar.test.tsx、Machine.test.tsx

**不改**：canvasSlice.ts（仅加 hoverPosFrac + setHoverPosFrac）、historySlice.ts、App.tsx、所有纯函数/config/CSS

---

## 验证

1. `tsc --noEmit` — 零类型错误
2. `npm run lint` — 零 ESLint 错误
3. `npm test` — 通过
4. 手动验证：BUILD 放置/拾取、WIRE Solid/Liquid 连线/续接、DEVICE_SELECT 框选/Shift/M/Ctrl+C、蓝图插入、撤销重做
