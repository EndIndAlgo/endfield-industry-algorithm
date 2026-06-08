import type { StateCreator } from 'zustand';
import type { CanvasSlice, GameState } from './types';

export const createCanvasSlice: StateCreator<GameState, [], [], CanvasSlice> = (set) => ({
    zoom: 1,
    pan: { x: 0, y: 0 },
    gridWidth: 24,
    gridHeight: 24,

    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    setGridSize: (width, height) => set({ gridWidth: width, gridHeight: height }),
});
