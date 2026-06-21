import type { StateCreator } from 'zustand';
import type { BlueprintSlice, GameState } from './types';
import { getBoundingBox } from '@/utils/grid';

export const createBlueprintSlice: StateCreator<GameState, [], [], BlueprintSlice> = (set) => ({
    uiView: 'editor',
    blueprintListMode: 'manage',
    currentBlueprintId: null,
    currentBlueprintName: null,

    setUiView: (view) => set({ uiView: view }),
    setBlueprintListMode: (mode) => set({ blueprintListMode: mode }),

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

    startInsertBlueprintOnNewMap: (blueprint) => {
        const { machines, connections } = blueprint.data;
        if (machines.length === 0 && connections.length === 0) return;

        const bb = getBoundingBox(machines, connections);
        if (bb.width === 0 && bb.height === 0) return;

        const contentW = bb.width;
        const contentH = bb.height;
        const GRID_PRESETS = [24, 32, 40, 55, 70];
        const newSize = GRID_PRESETS.find(s => s >= Math.max(contentW, contentH) + 4) || 70;

        const anchor = { x: bb.minX, y: bb.minY };

        const newMachines = machines.map((m) => ({ ...m, id: crypto.randomUUID() }));
        const newConnections = connections.map((c) => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map((p) => ({ ...p }))
        }));

        set({
            machines: [],
            connections: [],
            gridWidth: newSize,
            gridHeight: newSize,
            modeState: {
                kind: 'MOVE_SELECTION',
                moveAnchor: anchor,
                movingMachinesSnapshot: newMachines,
                movingConnectionsSnapshot: newConnections,
                isCopying: true,
                originSelectedMachineIds: [],
                originSelectedConnectionIds: [],
            },
            uiView: 'editor',
            history: { past: [], future: [] }
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
