import type { Connection, PortType } from '@/types';
import { Mask } from '@/utils/mask';
import { getCornerPoints } from './port';

/** 构建连线占用矩阵 (0=空, 1=被连线占用), 可选按 portType 过滤 */
export const buildConnectionGrid = (
  connections: Connection[],
  gridW: number,
  gridH: number,
  portType?: PortType
): Mask => {
  const grid = Mask.Uniform(gridW, gridH, 0);
  for (const c of connections) {
    if (portType && c.portType !== portType) continue;
    for (const p of c.path) {
      if (p.x >= 0 && p.x < gridW && p.y >= 0 && p.y < gridH) {
        grid.WriteValue(p.x, p.y, 1);
      }
    }
  }
  return grid;
};

/**
 * 构建已有同类型连线拐弯点网格
 * 桥不能放在已有线的拐弯上
 */
export const buildExistingCornerGrid = (
  connections: Connection[],
  gw: number,
  gh: number,
  portType: PortType
): Mask => {
  const corners: import('@/types').Point[] = [];
  for (const conn of connections) {
    if (conn.portType !== portType) continue;
    for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
      corners.push(cp);
    }
  }
  return Mask.FromCornerPoints(corners, gw, gh);
};
