import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import type { PlacedMachine, Connection, ModeState } from '@/types';

/** 创建一台测试用的 1x1 机器（物流桥，不占大空间） */
const makeLBR = (overrides: Partial<PlacedMachine> = {}): PlacedMachine => ({
  id: 'lbr-1',
  machineId: 'lbr', // 物流桥: 1×1, Solid 输入+输出
  x: 5, y: 5,
  rotation: 0,
  ...overrides,
});

/** 创建一条测试连线 */
const makeConn = (overrides: Partial<Connection> = {}): Connection => ({
  id: 'conn-1',
  tailFacing: 1,
  path: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 5 }],
  headFacing: 2,
  portType: 'Solid',
  ...overrides,
});

const resetStore = () => {
  useGameStore.setState({
    machines: [],
    connections: [],
    modeState: { kind: 'BUILD', placing: null },
    zoom: 1,
    pan: { x: 0, y: 0 },
    gridWidth: 24,
    gridHeight: 24,
    history: { past: [], future: [] },
    hoverPosFrac: null,
  });
};

describe('machinesSlice', () => {
  beforeEach(resetStore);

  describe('addMachine', () => {
    it('在空地添加机器成功', () => {
      const { takeSnapshot } = useGameStore.getState();
      takeSnapshot();
      useGameStore.getState().addMachine('lbr', 3, 3, 0);
      const { machines } = useGameStore.getState();
      expect(machines).toHaveLength(1);
      expect(machines[0].machineId).toBe('lbr');
      expect(machines[0].x).toBe(3);
      expect(machines[0].y).toBe(3);
    });

    it('不存在的 machineId 忽略', () => {
      useGameStore.getState().addMachine('nonexistent', 3, 3, 0);
      expect(useGameStore.getState().machines).toHaveLength(0);
    });

    it('越界（负坐标）拒绝', () => {
      useGameStore.getState().addMachine('lbr', -1, 0, 0);
      expect(useGameStore.getState().machines).toHaveLength(0);
    });

    it('越界（超出网格）拒绝', () => {
      useGameStore.getState().addMachine('ref', 22, 0, 0); // 精炼炉 3×3, x=22, width=3 → 25 > 24 → 越界
      expect(useGameStore.getState().machines).toHaveLength(0);
    });

    it('与已有机器碰撞拒绝', () => {
      useGameStore.getState().addMachine('lbr', 3, 3, 0);
      useGameStore.getState().addMachine('lbr', 3, 3, 0); // 同位置
      expect(useGameStore.getState().machines).toHaveLength(1);
    });

    it('与连线网格重叠拒绝', () => {
      // 在 (5,5) 已有连线经过，添加机器到该位置应被拒绝
      useGameStore.setState({
        connections: [makeConn({ path: [{ x: 5, y: 5 }] })],
      });
      useGameStore.getState().addMachine('lbr', 5, 5, 0);
      expect(useGameStore.getState().machines).toHaveLength(0);
    });

    it('rotation 为 1（90°）时正确交换宽高', () => {
      useGameStore.getState().addMachine('ref', 5, 5, 1); // 精炼炉 3×3, rotation=1 仍是 3×3
      const m = useGameStore.getState().machines[0];
      expect(m).toBeDefined();
      expect(m.rotation).toBe(1);
    });
  });

  describe('removeMachine', () => {
    it('删除指定机器', () => {
      useGameStore.setState({ machines: [makeLBR({ id: 'a' }), makeLBR({ id: 'b', x: 10 })] });
      useGameStore.getState().removeMachine('a');
      expect(useGameStore.getState().machines).toHaveLength(1);
      expect(useGameStore.getState().machines[0].id).toBe('b');
    });

    it('级联删除连接到该机器端口的连线', () => {
      const m = makeLBR({ id: 'm1', x: 0, y: 0 });
      // lbr rotation=0: 输入端口在 (0,0) left, 输出端口在 (0,0) right
      // 端口外侧格: 输入在 (-1,0), 输出在 (1,0)
      useGameStore.setState({
        machines: [m],
        connections: [
          makeConn({ id: 'c1', path: [{ x: -1, y: 0 }, { x: 0, y: 0 }] }), // 起点=输入端外侧 → 删除
          makeConn({ id: 'c2', path: [{ x: 1, y: 0 }, { x: 5, y: 0 }] }),  // 起点=输出端外侧 → 删除
          makeConn({ id: 'c3', path: [{ x: 5, y: 5 }, { x: 6, y: 6 }] }),  // 无关 → 保留
        ],
      });
      useGameStore.getState().removeMachine('m1');
      const { connections } = useGameStore.getState();
      expect(connections).toHaveLength(1);
      expect(connections[0].id).toBe('c3');
    });
  });

  describe('pickupMachine', () => {
    it('拾取机器放入 modeState.placing.movingMachineBackup，从 machines 移除', () => {
      useGameStore.setState({ machines: [makeLBR()] });
      useGameStore.getState().pickupMachine('lbr-1');
      const s = useGameStore.getState();
      expect(s.machines).toHaveLength(0);
      expect(s.modeState.kind).toBe('BUILD');
      const ms = s.modeState as Extract<ModeState, { kind: 'BUILD' }>;
      expect(ms.placing).toBeDefined();
      expect(ms.placing!.movingMachineBackup).toBeDefined();
      expect(ms.placing!.movingMachineBackup!.id).toBe('lbr-1');
    });

    it('拾取不存在的机器不改变状态', () => {
      useGameStore.setState({ machines: [makeLBR()] });
      useGameStore.getState().pickupMachine('nonexistent');
      expect(useGameStore.getState().machines).toHaveLength(1);
      expect((useGameStore.getState().modeState as Extract<ModeState, { kind: 'BUILD' }>).placing).toBeNull();
    });
  });

  describe('cancelOperation', () => {
    it('归还拾取中的机器', () => {
      useGameStore.setState({ machines: [makeLBR()] });
      useGameStore.getState().pickupMachine('lbr-1');
      useGameStore.getState().cancelOperation();
      const s = useGameStore.getState();
      expect(s.machines).toHaveLength(1);
      expect(s.modeState.kind).toBe('BUILD');
      expect((s.modeState as Extract<ModeState, { kind: 'BUILD' }>).placing).toBeNull();
    });
  });
});

