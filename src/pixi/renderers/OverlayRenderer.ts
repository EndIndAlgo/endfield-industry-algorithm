import { Container, Graphics } from 'pixi.js';
import type { Point, PortConfig } from '@/types';
import { getMachineConfig } from '@/config/machines';
import { getRotatedDimensions, getRotatedPorts } from '@/utils/machineUtils';
import { GRID_SIZE, PORT_ARROW_ROTATION } from '@/config/constants';
import { Z_INDEX, machineZ } from '@/config/zIndex';

// ── 颜色常量 ──
const GHOST_BORDER = 0xc4c1c1;
const GHOST_FILL = 0xcccccc;
const INVALID_RED = 0xff4444;
const SUPPLY_YELLOW = 0xffcc00;
const SELECTION_FILL = 0x4287f5;
const SELECTION_STROKE = 0x4287f5;
const YELLOW_DASH = 0xffcc00;
const BLUEPRINT_BLUE = 0x64c8ff;

/**
 * 叠加层渲染器
 *
 * 负责 Ghost 放置预览、选框、批量移动预览、子蓝图轮廓等
 * 动态覆盖层的创建与更新。
 */
export class OverlayRenderer {
  /** 创建 Ghost 机器预览（不含端口箭头和供电范围） */
  static createGhostMachine(
    machineId: string,
    rotation: number,
    ghostPos: Point,
    isValid: boolean,
  ): Container {
    const config = getMachineConfig(machineId);
    if (!config) return new Container();

    const { width, height } = getRotatedDimensions(config.width, config.height, rotation as never);
    const pixW = width * GRID_SIZE;
    const pixH = height * GRID_SIZE;

    const container = new Container({ label: 'ghost-machine' });
    container.position.set(ghostPos.x * GRID_SIZE, ghostPos.y * GRID_SIZE);
    container.zIndex = machineZ(Z_INDEX.GHOST_BASE, config.mask.maxMask);

    // 条纹背景（模拟 CSS repeating-linear-gradient）
    const bg = new Graphics({ label: 'ghost-bg' });
    const stripeColor = isValid ? 0xc4c1c1 : INVALID_RED;
    const bgAlpha = isValid ? 0.25 : 0.35;
    bg.rect(0, 0, pixW, pixH).fill({ color: stripeColor, alpha: bgAlpha });

    // 斜条纹
    const stripeSize = 8;
    for (let i = -pixH; i < pixW + pixH; i += stripeSize * 2) {
      bg.moveTo(i, 0).lineTo(i - pixH, pixH).lineTo(i - pixH + stripeSize, pixH)
        .lineTo(i + stripeSize, 0).closePath()
        .fill({ color: stripeColor, alpha: bgAlpha * 1.5 });
    }
    container.addChild(bg);

    // 边框
    const border = new Graphics({ label: 'ghost-border' });
    if (!isValid) {
      border.rect(0, 0, pixW, pixH).stroke({ width: 4, color: INVALID_RED, alpha: 0.5 });
    } else {
      border.rect(0, 0, pixW, pixH).stroke({ width: 1, color: GHOST_BORDER });
    }
    container.addChild(border);

    return container;
  }

  /** 创建 Ghost 供电范围虚线框 */
  static createSupplyRange(
    ghostPos: Point,
    width: number,
    height: number,
    supplyDistance: number,
  ): Graphics {
    if (supplyDistance <= 0) return new Graphics();

    const d = supplyDistance * GRID_SIZE;
    const x = ghostPos.x * GRID_SIZE - d;
    const y = ghostPos.y * GRID_SIZE - d;
    const w = width * GRID_SIZE + d * 2;
    const h = height * GRID_SIZE + d * 2;

    const g = new Graphics({ label: 'supply-range' });
    g.rect(x, y, w, h).stroke({ width: 2, color: SUPPLY_YELLOW, alpha: 0.5 });
    g.zIndex = Z_INDEX.SUPPLY_RANGE;
    return g;
  }

  /** 创建 Ghost 端口箭头 */
  static createGhostArrows(
    machineId: string,
    rotation: number,
    ghostPos: Point,
  ): Container {
    const config = getMachineConfig(machineId);
    if (!config) return new Container();

    const inputs = getRotatedPorts(config.inputs, config.width, config.height, rotation as never);
    const outputs = getRotatedPorts(config.outputs, config.width, config.height, rotation as never);

    const container = new Container({ label: 'ghost-arrows' });
    container.zIndex = Z_INDEX.GHOST_ARROW;

    for (const p of inputs) {
      OverlayRenderer.addArrow(container, p, ghostPos, true);
    }
    for (const p of outputs) {
      OverlayRenderer.addArrow(container, p, ghostPos, false);
    }

    return container;
  }

