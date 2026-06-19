import type { Point, PlacedMachine, Connection, Direction, PortType } from '../../types';
import { sideToDir } from '../../types';
import { MACHINES } from '../../config/machines';
import { getRotatedDimensions, getRotatedPorts } from '../machineUtils';
import { getVectorFromSide, dirFromPoints } from './direction';

/**
 * 返回路径中所有拐弯点 (方向发生变化的格子)
 * entryDir: 进入 fullPath[0] 的方向, undefined 表示未知
 * exitDir:  离开 fullPath[last] 的方向, undefined 表示未知
 */
export const getCornerPoints = (
  fullPath: Point[],
  entryDir: Direction | undefined,
  exitDir: Direction | undefined
): Point[] => {
  const n = fullPath.length;
  if (n === 0) return [];

  if (n === 1) {
    if (entryDir !== undefined && exitDir !== undefined && entryDir !== exitDir) {
      return [fullPath[0]];
    }
    return [];
  }

  const corners: Point[] = [];
  // 首点
  if (entryDir !== undefined && entryDir !== dirFromPoints(fullPath[0], fullPath[1])) {
    corners.push(fullPath[0]);
  }
  // 中间点
  for (let i = 1; i < n - 1; i++) {
    if (dirFromPoints(fullPath[i - 1], fullPath[i]) !== dirFromPoints(fullPath[i], fullPath[i + 1])) {
      corners.push(fullPath[i]);
    }
  }
  // 尾点
  if (exitDir !== undefined && dirFromPoints(fullPath[n - 2], fullPath[n - 1]) !== exitDir) {
    corners.push(fullPath[n - 1]);
  }
  return corners;
};

/** 计算机器的端口连接点 (端口绝对坐标 + 方向向量, 即传送带端点位置) */
export const getMachinePortCheckPositions = (machine: PlacedMachine): Point[] => {
  const config = MACHINES.find(c => c.id === machine.machineId);
  if (!config) return [];
  const allPorts = [
    ...getRotatedPorts(config.inputs, config.width, config.height, machine.rotation),
    ...getRotatedPorts(config.outputs, config.width, config.height, machine.rotation)
  ];
  return allPorts.map(p => {
    const vec = getVectorFromSide(p.side);
    return { x: machine.x + p.x + vec.x, y: machine.y + p.y + vec.y };
  });
};

/** 在指定点分割连线，返回子连线数组 (0~2 个)，分割点不包含在子路径中 */
export const splitConnectionAt = (conn: Connection, point: Point): Connection[] => {
  const idx = conn.path.findIndex(p => p.x === point.x && p.y === point.y);
  if (idx === -1) return [conn];

  const parts: Connection[] = [];

  if (idx > 0) {
    const subPath = conn.path.slice(0, idx);
    const hf = dirFromPoints(conn.path[idx - 1], conn.path[idx]);
    parts.push({ ...conn, id: crypto.randomUUID(), path: subPath, headFacing: hf });
  }

  if (idx < conn.path.length - 1) {
    const subPath = conn.path.slice(idx + 1);
    const tf = dirFromPoints(conn.path[idx], conn.path[idx + 1]);
    parts.push({ ...conn, id: crypto.randomUUID(), path: subPath, tailFacing: tf });
  }

  return parts;
};

/** 返回机器所有匹配类型的输出端口外侧格及朝向 */
export const getPortOuterCells = (
  machine: PlacedMachine,
  portType?: PortType
): { pos: Point; facing: Direction }[] => {
  const config = MACHINES.find(c => c.id === machine.machineId);
  if (!config) return [];
  const outputs = getRotatedPorts(config.outputs, config.width, config.height, machine.rotation);
  return outputs
    .filter(p => !portType || p.type === portType)
    .map(p => {
      const vec = getVectorFromSide(p.side);
      return {
        pos: { x: machine.x + p.x + vec.x, y: machine.y + p.y + vec.y },
        facing: sideToDir[p.side]
      };
    });
};

/** 返回机器所有匹配类型的输入端口外侧格及 side */
export const getInputPortOuterCells = (
  machine: PlacedMachine,
  portType?: PortType
): { pos: Point; side: 'top' | 'right' | 'bottom' | 'left' }[] => {
  const config = MACHINES.find(c => c.id === machine.machineId);
  if (!config) return [];
  const inputs = getRotatedPorts(config.inputs, config.width, config.height, machine.rotation);
  return inputs
    .filter(p => !portType || p.type === portType)
    .map(p => {
      const vec = getVectorFromSide(p.side);
      return {
        pos: { x: machine.x + p.x + vec.x, y: machine.y + p.y + vec.y },
        side: p.side
      };
    });
};

/** 检查网格位置是否是某个机器的输出端口外侧格，返回端口信息 */
export const findPortOuterCellAt = (
  pos: Point,
  machines: PlacedMachine[],
  portType?: PortType
): { pos: Point; facing: Direction } | null => {
  for (const m of machines) {
    const cells = getPortOuterCells(m, portType);
    for (const cell of cells) {
      if (cell.pos.x === pos.x && cell.pos.y === pos.y) {
        return cell;
      }
    }
  }
  return null;
};

/** 从可用端口列表中选出离目标曼哈顿距离最近的一个 */
export const pickClosestPort = (
  availablePorts: { pos: Point; facing: Direction }[],
  target: Point
): { pos: Point; facing: Direction } => {
  let best = availablePorts[0];
  let bestDist = Math.abs(best.pos.x - target.x) + Math.abs(best.pos.y - target.y);
  for (let i = 1; i < availablePorts.length; i++) {
    const d = Math.abs(availablePorts[i].pos.x - target.x) + Math.abs(availablePorts[i].pos.y - target.y);
    if (d < bestDist) { bestDist = d; best = availablePorts[i]; }
  }
  return best;
};

/** 查找占据指定网格位置的机器 */
export const findMachineAt = (
  pos: Point,
  machines: PlacedMachine[]
): PlacedMachine | null => {
  for (const m of machines) {
    const config = MACHINES.find(c => c.id === m.machineId);
    if (!config) continue;
    const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
    if (pos.x >= m.x && pos.x < m.x + width && pos.y >= m.y && pos.y < m.y + height) {
      return m;
    }
  }
  return null;
};
