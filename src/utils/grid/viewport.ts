import type { Point } from '@/types';
import { GRID_SIZE } from '@/config/constants';

/** 限制平移范围，防止无限滚入空白区域 */
export const clampPan = (pan: Point, gridW: number, gridH: number): Point => {
  const maxX = gridW * GRID_SIZE * 2;
  const maxY = gridH * GRID_SIZE * 2;
  const minX = -gridW * GRID_SIZE;
  const minY = -gridH * GRID_SIZE;
  return {
    x: Math.max(minX, Math.min(maxX, pan.x)),
    y: Math.max(minY, Math.min(maxY, pan.y)),
  };
};
