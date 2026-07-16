import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point } from '@/types';
import type { BlueprintRegistry, BlueprintSnapshot } from '@/types';

interface UseBlueprintSelectModeDeps {
    getGridPos: (e: React.MouseEvent) => Point;
}

/** 检查 nodeId 是否在 targetId 的子树中（递归） */
function isInSubtree(nodeId: string, rootId: string, registry: BlueprintRegistry): boolean {
    const snapshot = registry[rootId];
    if (!snapshot) return false;
    for (const child of snapshot.children) {
        if (child.childNodeId === nodeId) return true;
        if (isInSubtree(nodeId, child.childNodeId, registry)) return true;
    }
    return false;
}

/** 找到包含指定 nodeId 的直接子蓝图 */
function findDirectChildContaining(
    nodeId: string,
    viewing: BlueprintSnapshot,
    registry: BlueprintRegistry,
): string | null {
    for (const child of viewing.children) {
        if (child.childNodeId === nodeId || isInSubtree(nodeId, child.childNodeId, registry)) {
            return child.childNodeId;
        }
    }
    return null;
}

export function useBlueprintSelectMode({ getGridPos }: UseBlueprintSelectModeDeps) {
    const onClick = useCallback((e: React.MouseEvent) => {
        const s = useGameStore.getState();
        if (s.modeState.kind !== 'BLUEPRINT_SELECT') return;

        const pos = getGridPos(e);
        const { machines, blueprintRegistry, currentViewingNodeId } = s;
        if (!currentViewingNodeId) return;

        const viewing = blueprintRegistry[currentViewingNodeId];
        if (!viewing || viewing.children.length === 0) return;

        // 查找点击位置的机器
        const clickedMachine = machines.find(
            (m) => m.x <= pos.x && pos.x < m.x + 1 && m.y <= pos.y && pos.y < m.y + 1,
        );

        if (!clickedMachine || !clickedMachine.blueprintNodeId) {
            // 点击空地 → 取消选中
            useGameStore.setState({
                modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null },
            });
            return;
        }

        // 如果点击的是 viewing 自有机器，不选中
        if (clickedMachine.blueprintNodeId === currentViewingNodeId) {
            useGameStore.setState({
                modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null },
            });
            return;
        }

        // 找到包含此机器的直接子蓝图
        const childNodeId = findDirectChildContaining(
            clickedMachine.blueprintNodeId,
            viewing,
            blueprintRegistry,
        );

        useGameStore.setState({
            modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: childNodeId },
        });
    }, [getGridPos]);

    return { onClick };
}
