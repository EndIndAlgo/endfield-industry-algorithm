import type { StateCreator } from 'zustand';
import type { CanvasSlice, GameState } from './types';
import { MACHINES } from '../../config/machines';
import { getRotatedDimensions } from '../../utils/machineUtils';
import { getMachinePortCheckPositions } from '../../utils/grid';

export const createCanvasSlice: StateCreator<GameState, [], [], CanvasSlice> = (set, get) => ({
    zoom: 1,
    pan: { x: 0, y: 0 },
    gridWidth: 24,
    gridHeight: 24,

    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    setGridSize: (width, height) => {
        const { machines, connections } = get();

        // 检测越界机器
        const outOfBoundsIds = new Set<string>();
        const validMachines = machines.filter(m => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (!config) return true;
            const { width: mw, height: mh } = getRotatedDimensions(config.width, config.height, m.rotation);
            if (m.x < 0 || m.y < 0 || m.x + mw > width || m.y + mh > height) {
                outOfBoundsIds.add(m.id);
                return false;
            }
            return true;
        });

        // 清除越界机器端口上的连线
        const removedPorts = new Set<string>();
        for (const m of machines) {
            if (!outOfBoundsIds.has(m.id)) continue;
            for (const pos of getMachinePortCheckPositions(m)) {
                removedPorts.add(`${pos.x},${pos.y}`);
            }
        }
        const validConnections = connections.filter(c => {
            if (removedPorts.has(`${c.path[0].x},${c.path[0].y}`)) return false;
            if (removedPorts.has(`${c.path[c.path.length - 1].x},${c.path[c.path.length - 1].y}`)) return false;
            return true;
        });

        set({
            gridWidth: width,
            gridHeight: height,
            machines: validMachines,
            connections: validConnections,
        });
    },
});
