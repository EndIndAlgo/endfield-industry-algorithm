import React, { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { Machine } from './Machine';
import { ConnectionSVGLayer } from './ConnectionSVGLayer';
import { useGridEvents } from '../hooks/useGridEvents';
import { GameMode } from '../types';
import type { PortConfig } from '../types';
import { MACHINES, getMachineConfig } from '../config/machines';
import classNames from 'classnames';
import './Grid.scss';
import { checkCollision } from '../utils/gridUtils';
import { getRotatedDimensions, getRotatedPorts, buildPowerGrid } from '../utils/machineUtils';
import { GRID_SIZE, PORT_ARROW_ROTATION } from '../config/constants';

export const Grid = () => {
  // ── 细粒度 store selector ──
  const zoom = useGameStore(s => s.zoom);
  const pan = useGameStore(s => s.pan);
  const gridWidth = useGameStore(s => s.gridWidth);
  const gridHeight = useGameStore(s => s.gridHeight);
  const machines = useGameStore(s => s.machines);
  const connections = useGameStore(s => s.connections);
  const mode = useGameStore(s => s.mode);
  const selectedMachineId = useGameStore(s => s.selectedMachineId);
  const previewRotation = useGameStore(s => s.previewRotation);
  const isConnecting = useGameStore(s => s.isConnecting);
  const previewPath = useGameStore(s => s.previewPath);
  const isValidPath = useGameStore(s => s.isValidPath);
  const connectPortType = useGameStore(s => s.portType);
  const selectionStart = useGameStore(s => s.selectionStart);
  const selectionEnd = useGameStore(s => s.selectionEnd);
  const selectedMachineIds = useGameStore(s => s.selectedMachineIds);
  const selectedConnectionIds = useGameStore(s => s.selectedConnectionIds);
  const moveAnchor = useGameStore(s => s.moveAnchor);
  const movingMachinesSnapshot = useGameStore(s => s.movingMachinesSnapshot);
  const movingConnectionsSnapshot = useGameStore(s => s.movingConnectionsSnapshot);

  // ── 供电网格 ──
  const poweredMachineIds = useMemo(() => {
    const grid = buildPowerGrid(machines, gridWidth, gridHeight, getMachineConfig);
    const powered = new Set<string>();
    for (const m of machines) {
      const cfg = getMachineConfig(m.machineId);
      if (!cfg || !cfg.power || cfg.power <= 0) {
        powered.add(m.id);
        continue;
      }
      const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
      let hasPower = false;
      for (let y = m.y; y < m.y + height && !hasPower; y++) {
        for (let x = m.x; x < m.x + width && !hasPower; x++) {
          if (x >= 0 && y >= 0 && x < gridWidth && y < gridHeight && grid[y * gridWidth + x]) {
            hasPower = true;
          }
        }
      }
      if (hasPower) powered.add(m.id);
    }
    return powered;
  }, [machines, gridWidth, gridHeight]);

  // ── 事件处理（提取到 hook） ──
  const {
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
  } = useGridEvents();

  // ── 连线预览方向 ──
  const tailFacingForPreview = useGameStore(s => s.activeTailFacing);
  const headFacingForPreview = useGameStore(s => s.previewHeadFacing);

  const showMovePreview = (mode === GameMode.MOVE_SELECTION || mode === GameMode.BLUEPRINT_PLACE) && moveAnchor && hoverPos;

  // ── 放置预览 ──
  const ghostConfig = (mode === GameMode.BUILD && selectedMachineId) ? MACHINES.find(m => m.id === selectedMachineId) : null;
  let isGhostInvalid = false;
  let ghostWidth = 0;
  let ghostHeight = 0;
  let ghostPorts: (PortConfig & { isInput?: boolean })[] = [];

  if (ghostConfig && hoverPos) {
    const dims = getRotatedDimensions(ghostConfig.width, ghostConfig.height, previewRotation);
    ghostWidth = dims.width;
    ghostHeight = dims.height;

    const candidate = { x: hoverPos.x, y: hoverPos.y, width: ghostWidth, height: ghostHeight };
    const isOutOfBounds = candidate.x < 0 || candidate.y < 0 ||
      candidate.x + candidate.width > gridWidth ||
      candidate.y + candidate.height > gridHeight;
    isGhostInvalid = isOutOfBounds || checkCollision(candidate, machines);

    ghostPorts = getRotatedPorts(
      [...ghostConfig.inputs, ...ghostConfig.outputs],
      ghostConfig.width, ghostConfig.height, previewRotation
    ).map((p, i) => ({ ...p, isInput: i < ghostConfig.inputs.length }));
  }

  return (
    <div
      className={classNames('grid-container', {
        'wiring-mode': mode === GameMode.CONVEYOR || mode === GameMode.PIPE,
        'panning': isPanning,
      })}
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
    >
      <div
        className="zoom-content"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: '100%', height: '100%'
        }}
      >
        <div
          className="grid-background"
          style={{ width: gridWidth * GRID_SIZE, height: gridHeight * GRID_SIZE }}
        />

        {/* 连线 SVG 图层 */}
        <ConnectionSVGLayer
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          connections={connections}
          selectedConnectionIds={selectedConnectionIds}
          isConnecting={isConnecting}
          previewPath={previewPath}
          isValidPath={isValidPath}
          tailFacingForPreview={tailFacingForPreview}
          headFacingForPreview={headFacingForPreview}
          connectPortType={connectPortType}
          showMovePreview={!!showMovePreview}
          movingConnectionsSnapshot={movingConnectionsSnapshot}
          moveAnchor={moveAnchor}
          hoverPos={hoverPos}
        />

        {/* 机器图层 */}
        {machines.map(m => (
          <Machine
            key={m.id}
            data={m}
            isSelected={selectedMachineIds.includes(m.id)}
            isPowered={poweredMachineIds.has(m.id)}
          />
        ))}

        {/* 框选矩形 */}
        {selectionStart && selectionEnd && mode === GameMode.DEVICE_SELECT && (() => {
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
                height: height * GRID_SIZE
              }}
            />
          );
        })()}

        {/* 批量移动预览 - 机器 */}
        {showMovePreview && movingMachinesSnapshot.map(m => {
          const offsetX = hoverPos!.x - moveAnchor!.x;
          const offsetY = hoverPos!.y - moveAnchor!.y;
          const ghostX = m.x + offsetX;
          const ghostY = m.y + offsetY;

          return (
            <div key={`ghost-${m.id}`} style={{ opacity: 0.6, pointerEvents: 'none', zIndex: 20 }}>
              <Machine
                data={{ ...m, x: ghostX, y: ghostY }}
                isSelected={true}
                isPowered={true}
              />
            </div>
          );
        })}

        {/* 单机器放置预览 */}
        {ghostConfig && hoverPos && (
          <>
            {ghostConfig.supplyDistance > 0 && (
              <div
                style={{
                  left: (hoverPos.x - ghostConfig.supplyDistance) * GRID_SIZE,
                  top: (hoverPos.y - ghostConfig.supplyDistance) * GRID_SIZE,
                  width: (ghostWidth + 2 * ghostConfig.supplyDistance) * GRID_SIZE,
                  height: (ghostHeight + 2 * ghostConfig.supplyDistance) * GRID_SIZE,
                  position: 'absolute',
                  border: '2px dashed #ffcc00',
                  backgroundColor: 'rgba(255, 204, 0, 0.2)',
                  pointerEvents: 'none',
                  zIndex: 5
                }}
              />
            )}
            <div
              className={classNames('machine-ghost', { 'invalid-placement': isGhostInvalid })}
              style={{
                left: hoverPos.x * GRID_SIZE,
                top: hoverPos.y * GRID_SIZE,
                width: ghostWidth * GRID_SIZE,
                height: ghostHeight * GRID_SIZE,
              } as React.CSSProperties}
            />
            {/* 预览端口箭头 */}
            {ghostPorts.map((p, i) => {
              let arrowX = hoverPos.x + p.x;
              let arrowY = hoverPos.y + p.y;
              let rotation = 0;
              const isInput = p.isInput;

              switch (p.side) {
                case 'left':
                  arrowX -= 1;
                  rotation = isInput ? PORT_ARROW_ROTATION.left.input : PORT_ARROW_ROTATION.left.output;
                  break;
                case 'right':
                  arrowX += 1;
                  rotation = isInput ? PORT_ARROW_ROTATION.right.input : PORT_ARROW_ROTATION.right.output;
                  break;
                case 'top':
                  arrowY -= 1;
                  rotation = isInput ? PORT_ARROW_ROTATION.top.input : PORT_ARROW_ROTATION.top.output;
                  break;
                case 'bottom':
                  arrowY += 1;
                  rotation = isInput ? PORT_ARROW_ROTATION.bottom.input : PORT_ARROW_ROTATION.bottom.output;
                  break;
              }

              return (
                <div
                  key={`ghost-arrow-${i}`}
                  className={classNames('ghost-arrow', isInput ? 'input-arrow' : 'output-arrow')}
                  style={{
                    left: arrowX * GRID_SIZE,
                    top: arrowY * GRID_SIZE,
                    transform: `rotate(${rotation}deg)`
                  } as React.CSSProperties}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18"></polyline>
                  </svg>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
