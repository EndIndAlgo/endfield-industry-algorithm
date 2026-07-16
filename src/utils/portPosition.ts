import type { Side } from '@/types';
import { GRID_SIZE } from '@/config/constants';

/** 端口中心在格子内的像素偏移量
 *  推导: 20(GRID_SIZE/2) - 3(容器padding) - 2(容器border) - 3(机身border) = 12 */
const CELL_CENTER = (GRID_SIZE / 2) - 3 - 2 - 3; // = 12

/** 端口在机器内部的居中对齐位置 */
export interface PortPixelCenter {
  /** 像素偏移量：对于 left/right 侧端口是 y 轴偏移，对于 top/bottom 侧端口是 x 轴偏移 */
  center: number;
  /** 端口所在边 */
  side: Side;
}

/**
 * 返回端口在机器内部的对齐中心点（纯数值，无 CSS 依赖）
 * 由 MachineRenderer 消费，也可用于未来的 DOM 定位
 */
export function getPortCenter(p: { x: number; y: number; side: Side }): PortPixelCenter {
  const isHorizontal = p.side === 'left' || p.side === 'right';
  const center = isHorizontal
    ? p.y * GRID_SIZE + CELL_CENTER
    : p.x * GRID_SIZE + CELL_CENTER;
  return { center, side: p.side };
}
