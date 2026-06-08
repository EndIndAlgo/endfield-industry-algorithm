import type { Point, PlacedMachine, Connection, Direction, PortType } from '../../types';
import type { GameMode } from '../../types';

export interface HistorySnapshot {
    machines: PlacedMachine[];
    connections: Connection[];
}

export interface CanvasSlice {
    zoom: number;
    pan: Point;
    gridWidth: number;
    gridHeight: number;
    setZoom: (zoom: number) => void;
    setPan: (pan: Point) => void;
    setGridSize: (width: number, height: number) => void;
}

export interface MachinesSlice {
    machines: PlacedMachine[];
    mode: GameMode;
    selectedMachineId: string | null;
    previewRotation: Direction;
    movingMachineBackup: PlacedMachine | null;
    setMode: (mode: GameMode) => void;
    selectMachine: (machineId: string | null) => void;
    rotatePreview: () => void;
    addMachine: (machineId: string, x: number, y: number, rotation: Direction) => void;
    removeMachine: (instanceId: string) => void;
    pickupMachine: (instanceId: string) => void;
    cancelOperation: () => void;
}

export interface WiringSlice {
    connections: Connection[];
    isWiring: boolean;
    isWiringValid: boolean;
    wiringSource: { tailPos: Point; tailFacing: Direction; portType: PortType } | null;
    wiringPreviewPath: Point[];
    startWiring: (tailPos: Point, tailFacing: Direction, portType: PortType) => void;
    updateWiringPreview: (mouseGridPos: Point) => void;

    commitWiring: () => void;
    cancelWiring: () => void;
}

export interface SelectionSlice {
    selectionStart: Point | null;
    selectionEnd: Point | null;
    selectedMachineIds: string[];
    selectedConnectionIds: string[];
    moveAnchor: Point | null;
    movingMachinesSnapshot: PlacedMachine[];
    movingConnectionsSnapshot: Connection[];
    isCopying: boolean;
    setBoxSelection: (start: Point | null, end: Point | null) => void;
    commitBoxSelection: (isToggle?: boolean) => void;
    clearSelection: () => void;
    deleteSelected: () => void;
    startBatchMove: (anchor: Point) => void;
    startCopySelection: (anchor: Point) => void;
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
    startInsertBlueprint: (blueprint: { data: { machines: any[], connections: any[] } }) => void;
    startInsertBlueprintOnNewMap: (blueprint: { data: { machines: any[], connections: any[] } }) => void;
}

export interface GameState extends CanvasSlice, MachinesSlice, WiringSlice, SelectionSlice, HistorySlice, BlueprintSlice {}
