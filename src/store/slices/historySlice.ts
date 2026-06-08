import type { StateCreator } from 'zustand';
import type { HistorySlice, GameState, HistorySnapshot } from './types';

export const createHistorySlice: StateCreator<GameState, [], [], HistorySlice> = (set, get) => ({
    history: {
        past: [],
        future: []
    },

    takeSnapshot: () => {
        const { machines, connections, history } = get();
        const snapshot: HistorySnapshot = { machines, connections };

        set({
            history: {
                past: [...history.past, snapshot],
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
            connections: get().connections
        };

        set({
            machines: previous.machines,
            connections: previous.connections,
            history: {
                past: newPast,
                future: [currentSnapshot, ...history.future]
            }
        });
    },

    redo: () => {
        const { history, cancelOperation } = get();
        if (history.future.length === 0) return;

        cancelOperation();

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        const currentSnapshot: HistorySnapshot = {
            machines: get().machines,
            connections: get().connections
        };

        set({
            machines: next.machines,
            connections: next.connections,
            history: {
                past: [...history.past, currentSnapshot],
                future: newFuture
            }
        });
    },
});
