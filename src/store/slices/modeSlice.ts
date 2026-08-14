import type { StateCreator } from 'zustand';
import type { ModeSlice, GameState } from './types';
import type { ModeState } from '@/types';
import { discardPendingInsertFork } from './blueprintSlice';

const defaultModeState: ModeState = { kind: 'BUILD', placing: null };

export const createModeSlice: StateCreator<GameState, [], [], ModeSlice> = (set, get) => ({
    modeState: defaultModeState,

    setMode: (kind) => {
        // 长按拾取中的机器先归还：setMode 覆盖 modeState 会丢弃 movingMachineBackup
        // （与 selectMachine 的还原守卫保持一致，避免工具栏切换模式导致机器消失）
        const ms = get().modeState;
        if (ms.kind === 'BUILD' && ms.placing?.movingMachineBackup) {
            set(state => ({
                machines: [...state.machines, ms.placing!.movingMachineBackup!],
            }));
        }
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
            case 'BLUEPRINT_SELECT':
                set({ modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null } });
                break;
        }
    },

    cancelOperation: () => {
        const ms = get().modeState;
        switch (ms.kind) {
            case 'BUILD':
                if (ms.placing) {
                    if (ms.placing.movingMachineBackup) {
                        set({
                            machines: [...get().machines, ms.placing.movingMachineBackup],
                            modeState: { kind: 'BUILD', placing: null },
                        });
                    } else {
                        set({ modeState: { kind: 'BUILD', placing: null } });
                    }
                }
                break;
            case 'WIRE':
                if (ms.connecting) {
                    get().cancelConnection();
                } else {
                    set({ modeState: { kind: 'BUILD', placing: null } });
                }
                break;
            case 'DEVICE_SELECT':
                set({ modeState: { kind: 'BUILD', placing: null } });
                break;
            case 'MOVE_SELECTION':
                if (ms.isCopying) {
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
            case 'BLUEPRINT_SELECT':
                set({ modeState: { kind: 'BUILD', placing: null } });
                break;
            case 'BLUEPRINT_MOVE':
                if (ms.isInserting) {
                    // 从列表导入 → 直接丢弃；引用自己产生的 fork 副本一并清理
                    discardPendingInsertFork(get, set, ms.childNodeId);
                    set({ modeState: { kind: 'BUILD', placing: null } });
                } else {
                    // 移动已有子蓝图 → 取消，回到 BLUEPRINT_SELECT
                    set({ modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: ms.childNodeId } });
                }
                break;
        }
    },
});
