import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { PlacedMachine, PortConfig, Side } from '@/types';
import { isVirtualMachine } from '@/types';
import { getMachineConfig } from '@/config/machines';
import { getRotatedDimensions, getRotatedPorts } from '@/utils/machineUtils';
import { getMachineTexture } from '@/pixi/TextureLoader';
import { GRID_SIZE } from '@/config/constants';
import { machineZ, Z_INDEX } from '@/config/zIndex';
import { getPortStyle } from '@/utils/portPosition';

/** 附着在机器 Container 上的运行时元数据 */
interface MachineMeta {
  machineId: string;
  isVirtual: boolean;
  isReadonly: boolean;
  isPowered: boolean;
}

// ── 颜色常量（与 CSS 变量一致） ──
const GRAY_DARK = 0x5f5d5d;
const GRAY = 0xc4c1c1;
const GRAY_LIGHT = 0xe5e1e1;
const SELECTION_BLUE = 0x4dabf7;
const BLACK_BG = 0x1d1d1d;
const GREEN = 0xabcd41;
const ORANGE = 0xe79c3a;

/** 机器标签文字样式（复用在所有机器上） */
const labelNameStyle = new TextStyle({
  fontSize: 16,
  fill: 0xffffff,
  fontFamily: 'system-ui, Avenir, Helvetica, Arial, sans-serif',
});
const labelHintStyle = new TextStyle({
  fontSize: 12,
  fill: 0xcccccc,
  fontFamily: 'system-ui, Avenir, Helvetica, Arial, sans-serif',
});

/**
 * 为一台已放置的机器创建或更新 PixiJS Container
 *
 * 返回的 Container 以机器中心为 anchor/pivot，rotation 直接用 angle 设置。
 * 位置 = (gridX + width/2) * GRID_SIZE, (gridY + height/2) * GRID_SIZE
 */
export class MachineRenderer {
  /**
   * 创建机器容器（首次）
   * @param m 已放置机器数据
   * @param isPowered 是否有供电
   * @param isReadonly 是否只读（子蓝图内机器）
   * @param zBase z-index 基底
   */
  static create(
    m: PlacedMachine,
    isPowered: boolean,
    isReadonly: boolean,
    zBase: number = Z_INDEX.STATIC_BASE,
  ): Container {
    const config = getMachineConfig(m.machineId);
    if (!config) throw new Error(`未知机器: ${m.machineId}`);

    const isVirtual = isVirtualMachine(m.machineId);
    const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
    const pixW = width * GRID_SIZE;
    const pixH = height * GRID_SIZE;

    const container = new Container({
      label: `machine:${m.id}:${config.name}`,
    });

    // 位置 = 左上角（不旋转容器）；端口坐标已由 getRotatedPorts 旋转变换
    container.position.set(m.x * GRID_SIZE, m.y * GRID_SIZE);
    container.zIndex = machineZ(zBase, config.mask.maxMask);
    container.sortableChildren = true;

    // ── 1. 机身边框（底层） ──
    const body = new Graphics({ label: 'body' });
    body.rect(0, 0, pixW, pixH);
    body.fill({ color: GRAY_DARK, alpha: 0.15 }); // 半透明底色
    body.zIndex = 0;
    container.addChild(body);

    // ── 2. 背景色（含 machine 颜色） ──
    const bg = new Graphics({ label: 'bg' });
    // 解析 config.color → 数字（格式为 "rgba(r,g,b,a)" 或十六进制）
    const bgColor = MachineRenderer.parseColor(config.color);
    bg.rect(3, 3, pixW - 6, pixH - 6) // 3px border 区域
      .fill({ color: bgColor, alpha: 0.7 });
    bg.zIndex = 1;
    container.addChild(bg);

    // ── 3. 边框线（3px） ──
    const border = new Graphics({ label: 'border' });
    border.rect(0, 0, pixW, pixH)
      .stroke({ width: 3, color: GRAY_DARK });
    border.zIndex = 2;
    container.addChild(border);

    // ── 附着运行时元数据 ──
    MachineRenderer.setMeta(container, {
      machineId: m.machineId,
      isVirtual,
      isReadonly,
      isPowered,
    });

    return container;
  }

