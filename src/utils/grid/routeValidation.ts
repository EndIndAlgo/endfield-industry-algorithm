import type { Point, Direction, PortType, PlacedMachine } from '../../types';
import { sideToDir } from '../../types';
import { trySingleLRoute } from './pathfinding';
import { computeHeadFacing } from './direction';
import { getInputPortOuterCells } from './port';
import { getCornerPoints } from './port';

/**
 * portDir 的垂直方向（取两个垂直方向中与目标更接近的那个）
 */
const perpendicularDir = (dir: Direction, start: Point, end: Point): Direction => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dir === 0 || dir === 2) {
    // 垂直端口(上/下)，垂直方向是水平
    return dx > 0 ? 1 : dx < 0 ? 3 : 1;
  }
  // 水平端口(左/右)，垂直方向是垂直
  return dy > 0 ? 2 : dy < 0 ? 0 : 2;
};

/**
 * 检查路径上的桥冲突与拐弯约束
 * @returns true = 无冲突，路径合法
 */
export const validateRouteConflicts = (
  fullPath: Point[],
  tailFacing: Direction,
  headFacing: Direction,
  sameConnGrid: Uint8Array,
  mergedGrid: Uint8Array,
  existingCornerGrid: Uint8Array,
  bridgeMask: number,
  connMask: number,
  gw: number,
  options: { isContinuing: boolean; startPos: Point }
): boolean => {
  const { isContinuing, startPos } = options;

  // 拐弯点在同类型连线上的检查（自动续接时豁免起点格）
  for (const cp of getCornerPoints(fullPath, tailFacing, headFacing)) {
    if (isContinuing && cp.x === startPos.x && cp.y === startPos.y) continue;
    if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < sameConnGrid.length / gw
        && sameConnGrid[cp.y * gw + cp.x]) {
      return false;
    }
  }

  // 桥掩码冲突检查 (物理冲突 + 拐弯约束)
  for (const p of fullPath) {
    if (isContinuing && p.x === startPos.x && p.y === startPos.y) continue;
    const idx = p.y * gw + p.x;
    if (idx < 0 || idx >= sameConnGrid.length) continue;
    if (!sameConnGrid[idx]) continue;
    // 物理冲突: (bridgeMask & cellMask) 不能超出同类型连线层
    const cellMask = mergedGrid[idx] | connMask;
    if ((bridgeMask & cellMask) !== connMask) return false;
    // 拐弯约束: 桥不能放在已有线的拐弯上
    if (existingCornerGrid[idx]) return false;
  }

  return true;
};

export interface RouteToMachineResult {
  path: Point[];
  headFacing: Direction;
  isValid: boolean;
  targetIsMachine: boolean;
}

/**
 * 尝试从 startPos 连接到目标机器的输入端口
 * 遍历所有匹配类型的输入端口，尝试 L 形路径，检查冲突
 * 若无合法路径则返回忽略障碍的视觉 fallback 路径
 */
