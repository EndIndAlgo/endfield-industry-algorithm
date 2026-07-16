import type { PlacedMachine, Connection, BlueprintRegistry } from '@/types';
import { isVirtualMachine } from '@/types';
import { flattenBlueprint as flattenTree } from '@/utils/blueprintTree';

export interface FlattenResult {
    machines: PlacedMachine[];
    connections: Connection[];
}

/**
 * 将蓝图及其所有后代递归展平为纯 machines + connections。
 * - 移除所有虚拟机器（sin/sot/lin/lot）
 * - 跨层级连线通过坐标自然对接
 * - 子蓝图机器坐标累加 childRef 偏移
 */
export function flattenBlueprint(
    nodeId: string,
    registry: BlueprintRegistry,
): FlattenResult {
    return flattenTree(nodeId, registry, 0, 0);
}

/**
 * 深拷贝蓝图：展平后重新打包为独立的新 snapshot。
 * 用于导入(复制)操作——将树形蓝图变为扁平蓝图。
 */
export function cloneBlueprint(
    nodeId: string,
    registry: BlueprintRegistry,
): { machines: PlacedMachine[]; connections: Connection[] } {
    const flat = flattenTree(nodeId, registry, 0, 0);

    // 移除虚拟机器
    const realMachines = flat.machines.filter((m) => !isVirtualMachine(m.machineId));

    // 移除连接到虚拟机器端点的连线
    const vmPositions = new Set(
        flat.machines
            .filter((m) => isVirtualMachine(m.machineId))
            .map((m) => `${m.x},${m.y}`),
    );
    const realConns = flat.connections.filter((c) => {
        const first = c.path[0];
        const last = c.path[c.path.length - 1];
        return !vmPositions.has(`${first.x},${first.y}`) && !vmPositions.has(`${last.x},${last.y}`);
    });

    // 重新分配 ID
    return {
        machines: realMachines.map((m) => ({ ...m, id: crypto.randomUUID() })),
        connections: realConns.map((c) => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map((p) => ({ ...p })),
        })),
    };
}
