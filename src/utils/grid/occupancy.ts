import type { PlacedMachine, Connection, PortType } from '../../types';
import { MACHINES } from '../../config/machines';
import { getRotatedDimensions } from '../machineUtils';

/** 构建机器占用矩阵 (0=空, 1=被机器占用), size = gridW × gridH */
export const buildOccupancyGrid = (
  machines: PlacedMachine[],
  gridW: number,
  gridH: number
): Uint8Array => {
  const grid = new Uint8Array(gridW * gridH);
  for (const m of machines) {
    const config = MACHINES.find(c => c.id === m.machineId);
    if (!config) continue;
    const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
    const mx2 = Math.min(m.x + width, gridW);
    const my2 = Math.min(m.y + height, gridH);
    for (let y = Math.max(m.y, 0); y < my2; y++) {
      const row = y * gridW;
      for (let x = Math.max(m.x, 0); x < mx2; x++) {
        grid[row + x] = 1;
      }
    }
  }
  return grid;
};

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
