// ── 碰撞检测 / 包围盒 ──
export { getBoundingBox, getMachineRect, checkPlacementCollision, calculateContentDimensions } from './collision';
export type { BoundingBox } from './collision';

// ── 占用网格 ──
export { buildConnectionGrid, buildMergedGrid } from './occupancy';

// ── 方向工具 ──
export { getVectorFromSide, dirFromPoints, computeHeadFacing } from './direction';

// ── 寻路算法 ──
export { routeManhattan, trySingleLRoute } from './pathfinding';

// ── 端口 / 连线工具 ──
export { getCornerPoints, getMachinePortCheckPositions, splitConnectionAt, getPortOuterCells, getInputPortOuterCells, findPortOuterCellAt, findMachineAt } from './port';