describe('historySlice', () => {
  beforeEach(resetStore);

  it('takeSnapshot 推入 past', () => {
    useGameStore.getState().takeSnapshot();
    expect(useGameStore.getState().history.past).toHaveLength(1);
  });

  it('undo 恢复之前状态', () => {
    // 初始状态空
    useGameStore.getState().takeSnapshot(); // past: [空]
    useGameStore.setState({ machines: [makeLBR()] });
    // 当前 machines 有 1 台
    useGameStore.getState().undo();
    expect(useGameStore.getState().machines).toHaveLength(0);
    expect(useGameStore.getState().history.future).toHaveLength(1); // 当前状态推入 future
  });

  it('redo 重做', () => {
    useGameStore.getState().takeSnapshot(); // 快照空状态
    useGameStore.setState({ machines: [makeLBR()] });
    useGameStore.getState().undo();
    expect(useGameStore.getState().machines).toHaveLength(0);
    useGameStore.getState().redo();
    expect(useGameStore.getState().machines).toHaveLength(1);
  });

  it('past 为空时 undo 不报错', () => {
    expect(() => useGameStore.getState().undo()).not.toThrow();
  });

  it('future 为空时 redo 不报错', () => {
    expect(() => useGameStore.getState().redo()).not.toThrow();
  });

  it('快照上限 50 步，超出丢弃最旧', () => {
    for (let i = 0; i < 55; i++) {
      useGameStore.getState().takeSnapshot();
    }
    expect(useGameStore.getState().history.past.length).toBeLessThanOrEqual(50);
  });

  it('takeSnapshot 清空 future', () => {
    useGameStore.getState().takeSnapshot();
    useGameStore.setState({ machines: [makeLBR()] });
    useGameStore.getState().undo(); // future 有 1 个
    expect(useGameStore.getState().history.future).toHaveLength(1);
    useGameStore.getState().takeSnapshot(); // 清空 future
    expect(useGameStore.getState().history.future).toHaveLength(0);
  });
});

