import type { Point, PlacedMachine, Connection, Direction, PortType } from '@/types';
import type { GameMode } from '@/types';

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
    pickupOffset: Point | null;
    hoverPosFrac: Point | null;
    setHoverPosFrac: (pos: Point | null) => void;
    setMode: (mode: GameMode) => void;
    selectMachine: (machineId: string | null) => void;
    rotatePreview: () => void;
    addMachine: (machineId: string, x: number, y: number, rotation: Direction) => void;
    removeMachine: (instanceId: string) => void;
    pickupMachine: (instanceId: string) => void;
    cancelOperation: () => void;
}

export interface ConnectionSlice {
    connections: Connection[];
    isConnecting: boolean;
    isValidPath: boolean;
    // 连线源：可用端口列表（点击机器=全部匹配输出端口，点击端口外侧=仅该端口，延续=单元素）
    availablePorts: { pos: Point; facing: Direction }[];
    portType: PortType;
    // 当前帧计算结果
    activeStartPos: Point;
    activeTailFacing: Direction;
    previewPath: Point[];
    previewHeadFacing: Direction;
    // L 形策略
    lShapeMode: 'auto' | 'perpendicular' | 'same-dir';
    // 续接标记（自动续接或其他触发方式）
    isContinuing: boolean;
    continueSourceId: string | null;
    // 当前预览目标是否为机器（用于判断是否续接）
    previewTargetIsMachine: boolean;
    // Actions
    startConnecting: (ports: { pos: Point; facing: Direction }[], portType: PortType) => void;
    updatePreview: (mouseGridPos: Point) => void;
    toggleLShape: () => void;
    commitConnection: () => void;
    cancelConnection: () => void;
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

export interface GameState extends CanvasSlice, MachinesSlice, ConnectionSlice, SelectionSlice, HistorySlice, BlueprintSlice {}
