import React, { useMemo, memo } from 'react';
import classNames from 'classnames';
import { useGameStore } from '@/store/gameStore';
import type { Point, PortConfig } from '@/types';
import { MACHINES } from '@/config/machines';
import { checkPlacementCollision } from '@/utils/grid';
import { getRotatedDimensions, getRotatedPorts } from '@/utils/machineUtils';
import { GRID_SIZE } from '@/config/constants';
import { Z_INDEX, machineZ } from '@/config/zIndex';
import { getGhostArrowPosition } from '@/utils/portPosition';
import { selectPlacing, selectIsBuildMode } from '@/store/selectors';
import './GhostPreview.scss';

interface GhostPreviewProps {
  hoverPos: Point | null;
}

/** BUILD 模式下鼠标悬停时的机器放置预览（ghost + 供电范围 + 端口箭头） */
export const GhostPreview: React.FC<GhostPreviewProps> = memo(({ hoverPos }) => {
  const isBuild = useGameStore(selectIsBuildMode);
  const placing = useGameStore(selectPlacing);
  const machines = useGameStore(s => s.machines);
  const connections = useGameStore(s => s.connections);
  const gridWidth = useGameStore(s => s.gridWidth);
  const gridHeight = useGameStore(s => s.gridHeight);
  const hoverPosFrac = useGameStore(s => s.hoverPosFrac);

  const selectedMachineId = placing?.selectedMachineId ?? null;
  const previewRotation = placing?.previewRotation ?? 0;
  const buildOffset = placing?.buildOffset ?? null;

  const ghostConfig = useMemo(
    () => (isBuild && selectedMachineId) ? MACHINES.find(m => m.id === selectedMachineId) : null,
    [isBuild, selectedMachineId],
  );

  // 用 buildOffset 计算实际 ghost 整格位置：round(鼠标小数位置 − 偏移)
  const ghostPos = useMemo(() => {
    if (!buildOffset || !hoverPosFrac) return hoverPos;
    return {
      x: Math.round(hoverPosFrac.x - buildOffset.x),
      y: Math.round(hoverPosFrac.y - buildOffset.y),
    };
  }, [hoverPosFrac, buildOffset, hoverPos]);

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
      ghostConfig.id, candidate.x, candidate.y, previewRotation,
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
          zIndex: machineZ(Z_INDEX.GHOST_BASE, ghostConfig.mask.maxMask),
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
