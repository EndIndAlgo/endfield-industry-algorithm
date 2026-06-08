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

export const GameMode = {
  BUILD: 'BUILD',
  WIRE: 'WIRE',
  DEVICE_SELECT: 'DEVICE_SELECT',
  MOVE_SELECTION: 'MOVE_SELECTION',
  BLUEPRINT_PLACE: 'BLUEPRINT_PLACE'
} as const;

export type GameMode = typeof GameMode[keyof typeof GameMode];
