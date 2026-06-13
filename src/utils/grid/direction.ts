import type { Point, Direction } from '../../types';

// 方向 → 单位向量
export const getVectorFromSide = (side: 'top' | 'right' | 'bottom' | 'left'): Point => {
  switch (side) {
    case 'top': return { x: 0, y: -1 };
    case 'right': return { x: 1, y: 0 };
    case 'bottom': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
  }
};

/** 根据两点相对位置返回方向 (右1 左3 下2 上0) */
export const dirFromPoints = (a: Point, b: Point): Direction => {
  if (b.x > a.x) return 1;
  if (b.x < a.x) return 3;
  if (b.y > a.y) return 2;
  return 0;
};

/** 计算路径的 headFacing：直路径=路径方向，L 形=第二段方向 */
export const computeHeadFacing = (path: Point[], tailFacing: Direction): Direction => {
  if (path.length <= 1) return tailFacing;
  const n = path.length;
  return dirFromPoints(path[n - 2], path[n - 1]);
};
