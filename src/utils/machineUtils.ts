import type { Direction, PortConfig, PlacedMachine, MachineConfig } from '../types';

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

/** 檢查目標機器是否在供電範圍內 */
export const isMachinePowered = (
    target: PlacedMachine,
    allMachines: PlacedMachine[],
    getConfig: (id: string) => MachineConfig | undefined
): boolean => {
    const targetConfig = getConfig(target.machineId);
    if (!targetConfig || !targetConfig.power || targetConfig.power <= 0) {
        // 不需要電力
        return true;
    }

    // 找最大範圍以決定網格尺寸
    let maxX = target.x + targetConfig.width;
    let maxY = target.y + targetConfig.height;
    for (const m of allMachines) {
        const cfg = getConfig(m.machineId);
        if (!cfg) continue;
        const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
        maxX = Math.max(maxX, m.x + width + cfg.supplyDistance);
        maxY = Math.max(maxY, m.y + height + cfg.supplyDistance);
    }
    const gw = maxX + 10;
    const gh = maxY + 10;

    const powerGrid = buildPowerGrid(allMachines, gw, gh, getConfig);
    const { width, height } = getRotatedDimensions(targetConfig.width, targetConfig.height, target.rotation);

    for (let y = target.y; y < target.y + height; y++) {
        for (let x = target.x; x < target.x + width; x++) {
            if (powerGrid[y * gw + x]) return true;
        }
    }

    return false;
};
