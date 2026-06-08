import type { StateCreator } from 'zustand';
import type { BlueprintSlice, GameState } from './types';
import { GameMode } from '../../types';
import { MACHINES } from '../../config/machines';
import { getRotatedDimensions } from '../../utils/machineUtils';

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

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        machines.forEach((m: any) => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (config) {
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + width);
                maxY = Math.max(maxY, m.y + height);
            }
        });

        connections.forEach((c: any) => {
            c.path.forEach((p: any) => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + 1);
                maxY = Math.max(maxY, p.y + 1);
            });
        });

        const anchor = { x: minX, y: minY };

        const newMachines = machines.map((m: any) => ({ ...m, id: crypto.randomUUID() }));
        const newConnections = connections.map((c: any) => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map((p: any) => ({ ...p }))
        }));

        set({
            mode: GameMode.BLUEPRINT_PLACE,
            moveAnchor: anchor,
            movingMachinesSnapshot: newMachines,
            movingConnectionsSnapshot: newConnections,
            isCopying: true,
            uiView: 'editor'
        });
    },

    startInsertBlueprintOnNewMap: (blueprint) => {
        const { machines, connections } = blueprint.data;
        if (machines.length === 0 && connections.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        machines.forEach((m: any) => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (config) {
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + width);
                maxY = Math.max(maxY, m.y + height);
            }
        });

        connections.forEach((c: any) => {
            c.path.forEach((p: any) => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + 1);
                maxY = Math.max(maxY, p.y + 1);
            });
        });

        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const GRID_PRESETS = [24, 32, 40, 55, 70];
        const newSize = GRID_PRESETS.find(s => s >= Math.max(contentW, contentH) + 4) || 70;

        const anchor = { x: minX, y: minY };

        const newMachines = machines.map((m: any) => ({ ...m, id: crypto.randomUUID() }));
        const newConnections = connections.map((c: any) => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map((p: any) => ({ ...p }))
        }));

        set({
            machines: [],
            connections: [],
            gridWidth: newSize,
            gridHeight: newSize,
            mode: GameMode.BLUEPRINT_PLACE,
            moveAnchor: anchor,
            movingMachinesSnapshot: newMachines,
            movingConnectionsSnapshot: newConnections,
            isCopying: true,
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
            mode: GameMode.BUILD,
            selectedMachineId: null,
            movingMachineBackup: null,
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
            mode: GameMode.BUILD,
            selectedMachineId: null,
            movingMachineBackup: null,
            history: { past: [], future: [] }
        });
    },
});
