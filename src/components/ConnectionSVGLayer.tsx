import React from 'react';
import classNames from 'classnames';
import type { Point, Connection, Direction, PortType } from '../types';
import { GRID_SIZE } from '../config/constants';

const EXTEND = 0.45;

/** 将路径端点沿方向延伸，使连线视觉上深入机器内部 */
const extendPoint = (p: Point, dir: number, amt: number): Point => {
  switch (dir % 4) {
    case 0: return { x: p.x, y: p.y - amt };
    case 1: return { x: p.x + amt, y: p.y };
    case 2: return { x: p.x, y: p.y + amt };
    case 3: return { x: p.x - amt, y: p.y };
    default: return { ...p };
  }
};

/** 将路径转为 SVG polyline points 字符串 */
const pathToPoints = (path: Point[], tailFacing: number, headFacing: number): string => {
  const renderPath: Point[] = [];
  renderPath.push(extendPoint(path[0], (tailFacing + 2) % 4, EXTEND));
  renderPath.push(...path);
  const last = path[path.length - 1];
  renderPath.push(extendPoint(last, headFacing, EXTEND));
  return renderPath.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ');
};

interface ConnectionSVGLayerProps {
  gridWidth: number;
  gridHeight: number;
  connections: Connection[];
  selectedConnectionIds: string[];
  isConnecting: boolean;
  previewPath: Point[];
  isValidPath: boolean;
  tailFacingForPreview: Direction;
  headFacingForPreview: Direction;
  connectPortType: PortType;
  /** 批量移动预览 */
  showMovePreview: boolean;
  movingConnectionsSnapshot: Connection[];
  moveAnchor: Point | null;
  hoverPos: Point | null;
}

/** 连线 SVG 渲染层：已确认连线 + 预览 + 批量移动预览 */
export const ConnectionSVGLayer: React.FC<ConnectionSVGLayerProps> = ({
  gridWidth,
  gridHeight,
  connections,
  selectedConnectionIds,
  isConnecting,
  previewPath,
  isValidPath,
  tailFacingForPreview,
  headFacingForPreview,
  connectPortType,
  showMovePreview,
  movingConnectionsSnapshot,
  moveAnchor,
  hoverPos,
}) => {
  const svgSize = {
    width: gridWidth * GRID_SIZE,
    height: gridHeight * GRID_SIZE,
  };

  return (
    <>
      {/* 主连线图层 */}
      <svg
        className="connections-layer"
        style={{ ...svgSize, pointerEvents: 'none' }}
      >
        {/* 已确认连线 */}
        {connections.map(conn => {
          const pts = pathToPoints(conn.path, conn.tailFacing, conn.headFacing);
          const cls = (base: string) => classNames(base, { selected: selectedConnectionIds.includes(conn.id) });
          const linePrefix = conn.portType === 'Liquid' ? 'pipe' : 'conveyor';

          return (
            <g key={conn.id}>
              <polyline points={pts} className={cls(`${linePrefix}-line-outline`)} />
              <polyline points={pts} className={cls(`${linePrefix}-line-fill`)} />
            </g>
          );
        })}

        {/* 连线预览 */}
        {isConnecting && previewPath.length > 0 && (() => {
          const pt = pathToPoints(previewPath, tailFacingForPreview, headFacingForPreview);
          const pcls = (base: string) => classNames(base, { 'invalid': !isValidPath });
          const prevPrefix = connectPortType === 'Liquid' ? 'pipe' : 'conveyor';
          return (
            <>
              <polyline points={pt} className={pcls(`${prevPrefix}-preview-outline`)} />
              <polyline points={pt} className={pcls(`${prevPrefix}-preview-fill`)} />
            </>
          );
        })()}
      </svg>

      {/* 批量移动预览 - 连线 */}
      {showMovePreview && (() => {
        const offsetX = hoverPos!.x - moveAnchor!.x;
        const offsetY = hoverPos!.y - moveAnchor!.y;

        return (
          <svg
            className="connections-layer"
            style={{ ...svgSize, pointerEvents: 'none', zIndex: 12 }}
          >
            {movingConnectionsSnapshot.map(conn => {
              const newPath = conn.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
              const pointsStr = pathToPoints(newPath, conn.tailFacing, conn.headFacing);
              const linePrefix = conn.portType === 'Liquid' ? 'pipe' : 'conveyor';
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
      })()}
    </>
  );
};
