import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point, GridPointerEvent } from '@/types';

interface UseSelectionModeDeps {
  getGridPos: (e: GridPointerEvent) => Point;
  hoverPosRef: React.MutableRefObject<Point | null>;
}

export function useSelectionMode({ getGridPos }: UseSelectionModeDeps) {
  const onMouseDown = useCallback((e: GridPointerEvent) => {
    const s = useGameStore.getState();
    if (s.modeState.kind === 'DEVICE_SELECT' && e.button === 0) {
      const pos = getGridPos(e);
      s.setBoxSelection(pos, pos);
    }
  }, [getGridPos]);

  const onMouseUp = useCallback((e: GridPointerEvent) => {
    const s = useGameStore.getState();
    const ms = s.modeState;
    if (ms.kind === 'DEVICE_SELECT' && ms.selectionStart) {
      s.commitBoxSelection(e.shiftKey);
    }
  }, []);

  const onMouseMove = useCallback((pos: Point, buttons: number) => {
    const s = useGameStore.getState();
    const ms = s.modeState;
    if (ms.kind === 'DEVICE_SELECT' && ms.selectionStart && buttons === 1) {
      s.setBoxSelection(ms.selectionStart, pos);
    }
  }, []);

  const onClickCommit = useCallback((e: GridPointerEvent) => {
    const pos = getGridPos(e);
    const s = useGameStore.getState();
    s.takeSnapshot();
    s.commitBatchMove(pos);
  }, [getGridPos]);

  return { onMouseDown, onMouseUp, onMouseMove, onClickCommit };
}
