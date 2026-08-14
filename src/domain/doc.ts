/**
 * 蓝图文档领域层（纯函数，零框架依赖）
 *
 * FactoryDoc 是唯一持久化真相源：所有已提交蓝图节点及其内容。
 * 编辑语义为检出式（checkout）：用户编辑发生在 store 的工作视图上，
 * 通过 commitNode / forkCommit 显式提交回 doc。
 *
 * 依赖方向：store → domain → persist（单向，doc 从不反向订阅 store）。
 */
import type { PlacedMachine, Connection } from '@/types';
import { isVirtualMachine } from '@/types';

// ── 类型 ──

export interface ChildRef {
  childNodeId: string;
  x: number;
  y: number;
}

export interface CommittedNode {
  nodeId: string;
  name: string;
  version: number;
  gridW: number;
  gridH: number;
  machines: PlacedMachine[];
  connections: Connection[];
  children: ChildRef[];
  createdAt: number;
  updatedAt: number;
}

export interface FactoryDoc {
  version: 1;
  nodes: Record<string, CommittedNode>;
}

/** 提交到节点的内容（机器 + 连线，不含 children） */
export interface NodeContent {
  machines: PlacedMachine[];
  connections: Connection[];
}

/** 子蓝图摘要（BLUEPRINT_MOVE 预览等只读用途） */
export interface BlueprintSummary {
  nodeId: string;
  name: string;
  gridW: number;
  gridH: number;
}

export const DEFAULT_BLUEPRINT_NAME = '未命名蓝图';

// ── 工厂 ──

export function createEmptyDoc(): FactoryDoc {
  return { version: 1, nodes: {} };
}

export function createNodeWithContent(
  name: string,
  gridW: number,
  gridH: number,
  content: NodeContent,
): CommittedNode {
  const now = Date.now();
  return {
    nodeId: crypto.randomUUID(),
    name,
    version: 1,
    gridW,
    gridH,
    machines: content.machines,
    connections: content.connections,
    children: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── 查询 ──

export function getNode(doc: FactoryDoc, nodeId: string | null | undefined): CommittedNode | undefined {
  if (!nodeId) return undefined;
  return doc.nodes[nodeId];
}

/** 根节点 = 不被任何节点引用的节点 */
export function findRoots(doc: FactoryDoc): string[] {
  const childIds = new Set<string>();
  for (const node of Object.values(doc.nodes)) {
    for (const child of node.children) childIds.add(child.childNodeId);
  }
  return Object.keys(doc.nodes).filter((id) => !childIds.has(id));
}

/** 引用计数：有多少个节点把 nodeId 作为子蓝图引用 */
export function refCount(doc: FactoryDoc, nodeId: string): number {
  let count = 0;
  for (const node of Object.values(doc.nodes)) {
    for (const child of node.children) {
      if (child.childNodeId === nodeId) count++;
    }
  }
  return count;
}

/** 祖先路径（自顶向下）；环防护 */
export function findAncestorPath(doc: FactoryDoc, nodeId: string, _visited: Set<string> = new Set()): string[] {
  if (_visited.has(nodeId)) return [];
  _visited.add(nodeId);

  for (const node of Object.values(doc.nodes)) {
    for (const child of node.children) {
      if (child.childNodeId === nodeId) {
        return [...findAncestorPath(doc, node.nodeId, _visited), node.nodeId];
      }
    }
  }
  return [];
}

/** 是否允许把 childId 作为 parentId 的子蓝图插入（存在 + 非自身 + 非祖先） */
export function canInsertChild(doc: FactoryDoc, parentId: string, childId: string): boolean {
  if (!doc.nodes[childId]) return false;
  if (parentId === childId) return false;
  return !findAncestorPath(doc, parentId).includes(childId);
}

/** 当前节点内容与 doc 已提交内容是否一致（脏检测，供离开确认使用） */
export function isContentEqual(a: NodeContent, b: NodeContent): boolean {
  // 按 id 稳定排序后比较：批量移动取消会改变数组顺序，顺序不应影响脏判定
  const stable = <T extends { id: string }>(arr: T[]): T[] =>
    [...arr].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return JSON.stringify(stable(a.machines)) === JSON.stringify(stable(b.machines))
    && JSON.stringify(stable(a.connections)) === JSON.stringify(stable(b.connections));
}

// ── 提交 ──

/** 原地提交（未共享节点）：内容写回原 nodeId，version+1 */
export function commitNode(
  doc: FactoryDoc,
  nodeId: string,
  content: NodeContent,
  name: string,
  gridW: number,
  gridH: number,
): FactoryDoc {
  const node = doc.nodes[nodeId];
  if (!node) return doc;
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [nodeId]: {
        ...node,
        name,
        gridW,
        gridH,
        machines: content.machines,
        connections: content.connections,
        version: node.version + 1,
        updatedAt: Date.now(),
      },
    },
  };
}