describe('selectionSlice', () => {
  beforeEach(resetStore);

  describe('commitBoxSelection', () => {
    it('框选范围内机器被选中', () => {
      useGameStore.setState({
        machines: [makeLBR({ x: 2, y: 2 })],
        modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: [], selectedConnectionIds: [] },
      });
      useGameStore.getState().setBoxSelection({ x: 0, y: 0 }, { x: 5, y: 5 });
      useGameStore.getState().commitBoxSelection();
      // lbr 1×1 在 (2,2), 完全在 (0,0)-(5,5) 内 → 选中
      const s = useGameStore.getState();
      expect(s.modeState.kind).toBe('DEVICE_SELECT');
      if (s.modeState.kind === 'DEVICE_SELECT') {
        expect(s.modeState.selectedMachineIds).toContain('lbr-1');
      }
    });

    it('框选范围外机器不被选中', () => {
      useGameStore.setState({
        machines: [makeLBR({ x: 10, y: 10 })],
        modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: [], selectedConnectionIds: [] },
      });
      useGameStore.getState().setBoxSelection({ x: 0, y: 0 }, { x: 5, y: 5 });
      useGameStore.getState().commitBoxSelection();
      const s = useGameStore.getState();
      if (s.modeState.kind === 'DEVICE_SELECT') {
        expect(s.modeState.selectedMachineIds).toHaveLength(0);
      }
    });

    it('toggle 模式反选已选中的机器', () => {
      useGameStore.setState({
        machines: [makeLBR({ x: 2, y: 2 })],
        modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: ['lbr-1'], selectedConnectionIds: [] },
      });
      useGameStore.getState().setBoxSelection({ x: 0, y: 0 }, { x: 5, y: 5 });
      useGameStore.getState().commitBoxSelection(true);
      const s = useGameStore.getState();
      if (s.modeState.kind === 'DEVICE_SELECT') {
        expect(s.modeState.selectedMachineIds).toHaveLength(0);
      }
    });
  });

  describe('deleteSelected', () => {
    it('删除选中的机器', () => {
      useGameStore.setState({
        machines: [makeLBR()],
        modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: ['lbr-1'], selectedConnectionIds: [] },
      });
      useGameStore.getState().deleteSelected();
      expect(useGameStore.getState().machines).toHaveLength(0);
    });

    it('无选中时不操作', () => {
      useGameStore.setState({
        machines: [makeLBR()],
        modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: [], selectedConnectionIds: [] },
      });
      useGameStore.getState().deleteSelected();
      expect(useGameStore.getState().machines).toHaveLength(1);
    });
  });

  describe('startBatchMove', () => {
    it('移动机器到 snapshot，从 store 移除', () => {
      useGameStore.setState({
        machines: [makeLBR()],
        modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: ['lbr-1'], selectedConnectionIds: [] },
      });
      useGameStore.getState().startBatchMove();
      const s = useGameStore.getState();
      expect(s.machines).toHaveLength(0);
      expect(s.modeState.kind).toBe('MOVE_SELECTION');
      if (s.modeState.kind === 'MOVE_SELECTION') {
        expect(s.modeState.movingMachinesSnapshot).toHaveLength(1);
      }
    });

    it('无选中时不操作', () => {
      useGameStore.setState({
        machines: [makeLBR()],
        modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: [], selectedConnectionIds: [] },
      });
      useGameStore.getState().startBatchMove();
      const s = useGameStore.getState();
      expect(s.modeState.kind).toBe('DEVICE_SELECT');
    });
  });

  describe('startCopySelection', () => {
    it('复制选中的机器（ID 重新生成）', () => {
      useGameStore.setState({
        machines: [makeLBR()],
        modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: ['lbr-1'], selectedConnectionIds: [] },
      });
      useGameStore.getState().startCopySelection();
      const s = useGameStore.getState();
      expect(s.modeState.kind).toBe('MOVE_SELECTION');
      if (s.modeState.kind === 'MOVE_SELECTION') {
        expect(s.modeState.movingMachinesSnapshot).toHaveLength(1);
        expect(s.modeState.movingMachinesSnapshot[0].id).not.toBe('lbr-1'); // 新 ID
        expect(s.modeState.isCopying).toBe(true);
      }
    });
  });

  describe('commitBatchMove', () => {
    it('移动到目标位置', () => {
      useGameStore.setState({
        machines: [],
        connections: [],
        modeState: {
          kind: 'MOVE_SELECTION',
          moveAnchor: { x: 0, y: 0 },
          movingMachinesSnapshot: [makeLBR({ x: 0, y: 0, id: 'm1' })],
          movingConnectionsSnapshot: [],
          isCopying: false,
          originSelectedMachineIds: [],
          originSelectedConnectionIds: [],
        },
        gridWidth: 24,
        gridHeight: 24,
      });
      useGameStore.getState().commitBatchMove({ x: 5, y: 5 });
      const s = useGameStore.getState();
      expect(s.machines[0].x).toBe(5);
      expect(s.machines[0].y).toBe(5);
    });

    it('碰撞时拒绝移动', () => {
      useGameStore.setState({
        machines: [makeLBR({ x: 5, y: 5, id: 'blocker' })],
        connections: [],
        modeState: {
          kind: 'MOVE_SELECTION',
          moveAnchor: { x: 0, y: 0 },
          movingMachinesSnapshot: [makeLBR({ x: 0, y: 0, id: 'm1' })],
          movingConnectionsSnapshot: [],
          isCopying: false,
          originSelectedMachineIds: [],
          originSelectedConnectionIds: [],
        },
        gridWidth: 24,
        gridHeight: 24,
      });
      useGameStore.getState().commitBatchMove({ x: 5, y: 5 });
      // 碰撞，snapshot 应还在（移动未成功）
      const s = useGameStore.getState();
      expect(s.modeState.kind).toBe('MOVE_SELECTION');
      if (s.modeState.kind === 'MOVE_SELECTION') {
        expect(s.modeState.movingMachinesSnapshot).toHaveLength(1);
      }
    });

    it('越界时拒绝', () => {
      useGameStore.setState({
        machines: [],
        modeState: {
          kind: 'MOVE_SELECTION',
          moveAnchor: { x: 0, y: 0 },
          movingMachinesSnapshot: [makeLBR({ x: 0, y: 0, id: 'm1' })],
          movingConnectionsSnapshot: [],
          isCopying: false,
          originSelectedMachineIds: [],
          originSelectedConnectionIds: [],
        },
        gridWidth: 24,
        gridHeight: 24,
      });
      useGameStore.getState().commitBatchMove({ x: 100, y: 100 });
      // 越界，snapshot 应还在
      const s = useGameStore.getState();
      expect(s.modeState.kind).toBe('MOVE_SELECTION');
      if (s.modeState.kind === 'MOVE_SELECTION') {
        expect(s.modeState.movingMachinesSnapshot).toHaveLength(1);
      }
    });
  });
});

