import type { Point } from '@/types';
import { GRID_SIZE } from '@/config/constants';

/** 限制平移范围，防止无限滚入空白区域（正负对称：高缩放下也能平移到右/下边缘） */
export const clampPan = (pan: Point, gridW: number, gridH: number): Point => {
  const rangeX = gridW * GRID_SIZE * 2;
  const rangeY = gridH * GRID_SIZE * 2;
  return {
    x: Math.max(-rangeX, Math.min(rangeX, pan.x)),
    y: Math.max(-rangeY, Math.min(rangeY, pan.y)),
  };
};
