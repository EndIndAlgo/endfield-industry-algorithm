import type { Point, PlacedMachine, Connection, Direction, PortType, ModeState, BlueprintRegistry } from '@/types';

export interface HistorySnapshot {
    machines: PlacedMachine[];
    connections: Connection[];
    /** 蓝图注册表（浅拷贝引用，undo/redo 时恢复） */
    blueprintRegistry?: BlueprintRegistry;
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
    setMode: (kind: 'BUILD' | 'WIRE_SOLID' | 'WIRE_LIQUID' | 'DEVICE_SELECT' | 'BLUEPRINT_SELECT') => void;
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
    blueprintRegistry: BlueprintRegistry;
    currentViewingNodeId: string | null;
    currentAncestorPath: string[];
    // 蓝图树操作
    createBlueprint: () => string;
    saveCurrentBlueprint: (name: string) => void;
    loadBlueprint: (nodeId: string) => void;
    startInsertChild: (nodeId: string) => void;
    commitInsert: (ox: number, oy: number) => void;
    commitMove: (nodeId: string, ox: number, oy: number) => void;
    removeChild: (nodeId: string) => void;
    navigateInto: (nodeId: string) => void;
    navigateToParent: () => void;
    syncStoreFromViewing: () => void;
    // 兼容旧接口
    loadGame: (machines: import('@/types').PlacedMachine[], connections: import('@/types').Connection[], gridWidth: number, gridHeight: number, blueprintId: string | null, blueprintName: string) => void;
    resetGame: () => void;
    setUiView: (view: 'list' | 'editor' | 'about' | 'settings') => void;
    /** @deprecated 使用 startInsertChild 替代 */
    startInsertBlueprint: (blueprint: { data: { machines: import('@/types').PlacedMachine[], connections: import('@/types').Connection[] } }) => void;
}

export interface GameState extends CanvasSlice, ModeSlice, MachinesSlice, ConnectionSlice, SelectionSlice, HistorySlice, BlueprintSlice {}
