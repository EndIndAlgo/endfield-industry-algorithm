import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point } from '@/types';

interface UseSelectionModeDeps {
  getGridPos: (e: { clientX: number; clientY: number }) => Point;
  hoverPosRef: React.MutableRefObject<Point | null>;
}

/**
 * 选择/移动模式 hook
 * 处理 DEVICE_SELECT 框选 + MOVE_SELECTION 批量移动确认
 */
export function useSelectionMode({ getGridPos }: UseSelectionModeDeps) {
  /** 鼠标按下：开始框选 */
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const s = useGameStore.getState();
    if (s.modeState.kind === 'DEVICE_SELECT' && e.button === 0) {
      const pos = getGridPos(e);
      s.setBoxSelection(pos, pos);
    }
  }, [getGridPos]);

  /** 鼠标释放：提交框选 */
  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const s = useGameStore.getState();
    const ms = s.modeState;
    if (ms.kind === 'DEVICE_SELECT' && ms.selectionStart) {
      s.commitBoxSelection(e.shiftKey);
    }
  }, []);

  /** 鼠标移动：更新框选范围 */
  const onMouseMove = useCallback((pos: Point, e: React.MouseEvent) => {
    const s = useGameStore.getState();
    const ms = s.modeState;
    if (ms.kind === 'DEVICE_SELECT' && ms.selectionStart && e.buttons === 1) {
      s.setBoxSelection(ms.selectionStart, pos);
    }
  }, []);

  /** 点击确认：批量移动 / 蓝图放置 */
  const onClickCommit = useCallback((e: React.MouseEvent) => {
    const pos = getGridPos(e);
    const s = useGameStore.getState();
    s.takeSnapshot();
    s.commitBatchMove(pos);
  }, [getGridPos]);

  return { onMouseDown, onMouseUp, onMouseMove, onClickCommit };
}