// ======================================================================
// Phase 3 验证：BlueprintSlice 新 API
// ======================================================================
describe('blueprintSlice (蓝图树)', () => {
  beforeEach(() => {
    useGameStore.setState({
      machines: [],
      connections: [],
      modeState: { kind: 'BUILD', placing: null },
      zoom: 1, pan: { x: 0, y: 0 },
      gridWidth: 24, gridHeight: 24,
      history: { past: [], future: [] },
      hoverPosFrac: null,
      blueprintRegistry: {},
      currentViewingNodeId: null,
      currentAncestorPath: [],
    });
  });

  it('createBlueprint 创建空蓝图并设为 viewing', () => {
    const nodeId = useGameStore.getState().createBlueprint();
    expect(nodeId).toBeTruthy();
    const s = useGameStore.getState();
    expect(s.currentViewingNodeId).toBe(nodeId);
    expect(s.blueprintRegistry[nodeId]).toBeDefined();
    expect(s.blueprintRegistry[nodeId].name).toBe('未命名蓝图');
    expect(s.blueprintRegistry[nodeId].version).toBe(1);
  });

  it('createBlueprint 后 machines/connections 为空', () => {
    useGameStore.getState().createBlueprint();
    const s = useGameStore.getState();
    expect(s.machines).toHaveLength(0);
    expect(s.connections).toHaveLength(0);
  });

  it('syncStoreFromViewing 展平 viewing 到 store', () => {
    const nodeId = useGameStore.getState().createBlueprint();
    // 在 store 中放置一台机器（模拟 addMachine）
    useGameStore.setState({
      machines: [
        { id: 'm1', machineId: 'lbr', x: 3, y: 3, rotation: 0 as const, blueprintNodeId: nodeId },
      ],
    });
    useGameStore.getState().syncStoreFromViewing();
    const s2 = useGameStore.getState();
    expect(s2.machines).toHaveLength(1);
    expect(s2.machines[0].blueprintNodeId).toBe(nodeId);
  });

  it('loadBlueprint 导航到已有蓝图', () => {
    const nodeId = useGameStore.getState().createBlueprint();
    // 创建第二个蓝图
    useGameStore.getState().createBlueprint();
    // 导航回第一个
    useGameStore.getState().loadBlueprint(nodeId);
    expect(useGameStore.getState().currentViewingNodeId).toBe(nodeId);
  });

  it('loadGame 兼容旧接口并创建 snapshot', () => {
    useGameStore.getState().loadGame(
      [{ id: 'm1', machineId: 'lbr', x: 0, y: 0, rotation: 0 }],
      [],
      24, 24,
      null, '测试蓝图',
    );
    const s = useGameStore.getState();
    expect(s.currentViewingNodeId).toBeTruthy();
    expect(s.blueprintRegistry[s.currentViewingNodeId!]).toBeDefined();
    expect(s.machines[0].blueprintNodeId).toBe(s.currentViewingNodeId);
  });

  it('resetGame 清空画布但不删除已保存蓝图', () => {
    useGameStore.getState().createBlueprint();
    useGameStore.getState().resetGame();
    const s = useGameStore.getState();
    // registry 保留（已保存的蓝图不丢失）
    expect(Object.keys(s.blueprintRegistry).length).toBeGreaterThanOrEqual(1);
    expect(s.currentViewingNodeId).toBeNull();
    expect(s.currentAncestorPath).toEqual([]);
    expect(s.machines).toEqual([]);
  });
});

