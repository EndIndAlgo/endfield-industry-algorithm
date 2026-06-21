import React, { useMemo, memo } from 'react';
import classNames from 'classnames';
import { useGameStore } from '@/store/gameStore';
import { GameMode } from '@/types';
import type { Point, PortConfig } from '@/types';
import { MACHINES } from '@/config/machines';
import { checkPlacementCollision } from '@/utils/grid';
import { getRotatedDimensions, getRotatedPorts } from '@/utils/machineUtils';
import { GRID_SIZE } from '@/config/constants';
import { Z_INDEX, machineZ } from '@/config/zIndex';
import { getMachineMask } from '@/utils/machineUtils';
import { getGhostArrowPosition } from '@/utils/portPosition';
import './GhostPreview.scss';

interface GhostPreviewProps {
  hoverPos: Point | null;
}

/** BUILD 模式下鼠标悬停时的机器放置预览（ghost + 供电范围 + 端口箭头） */
export const GhostPreview: React.FC<GhostPreviewProps> = memo(({ hoverPos }) => {
  const mode = useGameStore(s => s.mode);
  const selectedMachineId = useGameStore(s => s.selectedMachineId);
  const previewRotation = useGameStore(s => s.previewRotation);
  const machines = useGameStore(s => s.machines);
  const connections = useGameStore(s => s.connections);
  const gridWidth = useGameStore(s => s.gridWidth);
  const gridHeight = useGameStore(s => s.gridHeight);
  const pickupOffset = useGameStore(s => s.pickupOffset);
  const hoverPosFrac = useGameStore(s => s.hoverPosFrac);

  const ghostConfig = useMemo(
    () => (mode === GameMode.BUILD && selectedMachineId) ? MACHINES.find(m => m.id === selectedMachineId) : null,
    [mode, selectedMachineId],
  );

  // 拾取偏移后的实际 ghost 整格位置：round(鼠标小数位置 − 拾取偏移)
  const ghostPos = useMemo(() => {
    if (!pickupOffset || !hoverPosFrac) return hoverPos;
    return {
      x: Math.round(hoverPosFrac.x - pickupOffset.x),
      y: Math.round(hoverPosFrac.y - pickupOffset.y),
    };
  }, [hoverPosFrac, pickupOffset, hoverPos]);

  const ghostData = useMemo(() => {
    if (!ghostConfig || !ghostPos) return null;

    const dims = getRotatedDimensions(ghostConfig.width, ghostConfig.height, previewRotation);
    const ghostWidth = dims.width;
    const ghostHeight = dims.height;

    const candidate = { x: ghostPos.x, y: ghostPos.y, width: ghostWidth, height: ghostHeight };
    const isOutOfBounds = candidate.x < 0 || candidate.y < 0 ||
      candidate.x + candidate.width > gridWidth ||
      candidate.y + candidate.height > gridHeight;
    const isGhostInvalid = isOutOfBounds || checkPlacementCollision(
      ghostConfig.id, candidate.x, candidate.y, ghostWidth, ghostHeight,
      machines, connections, gridWidth, gridHeight,
    );

    const ghostPorts = getRotatedPorts(
      [...ghostConfig.inputs, ...ghostConfig.outputs],
      ghostConfig.width, ghostConfig.height, previewRotation,
    ).map((p, i) => ({ ...p, isInput: i < ghostConfig.inputs.length }));

    return { ghostWidth, ghostHeight, isGhostInvalid, ghostPorts };
  }, [ghostConfig, ghostPos, previewRotation, machines, connections, gridWidth, gridHeight]);

  if (!ghostConfig || !ghostPos || !ghostData) return null;

  const { ghostWidth, ghostHeight, isGhostInvalid, ghostPorts } = ghostData;

  return (
    <>
      {/* 供电范围虚线框 */}
      {ghostConfig.supplyDistance > 0 && (
        <div
          style={{
            left: (ghostPos.x - ghostConfig.supplyDistance) * GRID_SIZE,
            top: (ghostPos.y - ghostConfig.supplyDistance) * GRID_SIZE,
            width: (ghostWidth + 2 * ghostConfig.supplyDistance) * GRID_SIZE,
            height: (ghostHeight + 2 * ghostConfig.supplyDistance) * GRID_SIZE,
            position: 'absolute',
            border: '2px dashed #ffcc00',
            backgroundColor: 'rgba(255, 204, 0, 0.2)',
            pointerEvents: 'none',
            zIndex: Z_INDEX.SUPPLY_RANGE,
          }}
        />
      )}

      {/* Ghost 机器占位 */}
      <div
        className={classNames('machine-ghost', { 'invalid-placement': isGhostInvalid })}
        style={{
          left: ghostPos.x * GRID_SIZE,
          top: ghostPos.y * GRID_SIZE,
          width: ghostWidth * GRID_SIZE,
          height: ghostHeight * GRID_SIZE,
          zIndex: machineZ(Z_INDEX.GHOST_BASE, getMachineMask(ghostConfig.id)),
        } as React.CSSProperties}
      />

      {/* Ghost 端口箭头 */}
      {ghostPorts.map((p: PortConfig & { isInput?: boolean }, i: number) => {
        const pos = getGhostArrowPosition(p, ghostPos);

        return (
          <div
            key={`ghost-arrow-${i}`}
            className={classNames('ghost-arrow', p.isInput ? 'input-arrow' : 'output-arrow')}
            style={{
              left: pos.left,
              top: pos.top,
              transform: `rotate(${pos.rotation}deg)`,
              zIndex: Z_INDEX.GHOST_ARROW,
            } as React.CSSProperties}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </div>
        );
      })}
    </>
  );
});
