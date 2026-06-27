import type { Mask } from '@/utils/mask';

export type MachineId = string;

export interface Point {
  x: number;
  y: number;
}

export interface Material {
  id: string;
  name: string;
  icon: number; // Represents the image number
}

export interface MachineConfig {
  id: string; // e.g., 'miner', 'furnace'
  name: string;
  power: number;
  width: number;
  height: number;
  // Ports relative to top-left (0,0) of the machine
  inputs: PortConfig[];
  outputs: PortConfig[];
  color: string;
  supplyDistance: number; // 从机器边缘向外延伸的格数 (0=不供电)
  mask: Mask; // 未旋转掩码（rot=0）
  /** 4 种旋转后的掩码 [rot0,rot1,rot2,rot3]，模块加载时由 machines.ts 填充 */
  mask4?: Mask[];
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

export type PortType = 'Solid' | 'Liquid' | 'Gas';

export interface PortConfig {
  x: number;
  y: number;
  side: Side;
  type: PortType;
  autoConnect: boolean; // 该端口是否自动贴附物流器
}

export type Direction = 0 | 1 | 2 | 3; // 0: Up, 1: Right, 2: Down, 3: Left (Clockwise)

/** Side → Direction 映射 */
export const sideToDir: Record<Side, Direction> = {
    top: 0,
    right: 1,
    bottom: 2,
    left: 3
};

export interface PlacedMachine {
  id: MachineId; // unique instance id (UUID)
  machineId: string; // refers to MachineConfig.id
  x: number;
  y: number;
  rotation: Direction; // Default 0
}

export interface Connection {
  id: string;
  tailFacing: Direction; // path[0] 處傳送帶的走向 (遠離來源機器輸出端口)
  path: Point[];
  headFacing: Direction; // path[last] 處傳送帶的走向 (朝向目標機器輸入端口)
  portType: PortType;
}

// ── 连线中的瞬态字段（WIRE variant 子状态）──
export interface ConnectingFields {
  availablePorts: { pos: Point; facing: Direction }[];
  activeStartPos: Point;
  activeTailFacing: Direction;
  previewPath: Point[];
  previewHeadFacing: Direction;
  isValidPath: boolean;
  lShapeMode: 'auto' | 'perpendicular' | 'same-dir';
  isContinuing: boolean;
  continueSourceId: string | null;
  previewTargetIsMachine: boolean;
}

// ── 模式判别联合 ──
export type ModeState =
  // BUILD：placing 判 null 区分 idle/placing/pickup
  | {
      kind: 'BUILD';
      placing: {
        selectedMachineId: string;
        previewRotation: Direction;
        /** 放置偏移：鼠标到机器原点的距离。工具栏选机 = 中心，拾取 = 鼠标在机器内的精确位置 */
        buildOffset: Point;
        /** null = 从工具栏选的，object = 从画布拾取的，撤销时需要还原 */
        movingMachineBackup: PlacedMachine | null;
      } | null;                                    // null=空闲
    }

  // WIRE：CONVEYOR+PIPE 合并，portType 区分物流类型，connecting null 区分子状态
  | {
      kind: 'WIRE';
      portType: 'Solid' | 'Liquid';             // Solid=传送带(E键), Liquid=管道(Q键)
      connecting: ConnectingFields | null;       // null=空闲, object=连线中
    }

  // DEVICE_SELECT：selectionStart/End 的 null 区分空闲/拖拽
  | {
      kind: 'DEVICE_SELECT';
      selectionStart: Point | null;             // null=空闲, object=拖拽中
      selectionEnd: Point | null;
      selectedMachineIds: string[];             // 框选结果（持久，供后续移动/复制/删除）
      selectedConnectionIds: string[];
    }

  // MOVE_SELECTION：M+Ctrl+C+蓝图插入合并，isCopying 区分来源
  | {
      kind: 'MOVE_SELECTION';
      moveAnchor: Point;
      movingMachinesSnapshot: PlacedMachine[];
      movingConnectionsSnapshot: Connection[];
      isCopying: boolean;                       // false=移动, true=复制/蓝图
      originSelectedMachineIds: string[];       // 取消移动时还原原选区
      originSelectedConnectionIds: string[];
    };

// ── 物流掩码 (按高度排列，值=渲染顺序) ──

/** Bit 1 — Solid 连线层 */
export const MASK_SOLID = 0b00000010;

/** Bit 2 — Liquid 连线层 (含 Solid 层) */
export const MASK_LIQUID = 0b00000100;

/** portType → 连线掩码 */
export const portTypeToMask: Record<PortType, number> = {
  Solid: MASK_SOLID,
  Liquid: MASK_LIQUID,
  Gas: 0x00,  // 预留
};

/** Solid 物流器: 机器实体位 | Solid 层 = 0b00000011 */
export const MASK_SOLID_LOGISTICS = 0b00000001 | MASK_SOLID;

/** Liquid 物流器: 机器实体位 | Solid 层 | Liquid 层 = 0b00000111 */
export const MASK_LIQUID_LOGISTICS = 0b00000001 | MASK_SOLID | MASK_LIQUID;

/** 普通机器: 阻挡一切 = 0b11111111 */
export const MASK_REGULAR_MACHINE = 0xFF;