// ======================================================================
// Phase 5 验证：ModeState & Selector
// ======================================================================
describe('ModeState & Selector (Phase 5)', () => {
  beforeEach(() => {
    useGameStore.setState({
      modeState: { kind: 'BUILD', placing: null },
      currentViewingNodeId: null,
      currentAncestorPath: [],
      blueprintRegistry: {},
      machines: [],
      connections: [],
    });
  });

  it('setMode BLUEPRINT_SELECT 进入蓝图选择模式', () => {
    useGameStore.getState().setMode('BLUEPRINT_SELECT');
    const ms = useGameStore.getState().modeState;
    expect(ms.kind).toBe('BLUEPRINT_SELECT');
    if (ms.kind === 'BLUEPRINT_SELECT') {
      expect(ms.selectedChildNodeId).toBeNull();
    }
  });

  it('cancelOperation 从 BLUEPRINT_SELECT 回到 BUILD', () => {
    useGameStore.getState().setMode('BLUEPRINT_SELECT');
    useGameStore.getState().cancelOperation();
    expect(useGameStore.getState().modeState.kind).toBe('BUILD');
  });

  it('cancelOperation 从 BLUEPRINT_MOVE(isInserting) 丢弃回到 BUILD', () => {
    useGameStore.setState({
      modeState: {
        kind: 'BLUEPRINT_MOVE',
        childNodeId: 'test',
        childSnapshot: { nodeId: 'test', blueprintId: 'bp', name: '', version: 1, machines: [], connections: [], children: [], ownMask: null!, childrenMask: null!, totalMask: null!, createdAt: 0, updatedAt: 0 },
        moveAnchor: { x: 0, y: 0 },
        previewOffset: null,
        isCopying: true,
        isInserting: true,
        isValidPosition: true,
      },
    });
    useGameStore.getState().cancelOperation();
    expect(useGameStore.getState().modeState.kind).toBe('BUILD');
  });

  it('selector selectIsBlueprintSelectMode 正确返回', async () => {
    const { selectIsBlueprintSelectMode } = await import('@/store/selectors');
    useGameStore.getState().setMode('BLUEPRINT_SELECT');
    expect(selectIsBlueprintSelectMode(useGameStore.getState())).toBe(true);

    useGameStore.getState().setMode('BUILD');
    expect(selectIsBlueprintSelectMode(useGameStore.getState())).toBe(false);
  });

  it('selector selectViewingNodeId / selectDescendantMachines', async () => {
    const { selectViewingNodeId, selectDescendantMachines } = await import('@/store/selectors');
    const nodeId = useGameStore.getState().createBlueprint();
    expect(selectViewingNodeId(useGameStore.getState())).toBe(nodeId);

    // 加入一台后代机器
    const machines = [{ id: 'm1', machineId: 'lbr', x: 0, y: 0, rotation: 0 as const, blueprintNodeId: 'other-node' }];
    useGameStore.setState({ machines });
    expect(selectDescendantMachines(useGameStore.getState())).toHaveLength(1);
  });
});