  /** 创建选框 */
  static createSelectionBox(
    start: Point,
    end: Point,
  ): Graphics {
    const x1 = Math.min(start.x, end.x) * GRID_SIZE;
    const y1 = Math.min(start.y, end.y) * GRID_SIZE;
    const x2 = Math.max(start.x, end.x) * GRID_SIZE + GRID_SIZE;
    const y2 = Math.max(start.y, end.y) * GRID_SIZE + GRID_SIZE;

    const g = new Graphics({ label: 'selection-box' });
    g.rect(x1, y1, x2 - x1, y2 - y1)
      .fill({ color: SELECTION_FILL, alpha: 0.2 })
      .stroke({ width: 1, color: SELECTION_STROKE, alpha: 0.6 });
    g.zIndex = Z_INDEX.SELECTION_BOX;
    return g;
  }

  /** 创建子蓝图选中轮廓 */
  static createSubBlueprintOutline(
    x: number,
    y: number,
    w: number,
    h: number,
  ): Graphics {
    const g = new Graphics({ label: 'sub-blueprint-outline' });
    g.rect(x * GRID_SIZE, y * GRID_SIZE, w * GRID_SIZE, h * GRID_SIZE)
      .fill({ color: YELLOW_DASH, alpha: 0.08 })
      .stroke({ width: 2, color: YELLOW_DASH, alpha: 0.8 });
    g.zIndex = 99;
    return g;
  }

  /** 创建蓝图移动预览 */
  static createBlueprintMovePreview(
    x: number,
    y: number,
    w: number,
    h: number,
  ): Graphics {
    const g = new Graphics({ label: 'blueprint-move-preview' });
    g.rect(x * GRID_SIZE, y * GRID_SIZE, w * GRID_SIZE, h * GRID_SIZE)
      .fill({ color: BLUEPRINT_BLUE, alpha: 0.1 })
      .stroke({ width: 2, color: BLUEPRINT_BLUE, alpha: 0.8 });
    g.zIndex = 98;
    return g;
  }

  // ── 私有 ──

  private static addArrow(
    container: Container,
    p: PortConfig & { isInput?: boolean },
    ghostPos: Point,
    isInput: boolean,
  ): void {
    // 计算箭头在 ghost 外部相邻格的位置
    let ax = ghostPos.x + p.x;
    let ay = ghostPos.y + p.y;

    const arrowRotation = PORT_ARROW_ROTATION;
    let rot = 0;
    switch (p.side) {
      case 'left':
        ax -= 1;
        rot = isInput ? arrowRotation.left.input : arrowRotation.left.output;
        break;
      case 'right':
        ax += 1;
        rot = isInput ? arrowRotation.right.input : arrowRotation.right.output;
        break;
      case 'top':
        ay -= 1;
        rot = isInput ? arrowRotation.top.input : arrowRotation.top.output;
        break;
      case 'bottom':
        ay += 1;
        rot = isInput ? arrowRotation.bottom.input : arrowRotation.bottom.output;
        break;
    }

    const px = ax * GRID_SIZE + GRID_SIZE / 2;
    const py = ay * GRID_SIZE + GRID_SIZE / 2;
    const size = 12;
    const rad = (rot * Math.PI) / 180;

    const arrow = new Graphics({ label: 'ghost-arrow' });
    // 绘制等腰三角形
    const tipX = size;
    const tipY = 0;
    const b1X = -size * 0.5;
    const b1Y = -size * 0.6;
    const b2X = -size * 0.5;
    const b2Y = size * 0.6;

    const rotPt = (x: number, y: number) => ({
      x: px + x * Math.cos(rad) - y * Math.sin(rad),
      y: py + x * Math.sin(rad) + y * Math.cos(rad),
    });

    const t = rotPt(tipX, tipY);
    const b1 = rotPt(b1X, b1Y);
    const b2 = rotPt(b2X, b2Y);

    arrow.poly([t.x, t.y, b1.x, b1.y, b2.x, b2.y]).fill({ color: GHOST_FILL, alpha: 0.8 });
    container.addChild(arrow);
  }
}
