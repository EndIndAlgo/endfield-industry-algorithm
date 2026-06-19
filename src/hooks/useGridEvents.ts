import { useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameMode } from '../types';
import type { Point } from '../types';
import { usePanZoom } from './grid/usePanZoom';
import { useWireMode } from './grid/useWireMode';
import { useSelectionMode } from './grid/useSelectionMode';
import { useKeyboardShortcuts } from './grid/useKeyboardShortcuts';

interface UseGridEventsReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoverPos: Point | null;
  isPanning: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseUp: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleClick: (e: React.MouseEvent) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
  handleWheel: (e: React.WheelEvent) => void;
}

/**
 * 画布事件总管 hook（调度层）
 * 组合 usePanZoom / useWireMode / useSelectionMode / useKeyboardShortcuts，
 * 按当前 GameMode 将 DOM 事件分发给对应子 hook。
 */
export const useGridEvents = (): UseGridEventsReturn => {
  // ── 共享基础设施 ──
  const { containerRef, isPanning, getGridPos, handleWheel, startPan, movePan, stopPan } =
    usePanZoom();

  // ── hover 状态（React state 驱动渲染，ref 供闭包读取最新值） ──
  const [hoverPos, setHoverPos] = useState<Point | null>(null);
  const hoverPosRef = useRef<Point | null>(null);

  // ── 子 hook ──
  const wire = useWireMode({ getGridPos, hoverPosRef });
  const select = useSelectionMode({ getGridPos, hoverPosRef });
  useKeyboardShortcuts({ hoverPosRef });

  // ═══════════════════════════════════════════════════════════
  // 组合事件处理器
  // ═══════════════════════════════════════════════════════════

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 中键 → 平移
    if (e.button === 1) {
      e.preventDefault();
      startPan(e);
      return;
    }
    // 左键 + 框选模式 → 开始框选
    select.onMouseDown(e);
  }, [startPan, select]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    stopPan();
    select.onMouseUp(e);
  }, [stopPan, select]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 平移中
    if (isPanning) {
      movePan(e);
      return;
    }
    // 常规：更新 hover + 子模式处理
    const pos = getGridPos(e);
    setHoverPos(pos);
    hoverPosRef.current = pos;
    wire.onMouseMove(pos);
    select.onMouseMove(pos, e);
  }, [isPanning, getGridPos, movePan, wire, select]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isPanning) return;

    const s = useGameStore.getState();

    // ── 连线模式 ──
    if (s.mode === GameMode.CONVEYOR || s.mode === GameMode.PIPE) {
      wire.onClick(e);
      return;
    }

    // ── 批量移动 / 蓝图放置 ──
    if (s.mode === GameMode.MOVE_SELECTION || s.mode === GameMode.BLUEPRINT_PLACE) {
      select.onClickCommit(e);
      return;
    }

    // ── 建造模式 ──
    if (s.mode === GameMode.BUILD && s.selectedMachineId) {
      const pos = getGridPos(e);
      s.takeSnapshot();
      s.addMachine(s.selectedMachineId, pos.x, pos.y, s.previewRotation);
      if (!e.ctrlKey) {
        s.selectMachine(null);
      }
    }
  }, [isPanning, getGridPos, wire, select]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    useGameStore.getState().cancelOperation();
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverPos(null);
    stopPan();
  }, [stopPan]);

  return {
    containerRef,
    hoverPos,
    isPanning,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleClick,
    handleContextMenu,
    handleMouseLeave,
    handleWheel,
  };
};
