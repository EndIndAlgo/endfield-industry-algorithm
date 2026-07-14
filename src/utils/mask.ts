import type { Direction, PortType, Point } from '@/types';
import { portTypeToMask, isHorizontal } from '@/types';

/** FromOccupancy 需要的机器掩码条目（调用方负责从 MachineConfig 解析） */
export interface MachineMaskEntry { mask: Mask; x: number; y: number }
/** FromOccupancy 需要的连线最小字段 */
interface ConnLike { path: Point[]; portType: string };

/** 遍历 Uint8Array 取最大值 */
const computeMaxMask = (data: Uint8Array): number => {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > max) max = data[i];
  }
  return max;
};

/**
 * 掩码对象 — 封装二维占用掩码的存储与操作
 *
 * 内部使用一维 Uint8Array (y * width + x)，外部通过 get(x, y) 查询，
 * 通过 Merge / MergeInPlace / HasCollision / TryMerge 组合操作。
 * 掩码旋转由 FromMask 在构造时完成，构造后方向冻结。
 */
export class Mask {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;

  /** 最大掩码值缓存。脏时由 getter 惰性重算。_dirty 日后扩展为通用非关键数据脏标志。 */
  private _max_mask_cache = 0;
  private _dirty = true;

  get maxMask(): number {
    if (this._dirty) {
      this._max_mask_cache = computeMaxMask(this.data);
      this._dirty = false;
    }
    return this._max_mask_cache;
  }

  private constructor(
    data: Uint8Array,
    width: number,
    height: number,
  ) {
    this.data = data;
    this.width = width;
    this.height = height;
  }

  // ── 查询 ──

  /** 读取 (x, y) 处的掩码值，越界行为由调用方保证 */
  get(x: number, y: number): number {
    return this.data[y * this.width + x];
  }

  /** 检查 (x, y) 处是否被指定掩码阻挡：(grid[x,y] & mask) !== 0 */
  IsBlocked(x: number, y: number, mask: number): boolean {
    return (this.data[y * this.width + x] & mask) !== 0;
  }

  // ── 工厂 ──

  /** 创建 w×h 全同值掩码 */
  static Uniform(w: number, h: number, value: number): Mask {
    const data = new Uint8Array(w * h);
    if (value !== 0) data.fill(value);
    const m = new Mask(data, w, h);
    m._max_mask_cache = value;
    m._dirty = false;
    return m;
  }

  /**
   * 从无旋转的配置掩码 + 旋转方向创建新掩码
   *
   * 旋转映射（逆映射，从目标坐标读取源坐标）：
   *  rot=0: (sx, sy) = (nx, ny)
   *  rot=1: (sx, sy) = (ny, sh - 1 - nx)
   *  rot=2: (sx, sy) = (sw - 1 - nx, sh - 1 - ny)
   *  rot=3: (sx, sy) = (sw - 1 - ny, nx)
   */
  static FromMask(cfgMask: Mask, rotation: Direction): Mask {
    const { width: sw, height: sh, data: src } = cfgMask;
    if (rotation === 0) return cfgMask.Clone();

    const swapped = isHorizontal(rotation);
    const nw = swapped ? sh : sw;
    const nh = swapped ? sw : sh;
    const dst = new Uint8Array(nw * nh);

    for (let ny = 0; ny < nh; ny++) {
      const row = ny * nw;
      for (let nx = 0; nx < nw; nx++) {
        let sx: number;
        let sy: number;
        switch (rotation) {
          case 1:
            sx = ny;
            sy = sh - 1 - nx;
            break;
          case 2:
            sx = sw - 1 - nx;
            sy = sh - 1 - ny;
            break;
          case 3:
            sx = sw - 1 - ny;
            sy = nx;
            break;
          default: // 0 already handled above
            sx = nx;
            sy = ny;
        }
        dst[row + nx] = src[sy * sw + sx];
      }
    }

    return new Mask(dst, nw, nh);
  }

  /**
   * 从连线路径创建掩码（包围盒尺寸）
   *
   * 路径点写入 `maskValue`，非路径点保持 0。
   * 合并到画布网格时 offset = 包围盒的 (minX, minY)。
   */
  static FromConnection(path: Point[], portType: PortType): Mask {
    if (path.length === 0) return new Mask(new Uint8Array(0), 0, 0);
    const maskValue = portTypeToMask[portType];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of path) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const data = new Uint8Array(w * h);

    for (const p of path) {
      data[(p.y - minY) * w + (p.x - minX)] = maskValue;
    }

