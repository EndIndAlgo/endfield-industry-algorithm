import React, { memo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { GRID_SIZE } from '@/config/constants';

/** DEVICE_SELECT 模式下的框选矩形 */
export const SelectionBox: React.FC = memo(() => {
  const modeState = useGameStore(s => s.modeState);

  if (modeState.kind !== 'DEVICE_SELECT') return null;
  const { selectionStart, selectionEnd } = modeState;
  if (!selectionStart || !selectionEnd) return null;

  const x1 = Math.min(selectionStart.x, selectionEnd.x);
  const y1 = Math.min(selectionStart.y, selectionEnd.y);
  const x2 = Math.max(selectionStart.x, selectionEnd.x);
  const y2 = Math.max(selectionStart.y, selectionEnd.y);
  const width = (x2 - x1) + 1;
  const height = (y2 - y1) + 1;

  return (
    <div
      className="selection-box"
      style={{
        left: x1 * GRID_SIZE,
        top: y1 * GRID_SIZE,
        width: width * GRID_SIZE,
        height: height * GRID_SIZE,
      }}
    />
  );
});
