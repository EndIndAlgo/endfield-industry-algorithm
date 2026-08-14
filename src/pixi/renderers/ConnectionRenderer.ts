import { Graphics } from 'pixi.js';
import type { Connection, Point, PortType, Direction } from '@/types';
import { portTypeToMask, oppositeDir, DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT } from '@/types';
import { GRID_SIZE } from '@/config/constants';
import { Z_INDEX, connZ } from '@/config/zIndex';
import { GRAY, CONVEYOR_FILL, PIPE_FILL, CONN_SELECTION_BLUE, INVALID_RED } from '@/config/colors';

/** 端点延伸量（格），与 pathToPoints 的 EXTEND 一致 */
const EXTEND = 0.45;

/**
 * 连线描边颜色决策（优先级：选中 > 无效预览 > 默认灰）。
 * 纯函数导出供测试锁定：新建即被选中的连线（如批量移动提交）必须蓝描边。
 */
export function connectionOutlineColor(isSelected: boolean, isPreview: boolean, isValid: boolean): number {
  if (isSelected) return CONN_SELECTION_BLUE;
  if (isPreview && !isValid) return INVALID_RED;
  return GRAY;
}

/**
 * 连线渲染器
 *
 * 每条已确认连线 = 2 个 Graphics 对象（outline + fill），
 * 组成一个 Group 放入对应的连线层。预览连线同理。
 */
export class ConnectionRenderer {
  /**
   * 为一条已确认连线创建 Graphics 对 [outline, fill]
   * 位置在网格原点，通过 world Container 的 transform 自动投影
   */
  static createConfirmed(
    conn: Connection,
    isSelected: boolean,
  ): Graphics[] {
    const points = ConnectionRenderer.pathToPixelPoints(
      conn.path,
      conn.tailFacing,
      conn.headFacing,
    );
    return ConnectionRenderer.createLinePair(
      points,
      conn.portType,
      isSelected,
      false, // confirmed
    );
  }

  /** 创建预览连线 Graphics 对 */
  static createPreview(
    previewPath: Point[],
    tailFacing: Direction,
    headFacing: Direction,
    portType: PortType,
    isValid: boolean,
  ): Graphics[] {
    const points = ConnectionRenderer.pathToPixelPoints(
      previewPath,
      tailFacing,
      headFacing,
    );
    return ConnectionRenderer.createLinePair(
      points,
      portType,
      false,
      true,  // preview
      isValid,
    );
  }

  /** 更新已存在的连线 Graphics 对（路径变化时重绘） */
  static updateLines(
    outline: Graphics,
    fill: Graphics,
    path: Point[],
    tailFacing: Direction,
    headFacing: Direction,
    portType: PortType,
    isSelected: boolean,
  ): void {
    const points = ConnectionRenderer.pathToPixelPoints(path, tailFacing, headFacing);
    const color = portType === 'Liquid' ? PIPE_FILL : CONVEYOR_FILL;
    const outlineWidth = isSelected ? 26 : 20;
    const fillWidth = isSelected ? 22 : 16;

    // outline
    outline.clear();
    if (points.length >= 2) {
      outline.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        outline.lineTo(points[i].x, points[i].y);
      }
      outline.stroke({
        width: outlineWidth,
        color: connectionOutlineColor(isSelected, false, true),
        cap: 'round',
        join: 'round',
      });
    }

    // fill
    fill.clear();
    if (points.length >= 2) {
      fill.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        fill.lineTo(points[i].x, points[i].y);
      }
      fill.stroke({
        width: fillWidth,
        color,
        cap: 'round',
        join: 'round',
      });
    }
  }

  /** 计算连线层的 zIndex */
  static layerZIndex(portType: PortType): number {
    return connZ(Z_INDEX.STATIC_BASE, portTypeToMask[portType]);
  }

  // ── 私有 ──

  private static createLinePair(
    points: Point[],
    portType: PortType,
    isSelected: boolean,
    isPreview: boolean,
    isValid = true,
  ): Graphics[] {
    const color = portType === 'Liquid' ? PIPE_FILL : CONVEYOR_FILL;
    const outlineColor = connectionOutlineColor(isSelected, isPreview, isValid);
    const fillColor = isPreview && !isValid ? INVALID_RED : color;
    const outlineWidth = isSelected ? 26 : isPreview ? 16 : 20;
    const fillWidth = isSelected ? 22 : isPreview ? 10 : 16;
    const alpha = isPreview ? 0.6 : 1;

    const outline = new Graphics({ label: 'conn-outline' });
    const fill = new Graphics({ label: 'conn-fill' });

    if (points.length >= 2) {
      for (const g of [outline, fill]) {
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          g.lineTo(points[i].x, points[i].y);
        }
      }

      outline.stroke({
        width: outlineWidth,
        color: outlineColor,
        cap: 'round',
        join: 'round',
        alpha,
      });

      fill.stroke({
        width: fillWidth,
        color: fillColor,
        cap: 'round',
        join: 'round',
        alpha,
      });
    }

    return [outline, fill];
  }

  /** 将路径点（网格坐标）转为像素坐标，与 pathToPoints 逻辑一致 */
  private static pathToPixelPoints(
    path: Point[],
    tailFacing: Direction,
    headFacing: Direction,
  ): Point[] {
    const result: Point[] = [];

    // 首点延伸
    result.push(ConnectionRenderer.extendPoint(
      path[0],
      oppositeDir(tailFacing),
      EXTEND,
    ));

    // 中间点
    result.push(...path);

    // 末点延伸
    const last = path[path.length - 1];
    result.push(ConnectionRenderer.extendPoint(last, headFacing, EXTEND));

    // 转为像素（与 pathToPoints 一致：* GRID_SIZE + GRID_SIZE/2）
    return result.map(p => ({
      x: p.x * GRID_SIZE + GRID_SIZE / 2,
      y: p.y * GRID_SIZE + GRID_SIZE / 2,
    }));
  }

  /** 沿方向延伸点 */
  private static extendPoint(p: Point, dir: Direction, amt: number): Point {
    switch (dir) {
      case DIR_UP: return { x: p.x, y: p.y - amt };
      case DIR_RIGHT: return { x: p.x + amt, y: p.y };
      case DIR_DOWN: return { x: p.x, y: p.y + amt };
      case DIR_LEFT: return { x: p.x - amt, y: p.y };
      default: return { ...p };
    }
  }
}
