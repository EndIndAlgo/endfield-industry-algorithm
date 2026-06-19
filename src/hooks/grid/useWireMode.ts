import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { GameMode } from '@/types';
import type { Point } from '@/types';
import { findPortOuterCellAt, findMachineAt, getPortOuterCells } from '@/utils/gridUtils';

interface UseWireModeDeps {
  getGridPos: (e: { clientX: number; clientY: number }) => Point;
  hoverPosRef: React.MutableRefObject<Point | null>;
}

/**
 * 连线模式 hook（传送带/管道）
 * 处理 CONVEYOR 和 PIPE 模式下的连线开始、提交、预览更新
 */
export function useWireMode({ getGridPos, hoverPosRef }: UseWireModeDeps) {
  /** 点击：开始连线或提交连线 */
  const onClick = useCallback((e: React.MouseEvent) => {
    const pos = getGridPos(e);
    const s = useGameStore.getState();

    // 正在进行连线 → 提交
    if (s.isConnecting) {
      if (s.isValidPath) {
        s.takeSnapshot();
        s.commitConnection();
      }
      return;
    }

    // 开始新连线：确定端口类型
    const portType = s.mode === GameMode.CONVEYOR ? 'Solid' : 'Liquid';

    // 尝试从机器端口开始
    const machine = findMachineAt(pos, s.machines);
    if (machine) {
      const ports = getPortOuterCells(machine, portType);
      if (ports.length > 0) {
        s.startConnecting(ports, portType);
        if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
      }
      return;
    }

    // 尝试从端口外侧格子开始
    const outerResult = findPortOuterCellAt(pos, s.machines, portType);
    if (outerResult) {
      s.startConnecting([{ pos: outerResult.pos, facing: outerResult.facing }], portType);
      if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
    }
  }, [getGridPos, hoverPosRef]);

  /** 鼠标移动：更新连线预览 */
  const onMouseMove = useCallback((pos: Point) => {
    const s = useGameStore.getState();
    if (s.isConnecting) {
      s.updatePreview(pos);
    }
  }, []);

  return { onClick, onMouseMove };
}
