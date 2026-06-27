import type { Direction, PlacedMachine, Point } from '@/types';
import { portTypeToMask } from '@/types';
import { MACHINES } from '@/config/machines';
import { getRotatedDimensions, getMachineConfigById } from '@/utils/machineUtils';
import { Mask } from '@/utils/mask';

/** 获取机器旋转后的矩形 */
const getMachineRect = (machine: PlacedMachine) => {
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

/** 掩码级放置碰撞检测：用 Mask 对象统一构建占用网格并逐格 AND 候选掩码 */
export const checkPlacementCollision = (
  machineId: string,
  x: number, y: number,
  rotation: Direction,
  machines: PlacedMachine[],
  connections: { path: Point[]; portType: string }[],
  gridW: number,
  gridH: number
): boolean => {
  // 构建已有实体占用网格
  const grid = Mask.Uniform(gridW, gridH, 0);

  // 已有机器掩码
  for (const m of machines) {
    const cfg = getMachineConfigById(m.machineId);
    if (!cfg) continue;
    grid.MergeInPlace(cfg.mask4![m.rotation], m.x, m.y);
  }

  // 已有连线掩码 (所有类型)
  for (const c of connections) {
    const cm = portTypeToMask[c.portType as keyof typeof portTypeToMask] ?? 0;
    if (cm === 0) continue;
    for (const p of c.path) {
      if (p.x >= 0 && p.x < gridW && p.y >= 0 && p.y < gridH) {
        grid.WriteValue(p.x, p.y, cm);
      }
    }
  }

  // 候选机器每格掩码 vs 已有掩码
  const candidateCfg = getMachineConfigById(machineId);
  if (!candidateCfg) return false;
  return grid.HasCollision(candidateCfg.mask4![rotation], x, y);
};

/** 计算内容尺寸（用于蓝图等） */
export const calculateContentDimensions = (machines: PlacedMachine[], connections: { path: Point[] }[]) => {
  const bb = getBoundingBox(machines, connections);
  return { width: bb.width, height: bb.height };
};
