import React, { memo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { selectIsBlueprintSelectMode, selectSelectedChildNodeId } from '@/store/selectors';
import { GRID_SIZE } from '@/config/constants';

/** 渲染选中子蓝图的黄色虚线轮廓框 */
export const SubBlueprintOutline: React.FC = memo(() => {
    const isBlueprintSelect = useGameStore(selectIsBlueprintSelectMode);
    const selectedChildNodeId = useGameStore(selectSelectedChildNodeId);
    const blueprintRegistry = useGameStore((s) => s.blueprintRegistry);
    const currentViewingNodeId = useGameStore((s) => s.currentViewingNodeId);

    if (!isBlueprintSelect || !selectedChildNodeId || !currentViewingNodeId) return null;

    const viewing = blueprintRegistry[currentViewingNodeId];
    if (!viewing) return null;

    const childRef = viewing.children.find((c) => c.childNodeId === selectedChildNodeId);
    if (!childRef) return null;

    const childSnapshot = blueprintRegistry[childRef.childNodeId];
    if (!childSnapshot) return null;

    const maskW = childSnapshot.totalMask.width;
    const maskH = childSnapshot.totalMask.height;

    return (
        <div
            style={{
                position: 'absolute',
                left: childRef.x * GRID_SIZE,
                top: childRef.y * GRID_SIZE,
                width: maskW * GRID_SIZE,
                height: maskH * GRID_SIZE,
                border: '2px dashed #ffcc00',
                backgroundColor: 'rgba(255, 204, 0, 0.08)',
                pointerEvents: 'none',
                zIndex: 99,
            }}
        />
    );
});
