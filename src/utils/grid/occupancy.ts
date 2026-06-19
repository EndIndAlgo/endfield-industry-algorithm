import type { PlacedMachine, Connection, PortType } from '../../types';
import { portTypeToMask } from '../../types';
import { MACHINES } from '../../config/machines';
import { getRotatedDimensions, getMachineCellMask } from '../machineUtils';
import { getCornerPoints } from './port';

/** 构建连线占用矩阵 (0=空, 1=被连线占用), 可选按 portType 过滤 */
export const buildConnectionGrid = (
  connections: Connection[],
  gridW: number,
  gridH: number,
  portType?: PortType
): Uint8Array => {
  const grid = new Uint8Array(gridW * gridH);
  for (const c of connections) {
    if (portType && c.portType !== portType) continue;
    for (const p of c.path) {
      if (p.x >= 0 && p.x < gridW && p.y >= 0 && p.y < gridH) {
        grid[p.y * gridW + p.x] = 1;
      }
    }
  }
  return grid;
};

/**
 * 构建合并占用网格 (8-bit 掩码)
 * 每格 = 所有机器掩码的 OR | 所有异类型连线掩码的 OR
 * 同类型连线不进入网格 (可通过, 后续在交叉点放桥)
 */
export const buildMergedGrid = (
  machines: PlacedMachine[],
  connections: Connection[],
  gridW: number,
  gridH: number,
  portType: PortType
): Uint8Array => {
  const grid = new Uint8Array(gridW * gridH);

  // 机器占用
  for (const m of machines) {
    const config = MACHINES.find(c => c.id === m.machineId);
    if (!config) continue;
    const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
    const mx2 = Math.min(m.x + width, gridW);
    const my2 = Math.min(m.y + height, gridH);
    for (let y = Math.max(m.y, 0); y < my2; y++) {
      const row = y * gridW;
      for (let x = Math.max(m.x, 0); x < mx2; x++) {
        grid[row + x] |= getMachineCellMask(m.machineId, x - m.x, y - m.y);
      }
    }
  }

  // 异类型连线 (同类型跳过, 可通过放桥)
  for (const c of connections) {
    if (c.portType === portType) continue;
    const otherMask = portTypeToMask[c.portType];
    for (const p of c.path) {
      if (p.x >= 0 && p.x < gridW && p.y >= 0 && p.y < gridH) {
        grid[p.y * gridW + p.x] |= otherMask;
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
): Uint8Array => {
  const grid = new Uint8Array(gw * gh);
  for (const conn of connections) {
    if (conn.portType !== portType) continue;
    for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
      if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < gh) {
        grid[cp.y * gw + cp.x] = 1;
      }
    }
  }
  return grid;
};