  /**
   * 更新机器容器的动态属性
   * 在 sync 时调用：图标、端口、标签、供电警告、选中状态
   */
  static update(
    container: Container,
    m: PlacedMachine,
    opts: {
      isPowered: boolean;
      isSelected: boolean;
      isReadonly: boolean;
      zoom: number;
    },
  ): void {
    const config = getMachineConfig(m.machineId);
    if (!config) return;

    const isVirtual = isVirtualMachine(m.machineId);
    const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
    const pixW = width * GRID_SIZE;
    const pixH = height * GRID_SIZE;
    const { isPowered, isSelected, isReadonly, zoom } = opts;

    // 清除动态子元素（保留 body, bg, border 前 3 个）
    MachineRenderer.clearDynamicChildren(container);

    // ── 图标（≥2×2 且非虚拟） ──
    if (config.width >= 2 && config.height >= 2 && !isVirtual) {
      MachineRenderer.addIcon(container, config.id, config.name, pixW, pixH);
    }

    // ── 端口指示器 ──
    if (!isReadonly && !isVirtual) {
      const inputs = getRotatedPorts(config.inputs, config.width, config.height, m.rotation);
      const outputs = getRotatedPorts(config.outputs, config.width, config.height, m.rotation);
      MachineRenderer.addPorts(container, inputs, outputs, pixW, pixH);
    }

    // ── 供电不足图标 ──
    if (!isPowered && !isVirtual && !isReadonly) {
      MachineRenderer.addPowerWarning(container, pixW, pixH);
    }

    // ── Hover 标签 ──
    MachineRenderer.addLabel(container, config.name, pixW, pixH, zoom, isReadonly, isVirtual);

    // ── 选中高亮 ──
    if (isSelected) {
      MachineRenderer.addSelectionHighlight(container, pixW, pixH);
    }

    // 存储最新机器数据
    MachineRenderer.setMeta(container, {
      machineId: m.machineId,
      isVirtual,
      isReadonly,
      isPowered,
    });
  }

  /** 构建端口 CSS 定位 → PixiJS 本地坐标 */
  private static computePortPosition(
    p: PortConfig,
    pixW: number,
    pixH: number,
    portW: number,
    portH: number,
  ): { px: number; py: number } | null {
    const posStyle = getPortStyle(p);
    switch (p.side) {
      case 'left':
        return { px: 0, py: parseFloat(posStyle.top as string) - portH / 2 };
      case 'right':
        return { px: pixW - portW, py: parseFloat(posStyle.top as string) - portH / 2 };
      case 'top':
        return { px: parseFloat(posStyle.left as string) - portW / 2, py: 0 };
      case 'bottom':
        return { px: parseFloat(posStyle.left as string) - portW / 2, py: pixH - portH };
      default:
        return null;
    }
  }

  /** 获取/设置机器容器的运行时元数据 */
  private static readonly META_KEY = Symbol('machineMeta');

  static getMeta(container: Container): MachineMeta | undefined {
    return (container as unknown as Record<symbol, MachineMeta>)[MachineRenderer.META_KEY];
  }

  private static setMeta(container: Container, meta: MachineMeta): void {
    (container as unknown as Record<symbol, MachineMeta>)[MachineRenderer.META_KEY] = meta;
  }

  // ── 私有方法 ──

  /** 清除第 4 个之后的所有子元素（body/bg/border 之后动态添加的） */
  private static clearDynamicChildren(container: Container): void {
    while (container.children.length > 3) {
      const last = container.children[container.children.length - 1];
      container.removeChild(last);
      last.destroy();
    }
  }

  /** 添加机器图标（Sprite 或后备文字） */
  private static addIcon(
    container: Container,
    machineId: string,
    fallbackName: string,
    pixW: number,
    pixH: number,
  ): void {
    const iconSize = Math.min(pixW, pixH) / 2;
    const tex = getMachineTexture(machineId);

    if (tex) {
      const sprite = new Sprite({
        texture: tex,
        label: 'icon',
        anchor: 0.5,
        width: iconSize,
        height: iconSize,
      });
      sprite.position.set(pixW / 2, pixH / 2);
      sprite.alpha = 0.7;
      // PixiJS 不支持 CSS grayscale filter，用低饱和度 tint 近似
      sprite.tint = 0xdddddd;
      sprite.zIndex = Z_INDEX.MACHINE_ICON;
      container.addChild(sprite);
    } else {
      // 文字后备
      const text = new Text({
        text: fallbackName,
        style: {
          fontSize: Math.max(10, iconSize * 0.25),
          fill: 0x000000,
          fontFamily: 'system-ui, Avenir, Helvetica, Arial, sans-serif',
          align: 'center',
          wordWrap: true,
          wordWrapWidth: pixW - 8,
        },
        label: 'icon-fallback',
      });
      text.anchor.set(0.5);
      text.position.set(pixW / 2, pixH / 2);
      text.alpha = 0.75;
      text.zIndex = Z_INDEX.MACHINE_ICON;
      container.addChild(text);
    }
  }