/** 分叉提交（共享节点）：旧节点保持不变，新节点承载本次内容 */
export function forkCommit(
  doc: FactoryDoc,
  nodeId: string,
  content: NodeContent,
  name: string,
  gridW: number,
  gridH: number,
): { doc: FactoryDoc; newNodeId: string } {
  const node = doc.nodes[nodeId];
  const newNodeId = crypto.randomUUID();
  const now = Date.now();
  const newNode: CommittedNode = {
    ...node,
    nodeId: newNodeId,
    name,
    version: node.version + 1,
    gridW,
    gridH,
    // 内容统一标注新节点归属
    machines: content.machines.map((m) => ({ ...m, blueprintNodeId: newNodeId })),
    connections: content.connections.map((c) => ({ ...c, blueprintNodeId: newNodeId })),
    children: node.children.map((c) => ({ ...c })),
    updatedAt: now,
  };
  return {
    doc: { ...doc, nodes: { ...doc.nodes, [newNodeId]: newNode } },
    newNodeId,
  };
}

// ── 子蓝图关系 ──

export function addChild(doc: FactoryDoc, parentId: string, childId: string, x: number, y: number): FactoryDoc {
  const parent = doc.nodes[parentId];
  if (!parent || !doc.nodes[childId]) return doc;
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [parentId]: {
        ...parent,
        children: [...parent.children, { childNodeId: childId, x, y }],
        updatedAt: Date.now(),
      },
    },
  };
}

export function removeChild(doc: FactoryDoc, parentId: string, childId: string): FactoryDoc {
  const parent = doc.nodes[parentId];
  if (!parent) return doc;
  const before = parent.children.length;
  const children = parent.children.filter((c) => c.childNodeId !== childId);
  if (children.length === before) return doc;
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [parentId]: { ...parent, children, updatedAt: Date.now() },
    },
  };
}

export function moveChild(doc: FactoryDoc, parentId: string, childId: string, x: number, y: number): FactoryDoc {
  const parent = doc.nodes[parentId];
  if (!parent) return doc;
  const ref = parent.children.find((c) => c.childNodeId === childId);
  if (!ref) return doc;
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [parentId]: {
        ...parent,
        children: parent.children.map((c) => (c.childNodeId === childId ? { ...c, x, y } : c)),
        updatedAt: Date.now(),
      },
    },
  };
}

/** 删除节点并清理所有引用（调用方负责 refCount === 0 检查） */
export function deleteNode(doc: FactoryDoc, nodeId: string): FactoryDoc {
  const nodes: Record<string, CommittedNode> = {};
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (id === nodeId) continue;
    const children = node.children.filter((c) => c.childNodeId !== nodeId);
    nodes[id] = children.length === node.children.length ? node : { ...node, children };
  }
  return { ...doc, nodes };
}

// ── 展平（派生视图） ──

/** 递归展平节点及其全部后代；过滤虚拟机器；坐标累加偏移；机器标注归属 nodeId */
export function flattenNode(
  doc: FactoryDoc,
  nodeId: string,
  offsetX = 0,
  offsetY = 0,
  _visited: Set<string> = new Set(),
): { machines: PlacedMachine[]; connections: Connection[] } {
  if (_visited.has(nodeId)) return { machines: [], connections: [] };
  _visited.add(nodeId);

  const node = doc.nodes[nodeId];
  if (!node) return { machines: [], connections: [] };

  const machines: PlacedMachine[] = [];
  const connections: Connection[] = [];

  for (const m of node.machines) {
    if (isVirtualMachine(m.machineId)) continue;
    machines.push({ ...m, blueprintNodeId: nodeId, x: m.x + offsetX, y: m.y + offsetY });
  }
  for (const c of node.connections) {
    connections.push({
      ...c,
      blueprintNodeId: nodeId,
      path: c.path.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })),
    });
  }
  for (const childRef of node.children) {
    const childResult = flattenNode(doc, childRef.childNodeId, offsetX + childRef.x, offsetY + childRef.y, _visited);
    machines.push(...childResult.machines);
    connections.push(...childResult.connections);
  }

  return { machines, connections };
}

/** 展平 nodeId 的全部后代（不含自身） */
export function flattenDescendants(
  doc: FactoryDoc,
  nodeId: string,
): { machines: PlacedMachine[]; connections: Connection[] } {
  const node = doc.nodes[nodeId];
  if (!node) return { machines: [], connections: [] };

  const machines: PlacedMachine[] = [];
  const connections: Connection[] = [];
  const visited = new Set<string>([nodeId]);

  for (const childRef of node.children) {
    const childResult = flattenNode(doc, childRef.childNodeId, childRef.x, childRef.y, visited);
    machines.push(...childResult.machines);
    connections.push(...childResult.connections);
  }

  return { machines, connections };
}
