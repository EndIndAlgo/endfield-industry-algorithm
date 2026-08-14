/**
 * 蓝图插入位置校验（纯函数 + 模块级缓存）
 *
 * 校验子蓝图放置在 (ox, oy) 是否合法：
 * 1. 越界：锚点 ≥ 0；非空蓝图按实际占位格判定（声明网格多为默认尺寸不作硬约束），
 *    空蓝图按声明网格尺寸判定
 * 2. 与父内容的掩码重叠（按游戏分层语义：同层/机器位重叠即冲突，
 *    异类连线交叉允许——与 Mask 系统的桥规则一致）
 *
 * 缓存策略（不可变更新下引用即身份）：
 * - 子蓝图占位格：CommittedNode 对象 → 展平后的相对占用格列表
 * - 父占用掩码：machines 数组引用 + 网格尺寸 → Mask
 */
import type { FactoryDoc, CommittedNode } from '@/domain/doc';
import { flattenNode } from '@/domain/doc';
import type { PlacedMachine, Connection } from '@/types';
import { portTypeToMask } from '@/types';
import { Mask } from './mask';
import { resolveMachineMasks, getMachineConfigById } from './machineUtils';

interface OccupiedCell {
  x: number;
  y: number;
  value: number;
}

const childOccupancyCache = new WeakMap<CommittedNode, OccupiedCell[]>();

const parentMaskCache = new WeakMap<
  PlacedMachine[],
  { conns: Connection[]; gw: number; gh: number; mask: Mask }
>();

/** 子蓝图展平后的相对占位格列表（含后代；机器按旋转掩码逐格，连线按路径格） */
function getChildOccupancy(doc: FactoryDoc, childNodeId: string): OccupiedCell[] | null {
  const node = doc.nodes[childNodeId];
  if (!node) return null;

  const hit = childOccupancyCache.get(node);
  if (hit) return hit;

  const flat = flattenNode(doc, childNodeId);
  const cells: OccupiedCell[] = [];

  for (const m of flat.machines) {
    const cfg = getMachineConfigById(m.machineId);
    if (!cfg) continue;
    const rotated = cfg.mask4![m.rotation];
    for (let y = 0; y < rotated.height; y++) {
      for (let x = 0; x < rotated.width; x++) {
        const value = rotated.get(x, y);
        if (value !== 0) cells.push({ x: m.x + x, y: m.y + y, value });
      }
    }
  }
  for (const c of flat.connections) {
    const maskValue = portTypeToMask[c.portType] ?? 0;
    if (maskValue === 0) continue;
    for (const p of c.path) {
      cells.push({ x: p.x, y: p.y, value: maskValue });
    }
  }

  childOccupancyCache.set(node, cells);
  return cells;
}

/** 父内容占用掩码（machines 引用不变则复用） */
function getParentMask(parent: {
  machines: PlacedMachine[];
  connections: Connection[];
  gridWidth: number;
  gridHeight: number;
}): Mask {
  const hit = parentMaskCache.get(parent.machines);
  if (
    hit
    && hit.conns === parent.connections
    && hit.gw === parent.gridWidth
    && hit.gh === parent.gridHeight
  ) {
    return hit.mask;
  }

  const mask = Mask.FromOccupancy({
    machines: resolveMachineMasks(parent.machines),
    connections: parent.connections,
    gridW: parent.gridWidth,
    gridH: parent.gridHeight,
  });
  parentMaskCache.set(parent.machines, {
    conns: parent.connections,
    gw: parent.gridWidth,
    gh: parent.gridHeight,
    mask,
  });
  return mask;
}

/** 校验子蓝图放置在 (ox, oy) 是否合法 */
export function validateChildPlacement(
  doc: FactoryDoc,
  childNodeId: string,
  ox: number,
  oy: number,
  parent: {
    machines: PlacedMachine[];
    connections: Connection[];
    gridWidth: number;
    gridHeight: number;
  },
): boolean {
  const node = doc.nodes[childNodeId];
  if (!node) return false;

  if (ox < 0 || oy < 0) return false;

  const cells = getChildOccupancy(doc, childNodeId);
  if (!cells) return false;

  if (cells.length === 0) {
    // 空蓝图：无实际占位，按声明网格尺寸约束
    return ox + node.gridW <= parent.gridWidth && oy + node.gridH <= parent.gridHeight;
  }

  // 非空蓝图：以实际占位格为准（声明网格多为创建时的默认尺寸，不作硬约束）
  const parentMask = getParentMask(parent);
  for (const cell of cells) {
    const x = cell.x + ox;
    const y = cell.y + oy;
    if (x < 0 || y < 0 || x >= parent.gridWidth || y >= parent.gridHeight) return false;
    // 位重叠即冲突：机器位/同层线不可叠；异类连线 (2 & 4 = 0) 允许交叉
    if ((parentMask.get(x, y) & cell.value) !== 0) return false;
  }
  return true;
}
