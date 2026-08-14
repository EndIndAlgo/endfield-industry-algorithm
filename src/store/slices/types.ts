import type { Point, PlacedMachine, Connection, Direction, PortType, ModeState } from '@/types';
import type { FactoryDoc } from '@/domain/doc';

export interface HistorySnapshot {
    machines: PlacedMachine[];
    connections: Connection[];
    /** 已提交文档（不可变更新，快照保留旧引用，结构共享零拷贝） */
    doc: FactoryDoc;
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
    /** 已提交真相源（唯一持久化对象） */
    doc: FactoryDoc;
    currentViewingNodeId: string | null;
    currentAncestorPath: string[];
    // 蓝图树操作（检出式：编辑在 store 工作视图，保存/导航才与 doc 交互）
    createBlueprint: () => string;
    saveCurrentBlueprint: (name: string) => void;
    loadBlueprint: (nodeId: string) => void;
    startInsertChild: (nodeId: string) => void;
    /** 展平复制：把目标蓝图（含后代）展平为普通机器/连线，跟随鼠标放置 */
    startFlattenCopy: (nodeId: string) => void;
    commitInsert: (ox: number, oy: number) => void;
    commitMove: (nodeId: string, ox: number, oy: number) => void;
    removeChild: (nodeId: string) => void;
    deleteBlueprint: (nodeId: string) => void;
    navigateInto: (nodeId: string) => void;
    navigateToParent: () => void;
    syncStoreFromViewing: () => void;
    /** 当前工作视图与已提交内容是否不一致（离开前确认用） */
    isCheckoutDirty: () => boolean;
    // 兼容旧接口
    loadGame: (machines: import('@/types').PlacedMachine[], connections: import('@/types').Connection[], gridWidth: number, gridHeight: number, blueprintId: string | null, blueprintName: string) => void;
    resetGame: () => void;
    setUiView: (view: 'list' | 'editor' | 'about' | 'settings') => void;
}

export interface GameState extends CanvasSlice, ModeSlice, MachinesSlice, ConnectionSlice, SelectionSlice, HistorySlice, BlueprintSlice {}
