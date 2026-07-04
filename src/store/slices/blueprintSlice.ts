import type { StateCreator } from 'zustand';
import type { BlueprintSlice, GameState } from './types';
import { getBoundingBox } from '@/utils/grid';

export const createBlueprintSlice: StateCreator<GameState, [], [], BlueprintSlice> = (set) => ({
    uiView: 'editor',
    currentBlueprintId: null,
    currentBlueprintName: null,

    setUiView: (view) => set({ uiView: view }),

    startInsertBlueprint: (blueprint) => {
        const { machines, connections } = blueprint.data;
        if (machines.length === 0 && connections.length === 0) return;

        const bb = getBoundingBox(machines, connections);
        if (bb.width === 0 && bb.height === 0) return;

        const anchor = { x: bb.minX, y: bb.minY };

        const newMachines = machines.map((m) => ({ ...m, id: crypto.randomUUID() }));
        const newConnections = connections.map((c) => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map((p) => ({ ...p }))
        }));

        set({
            modeState: {
                kind: 'MOVE_SELECTION',
                moveAnchor: anchor,
                movingMachinesSnapshot: newMachines,
                movingConnectionsSnapshot: newConnections,
                isCopying: true,
                originSelectedMachineIds: [],
                originSelectedConnectionIds: [],
            },
            uiView: 'editor'
        });
    },

    loadGame: (machines, connections, gridWidth, gridHeight, blueprintId, blueprintName) => {
        set({
            machines,
            connections,
            gridWidth,
            gridHeight,
            currentBlueprintId: blueprintId,
            currentBlueprintName: blueprintName,
            modeState: { kind: 'BUILD', placing: null },
            history: { past: [], future: [] }
        });
    },

    setCurrentBlueprint: (id, name) => set({ currentBlueprintId: id, currentBlueprintName: name }),

    resetGame: () => {
        set({
            machines: [],
            connections: [],
            currentBlueprintId: null,
            currentBlueprintName: null,
            modeState: { kind: 'BUILD', placing: null },
            history: { past: [], future: [] }
        });
    },
});
