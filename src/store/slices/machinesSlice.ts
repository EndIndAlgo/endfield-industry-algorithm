import type { StateCreator } from 'zustand';
import type { MachinesSlice, GameState } from './types';
import type { PlacedMachine, Direction } from '../../types';
import { GameMode } from '../../types';
import { MACHINES } from '../../config/machines';
import { checkCollision, buildConnectionGrid, getMachinePortCheckPositions } from '../../utils/gridUtils';
import { getRotatedDimensions } from '../../utils/machineUtils';

export const createMachinesSlice: StateCreator<GameState, [], [], MachinesSlice> = (set, get) => ({
    machines: [],
    mode: GameMode.BUILD,
    selectedMachineId: null,
    previewRotation: 0,
    movingMachineBackup: null,

    setMode: (mode) => set({ mode }),

    selectMachine: (machineId) => {
        const { movingMachineBackup } = get();
        if (movingMachineBackup) {
            set(state => ({
                machines: [...state.machines, movingMachineBackup],
                movingMachineBackup: null
            }));
        }
        set({ selectedMachineId: machineId, mode: GameMode.BUILD, previewRotation: 0 });
    },

    rotatePreview: () => set(state => ({ previewRotation: (state.previewRotation + 1) % 4 as Direction })),

    addMachine: (machineId, x, y, rotation) => {
        const config = MACHINES.find(m => m.id === machineId);
        if (!config) return;

        const { width, height } = getRotatedDimensions(config.width, config.height, rotation);
        const candidateRect = { x, y, width, height };
        const { machines, connections, gridWidth, gridHeight } = get();

        if (candidateRect.x < 0 || candidateRect.y < 0 ||
            candidateRect.x + candidateRect.width > gridWidth ||
            candidateRect.y + candidateRect.height > gridHeight) {
            return;
        }

        if (checkCollision(candidateRect, machines)) return;

        const connGrid = buildConnectionGrid(connections, gridWidth, gridHeight);
        for (let cy = y; cy < y + height; cy++) {
            for (let cx = x; cx < x + width; cx++) {
                if (cx >= 0 && cx < gridWidth && cy >= 0 && cy < gridHeight && connGrid[cy * gridWidth + cx]) {
                    return;
                }
            }
        }

        const { movingMachineBackup } = get();
        let finalId: string = crypto.randomUUID();
        if (movingMachineBackup) {
            finalId = movingMachineBackup.id;
        }

        const newMachine: PlacedMachine = { id: finalId, machineId, x, y, rotation };

        set(state => ({
            machines: [...state.machines, newMachine],
            movingMachineBackup: null
        }));
    },

    removeMachine: (instanceId) => {
        const machine = get().machines.find(m => m.id === instanceId);
        const portSet = new Set(
            (machine ? getMachinePortCheckPositions(machine) : []).map(p => `${p.x},${p.y}`)
        );
        set(state => ({
            machines: state.machines.filter(m => m.id !== instanceId),
            connections: state.connections.filter(c => {
                const first = c.path[0];
                const last = c.path[c.path.length - 1];
                return !portSet.has(`${first.x},${first.y}`) && !portSet.has(`${last.x},${last.y}`);
            })
        }));
    },

    pickupMachine: (instanceId) => {
        const { machines } = get();
        const machine = machines.find(m => m.id === instanceId);
        if (!machine) return;

        set(() => ({
            movingMachineBackup: machine,
            selectedMachineId: machine.machineId,
            previewRotation: machine.rotation,
            mode: GameMode.BUILD,
            machines: machines.filter(m => m.id !== instanceId),
        }));
    },

    cancelOperation: () => {
        const { isConnecting, movingMachineBackup, mode } = get();
        if (isConnecting) {
            get().cancelConnection();
            return;
        }
        // 连接模式（非连线中）→ 回到 BUILD
        if (mode === GameMode.CONVEYOR || mode === GameMode.PIPE) {
            set({ mode: GameMode.BUILD });
            return;
        }

        if (movingMachineBackup) {
            set(state => ({
                machines: [...state.machines, movingMachineBackup],
                movingMachineBackup: null,
                selectedMachineId: null,
                mode: GameMode.BUILD
            }));
        } else {
            set({ selectedMachineId: null });
        }

        const { movingMachinesSnapshot, movingConnectionsSnapshot } = get();
        if (mode === GameMode.DEVICE_SELECT) {
            set({ selectionStart: null, selectionEnd: null, selectedMachineIds: [], selectedConnectionIds: [], mode: GameMode.BUILD });
        }
        if (mode === GameMode.MOVE_SELECTION || mode === GameMode.BLUEPRINT_PLACE) {
            const { isCopying: wasCopying } = get();
            if (wasCopying) {
                set({
                    movingMachinesSnapshot: [],
                    movingConnectionsSnapshot: [],
                    moveAnchor: null,
                    mode: GameMode.DEVICE_SELECT,
                    isCopying: false
                });
            } else {
                set(state => ({
                    machines: [...state.machines, ...movingMachinesSnapshot],
                    connections: [...state.connections, ...movingConnectionsSnapshot],
                    movingMachinesSnapshot: [],
                    movingConnectionsSnapshot: [],
                    moveAnchor: null,
                    mode: GameMode.DEVICE_SELECT
                }));
            }
        }
    },
});
