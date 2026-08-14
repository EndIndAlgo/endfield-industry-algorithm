import type { StateCreator } from 'zustand';
import type { HistorySlice, GameState, HistorySnapshot } from './types';
import { saveDoc } from '@/domain/persist';

export const createHistorySlice: StateCreator<GameState, [], [], HistorySlice> = (set, get) => ({
    history: {
        past: [],
        future: []
    },

    takeSnapshot: () => {
        const { machines, connections, history, doc } = get();
        const snapshot: HistorySnapshot = {
            machines,
            connections,
            doc,
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
        };

        set({
            machines: previous.machines,
            connections: previous.connections,
            doc: previous.doc,
            history: {
                past: newPast,
                future: [currentSnapshot, ...history.future]
            }
        });

        // doc 是唯一持久真相源：undo 恢复到旧 doc 后同步落盘
        saveDoc(previous.doc);
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
        };

        set({
            machines: next.machines,
            connections: next.connections,
            doc: next.doc,
            history: {
                past: [...history.past, currentSnapshot],
                future: newFuture
            }
        });

        saveDoc(next.doc);
    },
});
