import type { StateCreator } from 'zustand';
import type { SelectionSlice, GameState } from './types';
import type { PlacedMachine, Connection } from '../../types';
import { GameMode } from '../../types';
import { MACHINES } from '../../config/machines';
import { checkCollision, getMachinePortCheckPositions, getBoundingBox, buildOccupancyGrid, getCornerPoints } from '../../utils/gridUtils';
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startBatchMove: (_anchor) => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const movingMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const movingConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        if (movingMachines.length === 0 && movingConnections.length === 0) return;

        const anchor = getBoundingBox(movingMachines, movingConnections);

        const remainingMachines = machines.filter(m => !selectedMachineIds.includes(m.id));
        const remainingConnections = connections.filter(c => !selectedConnectionIds.includes(c.id));

        set({
            mode: GameMode.MOVE_SELECTION,
            moveAnchor: { x: anchor.minX, y: anchor.minY },
            movingMachinesSnapshot: movingMachines,
            movingConnectionsSnapshot: movingConnections,
            machines: remainingMachines,
            connections: remainingConnections,
            selectedMachineIds: [],
            selectedConnectionIds: [],
            isCopying: false
        });
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startCopySelection: (_anchor) => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const sourceMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const sourceConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        if (sourceMachines.length === 0 && sourceConnections.length === 0) return;

        const anchor = getBoundingBox(sourceMachines, sourceConnections);

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
            moveAnchor: { x: anchor.minX, y: anchor.minY },
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

        // 连线路径碰撞检测（机器占用 + 异类型连线 + 同类型拐弯点）
        if (!collision) {
            const machineGrid = buildOccupancyGrid(machines, gridWidth, gridHeight);

            // 按 portType 分组构建已有连线占用网格
            const connGridByType = new Map<string, Uint8Array>();
            const allConnGrid = new Uint8Array(gridWidth * gridHeight);
            for (const c of connections) {
                let g = connGridByType.get(c.portType);
                if (!g) { g = new Uint8Array(gridWidth * gridHeight); connGridByType.set(c.portType, g); }
                for (const p of c.path) {
                    if (p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight) {
                        g[p.y * gridWidth + p.x] = 1;
                        allConnGrid[p.y * gridWidth + p.x] = 1;
                    }
                }
            }

            // 标记已有连线的拐弯点（同类型也不可重叠）
            const cornerGrid = new Uint8Array(gridWidth * gridHeight);
            for (const c of connections) {
                for (const cp of getCornerPoints(c.path, c.tailFacing, c.headFacing)) {
                    if (cp.x >= 0 && cp.x < gridWidth && cp.y >= 0 && cp.y < gridHeight) {
                        cornerGrid[cp.y * gridWidth + cp.x] = 1;
                    }
                }
            }

            const placedConns = movingConnectionsSnapshot.map(c => ({
                ...c,
                path: c.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
            }));

            connCheck: for (const conn of placedConns) {
                const sameTypeGrid = connGridByType.get(conn.portType);
                for (const p of conn.path) {
                    const idx = p.y * gridWidth + p.x;
                    if (p.x < 0 || p.y < 0 || p.x >= gridWidth || p.y >= gridHeight) { collision = true; break connCheck; }
                    if (machineGrid[idx]) { collision = true; break connCheck; }
                    if (allConnGrid[idx] && !(sameTypeGrid?.[idx])) { collision = true; break connCheck; }
                    if (sameTypeGrid?.[idx] && cornerGrid[idx]) { collision = true; break connCheck; }
                }
                // 移动连线自身的拐弯点也不能落在已有同类型连线上
                for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
                    if (cp.x >= 0 && cp.x < gridWidth && cp.y >= 0 && cp.y < gridHeight) {
                        if (sameTypeGrid?.[cp.y * gridWidth + cp.x]) { collision = true; break connCheck; }
                    }
                }
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
