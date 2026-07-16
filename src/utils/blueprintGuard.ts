import type { PlacedMachine, Connection } from '@/types';

/** 判断机器/连线是否属于当前 viewing 节点（可修改） */
export function isViewingOwn(
    item: PlacedMachine | Connection,
    viewingNodeId: string | null,
): boolean {
    if (!viewingNodeId) return true; // 无 viewing 时允许任意修改
    return item.blueprintNodeId === viewingNodeId;
}

/** 判断机器/连线是否属于后代节点（只读） */
export function isDescendant(
    item: PlacedMachine | Connection,
    viewingNodeId: string | null,
): boolean {
    if (!viewingNodeId) return false;
    const nid = item.blueprintNodeId;
    return nid != null && nid !== viewingNodeId;
}
