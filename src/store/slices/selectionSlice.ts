import type { StateCreator } from 'zustand';
import type { SelectionSlice, GameState } from './types';
import type { PlacedMachine, Connection } from '../../types';
import { GameMode } from '../../types';
import { MACHINES } from '../../config/machines';
import { checkCollision, getMachinePortCheckPositions } from '../../utils/gridUtils';
import { getRotatedDimensions } from '../../utils/machineUtils';

export const createSelectionSlice: StateCreator<GameState, [], [], SelectionSlice> = (set, get) => ({
    selectionStart: null,
    selectionEnd: null,
    selectedMachineIds: [],
    selectedConnectionIds: [],
    moveAnchor: null,
    movingMachinesSnapshot: [],
    movingConnectionsSnapshot: [],
    isCopying: false,

    setBoxSelection: (start, end) => set({ selectionStart: start, selectionEnd: end }),

    commitBoxSelection: (isToggle = false) => {
        const { selectionStart, selectionEnd, machines, connections, selectedMachineIds: prevMachineIds, selectedConnectionIds: prevConnectionIds } = get();
        if (!selectionStart || !selectionEnd) return;

        const x1 = Math.min(selectionStart.x, selectionEnd.x);
        const y1 = Math.min(selectionStart.y, selectionEnd.y);
        const x2 = Math.max(selectionStart.x, selectionEnd.x);
        const y2 = Math.max(selectionStart.y, selectionEnd.y);

        const machineIdsInBox = machines.filter(m => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (!config) return false;
            const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
            const mx1 = m.x;
            const my1 = m.y;
            const mx2 = m.x + width;
            const my2 = m.y + height;
            return !(x2 < mx1 || x1 >= mx2 || y2 < my1 || y1 >= my2);
        }).map(m => m.id);

        const connectionIdsInBox = connections.filter(c => {
            return c.path.some(p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
        }).map(c => c.id);

        let finalMachineIds: string[];
        let finalConnectionIds: string[];

        if (isToggle) {
            const boxSet = new Set(machineIdsInBox);
            finalMachineIds = prevMachineIds.filter(id => !boxSet.has(id));
            const boxConnSet = new Set(connectionIdsInBox);
            finalConnectionIds = prevConnectionIds.filter(id => !boxConnSet.has(id));
        } else {
            const unionMachines = new Set([...prevMachineIds, ...machineIdsInBox]);
            finalMachineIds = [...unionMachines];
            const unionConns = new Set([...prevConnectionIds, ...connectionIdsInBox]);
            finalConnectionIds = [...unionConns];
        }

        set({
            selectedMachineIds: finalMachineIds,
            selectedConnectionIds: finalConnectionIds,
            selectionStart: null,
            selectionEnd: null
        });
    },

    clearSelection: () => set({ selectedMachineIds: [], selectedConnectionIds: [] }),

    deleteSelected: () => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const machinesToRemove = new Set(selectedMachineIds);
        const connectionsToRemove = new Set(selectedConnectionIds);

        const deletedPortPositions = new Set<string>();
        for (const m of machines) {
            if (!machinesToRemove.has(m.id)) continue;
            const positions = getMachinePortCheckPositions(m);
            for (const pos of positions) {
                deletedPortPositions.add(`${pos.x},${pos.y}`);
            }
        }

        for (const c of connections) {
            const first = c.path[0];
            const last = c.path[c.path.length - 1];
            if (deletedPortPositions.has(`${first.x},${first.y}`) ||
                deletedPortPositions.has(`${last.x},${last.y}`)) {
                connectionsToRemove.add(c.id);
            }
        }

        const newMachines = machines.filter(m => !machinesToRemove.has(m.id));
        const newConnections = connections.filter(c => !connectionsToRemove.has(c.id));

        set({
            machines: newMachines,
            connections: newConnections,
            selectedMachineIds: [],
            selectedConnectionIds: []
        });
    },

    startBatchMove: (_anchor) => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const movingMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const movingConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        if (movingMachines.length === 0 && movingConnections.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        movingMachines.forEach(m => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (config) {
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + width);
                maxY = Math.max(maxY, m.y + height);
            }
        });

        movingConnections.forEach(c => {
            c.path.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + 1);
                maxY = Math.max(maxY, p.y + 1);
            });
        });

        const anchor = { x: minX, y: minY };

        const remainingMachines = machines.filter(m => !selectedMachineIds.includes(m.id));
        const remainingConnections = connections.filter(c => !selectedConnectionIds.includes(c.id));

        set({
            mode: GameMode.MOVE_SELECTION,
            moveAnchor: anchor,
            movingMachinesSnapshot: movingMachines,
            movingConnectionsSnapshot: movingConnections,
            machines: remainingMachines,
            connections: remainingConnections,
            selectedMachineIds: [],
            selectedConnectionIds: [],
            isCopying: false
        });
    },

    startCopySelection: (_anchor) => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const sourceMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const sourceConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        if (sourceMachines.length === 0 && sourceConnections.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        sourceMachines.forEach(m => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (config) {
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + width);
                maxY = Math.max(maxY, m.y + height);
            }
        });

        sourceConnections.forEach(c => {
            c.path.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + 1);
                maxY = Math.max(maxY, p.y + 1);
            });
        });

        const anchor = { x: minX, y: minY };

        const idMap: Record<string, string> = {};

        const newMachines: PlacedMachine[] = sourceMachines.map(m => {
            const newId = crypto.randomUUID();
            idMap[m.id] = newId;
            return { ...m, id: newId };
        });

        const newConnections: Connection[] = sourceConnections.map(c => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map(p => ({ ...p }))
        }));

        set({
            mode: GameMode.MOVE_SELECTION,
            moveAnchor: anchor,
            movingMachinesSnapshot: newMachines,
            movingConnectionsSnapshot: newConnections,
            selectedMachineIds: [],
            selectedConnectionIds: [],
            isCopying: true
        });
    },

    commitBatchMove: (targetPos) => {
        const { moveAnchor, movingMachinesSnapshot, movingConnectionsSnapshot, machines, gridWidth, gridHeight, connections } = get();
        if (!moveAnchor) return;

        const offsetX = targetPos.x - moveAnchor.x;
        const offsetY = targetPos.y - moveAnchor.y;

        let collision = false;

        const placedMachines = movingMachinesSnapshot.map(m => ({
            ...m,
            x: m.x + offsetX,
            y: m.y + offsetY
        }));

        for (const m of placedMachines) {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (!config) continue;
            const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
            const rect = { x: m.x, y: m.y, width, height };

            if (rect.x < 0 || rect.y < 0 || rect.x + width > gridWidth || rect.y + height > gridHeight) {
                collision = true;
                break;
            }

            if (checkCollision(rect, machines)) {
                collision = true;
                break;
            }
        }

        if (collision) return;

        const placedConnections = movingConnectionsSnapshot.map(c => ({
            ...c,
            path: c.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
        }));

        get().takeSnapshot();

        set({
            machines: [...machines, ...placedMachines],
            connections: [...connections, ...placedConnections],
            movingMachinesSnapshot: [],
            movingConnectionsSnapshot: [],
            moveAnchor: null,
            mode: GameMode.BUILD,
            selectedMachineIds: placedMachines.map(m => m.id),
            selectedConnectionIds: placedConnections.map(c => c.id),
            isCopying: false
        });
    },
});
