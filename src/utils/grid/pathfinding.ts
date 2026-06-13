import type { Point, PlacedMachine, Connection, Direction, PortType } from '../../types';
import { sideToDir } from '../../types';
import { MACHINES } from '../../config/machines';
import { getRotatedDimensions } from '../machineUtils';
import { getVectorFromSide } from './direction';
import { getCornerPoints } from './port';
import { buildOccupancyGrid, buildConnectionGrid } from './occupancy';

/** 8 分区曼哈顿路由: L 形直角折线，遇障碍自动换另一条路 */
export const routeManhattan = (
  start: Point,
  end: Point,
  grid: Uint8Array,
  gridW: number
): Point[] | null => {
  const tryRoute = (horizontalFirst: boolean): Point[] | null => {
    const path: Point[] = [];
    let cx = start.x;
    let cy = start.y;

    const axes: ('x' | 'y')[] = horizontalFirst ? ['x', 'y'] : ['y', 'x'];

    for (const axis of axes) {
      const tx = axis === 'x' ? end.x : cx;
      const ty = axis === 'y' ? end.y : cy;
      const sx = Math.sign(tx - cx);
      const sy = Math.sign(ty - cy);

      while (cx !== tx || cy !== ty) {
        cx += sx;
        cy += sy;
        if (grid[cy * gridW + cx]) {
          return null;
        }
        path.push({ x: cx, y: cy });
      }
    }

    return path;
  };

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // 主轴优先: |dx| >= |dy| → 水平先; 否则垂直先
  const horizontalDominant = Math.abs(dx) >= Math.abs(dy);

  return tryRoute(horizontalDominant) ?? tryRoute(!horizontalDominant) ?? null;
};

/** 寻找从 start 到 end 的布线路径 (8 分区 L 形路由, 含机器+连线碰撞检测) */
export const findPath = (
  start: Point,
  end: Point,
  machines: PlacedMachine[],
  entryDir?: Direction,
  endSide?: 'top' | 'right' | 'bottom' | 'left',
  gridW?: number,
  gridH?: number,
  connections?: Connection[],
  portType?: PortType
): Point[] | null => {
  // 端口向外偏移 (endSide)
  const realStart = { ...start };
  let realEnd = { ...end };
  if (endSide) {
    const v = getVectorFromSide(endSide);
    realEnd = { x: end.x + v.x, y: end.y + v.y };
  }

  // 计算网格范围
  const conns = connections ?? [];
  const gw = gridW ?? Math.max(
    ...machines.map(m => {
      const cfg = MACHINES.find(c => c.id === m.machineId);
      if (!cfg) return 0;
      const { width } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
      return m.x + width;
    }),
    realStart.x + 2,
    realEnd.x + 2,
    50
  ) + 10;
  const gh = gridH ?? Math.max(
    ...machines.map(m => {
      const cfg = MACHINES.find(c => c.id === m.machineId);
      if (!cfg) return 0;
      const { height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
      return m.y + height;
    }),
    realStart.y + 2,
    realEnd.y + 2,
    50
  ) + 10;

  // 机器 + 连线占用矩阵
  const machineGrid = buildOccupancyGrid(machines, gw, gh);
  const fullConnGrid = buildConnectionGrid(conns, gw, gh);
  const sameConnGrid = portType ? buildConnectionGrid(conns, gw, gh, portType) : fullConnGrid;
  const grid = new Uint8Array(gw * gh);
  for (let i = 0; i < grid.length; i++) {
    const hasSame = sameConnGrid[i] === 1;
    const hasOther = fullConnGrid[i] === 1 && !hasSame;
    grid[i] = machineGrid[i] | (hasSame && hasOther ? 1 : 0);
  }

  // 标记已有连线的拐弯格 → 禁止任何新路径穿越
  for (const conn of conns) {
    for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
      if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < gh) grid[cp.y * gw + cp.x] = 1;
    }
  }

  // 一段路径: routeManhattan 不走任何格, 独立检查落点
  if (realStart.x === realEnd.x && realStart.y === realEnd.y) {
    if (grid[realStart.y * gw + realStart.x]) return null;
    if (portType && sameConnGrid[realStart.y * gw + realStart.x]) {
      const exitDir: Direction | undefined = endSide ? ((sideToDir[endSide] + 2) % 4) as Direction : undefined;
      if (entryDir !== undefined && exitDir !== undefined && entryDir !== exitDir) return null;
    }
    return [realStart];
  }

  // routeManhattan 不检查起点, 独立检查 realStart
  if (grid[realStart.y * gw + realStart.x]) return null;

  const corePath = routeManhattan(realStart, realEnd, grid, gw);
  if (!corePath) return null;

  const fullPath = [realStart, ...corePath];

  // 新路径自身的拐弯格不得落在同类型连线上
  if (portType) {
    const exitDir: Direction | undefined = endSide ? ((sideToDir[endSide] + 2) % 4) as Direction : undefined;
    for (const cp of getCornerPoints(fullPath, entryDir, exitDir)) {
      if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < gh && sameConnGrid[cp.y * gw + cp.x]) return null;
    }
  }

  return [realStart, ...corePath];
};

/** 尝试单 L 形路径：从 start 沿 firstAxis 走第一段，再垂直走到 end */
export const trySingleLRoute = (
  start: Point,
  end: Point,
  firstAxis: Direction,
  grid: Uint8Array,
  gridW: number,
  gridH: number
): Point[] | null => {
  const path: Point[] = [];

  const horizontalFirst = firstAxis === 1 || firstAxis === 3;
  const corner: Point = horizontalFirst
    ? { x: end.x, y: start.y }
    : { x: start.x, y: end.y };

  const step1 = firstAxis === 1 ? { x: 1, y: 0 }
    : firstAxis === 3 ? { x: -1, y: 0 }
    : firstAxis === 2 ? { x: 0, y: 1 }
    : { x: 0, y: -1 };

  let cx = start.x;
  let cy = start.y;

  // 第一段：start → corner
  while (cx !== corner.x || cy !== corner.y) {
    cx += step1.x;
    cy += step1.y;
    if (cx < 0 || cx >= gridW || cy < 0 || cy >= gridH) return null;
    if (grid[cy * gridW + cx]) return null;
    path.push({ x: cx, y: cy });
  }

  // 第二段：corner → end（垂直方向）
  if (corner.x !== end.x || corner.y !== end.y) {
    const step2 = end.x > corner.x ? { x: 1, y: 0 }
      : end.x < corner.x ? { x: -1, y: 0 }
      : end.y > corner.y ? { x: 0, y: 1 }
      : { x: 0, y: -1 };

    while (cx !== end.x || cy !== end.y) {
      cx += step2.x;
      cy += step2.y;
      if (cx < 0 || cx >= gridW || cy < 0 || cy >= gridH) return null;
      if (grid[cy * gridW + cx]) return null;
      path.push({ x: cx, y: cy });
    }
  }

  return path;
};
