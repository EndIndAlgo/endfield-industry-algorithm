import type { Point, Direction } from '@/types';
import { isHorizontal } from '@/types';

/** 8 分区曼哈顿路由: L 形直角折线，遇障碍自动换另一条路 */
export const routeManhattan = (
  start: Point,
  end: Point,
  grid: Uint8Array,
  gridW: number,
  mask: number = 0xFF
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
        if ((grid[cy * gridW + cx] & mask) !== 0) {
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

/** 尝试单 L 形路径：从 start 沿 firstAxis 走第一段，再垂直走到 end */
export const trySingleLRoute = (
  start: Point,
  end: Point,
  firstAxis: Direction,
  grid: Uint8Array,
  gridW: number,
  gridH: number,
  mask: number = 0xFF
): Point[] | null => {
  const path: Point[] = [];

  const horizontalFirst = isHorizontal(firstAxis);
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
    if ((grid[cy * gridW + cx] & mask) !== 0) return null;
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
      if ((grid[cy * gridW + cx] & mask) !== 0) return null;
      path.push({ x: cx, y: cy });
    }
  }

  return path;
};
