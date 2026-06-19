import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GameState } from './slices/types';
import { createCanvasSlice } from './slices/canvasSlice';
import { createMachinesSlice } from './slices/machinesSlice';
import { createConnectionSlice } from './slices/connectionSlice';
import { createSelectionSlice } from './slices/selectionSlice';
import { createHistorySlice } from './slices/historySlice';
import { createBlueprintSlice } from './slices/blueprintSlice';

export const useGameStore = create<GameState>()(devtools((...a) => ({
    ...createCanvasSlice(...a),
    ...createMachinesSlice(...a),
    ...createConnectionSlice(...a),
    ...createSelectionSlice(...a),
    ...createHistorySlice(...a),
    ...createBlueprintSlice(...a),
}), { name: 'EndfieldGame' }));