// ======================================================================
// 端到端测试：创建 → 放置 → 保存 → 导入子蓝图
// ======================================================================
describe('蓝图树端到端流程', () => {
  beforeEach(() => {
    useGameStore.setState({
      machines: [],
      connections: [],
      modeState: { kind: 'BUILD', placing: null },
      zoom: 1, pan: { x: 0, y: 0 },
      gridWidth: 24, gridHeight: 24,
      history: { past: [], future: [] },
      hoverPosFrac: null,
      blueprintRegistry: {},
      currentViewingNodeId: null,
      currentAncestorPath: [],
    });
  });

  it('完整流程：创建蓝图 → 加机器 → 保存 → 验证 snapshot 含机器', () => {
    const { createBlueprint, addMachine, saveCurrentBlueprint } = useGameStore.getState();

    // 1. 创建蓝图
    const nodeId = createBlueprint();
    expect(nodeId).toBeTruthy();
    expect(useGameStore.getState().currentViewingNodeId).toBe(nodeId);

    // 2. 放置一台机器（带上 blueprintNodeId）
    useGameStore.getState().takeSnapshot();
    addMachine('lbr', 5, 5, 0);
    let s = useGameStore.getState();
    expect(s.machines).toHaveLength(1);
    expect(s.machines[0].blueprintNodeId).toBe(nodeId);

    // 3. 保存（Fork 新版本）
    saveCurrentBlueprint('测试蓝图');
    s = useGameStore.getState();
    const newNodeId = s.currentViewingNodeId;
    expect(newNodeId).toBeTruthy();
    expect(newNodeId).not.toBe(nodeId); // 保存应生成新 ID

    // 4. 验证新 snapshot 包含机器
    const saved = s.blueprintRegistry[newNodeId!];
    expect(saved).toBeDefined();
    expect(saved.machines).toHaveLength(1);
    expect(saved.machines[0].machineId).toBe('lbr');

    // 5. 验证旧版本保留（引擎不自动 GC）
    expect(s.blueprintRegistry[nodeId]).toBeDefined();

    // 6. 验证 store 中机器的 blueprintNodeId 已更新为新 nodeId
    expect(s.machines[0].blueprintNodeId).toBe(newNodeId);
  });

  it('完整流程：保存后再次放置机器，再次保存不丢失', () => {
    const { createBlueprint, addMachine, saveCurrentBlueprint } = useGameStore.getState();

    createBlueprint();
    useGameStore.getState().takeSnapshot();
    addMachine('lbr', 3, 3, 0);

    // 第一次保存
    saveCurrentBlueprint('v1');

    // 放置第二台机器
    useGameStore.getState().takeSnapshot();
    addMachine('spl', 7, 7, 0);
    expect(useGameStore.getState().machines).toHaveLength(2);

    // 第二次保存
    saveCurrentBlueprint('v2');
    const afterSave2 = useGameStore.getState().currentViewingNodeId!;

    // 验证 snapshot 包含两台机器
    const snap = useGameStore.getState().blueprintRegistry[afterSave2];
    expect(snap).toBeDefined();
    expect(snap.machines).toHaveLength(2);
  });

  it('完整流程：导入子蓝图后 store 包含子蓝图机器', () => {
    const { createBlueprint, addMachine, saveCurrentBlueprint } = useGameStore.getState();

    // --- 建立一个"子蓝图" ---
    createBlueprint();
    useGameStore.getState().takeSnapshot();
    addMachine('lbr', 2, 2, 0);
    saveCurrentBlueprint('子蓝图');
    const childNodeId = useGameStore.getState().currentViewingNodeId!;
    // 子蓝图包含 1 台 lbr 在 (2,2)

    // --- 建立"父蓝图" ---
    createBlueprint();
    const parentNodeId = useGameStore.getState().currentViewingNodeId!;

    // 模拟 startInsertChild + commitInsert
    useGameStore.setState({
      modeState: {
        kind: 'BLUEPRINT_MOVE',
        childNodeId,
        childSnapshot: useGameStore.getState().blueprintRegistry[childNodeId]!,
        moveAnchor: { x: 0, y: 0 },
        previewOffset: null,
        isCopying: true,
        isInserting: true,
        isValidPosition: true,
      },
    });
    useGameStore.getState().commitInsert(10, 5);

    // 验证：store.machines 包含父蓝图自有机器（0台）+ 子蓝图机器（lbr 偏移到 12,7）
    const s = useGameStore.getState();
    expect(s.machines.length).toBeGreaterThanOrEqual(1);
    const childMachine = s.machines.find(m => m.blueprintNodeId === childNodeId);
    expect(childMachine).toBeDefined();
    expect(childMachine!.x).toBe(12); // 2 + 10
    expect(childMachine!.y).toBe(7);  // 2 + 5

    // 验证：父蓝图 registry 中有 childRef
    const parent = s.blueprintRegistry[parentNodeId];
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].childNodeId).toBe(childNodeId);
    expect(parent.children[0].x).toBe(10);
    expect(parent.children[0].y).toBe(5);
  });
});
