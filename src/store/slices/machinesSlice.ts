import type { StateCreator } from 'zustand';
import type { MachinesSlice, GameState } from './types';
import type { PlacedMachine, Direction, Point } from '@/types';
import { MACHINES } from '@/config/machines';
import { checkPlacementCollision, getMachinePortCheckPositions } from '@/utils/grid';
import { getRotatedDimensions } from '@/utils/machineUtils';

export const createMachinesSlice: StateCreator<GameState, [], [], MachinesSlice> = (set, get) => ({
    machines: [],

    selectMachine: (machineId) => {
        const ms = get().modeState;

        // 如果正在拾取中（BUILD 模式，有 movingMachineBackup），先还原机器
        if (ms.kind === 'BUILD' && ms.placing?.movingMachineBackup) {
            set(state => ({
                machines: [...state.machines, ms.placing!.movingMachineBackup!],
            }));
        }

        if (!machineId) {
            set({ modeState: { kind: 'BUILD', placing: null } });
            return;
        }

        const config = MACHINES.find(c => c.id === machineId);
        if (!config) {
            set({ modeState: { kind: 'BUILD', placing: null } });
            return;
        }

        const { width, height } = getRotatedDimensions(config.width, config.height, 0);
        const buildOffset = { x: width / 2, y: height / 2 };

        set({
            modeState: {
                kind: 'BUILD',
                placing: {
                    selectedMachineId: machineId,
                    previewRotation: 0,
                    buildOffset,
                    movingMachineBackup: null,
                },
            },
        });
    },

    rotatePreview: () => {
        const ms = get().modeState;
        if (ms.kind !== 'BUILD' || !ms.placing) return;

        const newRotation = (ms.placing.previewRotation + 1) % 4 as Direction;
        // 旋转后重新计算中心偏移
        let buildOffset: Point;
        const config = MACHINES.find(c => c.id === ms.placing!.selectedMachineId);
        if (config) {
            const { width, height } = getRotatedDimensions(config.width, config.height, newRotation);
            buildOffset = { x: width / 2, y: height / 2 };
        } else {
            buildOffset = ms.placing.buildOffset;
        }

        set({
            modeState: {
                kind: 'BUILD',
                placing: { ...ms.placing, previewRotation: newRotation, buildOffset },
            },
        });
    },

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

        if (checkPlacementCollision(machineId, x, y, rotation, machines, connections, gridWidth, gridHeight)) return;

        const ms = get().modeState;
        let finalId: string = crypto.randomUUID();
        if (ms.kind === 'BUILD' && ms.placing?.movingMachineBackup) {
            finalId = ms.placing.movingMachineBackup.id;
        }

        const newMachine: PlacedMachine = { id: finalId, machineId, x, y, rotation };

        // 放置后保持 placing 状态（清空 movingMachineBackup），支持连续放置
        const newPlacing = ms.kind === 'BUILD' && ms.placing
            ? { ...ms.placing, movingMachineBackup: null }
            : null;

        set(state => ({
            machines: [...state.machines, newMachine],
            modeState: newPlacing
                ? { kind: 'BUILD' as const, placing: newPlacing }
                : { kind: 'BUILD' as const, placing: null },
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
        const { machines, hoverPosFrac } = get();
        const machine = machines.find(m => m.id === instanceId);
        if (!machine) return;

        // 记录拾取时鼠标在机器内的相对位置
        let offset: Point;
        if (hoverPosFrac) {
            offset = { x: hoverPosFrac.x - machine.x, y: hoverPosFrac.y - machine.y };
        } else {
            const config = MACHINES.find(c => c.id === machine.machineId);
            const { width, height } = config
                ? getRotatedDimensions(config.width, config.height, machine.rotation)
                : { width: 0, height: 0 };
            offset = { x: width / 2, y: height / 2 };
        }

        set({
            modeState: {
                kind: 'BUILD',
                placing: {
                    selectedMachineId: machine.machineId,
                    previewRotation: machine.rotation,
                    buildOffset: offset,
                    movingMachineBackup: machine,
                },
            },
            machines: machines.filter(m => m.id !== instanceId),
        });
    },
});
