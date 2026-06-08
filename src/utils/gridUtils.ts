import type { Point, PlacedMachine, Connection, Direction, PortType } from '../types';
import { sideToDir } from '../types';
import { MACHINES } from '../config/machines';
import { getRotatedDimensions, getRotatedPorts } from './machineUtils';

export const getMachineRect = (machine: PlacedMachine) => {
    const config = MACHINES.find(m => m.id === machine.machineId);
    if (!config) return null;
    const { width, height } = getRotatedDimensions(config.width, config.height, machine.rotation);
    return {
        x: machine.x,
        y: machine.y,
        w: width,
        h: height
    };
};

export const isOverlapping = (
    rectA: { x: number; y: number; w: number; h: number },
    rectB: { x: number; y: number; w: number; h: number }
): boolean => {
    return (
        rectA.x < rectB.x + rectB.w &&
        rectA.x + rectA.w > rectB.x &&
        rectA.y < rectB.y + rectB.h &&
        rectA.y + rectA.h > rectB.y
    );
};

/** 建構機器佔用矩陣 (0=空, 1=被機器佔用), size = gridW × gridH */
export const buildOccupancyGrid = (
    machines: PlacedMachine[],
    gridW: number,
    gridH: number
): Uint8Array => {
    const grid = new Uint8Array(gridW * gridH);
    for (const m of machines) {
        const config = MACHINES.find(c => c.id === m.machineId);
        if (!config) continue;
        const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
        const mx2 = Math.min(m.x + width, gridW);
        const my2 = Math.min(m.y + height, gridH);
        for (let y = Math.max(m.y, 0); y < my2; y++) {
            const row = y * gridW;
            for (let x = Math.max(m.x, 0); x < mx2; x++) {
                grid[row + x] = 1;
            }
        }
    }
    return grid;
};

/** 建構連線佔用矩陣 (0=空, 1=被連線佔用), 可選按 portType 過濾 */
export const buildConnectionGrid = (
    connections: Connection[],
    gridW: number,
    gridH: number,
    portType?: PortType
): Uint8Array => {
    const grid = new Uint8Array(gridW * gridH);
    for (const c of connections) {
        if (portType && c.portType !== portType) continue;
        for (const p of c.path) {
            if (p.x >= 0 && p.x < gridW && p.y >= 0 && p.y < gridH) {
                grid[p.y * gridW + p.x] = 1;
            }
        }
    }
    return grid;
};

export const checkCollision = (
    candidate: { x: number; y: number; width: number; height: number },
    machines: PlacedMachine[]
): boolean => {
    const candidateRect = { x: candidate.x, y: candidate.y, w: candidate.width, h: candidate.height };
    for (const m of machines) {
        const r = getMachineRect(m);
        if (r && isOverlapping(candidateRect, r)) {
            return true;
        }
    }
    return false;
};

// 方向 → 單位向量
export const getVectorFromSide = (side: 'top' | 'right' | 'bottom' | 'left'): Point => {
    switch (side) {
        case 'top': return { x: 0, y: -1 };
        case 'right': return { x: 1, y: 0 };
        case 'bottom': return { x: 0, y: 1 };
        case 'left': return { x: -1, y: 0 };
    }
};

/** 8 分區曼哈頓路由: L 形直角折線，遇障礙自動換另一條路 */
const routeManhattan = (
    start: Point,
    end: Point,
    grid: Uint8Array,
    gridW: number,
    _gridH: number
): Point[] | null => {
    const tryRoute = (horizontalFirst: boolean): Point[] | null => {
        const path: Point[] = [];
        let cx = start.x;
        let cy = start.y;

        const axes: ('x' | 'y')[] = horizontalFirst ? ['x', 'y'] : ['y', 'x'];

        for (const axis of axes) {
            const tx = axis === 'x' ? end.x : cx;
            const ty = axis === 'y' ? end.y : cy;
            const sx = Math.sign(tx - cx);
            const sy = Math.sign(ty - cy);

            while (cx !== tx || cy !== ty) {
                cx += sx;
                cy += sy;
                if (grid[cy * gridW + cx]) {
                    return null;
                }
                path.push({ x: cx, y: cy });
            }
        }

        return path;
    };

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // 主軸優先: |dx| >= |dy| → 水平先; 否則垂直先
    const horizontalDominant = Math.abs(dx) >= Math.abs(dy);

    return tryRoute(horizontalDominant) ?? tryRoute(!horizontalDominant) ?? null;
};

