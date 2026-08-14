/**
 * FactoryDoc 持久化（唯一存储出口）
 *
 * 旧格式数据（zmd_registry / zmd_blueprints 等）不再读取，
 * 按项目决策直接废弃（快速开发阶段，允许破坏性变更）。
 */
import type { FactoryDoc, CommittedNode } from './doc';

const DOC_KEY = 'zmd_doc_v1';

const PORT_TYPES = new Set(['Solid', 'Liquid', 'Gas']);

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isPoint = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && isFiniteNum((v as { x?: unknown }).x) && isFiniteNum((v as { y?: unknown }).y);

const isDir = (v: unknown): boolean => v === 0 || v === 1 || v === 2 || v === 3;

/**
 * 深度校验节点结构。
 * loadDoc 只做浅校验时，任何字段缺失/被篡改的 doc 都会在
 * findRoots/flattenNode 等 for...of 处抛 TypeError 导致启动白屏且无法自愈。
 */
function isValidNode(node: unknown, nodeId: string): node is CommittedNode {
  if (typeof node !== 'object' || node === null) return false;
  const n = node as Record<string, unknown>;
  if (typeof n.nodeId !== 'string' || n.nodeId !== nodeId) return false;
  if (typeof n.name !== 'string') return false;
  if (!isFiniteNum(n.gridW) || !isFiniteNum(n.gridH)) return false;
  if (!Array.isArray(n.machines) || !Array.isArray(n.connections) || !Array.isArray(n.children)) return false;

  for (const m of n.machines) {
    if (typeof m !== 'object' || m === null) return false;
    const mm = m as Record<string, unknown>;
    if (typeof mm.id !== 'string' || typeof mm.machineId !== 'string') return false;
    if (!isFiniteNum(mm.x) || !isFiniteNum(mm.y) || !isDir(mm.rotation)) return false;
  }
  for (const c of n.connections) {
    if (typeof c !== 'object' || c === null) return false;
    const cc = c as Record<string, unknown>;
    if (typeof cc.id !== 'string' || !isDir(cc.tailFacing) || !isDir(cc.headFacing)) return false;
    if (typeof cc.portType !== 'string' || !PORT_TYPES.has(cc.portType)) return false;
    if (!Array.isArray(cc.path) || cc.path.length === 0 || !cc.path.every(isPoint)) return false;
  }
  for (const child of n.children) {
    if (typeof child !== 'object' || child === null) return false;
    const ch = child as Record<string, unknown>;
    if (typeof ch.childNodeId !== 'string' || !isFiniteNum(ch.x) || !isFiniteNum(ch.y)) return false;
  }
  return true;
}

export function loadDoc(): FactoryDoc | null {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (p.version !== 1 || typeof p.nodes !== 'object' || p.nodes === null) return null;

    const nodes = p.nodes as Record<string, unknown>;
    for (const [key, node] of Object.entries(nodes)) {
      if (!isValidNode(node, key)) return null;
    }
    // 悬空 childRef（引用不存在的节点）会使 flatten/findAncestorPath 崩溃 → 整体丢弃
    for (const node of Object.values(nodes)) {
      for (const child of (node as CommittedNode).children) {
        if (!(child.childNodeId in nodes)) return null;
      }
    }

    return parsed as FactoryDoc;
  } catch (e) {
    console.error('加载蓝图文档失败', e);
    return null;
  }
}

/** 写入成功返回 true；失败（配额满/隐私模式）返回 false 由调用方提示 */
export function saveDoc(doc: FactoryDoc): boolean {
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    return true;
  } catch (e) {
    console.error('保存蓝图文档失败', e);
    return false;
  }
}
