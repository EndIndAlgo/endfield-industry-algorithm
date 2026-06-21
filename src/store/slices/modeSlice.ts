import type { StateCreator } from 'zustand';
import type { ModeSlice, GameState } from './types';
import type { ModeState } from '@/types';

const defaultModeState: ModeState = { kind: 'BUILD', placing: null };

export const createModeSlice: StateCreator<GameState, [], [], ModeSlice> = (set, get) => ({
    modeState: defaultModeState,

    setMode: (kind) => {
        switch (kind) {
            case 'BUILD':
                set({ modeState: { kind: 'BUILD', placing: null } });
                break;
            case 'WIRE_SOLID':
                set({ modeState: { kind: 'WIRE', portType: 'Solid', connecting: null } });
                break;
            case 'WIRE_LIQUID':
                set({ modeState: { kind: 'WIRE', portType: 'Liquid', connecting: null } });
                break;
            case 'DEVICE_SELECT':
                set({ modeState: { kind: 'DEVICE_SELECT', selectionStart: null, selectionEnd: null, selectedMachineIds: [], selectedConnectionIds: [] } });
                break;
        }
    },

    cancelOperation: () => {
        const ms = get().modeState;
        switch (ms.kind) {
            case 'BUILD':
                if (ms.placing) {
                    if (ms.placing.movingMachineBackup) {
                        // 拾取中 → 还原机器到 machines[]，回到空闲
                        set({
                            machines: [...get().machines, ms.placing.movingMachineBackup],
                            modeState: { kind: 'BUILD', placing: null },
                        });
                    } else {
                        // 放置中 → 清空选机，回到空闲
                        set({ modeState: { kind: 'BUILD', placing: null } });
                    }
                }
                // 空闲 → 无事发生
                break;
            case 'WIRE':
                if (ms.connecting) {
                    get().cancelConnection(); // → WIRE(空闲)
                } else {
                    set({ modeState: { kind: 'BUILD', placing: null } }); // → BUILD
                }
                break;
            case 'DEVICE_SELECT':
                set({ modeState: { kind: 'BUILD', placing: null } });
                break;
            case 'MOVE_SELECTION':
                if (ms.isCopying) {
                    // 复制/蓝图 → 直接丢弃
                    set({
                        modeState: {
                            kind: 'DEVICE_SELECT',
                            selectionStart: null,
                            selectionEnd: null,
                            selectedMachineIds: [],
                            selectedConnectionIds: [],
                        },
                    });
                } else {
                    // 移动 → 还原快照 + 原选区
                    // 注意：startBatchMove 只移除了选中的机器/连线，未选中的仍在 store 中，
                    // 所以必须追加而非覆盖。
                    set({
                        machines: [...get().machines, ...ms.movingMachinesSnapshot],
                        connections: [...get().connections, ...ms.movingConnectionsSnapshot],
                        modeState: {
                            kind: 'DEVICE_SELECT',
                            selectionStart: null,
                            selectionEnd: null,
                            selectedMachineIds: ms.originSelectedMachineIds,
                            selectedConnectionIds: ms.originSelectedConnectionIds,
                        },
                    });
                }
                break;
        }
    },
});
