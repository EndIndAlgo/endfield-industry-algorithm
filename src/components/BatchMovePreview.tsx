import React, { memo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Machine } from './Machine';
import { portTypeToMask } from '@/types';
import type { Point, Connection, PortType } from '@/types';
import { pathToPoints } from '@/utils/portPosition';
import { Z_INDEX, connZ } from '@/config/zIndex';

interface BatchMovePreviewProps {
  hoverPos: Point | null;
}

/** 渲染单个类型的批量移动连线 SVG */
const BatchMoveConnectionsSVG: React.FC<{ connections: Connection[]; portType: PortType; zIndex: number }> = memo(
  ({ connections, portType, zIndex }) => {
    if (connections.length === 0) return null;
    return (
      <svg
        className="connections-layer"
        style={{ pointerEvents: 'none', zIndex }}
      >
        {connections.map((conn: Connection) => {
          const pointsStr = pathToPoints(conn.path, conn.tailFacing, conn.headFacing);
          const linePrefix = portType === 'Liquid' ? 'pipe' : 'conveyor';

          return (
            <React.Fragment key={`ghost-conn-${conn.id}`}>
              <polyline
                points={pointsStr}
                className={`${linePrefix}-line-outline`}
                style={{ opacity: 0.5 }}
              />
              <polyline
                points={pointsStr}
                className={`${linePrefix}-line-fill`}
                style={{ opacity: 0.5 }}
              />
            </React.Fragment>
          );
        })}
      </svg>
    );
  },
);

/** MOVE_SELECTION 模式下的批量移动预览（机器虚影 + 连线虚影） */
export const BatchMovePreview: React.FC<BatchMovePreviewProps> = memo(({ hoverPos }) => {
  const modeState = useGameStore(s => s.modeState);

  if (modeState.kind !== 'MOVE_SELECTION' || !modeState.moveAnchor || !hoverPos) return null;
  const { moveAnchor, movingMachinesSnapshot, movingConnectionsSnapshot } = modeState;

  const offsetX = hoverPos!.x - moveAnchor!.x;
  const offsetY = hoverPos!.y - moveAnchor!.y;

  const solidConns = movingConnectionsSnapshot.filter(c => c.portType === 'Solid');
  const liquidConns = movingConnectionsSnapshot.filter(c => c.portType === 'Liquid');

  return (
    <>
      {/* 机器虚影 */}
      {movingMachinesSnapshot.map(m => {
        const ghostX = m.x + offsetX;
        const ghostY = m.y + offsetY;

        return (
          <div key={`ghost-${m.id}`} style={{ opacity: 0.6, pointerEvents: 'none' }}>
            <Machine
              data={{ ...m, x: ghostX, y: ghostY }}
              isSelected={true}
              isPowered={true}
              zBase={Z_INDEX.BATCH_BASE}
            />
          </div>
        );
      })}

      {/* Solid 批量连线虚影 */}
      <BatchMoveConnectionsSVG
        connections={solidConns.map(c => ({
          ...c,
          path: c.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY })),
        }))}
        portType="Solid"
        zIndex={connZ(Z_INDEX.BATCH_BASE, portTypeToMask['Solid'])}
      />

      {/* Liquid 批量连线虚影 */}
      <BatchMoveConnectionsSVG
        connections={liquidConns.map(c => ({
          ...c,
          path: c.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY })),
        }))}
        portType="Liquid"
        zIndex={connZ(Z_INDEX.BATCH_BASE, portTypeToMask['Liquid'])}
      />
    </>
  );
});
