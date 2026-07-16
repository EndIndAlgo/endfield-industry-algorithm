import { Container, TilingSprite, Texture, Graphics } from 'pixi.js';
import { GRID_SIZE } from '@/config/constants';

/** 网格边框颜色 — 与 CSS var(--black-light) 一致 */
const GRID_BORDER_COLOR = 0x3d3d3d;

/**
 * 网格背景层
 *
 * 用 TilingSprite 平铺 40×40 网格纹理 + Graphics 绘制 4px 边框，
 * 替代原有 CSS background-image + border 方案。
 */
export class GridLayer extends Container {
  private tile: TilingSprite;
  private border: Graphics;
  private _gridW = 0;
  private _gridH = 0;

  constructor() {
    super();

    // 生成 40×40 网格单元纹理（右下各 1px 线）
    const tileTexture = GridLayer.createTileTexture();
    this.tile = new TilingSprite({
      texture: tileTexture,
      width: 0,
      height: 0,
    });
    this.tile.alpha = 0.5;

    // 4px 实线边框
    this.border = new Graphics();

    this.addChild(this.tile, this.border);
  }

  /** 更新网格尺寸（gridWidth/gridHeight 变化时调用） */
  update(gridWidth: number, gridHeight: number): void {
    if (gridWidth === this._gridW && gridHeight === this._gridH) return;
    this._gridW = gridWidth;
    this._gridH = gridHeight;

    const w = gridWidth * GRID_SIZE;
    const h = gridHeight * GRID_SIZE;

    this.tile.width = w;
    this.tile.height = h;

    // 重建边框 Graphics（含 4px 向外扩展，与原 CSS 保持一致）
    this.border.clear();
    this.border.rect(-4, -4, w + 8, h + 8)
      .stroke({ width: 4, color: GRID_BORDER_COLOR });
  }

  /** 生成 40×40 网格单元纹理 */
  private static createTileTexture(): Texture {
    // 使用离屏 Canvas 2D 画线
    const canvas = document.createElement('canvas');
    canvas.width = GRID_SIZE;
    canvas.height = GRID_SIZE;

    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#c4c1c1'; // var(--gray)
    ctx.lineWidth = 1;

    // 右边缘
    ctx.beginPath();
    ctx.moveTo(GRID_SIZE - 0.5, 0);
    ctx.lineTo(GRID_SIZE - 0.5, GRID_SIZE);
    ctx.stroke();

    // 下边缘
    ctx.beginPath();
    ctx.moveTo(0, GRID_SIZE - 0.5);
    ctx.lineTo(GRID_SIZE, GRID_SIZE - 0.5);
    ctx.stroke();

    return Texture.from(canvas);
  }
}
