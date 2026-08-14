import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point, GridPointerEvent } from '@/types';
import type { FactoryDoc, CommittedNode } from '@/domain/doc';

function isInSubtree(
  nodeId: string,
  rootId: string,
  doc: FactoryDoc,
  _visited: Set<string> = new Set(),
): boolean {
  // 环防护：异常数据下防止无限递归
  if (_visited.has(rootId)) return false;
  _visited.add(rootId);

  const snapshot = doc.nodes[rootId];
  if (!snapshot) return false;
  for (const child of snapshot.children) {
    if (child.childNodeId === nodeId) return true;
    if (isInSubtree(nodeId, child.childNodeId, doc, _visited)) return true;
  }
  return false;
}

function findDirectChildContaining(
  nodeId: string,
  viewing: CommittedNode,
  doc: FactoryDoc,
): string | null {
  for (const child of viewing.children) {
    if (child.childNodeId === nodeId || isInSubtree(nodeId, child.childNodeId, doc)) {
      return child.childNodeId;
    }
  }
  return null;
}

export function useBlueprintSelectMode({ getGridPos }: { getGridPos: (e: GridPointerEvent) => Point }) {
  const onClick = useCallback((e: GridPointerEvent) => {
    const s = useGameStore.getState();
    if (s.modeState.kind !== 'BLUEPRINT_SELECT') return;

    const pos = getGridPos(e);
    const { machines, doc, currentViewingNodeId } = s;
    if (!currentViewingNodeId) return;

    const viewing = doc.nodes[currentViewingNodeId];
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
      doc,
    );

    useGameStore.setState({
      modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: childNodeId },
    });
  }, [getGridPos]);

  return { onClick };
}
