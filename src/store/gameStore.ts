import { create } from 'zustand';
import type { GameState } from './slices/types';
import { createCanvasSlice } from './slices/canvasSlice';
import { createMachinesSlice } from './slices/machinesSlice';
import { createWiringSlice } from './slices/wiringSlice';
import { createSelectionSlice } from './slices/selectionSlice';
import { createHistorySlice } from './slices/historySlice';
import { createBlueprintSlice } from './slices/blueprintSlice';

export const useGameStore = create<GameState>()((...a) => ({
    ...createCanvasSlice(...a),
    ...createMachinesSlice(...a),
    ...createWiringSlice(...a),
    ...createSelectionSlice(...a),
    ...createHistorySlice(...a),
    ...createBlueprintSlice(...a),
}));
