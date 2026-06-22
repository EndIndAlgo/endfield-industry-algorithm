import type { Direction, PortConfig, PlacedMachine, MachineConfig } from '@/types';
import { MASK_REGULAR_MACHINE } from '@/types';
import { MACHINES } from '@/config/machines';

/** 机器 ID → 配置的 O(1) 查找表 */
const machineMap = new Map(MACHINES.map(m => [m.id, m]));

/** 从配置读取机器渲染掩码（全同模式返回原值，差异模式返回 max） */
export const getMachineMask = (machineId: string): number => {
    const cfg = machineMap.get(machineId);
    if (!cfg) return MASK_REGULAR_MACHINE;
    const m = cfg.mask;
    if (typeof m === 'number') return m;
    let max = 0;
    for (const row of m) for (const v of row) if (v > max) max = v;
    return max;
};

/** 从配置读取机器指定格的碰撞掩码 */
export const getMachineCellMask = (machineId: string, relX: number, relY: number): number => {
    const cfg = machineMap.get(machineId);
    if (!cfg) return 0;
    const m = cfg.mask;
    if (typeof m === 'number') return m;
    if (relY < 0 || relY >= m.length) return 0;
    const row = m[relY];
    if (relX < 0 || relX >= row.length) return 0;
    return row[relX];
};

export const getRotatedDimensions = (width: number, height: number, rotation: Direction) => {
    if (rotation % 2 === 1) { // 1 (90) or 3 (270)
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

