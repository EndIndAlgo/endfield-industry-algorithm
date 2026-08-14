import { useGameStore } from '@/store/gameStore';
import type { Point } from '@/types';
import type { FactoryDoc, CommittedNode } from '@/domain/doc';
import { findPortOuterCellAt, findMachineAt, getPortOuterCells } from '@/utils/grid';

/**
 * 纯函数模式处理器
 *
 * 从 useWireMode / useSelectionMode / useBlueprintSelectMode 逐条搬移，
 * 只接收已归一化的指针事件（画布空间坐标 + 网格坐标），不再接触坐标系差异。
 */

/** 归一化后的指针事件（画布空间像素坐标 + 已换算网格坐标） */
export interface NormalizedPointer {
  /** 画布空间像素坐标（PixiJS e.global，与 world.toLocal 同系） */
  x: number;
  y: number;
  /** 整数网格坐标 */
  grid: Point;
  /** 小数网格坐标 */
  gridFrac: Point;
  button: number;
  buttons: number;
  shiftKey: boolean;
  ctrlKey: boolean;
}

export interface ModeHandlerContext {
  /** 最近一次画布内 hover 的网格坐标（指针越界后为 null） */
  getHoverGridPos: () => Point | null;
}

export interface ModeHandlers {
  onDown: (e: NormalizedPointer) => void;
  onUp: (e: NormalizedPointer) => void;
  onMove: (grid: Point, buttons: number) => void;
  /** click(左键)/tap/pointertap 统一提交入口，按 modeState.kind 分发 */
  onTap: (e: NormalizedPointer) => void;
}

// ── BLUEPRINT_SELECT 命中辅助（来自 useBlueprintSelectMode） ──

function isInSubtree(
  nodeId: string,
  rootId: string,
  doc: FactoryDoc,
  visited: Set<string> = new Set(),
): boolean {
  // 环防护：异常数据下防止无限递归
  if (visited.has(rootId)) return false;
  visited.add(rootId);

  const snapshot = doc.nodes[rootId];
  if (!snapshot) return false;
  for (const child of snapshot.children) {
    if (child.childNodeId === nodeId) return true;
    if (isInSubtree(nodeId, child.childNodeId, doc, visited)) return true;
  }
  return false;
}

function findDirectChildContaining(
  nodeId: string,
  viewing: CommittedNode,
  doc: FactoryDoc,
): string | null {
  for (const child of viewing.children) {
    if (child.childNodeId === nodeId || isInSubtree(nodeId, child.childNodeId, doc)) {
      return child.childNodeId;
    }
  }
  return null;
}

export function createModeHandlers(ctx: ModeHandlerContext): ModeHandlers {
  // ── WIRE：连线交互（来自 useWireMode） ──
  const wire = {
    onTap(e: NormalizedPointer) {
      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind !== 'WIRE') return;

      if (ms.connecting) {
        if (ms.connecting.isValidPath) {
          s.takeSnapshot();
          s.commitConnection();
        }
        return;
      }

      const portType = ms.portType;
      const machine = findMachineAt(e.grid, s.machines);
      if (machine) {
        const ports = getPortOuterCells(machine, portType);
        if (ports.length > 0) {
          s.startConnecting(ports, portType);
          const hover = ctx.getHoverGridPos();
          if (hover) s.updatePreview(hover);
        }
        return;
      }

      const outerResult = findPortOuterCellAt(e.grid, s.machines, portType);
      if (outerResult) {
        s.startConnecting([{ pos: outerResult.pos, facing: outerResult.facing }], portType);
        const hover = ctx.getHoverGridPos();
        if (hover) s.updatePreview(hover);
      }
    },
    onMove(grid: Point) {
      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind === 'WIRE' && ms.connecting) {
        s.updatePreview(grid);
      }
    },
  };

  // ── DEVICE_SELECT：框选 + 批量移动提交（来自 useSelectionMode） ──
  const select = {
    onDown(e: NormalizedPointer) {
      const s = useGameStore.getState();
      if (s.modeState.kind === 'DEVICE_SELECT' && e.button === 0) {
        s.setBoxSelection(e.grid, e.grid);
      }
    },
    onUp(e: NormalizedPointer) {
      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind === 'DEVICE_SELECT' && ms.selectionStart) {
        s.commitBoxSelection(e.shiftKey);
      }
    },
    onMove(grid: Point, buttons: number) {
      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind === 'DEVICE_SELECT' && ms.selectionStart && buttons === 1) {
        s.setBoxSelection(ms.selectionStart, grid);
      }
    },
    onTapCommit(e: NormalizedPointer) {
      const s = useGameStore.getState();
      s.takeSnapshot();
      s.commitBatchMove(e.grid);
    },
  };

  // ── BLUEPRINT_SELECT：子蓝图命中（来自 useBlueprintSelectMode） ──
  const bpSelect = {
    onTap(e: NormalizedPointer) {
      const s = useGameStore.getState();
      if (s.modeState.kind !== 'BLUEPRINT_SELECT') return;

      const pos = e.grid;
      const { machines, doc, currentViewingNodeId } = s;
      if (!currentViewingNodeId) return;

      const viewing = doc.nodes[currentViewingNodeId];
      if (!viewing || viewing.children.length === 0) return;

      const clickedMachine = machines.find(
        (m) => m.x <= pos.x && pos.x < m.x + 1 && m.y <= pos.y && pos.y < m.y + 1,
      );

      if (!clickedMachine || !clickedMachine.blueprintNodeId) {
        useGameStore.setState({
          modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null },
        });
        return;
      }

      if (clickedMachine.blueprintNodeId === currentViewingNodeId) {
        useGameStore.setState({
          modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null },
        });
        return;
      }

      const childNodeId = findDirectChildContaining(
        clickedMachine.blueprintNodeId,
        viewing,
        doc,
      );

      useGameStore.setState({
        modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: childNodeId },
      });
    },
  };

  return {
    onDown: (e) => select.onDown(e),
    onUp: (e) => select.onUp(e),
    onMove: (grid, buttons) => {
      wire.onMove(grid);
      select.onMove(grid, buttons);
    },
    onTap: (e) => {
      const s = useGameStore.getState();
      const ms = s.modeState;

      if (ms.kind === 'WIRE') {
        wire.onTap(e);
        return;
      }
      if (ms.kind === 'MOVE_SELECTION') {
        select.onTapCommit(e);
        return;
      }
      if (ms.kind === 'BLUEPRINT_SELECT') {
        bpSelect.onTap(e);
        return;
      }
      if (ms.kind === 'BLUEPRINT_MOVE') {
        // commitInsert 内部已 takeSnapshot
        const frac = s.hoverPosFrac;
        const gridPos = frac
          ? { x: Math.round(frac.x), y: Math.round(frac.y) }
          : e.grid;
        s.commitInsert(gridPos.x, gridPos.y);
        return;
      }
      if (ms.kind === 'BUILD' && ms.placing) {
        const frac = s.hoverPosFrac;
        const gridPos = frac
          ? {
              x: Math.round(frac.x - ms.placing.buildOffset.x),
              y: Math.round(frac.y - ms.placing.buildOffset.y),
            }
          : e.grid;
        s.takeSnapshot();
        s.addMachine(ms.placing.selectedMachineId, gridPos.x, gridPos.y, ms.placing.previewRotation);
        if (!e.ctrlKey) {
          s.selectMachine(null);
        }
      }
    },
  };
}
