import type { Direction, Point, PortConfig, Side } from '@/types';
import { oppositeDir, DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT } from '@/types';
import { GRID_SIZE, PORT_ARROW_ROTATION } from '@/config/constants';

/** 端口中心在格子内的像素偏移量
 *  推导: 20(GRID_SIZE/2) - 3(容器padding) - 2(容器border) - 3(机身border) = 12 */
const CELL_CENTER = (GRID_SIZE / 2) - 3 - 2 - 3; // = 12

// ── SVG 路径工具（被 ConnectionSVGLayer 和 BatchMovePreview 共用） ──

const EXTEND = 0.45;

/** 将路径端点沿方向延伸，使连线视觉上深入机器内部 */
const extendPoint = (p: Point, dir: Direction, amt: number): Point => {
  switch (dir) {
    case DIR_UP: return { x: p.x, y: p.y - amt };
    case DIR_RIGHT: return { x: p.x + amt, y: p.y };
    case DIR_DOWN: return { x: p.x, y: p.y + amt };
    case DIR_LEFT: return { x: p.x - amt, y: p.y };
    default: return { ...p };
  }
};

/** 将路径转为 SVG polyline points 字符串 */
export const pathToPoints = (path: Point[], tailFacing: Direction, headFacing: Direction): string => {
  const renderPath: Point[] = [];
  renderPath.push(extendPoint(path[0], oppositeDir(tailFacing), EXTEND));
  renderPath.push(...path);
  const last = path[path.length - 1];
  renderPath.push(extendPoint(last, headFacing, EXTEND));
  return renderPath.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ');
};

// ── 端口像素定位内核（二方共用） ──

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

// ── Machine.tsx 用：返回 CSS 属性对象 ──

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

// ── GhostPreview 用：返回绝对像素坐标 + 旋转角度 ──

/** Ghost 端口箭头的像素位置和方向 */
export function getGhostArrowPosition(
  p: PortConfig & { isInput?: boolean },
  hoverGridPos: Point,
): { left: number; top: number; rotation: number } {
  const isInput = p.isInput ?? false;

  // 箭头放在端口格之外的相邻格
  let arrowGridX = hoverGridPos.x + p.x;
  let arrowGridY = hoverGridPos.y + p.y;

  const arrowRotation: Record<string, { input: number; output: number }> = PORT_ARROW_ROTATION;

  switch (p.side) {
    case 'left':
      arrowGridX -= 1;
      return {
        left: arrowGridX * GRID_SIZE,
        top: arrowGridY * GRID_SIZE,
        rotation: isInput ? arrowRotation.left.input : arrowRotation.left.output,
      };
    case 'right':
      arrowGridX += 1;
      return {
        left: arrowGridX * GRID_SIZE,
        top: arrowGridY * GRID_SIZE,
        rotation: isInput ? arrowRotation.right.input : arrowRotation.right.output,
      };
    case 'top':
      arrowGridY -= 1;
      return {
        left: arrowGridX * GRID_SIZE,
        top: arrowGridY * GRID_SIZE,
        rotation: isInput ? arrowRotation.top.input : arrowRotation.top.output,
      };
    case 'bottom':
      arrowGridY += 1;
      return {
        left: arrowGridX * GRID_SIZE,
        top: arrowGridY * GRID_SIZE,
        rotation: isInput ? arrowRotation.bottom.input : arrowRotation.bottom.output,
      };
  }
}