  /** 添加端口指示器（输入/输出箭头） */
  private static addPorts(
    container: Container,
    inputs: PortConfig[],
    outputs: PortConfig[],
    pixW: number,
    pixH: number,
  ): void {
    // 检测重叠（同位置+同方向 = mixed/diamond）
    const inputKeySet = new Set(inputs.map(p => `${p.x},${p.y},${p.side}`));
    const mixedKeys = new Set(
      outputs.map(p => `${p.x},${p.y},${p.side}`).filter(k => inputKeySet.has(k)),
    );

    // 计算端口尺寸调整（shrink 规则）
    const allPorts = [...inputs, ...outputs];
    const opposites: Record<string, string> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

    for (const p of inputs) {
      if (mixedKeys.has(`${p.x},${p.y},${p.side}`)) continue;
      MachineRenderer.addPortIndicator(container, p, 'input', pixW, pixH, allPorts, opposites, false);
    }
    for (const p of outputs) {
      const isMixed = mixedKeys.has(`${p.x},${p.y},${p.side}`);
      MachineRenderer.addPortIndicator(container, p, 'output', pixW, pixH, allPorts, opposites, isMixed);
    }
  }

  /** 添加单个端口指示器 */
  private static addPortIndicator(
    container: Container,
    p: PortConfig,
    type: 'input' | 'output',
    pixW: number,
    pixH: number,
    allPorts: PortConfig[],
    opposites: Record<string, string>,
    isMixed: boolean,
  ): void {
    // 计算端口尺寸（与 CSS .port 默认尺寸一致）
    const isHorizontal_ = p.side === 'left' || p.side === 'right';
    let portW = isHorizontal_ ? 20 : 28;
    let portH = isHorizontal_ ? 28 : 20;

    // Shrink 规则
    const peers = allPorts.filter(
      q => q.x === p.x && q.y === p.y && q.side !== p.side,
    );
    let shrinkDepth = false;
    let shrinkLength = false;
    for (const peer of peers) {
      if (peer.side === opposites[p.side]) shrinkDepth = true;
      else shrinkLength = true;
    }
    if (shrinkDepth && isHorizontal_) portW = 8;
    if (shrinkDepth && !isHorizontal_) portH = 8;
    if (shrinkLength && isHorizontal_) portH = 12;
    if (shrinkLength && !isHorizontal_) portW = 12;

    // 端口在机器内的位置（像素），复用 getPortStyle 的定位逻辑
    const pos = MachineRenderer.computePortPosition(p, pixW, pixH, portW, portH);
    if (!pos) return;
    const { px, py } = pos;

    // 外框
    const outer = new Graphics({ label: `port-${type}` });
    outer.rect(px, py, portW, portH)
      .fill({ color: GRAY })
      .stroke({ width: 1.5, color: GRAY_DARK });
    outer.zIndex = 4;
    container.addChild(outer);

    // 内框（稍小，浅色）
    const inset = 2;
    const inner = new Graphics({ label: `port-inner-${type}` });
    inner.rect(px + inset, py + inset, portW - inset * 2, portH - inset * 2)
      .fill({ color: GRAY_LIGHT });
    inner.zIndex = 5;
    container.addChild(inner);

    // 箭头三角形
    MachineRenderer.addArrow(container, px, py, portW, portH, p.side, type, isMixed);
  }

  /** 在端口内绘制箭头三角形 */
  private static addArrow(
    container: Container,
    px: number, py: number,
    portW: number, portH: number,
    side: Side,
    type: 'input' | 'output',
    isMixed: boolean,
  ): void {
    const cx = px + portW / 2;
    const cy = py + portH / 2;
    const arrowSize = Math.min(portW, portH) * 0.4;

    let angle = 0;
    if (isMixed) {
      // 菱形（不参与方向旋转）
      const diamond = new Graphics({ label: 'port-diamond' });
      const s = arrowSize * 0.7;
      diamond.poly([cx - s, cy, cx, cy - s, cx + s, cy, cx, cy + s])
        .fill({ color: GRAY_DARK });
      diamond.zIndex = 6;
      container.addChild(diamond);
      return;
    }

    // 箭头方向：input 指向内，output 指向外
    const arrowAngles: Record<string, { input: number; output: number }> = {
      left: { input: 0, output: 180 },
      right: { input: 180, output: 0 },
      top: { input: 90, output: 270 },
      bottom: { input: 270, output: 90 },
    };

    angle = arrowAngles[side]?.[type] ?? 0;
    const rad = (angle * Math.PI) / 180;

    // 箭头三点（方向向右，再旋转）
    const tipX = cx + arrowSize * 0.6;
    const tipY = cy;
    const baseX1 = cx - arrowSize * 0.4;
    const baseY1 = cy - arrowSize * 0.5;
    const baseX2 = cx - arrowSize * 0.4;
    const baseY2 = cy + arrowSize * 0.5;

    const rotPoint = (x: number, y: number) => {
      const dx = x - cx;
      const dy = y - cy;
      return {
        x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
        y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
      };
    };

    const t = rotPoint(tipX, tipY);
    const b1 = rotPoint(baseX1, baseY1);
    const b2 = rotPoint(baseX2, baseY2);

    const arrow = new Graphics({ label: 'port-arrow' });
    arrow.poly([t.x, t.y, b1.x, b1.y, b2.x, b2.y])
      .fill({ color: GRAY_DARK });
    arrow.zIndex = 7;
    container.addChild(arrow);
  }

