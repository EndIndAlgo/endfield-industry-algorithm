import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point, GridPointerEvent, BlueprintRegistry, BlueprintSnapshot } from '@/types';

interface UseBlueprintSelectModeDeps {
  getGridPos: (e: GridPointerEvent) => Point;
}

function isInSubtree(nodeId: string, rootId: string, registry: BlueprintRegistry): boolean {
  const snapshot = registry[rootId];
  if (!snapshot) return false;
  for (const child of snapshot.children) {
    if (child.childNodeId === nodeId) return true;
    if (isInSubtree(nodeId, child.childNodeId, registry)) return true;
  }
  return false;
}

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
  const onClick = useCallback((e: GridPointerEvent) => {
    const s = useGameStore.getState();
    if (s.modeState.kind !== 'BLUEPRINT_SELECT') return;

    const pos = getGridPos(e);
    const { machines, blueprintRegistry, currentViewingNodeId } = s;
    if (!currentViewingNodeId) return;

    const viewing = blueprintRegistry[currentViewingNodeId];
    if (!viewing || viewing.children.length === 0) return;

    const clickedMachine = machines.find(
      (m) => m.x <= pos.x && pos.x < m.x + 1 && m.y <= pos.y && pos.y < m.y + 1,
    );

    if (!clickedMachine || !clickedMachine.blueprintNodeId) {
      useGameStore.setState({
        modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null },
      });
      return;
    }

    if (clickedMachine.blueprintNodeId === currentViewingNodeId) {
      useGameStore.setState({
        modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null },
      });
      return;
    }

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
