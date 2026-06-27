import type { Direction, PortConfig, PlacedMachine, MachineConfig } from '@/types';
import { isHorizontal } from '@/types';
import { MACHINES } from '@/config/machines';

/** 机器 ID → 配置的 O(1) 查找表 */
const machineMap = new Map(MACHINES.map(m => [m.id, m]));

// 启动时验证：硬编码引用的机器 ID 必须存在，否则立即炸，避免静默坏数据
const REQUIRED_IDS = [
  'lbr', 'pbr',  // 物流桥 / 管道桥 — connectionSlice + selectionSlice 桥生成
  'pco',         // 协议核心 — 默认蓝图起点
];
for (const id of REQUIRED_IDS) {
  if (!machineMap.has(id)) {
    throw new Error(`[machineUtils] 缺失必要机器配置: "${id}"，请检查 MACHINES 数组`);
  }
}

/** O(1) 查找机器配置 */
export const getMachineConfigById = (id: string): MachineConfig | undefined =>
    machineMap.get(id);

export const getRotatedDimensions = (width: number, height: number, rotation: Direction) => {
    if (isHorizontal(rotation)) { // 90° or 270°
        return { width: height, height: width };
    }
    return { width, height };
};

export const getRotatedPorts = (
    ports: PortConfig[],
    originalWidth: number,
    originalHeight: number,
    rotation: Direction
): PortConfig[] => {
    if (rotation === 0) return ports;

    return ports.map(p => {
        let x = p.x;
        let y = p.y;
        let side = p.side;

        for (let r = 0; r < rotation; r++) {
            const oldX = x;
            const oldY = y;
            const currentH = (r % 2 === 0) ? originalHeight : originalWidth;
            x = currentH - 1 - oldY;
            y = oldX;

            switch (side) {
                case 'top': side = 'right'; break;
                case 'right': side = 'bottom'; break;
                case 'bottom': side = 'left'; break;
                case 'left': side = 'top'; break;
            }
        }

        return { ...p, x, y, side };
    });
};

/** 建構供電範圍矩陣 (0=無供電, 1=有供電)，網格 size = gridW × gridH */
export const buildPowerGrid = (
    machines: PlacedMachine[],
    gridW: number,
    gridH: number,
    getConfig: (id: string) => MachineConfig | undefined
): Uint8Array => {
    const grid = new Uint8Array(gridW * gridH);

    for (const m of machines) {
        const cfg = getConfig(m.machineId);
        if (!cfg || cfg.supplyDistance <= 0) continue;

        const d = cfg.supplyDistance;
        const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);

        const x1 = Math.max(0, m.x - d);
        const y1 = Math.max(0, m.y - d);
        const x2 = Math.min(gridW, m.x + width + d);
        const y2 = Math.min(gridH, m.y + height + d);

        for (let y = y1; y < y2; y++) {
            const row = y * gridW;
            for (let x = x1; x < x2; x++) {
                grid[row + x] = 1;
            }
        }
    }

    return grid;
};

