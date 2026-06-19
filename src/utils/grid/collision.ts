import type { PlacedMachine, Point } from '../../types';
import { portTypeToMask } from '../../types';
import { MACHINES } from '../../config/machines';
import { getRotatedDimensions, getMachineCellMask } from '../machineUtils';

/** 获取机器旋转后的矩形 */
export const getMachineRect = (machine: PlacedMachine) => {
  const config = MACHINES.find(m => m.id === machine.machineId);
  if (!config) return null;
  const { width, height } = getRotatedDimensions(config.width, config.height, machine.rotation);
  return { x: machine.x, y: machine.y, w: width, h: height };
};

export interface BoundingBox {
  minX: number; minY: number;
  maxX: number; maxY: number;
  width: number; height: number;
}

/** 计算一组机器和连线的最小包围盒 */
export const getBoundingBox = (
  machines: PlacedMachine[],
  connections: { path: Point[] }[]
): BoundingBox => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const m of machines) {
    const rect = getMachineRect(m);
    if (rect) {
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.w);
      maxY = Math.max(maxY, rect.y + rect.h);
    }
  }

  for (const c of connections) {
    for (const p of c.path) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + 1);
      maxY = Math.max(maxY, p.y + 1);
    }
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

/** 掩码级放置碰撞检测：逐格 AND 候选机器掩码与已有实体掩码，统一预检和放置逻辑 */
export const checkPlacementCollision = (
  machineId: string,
  x: number, y: number,
  width: number, height: number,
  machines: PlacedMachine[],
  connections: { path: Point[]; portType: string }[],
  gridW: number,
  gridH: number
): boolean => {
  const grid = new Uint8Array(gridW * gridH);

  // 已有机器掩码
  for (const m of machines) {
    const cfg = MACHINES.find(c => c.id === m.machineId);
    if (!cfg) continue;
    const { width: mw, height: mh } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
    const mx2 = Math.min(m.x + mw, gridW);
    const my2 = Math.min(m.y + mh, gridH);
    for (let my = Math.max(m.y, 0); my < my2; my++) {
      const row = my * gridW;
      for (let mx = Math.max(m.x, 0); mx < mx2; mx++) {
        grid[row + mx] |= getMachineCellMask(m.machineId, mx - m.x, my - m.y);
      }
    }
  }

  // 已有连线掩码 (所有类型)
  for (const c of connections) {
    const cm = portTypeToMask[c.portType as keyof typeof portTypeToMask] ?? 0;
    for (const p of c.path) {
      if (p.x >= 0 && p.x < gridW && p.y >= 0 && p.y < gridH) {
        grid[p.y * gridW + p.x] |= cm;
      }
    }
  }

  // 候选机器每格掩码 vs 已有掩码
  for (let cy = y; cy < y + height; cy++) {
    if (cy < 0 || cy >= gridH) continue;
    const row = cy * gridW;
    for (let cx = x; cx < x + width; cx++) {
      if (cx < 0 || cx >= gridW) continue;
      if (getMachineCellMask(machineId, cx - x, cy - y) & grid[row + cx]) return true;
    }
  }

  return false;
};

/** 计算内容尺寸（用于蓝图等） */
export const calculateContentDimensions = (machines: PlacedMachine[], connections: { path: Point[] }[]) => {
  const bb = getBoundingBox(machines, connections);
  return { width: bb.width, height: bb.height };
};