    const m = new Mask(data, w, h);
    m._max_mask_cache = maskValue;
    m._dirty = false;
    return m;
  }

  /**
   * 从机器列表 + 连线列表构建占用掩码（最常用的组合构建入口）
   *
   * 等价于：Uniform → 遍历机器 MergeInPlace → 遍历连线 WriteValue
   * excludePortType 用于路由场景：同类型连线可通过故不进入掩码
   */
  static FromOccupancy(opts: {
    machines: MachineMaskEntry[];
    connections: ConnLike[];
    gridW: number;
    gridH: number;
    excludePortType?: PortType;
  }): Mask {
    const { machines, connections, gridW, gridH, excludePortType } = opts;
    const grid = Mask.Uniform(gridW, gridH, 0);

    for (const m of machines) {
      grid.MergeInPlace(m.mask, m.x, m.y);
    }

    for (const c of connections) {
      if (excludePortType !== undefined && c.portType === excludePortType) continue;
      const maskValue = portTypeToMask[c.portType as keyof typeof portTypeToMask] ?? 0;
      if (maskValue === 0) continue;
      for (const p of c.path) {
        if (p.x >= 0 && p.x < gridW && p.y >= 0 && p.y < gridH) {
          grid.WriteValue(p.x, p.y, maskValue);
        }
      }
    }

    return grid;
  }

  /**
   * 从连线拐弯点列表构建掩码（每个拐弯点写 1）
   * 调用方负责用 getCornerPoints 预计算拐弯点并通过 portType 过滤
   */
  static FromCornerPoints(corners: Point[], gridW: number, gridH: number): Mask {
    const grid = Mask.Uniform(gridW, gridH, 0);
    for (const cp of corners) {
      if (cp.x >= 0 && cp.x < gridW && cp.y >= 0 && cp.y < gridH) {
        grid.WriteValue(cp.x, cp.y, 1);
      }
    }
    return grid;
  }

  // ── 单点写入 ──

  /** 在 (x, y) 处按位或写入掩码值 */
  WriteValue(x: number, y: number, value: number): void {
    this.data[y * this.width + x] |= value;
    this._dirty = true;
  }

  // ── 碰撞 ──

  /**
   * 检查 other 放在 (ox, oy) 处是否与自身碰撞
   *
   * 判定规则：
   *  - other 的非零格越出 this 边界 → true
   *  - other 的非零格 & this 对应格 !== 0 → true
   *  - other 的零格不作检查
   */
  HasCollision(other: Mask, ox: number, oy: number): boolean {
    const { data: od, width: ow, height: oh } = other;
    const tw = this.width;
    const th = this.height;

    for (let ly = 0; ly < oh; ly++) {
      const ty = oy + ly;
      const srcRow = ly * ow;
      for (let lx = 0; lx < ow; lx++) {
        const v = od[srcRow + lx];
        if (v === 0) continue;
        const tx = ox + lx;
        if (tx < 0 || tx >= tw || ty < 0 || ty >= th) return true;
        if (this.data[ty * tw + tx] & v) return true;
      }
    }
    return false;
  }

  // ── 合并 ──

  /** 无条件合并，返回新 Mask（不修改自身） */
  Merge(other: Mask, ox: number, oy: number): Mask {
    return this.Clone().mergeInPlaceInternal(other, ox, oy);
  }

  /** 无条件就地合并（修改自身） */
  MergeInPlace(other: Mask, ox: number, oy: number): void {
    this.mergeInPlaceInternal(other, ox, oy);
  }

  /** 先判碰：无碰 → 返回合并后的新 Mask（不修改自身）；有碰 → 返回 null */
  TryMerge(other: Mask, ox: number, oy: number): Mask | null {
    if (this.HasCollision(other, ox, oy)) return null;
    return this.Merge(other, ox, oy);
  }

  /** 就地版 TryMerge：先判碰，无碰则原地合并，返回是否成功。零分配。 */
  TryMergeInPlace(other: Mask, ox: number, oy: number): boolean {
    if (this.HasCollision(other, ox, oy)) return false;
    this.MergeInPlace(other, ox, oy);
    return true;
  }

  // ── 工具 ──

  Clone(): Mask {
    const m = new Mask(new Uint8Array(this.data), this.width, this.height);
    m._max_mask_cache = this._max_mask_cache;
    m._dirty = this._dirty;
    return m;
  }

  // ── 内部 ──

  private mergeInPlaceInternal(other: Mask, ox: number, oy: number): this {
    const { data: od, width: ow, height: oh } = other;
    const tw = this.width;
    const td = this.data;

    for (let ly = 0; ly < oh; ly++) {
      const ty = oy + ly;
      if (ty < 0 || ty >= this.height) continue;
      const srcRow = ly * ow;
      const dstRow = ty * tw;
      for (let lx = 0; lx < ow; lx++) {
        const tx = ox + lx;
        if (tx < 0 || tx >= tw) continue;
        const v = od[srcRow + lx];
        if (v === 0) continue;
        td[dstRow + tx] |= v;
      }
    }

    this._dirty = true;
    return this;
  }
}
