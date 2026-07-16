import type { PlacedMachine, Connection, BlueprintRegistry } from '@/types';
import { isVirtualMachine } from '@/types';

// ── 展平 ──

/** 递归展平蓝图及其所有后代为纯 machines + connections。
 *  - 移除所有虚拟机器（sin/sot/lin/lot）
 *  - 子蓝图机器坐标累加 childRef 偏移
 *  - 连线坐标同步偏移 */
export function flattenBlueprint(
  nodeId: string,
  registry: BlueprintRegistry,
  offsetX = 0,
  offsetY = 0,
  _visited: Set<string> = new Set(),
): { machines: PlacedMachine[]; connections: Connection[] } {
  if (_visited.has(nodeId)) return { machines: [], connections: [] };
  _visited.add(nodeId);

  const snapshot = registry[nodeId];
  if (!snapshot) return { machines: [], connections: [] };

  const machines: PlacedMachine[] = [];
  const connections: Connection[] = [];

  // 本节点机器（保留虚拟机器——展平时丢弃）
  for (const m of snapshot.machines) {
    if (isVirtualMachine(m.machineId)) continue;
    machines.push({ ...m, x: m.x + offsetX, y: m.y + offsetY });
  }

  // 本节点连线
  for (const c of snapshot.connections) {
    connections.push({
      ...c,
      path: c.path.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })),
    });
  }

  // 递归子蓝图
  for (const childRef of snapshot.children) {
    const childResult = flattenBlueprint(
      childRef.childNodeId,
      registry,
      offsetX + childRef.x,
      offsetY + childRef.y,
      _visited,
    );
    machines.push(...childResult.machines);
    connections.push(...childResult.connections);
  }

  return { machines, connections };
}

// ── syncStoreFromViewing ──
// 模型：store 是 viewing 的工作副本（fork），registry 是已保存的真相。
// viewing 自有数据始终从 store 保留，子蓝图数据从 registry 展平。

/** 从 registry 展平所有子蓝图，与 store 中 viewing 自有数据合并。 */
export function syncStoreFromViewing(
  viewingNodeId: string | null,
  registry: BlueprintRegistry,
  viewingOwnMachines: PlacedMachine[],
  viewingOwnConnections: Connection[],
): { machines: PlacedMachine[]; connections: Connection[] } {
  if (!viewingNodeId) return { machines: [], connections: [] };

  // viewing 自有数据：始终来自 store（工作副本）
  const machines: PlacedMachine[] = viewingOwnMachines.map((m) => ({
    ...m,
    blueprintNodeId: viewingNodeId,
  }));
  const connections: Connection[] = viewingOwnConnections.map((c) => ({
    ...c,
    path: c.path.map((p) => ({ ...p })),
    blueprintNodeId: viewingNodeId,
  }));

  // 子蓝图数据：从 registry 展平
  const snapshot = registry[viewingNodeId];
  if (snapshot) {
    for (const childRef of snapshot.children) {
      const childResult = flattenOnlyDescendants(
        childRef.childNodeId,
        registry,
        childRef.x,
        childRef.y,
        new Set(),
      );
      machines.push(...childResult.machines);
      connections.push(...childResult.connections);
    }
  }

  return { machines, connections };
}

/** 递归展平后代节点（只展平子蓝图，不含 viewing 自身） */
function flattenOnlyDescendants(
  nodeId: string,
  registry: BlueprintRegistry,
  offsetX: number,
  offsetY: number,
  _visited: Set<string>,
): { machines: PlacedMachine[]; connections: Connection[] } {
  if (_visited.has(nodeId)) return { machines: [], connections: [] };
  _visited.add(nodeId);

  const snapshot = registry[nodeId];
  if (!snapshot) return { machines: [], connections: [] };

  const machines: PlacedMachine[] = [];
  const connections: Connection[] = [];

  for (const m of snapshot.machines) {
    machines.push({ ...m, x: m.x + offsetX, y: m.y + offsetY, blueprintNodeId: nodeId });
  }
  for (const c of snapshot.connections) {
    connections.push({
      ...c,
      path: c.path.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })),
      blueprintNodeId: nodeId,
    });
  }
  for (const childRef of snapshot.children) {
    const childResult = flattenOnlyDescendants(
      childRef.childNodeId, registry,
      offsetX + childRef.x, offsetY + childRef.y,
      _visited,
    );
    machines.push(...childResult.machines);
    connections.push(...childResult.connections);
  }

  return { machines, connections };
}

