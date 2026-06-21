import type { Point, PlacedMachine, Connection, Direction, PortType, ModeState } from '@/types';

export interface HistorySnapshot {
    machines: PlacedMachine[];
    connections: Connection[];
}

export interface CanvasSlice {
    zoom: number;
    pan: Point;
    gridWidth: number;
    gridHeight: number;
    hoverPosFrac: Point | null;
    setZoom: (zoom: number) => void;
    setPan: (pan: Point) => void;
    setGridSize: (width: number, height: number) => void;
    setHoverPosFrac: (pos: Point | null) => void;
}

export interface ModeSlice {
    modeState: ModeState;
    setMode: (kind: 'BUILD' | 'WIRE_SOLID' | 'WIRE_LIQUID' | 'DEVICE_SELECT') => void;
    cancelOperation: () => void;
}

export interface MachinesSlice {
    machines: PlacedMachine[];
    selectMachine: (machineId: string | null) => void;
    rotatePreview: () => void;
    addMachine: (machineId: string, x: number, y: number, rotation: Direction) => void;
    removeMachine: (instanceId: string) => void;
    pickupMachine: (instanceId: string) => void;
}

export interface ConnectionSlice {
    connections: Connection[];
    startConnecting: (ports: { pos: Point; facing: Direction }[], portType: PortType) => void;
    updatePreview: (mouseGridPos: Point) => void;
    toggleLShape: () => void;
    commitConnection: () => void;
    cancelConnection: () => void;
}

export interface SelectionSlice {
    setBoxSelection: (start: Point | null, end: Point | null) => void;
    commitBoxSelection: (isToggle?: boolean) => void;
    clearSelection: () => void;
    deleteSelected: () => void;
    startBatchMove: () => void;
    startCopySelection: () => void;
    commitBatchMove: (targetPos: Point) => void;
}

export interface HistorySlice {
    history: { past: HistorySnapshot[]; future: HistorySnapshot[] };
    undo: () => void;
    redo: () => void;
    takeSnapshot: () => void;
}

export interface BlueprintSlice {
    uiView: 'list' | 'editor' | 'about' | 'settings';
    blueprintListMode: 'manage' | 'insert';
    currentBlueprintId: string | null;
    currentBlueprintName: string | null;
    loadGame: (machines: PlacedMachine[], connections: Connection[], gridWidth: number, gridHeight: number, blueprintId: string | null, blueprintName: string) => void;
    setCurrentBlueprint: (id: string, name: string) => void;
    resetGame: () => void;
    setUiView: (view: 'list' | 'editor' | 'about' | 'settings') => void;
    setBlueprintListMode: (mode: 'manage' | 'insert') => void;
    startInsertBlueprint: (blueprint: { data: { machines: PlacedMachine[], connections: Connection[] } }) => void;
    startInsertBlueprintOnNewMap: (blueprint: { data: { machines: PlacedMachine[], connections: Connection[] } }) => void;
}

export interface GameState extends CanvasSlice, ModeSlice, MachinesSlice, ConnectionSlice, SelectionSlice, HistorySlice, BlueprintSlice {}
