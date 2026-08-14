import type { Side } from '@/types';
import { GRID_SIZE } from '@/config/constants';

/** 端口中心在格子内的像素偏移量
 *  PixiJS 容器无 padding/border，端口中心 = 格中心（GRID_SIZE/2），
 *  与 ConnectionRenderer 的连线端点（cell 中心 +20）对齐 */
const CELL_CENTER = GRID_SIZE / 2;

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
