import type { Side } from '@/types';
import { GRID_SIZE } from '@/config/constants';

/** 端口中心在格子内的像素偏移量
 *  推导: 20(GRID_SIZE/2) - 3(容器padding) - 2(容器border) - 3(机身border) = 12 */
const CELL_CENTER = (GRID_SIZE / 2) - 3 - 2 - 3; // = 12

// ── 端口像素定位内核 ──

interface PortPixelOffset {
  /** 定位轴: 'x' 表示 left/right 属性沿 x 轴 */
  axis: 'x' | 'y';
  /** 沿定位轴的像素偏移量 */
  offset: number;
}

/** 将端口的格子坐标 + side 映射为格子内的像素偏移 */
function getPortCellPixelOffset(p: { x: number; y: number; side: Side }, cellCenter: number = CELL_CENTER): PortPixelOffset {
  switch (p.side) {
    case 'left':
    case 'right':
      return { axis: 'y', offset: p.y * GRID_SIZE + cellCenter };
    case 'top':
    case 'bottom':
      return { axis: 'x', offset: p.x * GRID_SIZE + cellCenter };
  }
}

// ── MachineRenderer 用：返回 CSS 属性对象，转为 PixiJS 本地坐标 ──

/** 计算机器端口在 .machine-body 内的绝对定位样式 */
export function getPortStyle(p: { x: number; y: number; side: Side }, cellCenter?: number): React.CSSProperties {
  const { offset } = getPortCellPixelOffset(p, cellCenter);

  const style: React.CSSProperties = {};

  switch (p.side) {
    case 'left':
      style.left = '-1px';
      style.top = `${offset}px`;
      style.transform = 'translate(0, -50%)';
      break;
    case 'right':
      style.right = '-0.5px';
      style.top = `${offset}px`;
      style.transform = 'translate(0, -50%)';
      break;
    case 'top':
      style.top = '-1px';
      style.left = `${offset}px`;
      style.transform = 'translate(-50%, 0)';
      break;
    case 'bottom':
      style.bottom = '-0.5px';
      style.left = `${offset}px`;
      style.transform = 'translate(-50%, 0)';
      break;
  }

  return style;
}
