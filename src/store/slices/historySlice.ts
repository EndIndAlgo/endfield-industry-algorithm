import type { StateCreator } from 'zustand';
import type { HistorySlice, GameState, HistorySnapshot } from './types';
import { saveDoc } from '@/domain/persist';
import { toaster } from '@/utils/toaster';

export const createHistorySlice: StateCreator<GameState, [], [], HistorySlice> = (set, get) => ({
    history: {
        past: [],
        future: []
    },

    takeSnapshot: (override) => {
        const { machines, connections, history, doc, gridWidth, gridHeight } = get();
        const snapshot: HistorySnapshot = {
            machines: override?.machines ?? machines,
            connections: override?.connections ?? connections,
            doc,
            gridWidth,
            gridHeight,
        };
        const maxHistory = 50;
        const past = [...history.past, snapshot];
        if (past.length > maxHistory) {
            past.splice(0, past.length - maxHistory);
        }

        set({
            history: {
                past,
                future: []
            }
        });
    },

    undo: () => {
        const { history, cancelOperation } = get();
        if (history.past.length === 0) return;

        cancelOperation();

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);

        const currentSnapshot: HistorySnapshot = {
            machines: get().machines,
            connections: get().connections,
            doc: get().doc,
            gridWidth: get().gridWidth,
            gridHeight: get().gridHeight,
        };

        set({
            machines: previous.machines,
            connections: previous.connections,
            doc: previous.doc,
            gridWidth: previous.gridWidth,
            gridHeight: previous.gridHeight,
            history: {
                past: newPast,
                future: [currentSnapshot, ...history.future]
            }
        });

        // doc 是唯一持久真相源：undo 恢复到旧 doc 后同步落盘；失败给用户可见提示
        if (!saveDoc(previous.doc)) {
            toaster.create({ title: '撤销后保存失败：本地存储不可用或已满', type: 'warning', duration: 4000 });
        }
    },

    redo: () => {
        const { history, cancelOperation } = get();
        if (history.future.length === 0) return;

        cancelOperation();

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        const currentSnapshot: HistorySnapshot = {
            machines: get().machines,
            connections: get().connections,
            doc: get().doc,
            gridWidth: get().gridWidth,
            gridHeight: get().gridHeight,
        };

        set({
            machines: next.machines,
            connections: next.connections,
            doc: next.doc,
            gridWidth: next.gridWidth,
            gridHeight: next.gridHeight,
            history: {
                past: [...history.past, currentSnapshot],
                future: newFuture
            }
        });

        if (!saveDoc(next.doc)) {
            toaster.create({ title: '重做后保存失败：本地存储不可用或已满', type: 'warning', duration: 4000 });
        }
    },
});
