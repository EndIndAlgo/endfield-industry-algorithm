import { useMemo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Machine } from './Machine';
import { ConnectionSVGLayer } from './ConnectionSVGLayer';
import { GhostPreview } from './GhostPreview';
import { SelectionBox } from './SelectionBox';
import { BatchMovePreview } from './BatchMovePreview';
import { useGridEvents } from '@/hooks/useGridEvents';
import { getMachineConfig } from '@/config/machines';
import classNames from 'classnames';
import './Grid.scss';
import { getRotatedDimensions, buildPowerGrid } from '@/utils/machineUtils';
import { GRID_SIZE } from '@/config/constants';
import { selectSelectedMachineIds } from '@/store/selectors';

export const Grid = () => {
  // ── 细粒度 store selector ──
  const zoom = useGameStore(s => s.zoom);
  const pan = useGameStore(s => s.pan);
  const gridWidth = useGameStore(s => s.gridWidth);
  const gridHeight = useGameStore(s => s.gridHeight);
  const machines = useGameStore(s => s.machines);
  const modeKind = useGameStore(s => s.modeState.kind);
  const selectedMachineIds = useGameStore(selectSelectedMachineIds);

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

  return (
    <div
      className={classNames('grid-container', {
        'wiring-mode': modeKind === 'WIRE',
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

        {/* Solid 连线层 */}
        <ConnectionSVGLayer portType="Solid" />

        {/* 所有机器（z-index 由 machineZ 按掩码自动分层） */}
        {machines.map(m => (
          <Machine
            key={m.id}
            data={m}
            isSelected={selectedMachineIds.includes(m.id)}
            isPowered={poweredMachineIds.has(m.id)}
          />
        ))}

        {/* Liquid 连线层 */}
        <ConnectionSVGLayer portType="Liquid" />

        {/* 框选矩形 */}
        <SelectionBox />

        {/* 批量移动预览 */}
        <BatchMovePreview hoverPos={hoverPos} />

        {/* 单机器放置预览 */}
        <GhostPreview hoverPos={hoverPos} />
      </div>
    </div>
  );
};
