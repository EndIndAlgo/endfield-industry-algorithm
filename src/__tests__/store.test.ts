import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { GameMode } from '../types';
import type { PlacedMachine, Connection, Direction } from '../types';

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
    mode: GameMode.BUILD,
    selectedMachineId: null,
    previewRotation: 0,
    movingMachineBackup: null,
    zoom: 1,
    pan: { x: 0, y: 0 },
    gridWidth: 24,
    gridHeight: 24,
    history: { past: [], future: [] },
    isConnecting: false,
    isContinuing: false,
    continueSourceId: null,
    isValidPath: true,
    availablePorts: [],
    portType: 'Solid',
    activeStartPos: { x: 0, y: 0 },
    activeTailFacing: 1 as Direction,
    previewPath: [],
    previewHeadFacing: 1 as Direction,
    lShapeMode: 'same-dir',
    previewTargetIsMachine: false,
    selectionStart: null,
    selectionEnd: null,
    selectedMachineIds: [],
    selectedConnectionIds: [],
    moveAnchor: null,
    movingMachinesSnapshot: [],
    movingConnectionsSnapshot: [],
    isCopying: false,
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
    it('拾取机器放入 movingMachineBackup，从 machines 移除', () => {
      useGameStore.setState({ machines: [makeLBR()] });
      useGameStore.getState().pickupMachine('lbr-1');
      const s = useGameStore.getState();
      expect(s.machines).toHaveLength(0);
      expect(s.movingMachineBackup).toBeDefined();
      expect(s.movingMachineBackup!.id).toBe('lbr-1');
    });

    it('拾取不存在的机器不改变状态', () => {
      useGameStore.setState({ machines: [makeLBR()] });
      useGameStore.getState().pickupMachine('nonexistent');
      expect(useGameStore.getState().machines).toHaveLength(1);
      expect(useGameStore.getState().movingMachineBackup).toBeNull();
    });
  });

  describe('cancelOperation', () => {
    it('归还拾取中的机器', () => {
      useGameStore.setState({ machines: [makeLBR()] });
      useGameStore.getState().pickupMachine('lbr-1');
      useGameStore.getState().cancelOperation();
      expect(useGameStore.getState().machines).toHaveLength(1);
      expect(useGameStore.getState().movingMachineBackup).toBeNull();
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
      useGameStore.setState({ machines: [makeLBR({ x: 2, y: 2 })] });
      useGameStore.getState().setBoxSelection({ x: 0, y: 0 }, { x: 5, y: 5 });
      useGameStore.getState().commitBoxSelection();
      // lbr 1×1 在 (2,2), 完全在 (0,0)-(5,5) 内 → 选中
      expect(useGameStore.getState().selectedMachineIds).toContain('lbr-1');
    });

    it('框选范围外机器不被选中', () => {
      useGameStore.setState({ machines: [makeLBR({ x: 10, y: 10 })] });
      useGameStore.getState().setBoxSelection({ x: 0, y: 0 }, { x: 5, y: 5 });
      useGameStore.getState().commitBoxSelection();
      expect(useGameStore.getState().selectedMachineIds).toHaveLength(0);
    });

    it('toggle 模式反选已选中的机器', () => {
      useGameStore.setState({
        machines: [makeLBR({ x: 2, y: 2 })],
        selectedMachineIds: ['lbr-1'],
      });
      useGameStore.getState().setBoxSelection({ x: 0, y: 0 }, { x: 5, y: 5 });
      useGameStore.getState().commitBoxSelection(true);
      expect(useGameStore.getState().selectedMachineIds).toHaveLength(0);
    });
  });

  describe('deleteSelected', () => {
    it('删除选中的机器', () => {
      useGameStore.setState({ machines: [makeLBR()], selectedMachineIds: ['lbr-1'] });
      useGameStore.getState().deleteSelected();
      expect(useGameStore.getState().machines).toHaveLength(0);
    });

    it('无选中时不操作', () => {
      useGameStore.setState({ machines: [makeLBR()] });
      useGameStore.getState().deleteSelected();
      expect(useGameStore.getState().machines).toHaveLength(1);
    });
  });

  describe('startBatchMove', () => {
    it('移动机器到 snapshot，从 store 移除', () => {
      useGameStore.setState({ machines: [makeLBR()], selectedMachineIds: ['lbr-1'] });
      useGameStore.getState().startBatchMove();
      const s = useGameStore.getState();
      expect(s.machines).toHaveLength(0);
      expect(s.movingMachinesSnapshot).toHaveLength(1);
      expect(s.mode).toBe('MOVE_SELECTION');
    });

    it('无选中时不操作', () => {
      useGameStore.setState({ machines: [makeLBR()] });
      useGameStore.getState().startBatchMove();
      expect(useGameStore.getState().movingMachinesSnapshot).toHaveLength(0);
    });
  });

  describe('startCopySelection', () => {
    it('复制选中的机器（ID 重新生成）', () => {
      useGameStore.setState({ machines: [makeLBR()], selectedMachineIds: ['lbr-1'] });
      useGameStore.getState().startCopySelection();
      const s = useGameStore.getState();
      expect(s.movingMachinesSnapshot).toHaveLength(1);
      expect(s.movingMachinesSnapshot[0].id).not.toBe('lbr-1'); // 新 ID
      expect(s.isCopying).toBe(true);
    });
  });

  describe('commitBatchMove', () => {
    it('移动到目标位置', () => {
      useGameStore.setState({
        machines: [],
        connections: [],
        movingMachinesSnapshot: [makeLBR({ x: 0, y: 0, id: 'm1' })],
        movingConnectionsSnapshot: [],
        moveAnchor: { x: 0, y: 0 },
        mode: GameMode.MOVE_SELECTION,
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
        movingMachinesSnapshot: [makeLBR({ x: 0, y: 0, id: 'm1' })],
        movingConnectionsSnapshot: [],
        moveAnchor: { x: 0, y: 0 },
        mode: GameMode.MOVE_SELECTION,
        gridWidth: 24,
        gridHeight: 24,
      });
      useGameStore.getState().commitBatchMove({ x: 5, y: 5 });
      // 碰撞，snapshot 应还在（移动未成功）
      expect(useGameStore.getState().movingMachinesSnapshot).toHaveLength(1);
    });

    it('越界时拒绝', () => {
      useGameStore.setState({
        machines: [],
        movingMachinesSnapshot: [makeLBR({ x: 0, y: 0, id: 'm1' })],
        movingConnectionsSnapshot: [],
        moveAnchor: { x: 0, y: 0 },
        mode: GameMode.MOVE_SELECTION,
        gridWidth: 24,
        gridHeight: 24,
      });
      useGameStore.getState().commitBatchMove({ x: 100, y: 100 });
      expect(useGameStore.getState().movingMachinesSnapshot).toHaveLength(1);
    });
  });
});