export const findRouteForMachine = (
  startPos: Point,
  tailFacing: Direction,
  targetMachine: PlacedMachine,
  targetPortType: PortType,
  lShapeMode: 'auto' | 'perpendicular' | 'same-dir',
  mergedGrid: Uint8Array,
  sameConnGrid: Uint8Array,
  existingCornerGrid: Uint8Array,
  bridgeMask: number,
  connMask: number,
  gw: number,
  gh: number,
  isContinuing: boolean,
  mouseGridPos: Point
): RouteToMachineResult => {
  const inputCells = getInputPortOuterCells(targetMachine, targetPortType);

  // ── 第一轮：尝试找到合法路径 ──
  let bestInput: { pos: Point; side: 'top' | 'right' | 'bottom' | 'left'; path: Point[] } | null = null;
  let bestInputDist = Infinity;

  for (const ic of inputCells) {
    const firstAxis = lShapeMode === 'perpendicular'
      ? perpendicularDir(tailFacing, startPos, ic.pos)
      : tailFacing;

    // 起终点相同：检查是否能放桥
    if (startPos.x === ic.pos.x && startPos.y === ic.pos.y) {
      if ((mergedGrid[startPos.y * gw + startPos.x] & connMask) !== 0) continue;

      const entryDir = ((sideToDir[ic.side] + 2) % 4) as Direction;
      // 非续接时拐弯在同类型线上 → 不放桥（续接首格豁免）
      if (!isContinuing && sameConnGrid[startPos.y * gw + startPos.x] && tailFacing !== entryDir) {
        continue;
      }
      // 桥掩码冲突检查
      if (sameConnGrid[startPos.y * gw + startPos.x]) {
        const cellMask = mergedGrid[startPos.y * gw + startPos.x] | connMask;
        if ((bridgeMask & cellMask) !== connMask) continue;
        if (existingCornerGrid[startPos.y * gw + startPos.x]) continue;
      }
      bestInput = { pos: ic.pos, side: ic.side, path: [startPos] };
      bestInputDist = 0;
      break;
    }

    // 起点被阻挡 → 跳过
    if ((mergedGrid[startPos.y * gw + startPos.x] & connMask) !== 0) continue;

    let path = trySingleLRoute(startPos, ic.pos, firstAxis, mergedGrid, gw, gh, connMask);
    if (!path && lShapeMode === 'auto') {
      path = trySingleLRoute(startPos, ic.pos, perpendicularDir(tailFacing, startPos, ic.pos), mergedGrid, gw, gh, connMask);
    }
    if (!path) continue;

    const fullPath = [startPos, ...path];
    const entryDir = ((sideToDir[ic.side] + 2) % 4) as Direction;

    if (!validateRouteConflicts(fullPath, tailFacing, entryDir, sameConnGrid, mergedGrid,
        existingCornerGrid, bridgeMask, connMask, gw, { isContinuing, startPos })) {
      continue;
    }

    const dist = Math.abs(ic.pos.x - mouseGridPos.x) + Math.abs(ic.pos.y - mouseGridPos.y);
    if (dist < bestInputDist) {
      bestInputDist = dist;
      bestInput = { pos: ic.pos, side: ic.side, path: fullPath };
    }
  }

  if (bestInput) {
    const headFacing = ((sideToDir[bestInput.side] + 2) % 4) as Direction;
    return { path: bestInput.path, headFacing, isValid: true, targetIsMachine: true };
  }

  // ── 无合法路径：忽略障碍计算 L 形路径用于视觉预览 ──
  const emptyGrid = new Uint8Array(gw * gh);
  let bestVisual: { path: Point[]; headFacing: Direction; dist: number } | null = null;

  for (const ic of inputCells) {
    if (startPos.x === ic.pos.x && startPos.y === ic.pos.y) {
      bestVisual = { path: [startPos], headFacing: ((sideToDir[ic.side] + 2) % 4) as Direction, dist: 0 };
      break;
    }
    const firstAxis = lShapeMode === 'perpendicular'
      ? perpendicularDir(tailFacing, startPos, ic.pos)
      : tailFacing;
    const p = trySingleLRoute(startPos, ic.pos, firstAxis, emptyGrid, gw, gh);
    if (p) {
      const d = Math.abs(ic.pos.x - mouseGridPos.x) + Math.abs(ic.pos.y - mouseGridPos.y);
      const hf = ((sideToDir[ic.side] + 2) % 4) as Direction;
      if (!bestVisual || d < bestVisual.dist) {
        bestVisual = { path: [startPos, ...p], headFacing: hf, dist: d };
      }
    }
  }

  return {
    path: bestVisual?.path ?? [startPos, mouseGridPos],
    headFacing: bestVisual?.headFacing ?? tailFacing,
    isValid: false,
    targetIsMachine: false,
  };
};

export interface RouteToGroundResult {
  path: Point[];
  headFacing: Direction;
  isValid: boolean;
}

/**
 * 尝试从 startPos 连接到地面目标位置
 * 尝试 L 形路径，检查冲突，若被阻挡则返回视觉 fallback 路径
 */
export const findRouteToGround = (
  startPos: Point,
  tailFacing: Direction,
  targetPos: Point,
  lShapeMode: 'auto' | 'perpendicular' | 'same-dir',
  mergedGrid: Uint8Array,
  sameConnGrid: Uint8Array,
  existingCornerGrid: Uint8Array,
  bridgeMask: number,
  connMask: number,
  gw: number,
  gh: number,
  isContinuing: boolean
): RouteToGroundResult => {
  const firstAxis = lShapeMode === 'perpendicular'
    ? perpendicularDir(tailFacing, startPos, targetPos)
    : tailFacing;

  // 视觉 fallback（忽略障碍的 L 形路径，用于被阻挡时的预览显示）
  const visualFallback = (): RouteToGroundResult => {
    const emptyGrid = new Uint8Array(gw * gh);
    const visualPath = trySingleLRoute(startPos, targetPos, firstAxis, emptyGrid, gw, gh);
    if (visualPath) {
      const visualFullPath = [startPos, ...visualPath];
      return { path: visualFullPath, headFacing: computeHeadFacing(visualFullPath, tailFacing), isValid: false };
    }
    return { path: [startPos, targetPos], headFacing: tailFacing, isValid: false };
  };

  // 起点自身被阻挡 → 视觉 fallback（避免跳到斜线）
  if ((mergedGrid[startPos.y * gw + startPos.x] & connMask) !== 0) {
    return visualFallback();
  }

  let path = trySingleLRoute(startPos, targetPos, firstAxis, mergedGrid, gw, gh, connMask);
  if (!path && lShapeMode === 'auto') {
    path = trySingleLRoute(startPos, targetPos, perpendicularDir(tailFacing, startPos, targetPos), mergedGrid, gw, gh, connMask);
  }

  if (path) {
    const fullPath = [startPos, ...path];
    const headFacing = computeHeadFacing(fullPath, tailFacing);
    const valid = validateRouteConflicts(fullPath, tailFacing, headFacing, sameConnGrid, mergedGrid,
        existingCornerGrid, bridgeMask, connMask, gw, { isContinuing, startPos });
    return { path: fullPath, headFacing, isValid: valid };
  }

  // 真实路径被阻挡 → 视觉 fallback
  return visualFallback();
};
