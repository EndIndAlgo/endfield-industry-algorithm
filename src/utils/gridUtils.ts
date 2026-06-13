// ── 碰撞检测 / 包围盒 ──
export { getBoundingBox, getMachineRect, isOverlapping, checkCollision, calculateContentDimensions } from './grid/collision';
export type { BoundingBox } from './grid/collision';

// ── 占用网格 ──
export { buildOccupancyGrid, buildConnectionGrid } from './grid/occupancy';

// ── 方向工具 ──
export { getVectorFromSide, dirFromPoints, computeHeadFacing } from './grid/direction';

// ── 寻路算法 ──
export { routeManhattan, findPath, trySingleLRoute } from './grid/pathfinding';

// ── 端口 / 连线工具 ──
export { getCornerPoints, getMachinePortCheckPositions, splitConnectionAt, getPortOuterCells, getInputPortOuterCells, findPortOuterCellAt, findMachineAt } from './grid/port';