/** 尋找從 start 到 end 的佈線路徑 (8 分區 L 形路由, 含機器+連線碰撞檢測) */
export const findPath = (
    start: Point,
    end: Point,
    machines: PlacedMachine[],
    entryDir?: Direction,
    endSide?: 'top' | 'right' | 'bottom' | 'left',
    gridW?: number,
    gridH?: number,
    connections?: Connection[],
    portType?: PortType
): Point[] | null => {
    // 端口向外偏移 (endSide)
    const realStart = { ...start };
    let realEnd = { ...end };
    if (endSide) {
        const v = getVectorFromSide(endSide);
        realEnd = { x: end.x + v.x, y: end.y + v.y };
    }

    // 計算網格範圍
    const conns = connections ?? [];
    const gw = gridW ?? Math.max(
        ...machines.map(m => {
            const cfg = MACHINES.find(c => c.id === m.machineId);
            if (!cfg) return 0;
            const { width } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
            return m.x + width;
        }),
        realStart.x + 2,
        realEnd.x + 2,
        50
    ) + 10;
    const gh = gridH ?? Math.max(
        ...machines.map(m => {
            const cfg = MACHINES.find(c => c.id === m.machineId);
            if (!cfg) return 0;
            const { height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
            return m.y + height;
        }),
        realStart.y + 2,
        realEnd.y + 2,
        50
    ) + 10;

    // 機器 + 連線佔用矩陣
    // 同類型連線不阻擋 (允許直線交叉, 後續由 commitWiring 放橋處理)
    // 異類型連線阻擋 (固體/液體傳送帶不可交叉)
    // 拐彎格單獨標記阻擋 (無論類型, 拐彎處一律不放橋)
    const machineGrid = buildOccupancyGrid(machines, gw, gh);
    const fullConnGrid = buildConnectionGrid(conns, gw, gh);
    const sameConnGrid = portType ? buildConnectionGrid(conns, gw, gh, portType) : fullConnGrid;
    const grid = new Uint8Array(gw * gh);
    for (let i = 0; i < grid.length; i++) {
        const hasSame = sameConnGrid[i] === 1;
        const hasOther = fullConnGrid[i] === 1 && !hasSame;
        grid[i] = machineGrid[i] | (hasSame && hasOther ? 1 : 0);
    }

    // 標記已有連線的拐彎格 → 禁止任何新路徑穿越
    for (const conn of conns) {
        for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
            if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < gh) grid[cp.y * gw + cp.x] = 1;
        }
    }

    // 一段路徑: routeManhattan 不走任何格, 獨立檢查落點
    if (realStart.x === realEnd.x && realStart.y === realEnd.y) {
        if (grid[realStart.y * gw + realStart.x]) return null;
        // 落在同類型連線上: 僅拐彎時阻擋, 直線段由 commitWiring 放橋
        if (portType && sameConnGrid[realStart.y * gw + realStart.x]) {
            const exitDir: Direction | undefined = endSide ? ((sideToDir[endSide] + 2) % 4) as Direction : undefined;
            if (entryDir !== undefined && exitDir !== undefined && entryDir !== exitDir) return null;
        }
        return [realStart];
    }

    // routeManhattan 不檢查起點, 獨立檢查 realStart
    if (grid[realStart.y * gw + realStart.x]) return null;

    const corePath = routeManhattan(realStart, realEnd, grid, gw, gh);
    if (!corePath) return null;

    const fullPath = [realStart, ...corePath];

    // 新路徑自身的拐彎格不得落在同類型連線上
    // 規則: 拐彎處不放橋, 直線段交叉才放橋 (由 commitWiring 處理)
    if (portType) {
        const exitDir: Direction | undefined = endSide ? ((sideToDir[endSide] + 2) % 4) as Direction : undefined;
        for (const cp of getCornerPoints(fullPath, entryDir, exitDir)) {
            if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < gh && sameConnGrid[cp.y * gw + cp.x]) return null;
        }
    }

    return [realStart, ...corePath];
};

/**
 * 返回路徑中所有拐彎點 (方向發生變化的格子)
 * entryDir: 進入 fullPath[0] 的方向, undefined 表示未知
 * exitDir:  離開 fullPath[last] 的方向, undefined 表示未知
 */
const getCornerPoints = (
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
    // 首點
    if (entryDir !== undefined && entryDir !== dirFromPoints(fullPath[0], fullPath[1])) {
        corners.push(fullPath[0]);
    }
    // 中間點
    for (let i = 1; i < n - 1; i++) {
        if (dirFromPoints(fullPath[i - 1], fullPath[i]) !== dirFromPoints(fullPath[i], fullPath[i + 1])) {
            corners.push(fullPath[i]);
        }
    }
    // 尾點
    if (exitDir !== undefined && dirFromPoints(fullPath[n - 2], fullPath[n - 1]) !== exitDir) {
        corners.push(fullPath[n - 1]);
    }
    return corners;
};

/** 根據兩點相對位置返回方向 (右1 左3 下2 上0) */
export const dirFromPoints = (a: Point, b: Point): Direction => {
    if (b.x > a.x) return 1;
    if (b.x < a.x) return 3;
    if (b.y > a.y) return 2;
    return 0;
};

/** 計算機器的端口連接點 (端口絕對座標 + 方向向量, 即傳送帶端點位置) */
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

export const calculateContentDimensions = (machines: PlacedMachine[], connections: { path: Point[] }[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (machines.length === 0 && connections.length === 0) return { width: 0, height: 0 };

    machines.forEach(m => {
        const rect = getMachineRect(m);
        if (rect) {
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.w);
            maxY = Math.max(maxY, rect.y + rect.h);
        }
    });

    connections.forEach(c => {
        c.path.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + 1);
            maxY = Math.max(maxY, p.y + 1);
        });
    });

    if (minX === Infinity || minY === Infinity) return { width: 0, height: 0 };

    return { width: maxX - minX, height: maxY - minY };
};