  /** 添加供电不足图标 */
  private static addPowerWarning(container: Container, pixW: number, pixH: number): void {
    const g = new Graphics({ label: 'power-warn' });
    const cx = pixW / 2;
    const cy = pixH / 2;
    // 简单橙色圆圈代替电池图标
    g.circle(cx, cy, 10)
      .fill({ color: ORANGE, alpha: 0.8 });
    g.circle(cx, cy, 10)
      .stroke({ width: 2, color: 0xd17700 }); // --orange-dark
    g.zIndex = Z_INDEX.POWER_ALERT_ICON;
    container.addChild(g);

    // 闪电符号（简化：白色竖线）
    const bolt = new Graphics({ label: 'power-bolt' });
    bolt.moveTo(cx - 2, cy - 6)
      .lineTo(cx + 3, cy - 6)
      .lineTo(cx - 1, cy + 1)
      .lineTo(cx + 4, cy + 1)
      .lineTo(cx - 2, cy + 6)
      .lineTo(cx + 1, cy + 1)
      .lineTo(cx - 4, cy + 1)
      .closePath()
      .fill({ color: 0xffffff });
    bolt.zIndex = Z_INDEX.POWER_ALERT_ICON + 0.5;
    container.addChild(bolt);
  }

  /** 添加 Hover 标签（机器名 + 操作提示） */
  private static addLabel(
    container: Container,
    name: string,
    pixW: number,
    pixH: number,
    zoom: number,
    isReadonly: boolean,
    isVirtual: boolean,
  ): void {
    const labelContainer = new Container({
      label: 'label-group',
      visible: false,
    });

    // 名称
    const nameText = new Text({
      text: name,
      style: labelNameStyle,
      label: 'label-name',
    });

    // 提示
    const hintText = new Text({
      text: isReadonly || isVirtual ? '' : '[点击] 查看详情/选择物品\n[长按] 移动',
      style: labelHintStyle,
      label: 'label-hint',
    });
    hintText.y = nameText.height + 2;

    labelContainer.addChild(nameText, hintText);

    // 背景框
    const pad = 8;
    const bw = Math.max(nameText.width, hintText.width) + pad * 2;
    const bh = nameText.height + (hintText.text ? hintText.height + 2 : 0) + pad * 2;
    const bg = new Graphics({ label: 'label-bg' });
    bg.roundRect(0, 0, bw, bh, 4)
      .fill({ color: BLACK_BG, alpha: 0.8 });
    // 顶部绿色条
    bg.rect(0, 0, bw, 4).fill({ color: GREEN });
    bg.zIndex = -1;
    labelContainer.addChildAt(bg, 0);

    // 定位到机器右下角外侧
    labelContainer.position.set(pixW + 4, pixH + 4);

    // 反向缩放以保持可读性
    if (zoom !== 1) {
      labelContainer.scale.set(1 / zoom);
    }

    labelContainer.zIndex = Z_INDEX.MACHINE_LABEL;
    container.addChild(labelContainer);
  }

  /** 添加选中高亮 */
  private static addSelectionHighlight(
    container: Container,
    pixW: number,
    pixH: number,
  ): void {
    const sel = new Graphics({ label: 'selection-highlight' });
    sel.rect(0, 0, pixW, pixH)
      .stroke({ width: 2, color: SELECTION_BLUE });
    sel.zIndex = Z_INDEX.MACHINE_LABEL; // 放在高层
    container.addChild(sel);
  }

  /** 解析颜色字符串 → 十六进制数字 */
  private static parseColor(colorStr: string): number {
    // 尝试 rgba
    const rgba = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgba) {
      const r = parseInt(rgba[1]);
      const g = parseInt(rgba[2]);
      const b = parseInt(rgba[3]);
      return (r << 16) | (g << 8) | b;
    }
    // 尝试 hex
    if (colorStr.startsWith('#')) {
      return parseInt(colorStr.slice(1), 16);
    }
    return 0x888888; // 后备灰色
  }
}
