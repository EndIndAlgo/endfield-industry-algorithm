import type { PlacedMachine, Point } from '../../types';
import { MACHINES } from '../../config/machines';
import { getRotatedDimensions } from '../machineUtils';

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

/** 矩形重叠检测 */
export const isOverlapping = (
  rectA: { x: number; y: number; w: number; h: number },
  rectB: { x: number; y: number; w: number; h: number }
): boolean => {
  return (
    rectA.x < rectB.x + rectB.w &&
    rectA.x + rectA.w > rectB.x &&
    rectA.y < rectB.y + rectB.h &&
    rectA.y + rectA.h > rectB.y
  );
};

/** 检测候选位置是否与已有机器碰撞 */
export const checkCollision = (
  candidate: { x: number; y: number; width: number; height: number },
  machines: PlacedMachine[]
): boolean => {
  const candidateRect = { x: candidate.x, y: candidate.y, w: candidate.width, h: candidate.height };
  for (const m of machines) {
    const r = getMachineRect(m);
    if (r && isOverlapping(candidateRect, r)) return true;
  }
  return false;
};

/** 计算内容尺寸（用于蓝图等） */
export const calculateContentDimensions = (machines: PlacedMachine[], connections: { path: Point[] }[]) => {
  const bb = getBoundingBox(machines, connections);
  return { width: bb.width, height: bb.height };
};
