import type { Point, PlacedMachine, Connection, Direction } from '@/types';
import type { GameState } from './slices/types';

/** 稳定的空数组引用，避免每次调用返回新 [] 导致 Zustand 误判状态变更 */
const EMPTY_ARRAY: never[] = [];

// ── 模式判别 ──

/** 是否在 BUILD 模式 */
export const selectIsBuildMode = (s: GameState) => s.modeState.kind === 'BUILD';

/** 是否在 WIRE 模式（Solid 或 Liquid） */
export const selectIsWireMode = (s: GameState) => s.modeState.kind === 'WIRE';

/** 是否在 DEVICE_SELECT 模式 */
export const selectIsDeviceSelectMode = (s: GameState) => s.modeState.kind === 'DEVICE_SELECT';

/** 是否在 MOVE_SELECTION 模式 */
export const selectIsMoveSelectionMode = (s: GameState) => s.modeState.kind === 'MOVE_SELECTION';

// ── BUILD 子状态 ──

/** BUILD 模式的 placing 字段（null=空闲，object=放置中/拾取中） */
export const selectPlacing = (s: GameState) =>
    s.modeState.kind === 'BUILD' ? s.modeState.placing : null;

/** 当前是否正在放置机器（含拾取中） */
export const selectIsPlacing = (s: GameState) =>
    s.modeState.kind === 'BUILD' && s.modeState.placing !== null;

/** 当前选中的机器 ID（仅在 BUILD placing 时有值） */
export const selectSelectedMachineId = (s: GameState) =>
    s.modeState.kind === 'BUILD' && s.modeState.placing
        ? s.modeState.placing.selectedMachineId
        : null;

/** 当前预览旋转（仅在 BUILD placing 时有值） */
export const selectPreviewRotation = (s: GameState): Direction =>
    s.modeState.kind === 'BUILD' && s.modeState.placing
        ? s.modeState.placing.previewRotation
        : 0;

/** 当前放置偏移（仅在 BUILD placing 时有值） */
export const selectBuildOffset = (s: GameState): Point | null =>
    s.modeState.kind === 'BUILD' && s.modeState.placing
        ? s.modeState.placing.buildOffset
        : null;

/** 当前是否在拾取机器（仅在 BUILD 模式 + placing 非 null + backup 非 null 时） */
export const selectIsPickup = (s: GameState) =>
    s.modeState.kind === 'BUILD' && s.modeState.placing !== null && s.modeState.placing.movingMachineBackup !== null;

// ── WIRE 子状态 ──

/** 是否在 WIRE Solid（传送带）模式 */
export const selectIsWireSolid = (s: GameState) =>
    s.modeState.kind === 'WIRE' && s.modeState.portType === 'Solid';

/** 是否在 WIRE Liquid（管道）模式 */
export const selectIsWireLiquid = (s: GameState) =>
    s.modeState.kind === 'WIRE' && s.modeState.portType === 'Liquid';

/** WIRE 模式的 portType（Solid/Liquid），非 WIRE 模式返回 null */
export const selectWirePortType = (s: GameState) =>
    s.modeState.kind === 'WIRE' ? s.modeState.portType : null;

/** 是否正在连线中 */
export const selectIsConnecting = (s: GameState) =>
    s.modeState.kind === 'WIRE' && s.modeState.connecting !== null;

/** WIRE 模式的 connecting 字段（null=空闲，object=连线中） */
export const selectConnecting = (s: GameState) =>
    s.modeState.kind === 'WIRE' ? s.modeState.connecting : null;

/** 当前可用端口列表 */
export const selectAvailablePorts = (s: GameState) =>
    s.modeState.kind === 'WIRE' && s.modeState.connecting
        ? s.modeState.connecting.availablePorts
        : EMPTY_ARRAY;

/** 当前 L 形策略 */
export const selectLShapeMode = (s: GameState) =>
    s.modeState.kind === 'WIRE' && s.modeState.connecting
        ? s.modeState.connecting.lShapeMode
        : 'auto';

/** 是否续接中 */
export const selectIsContinuing = (s: GameState) =>
    s.modeState.kind === 'WIRE' && s.modeState.connecting
        ? s.modeState.connecting.isContinuing
        : false;

// ── DEVICE_SELECT 子状态 ──

/** 框选起点 */
export const selectSelectionStart = (s: GameState) =>
    s.modeState.kind === 'DEVICE_SELECT' ? s.modeState.selectionStart : null;

/** 框选终点 */
export const selectSelectionEnd = (s: GameState) =>
    s.modeState.kind === 'DEVICE_SELECT' ? s.modeState.selectionEnd : null;

/** 已选中的机器 ID 列表 */
export const selectSelectedMachineIds = (s: GameState): string[] =>
    s.modeState.kind === 'DEVICE_SELECT' ? s.modeState.selectedMachineIds
    : s.modeState.kind === 'MOVE_SELECTION' ? s.modeState.originSelectedMachineIds
    : EMPTY_ARRAY;

/** 已选中的连线 ID 列表 */
export const selectSelectedConnectionIds = (s: GameState): string[] =>
    s.modeState.kind === 'DEVICE_SELECT' ? s.modeState.selectedConnectionIds
    : s.modeState.kind === 'MOVE_SELECTION' ? s.modeState.originSelectedConnectionIds
    : EMPTY_ARRAY;

/** 是否有选区（直接读 modeState 避免创建中间数组） */
export const selectHasSelection = (s: GameState): boolean => {
    if (s.modeState.kind === 'DEVICE_SELECT') {
        return s.modeState.selectedMachineIds.length > 0 || s.modeState.selectedConnectionIds.length > 0;
    }
    if (s.modeState.kind === 'MOVE_SELECTION') {
        return s.modeState.originSelectedMachineIds.length > 0 || s.modeState.originSelectedConnectionIds.length > 0;
    }
    return false;
};

// ── MOVE_SELECTION 子状态 ──

/** 移动锚点 */
export const selectMoveAnchor = (s: GameState): Point | null =>
    s.modeState.kind === 'MOVE_SELECTION' ? s.modeState.moveAnchor : null;

/** 移动中的机器快照 */
export const selectMovingMachinesSnapshot = (s: GameState): PlacedMachine[] =>
    s.modeState.kind === 'MOVE_SELECTION' ? s.modeState.movingMachinesSnapshot : EMPTY_ARRAY;

/** 移动中的连线快照 */
export const selectMovingConnectionsSnapshot = (s: GameState): Connection[] =>
    s.modeState.kind === 'MOVE_SELECTION' ? s.modeState.movingConnectionsSnapshot : EMPTY_ARRAY;

/** 是否复制模式（含蓝图插入） */
export const selectIsCopying = (s: GameState) =>
    s.modeState.kind === 'MOVE_SELECTION' && s.modeState.isCopying;
