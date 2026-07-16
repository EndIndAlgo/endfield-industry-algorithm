import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point, GridPointerEvent } from '@/types';
import { findPortOuterCellAt, findMachineAt, getPortOuterCells } from '@/utils/grid';

interface UseWireModeDeps {
  /** 屏幕坐标 → 网格坐标（事件源无关：DOM 或 PixiJS） */
  getGridPos: (e: GridPointerEvent) => Point;
  hoverPosRef: React.MutableRefObject<Point | null>;
}

export function useWireMode({ getGridPos, hoverPosRef }: UseWireModeDeps) {
  const onClick = useCallback((e: GridPointerEvent) => {
    const pos = getGridPos(e);
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
    const machine = findMachineAt(pos, s.machines);
    if (machine) {
      const ports = getPortOuterCells(machine, portType);
      if (ports.length > 0) {
        s.startConnecting(ports, portType);
        if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
      }
      return;
    }

    const outerResult = findPortOuterCellAt(pos, s.machines, portType);
    if (outerResult) {
      s.startConnecting([{ pos: outerResult.pos, facing: outerResult.facing }], portType);
      if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
    }
  }, [getGridPos, hoverPosRef]);

  const onMouseMove = useCallback((pos: Point) => {
    const s = useGameStore.getState();
    const ms = s.modeState;
    if (ms.kind === 'WIRE' && ms.connecting) {
      s.updatePreview(pos);
    }
  }, []);

  return { onClick, onMouseMove };
}
