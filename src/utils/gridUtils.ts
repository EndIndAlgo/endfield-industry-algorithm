import type { Point, PlacedMachine, Connection, Direction, PortType } from '../types';

export interface BoundingBox {
    minX: number; minY: number;
    maxX: number; maxY: number;
    width: number; height: number;
}

/** 计算一组机器和连线的最小包围盒 */
export const getBoundingBox = (
    machines: PlacedMachine[],
    connections: { path: Point[] }[]
): BoundingBox => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const m of machines) {
        const rect = getMachineRect(m);
        if (rect) {
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.w);
            maxY = Math.max(maxY, rect.y + rect.h);
        }
    }

    for (const c of connections) {
        for (const p of c.path) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + 1);
            maxY = Math.max(maxY, p.y + 1);
        }
    }

    if (!isFinite(minX)) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    return {
        minX, minY, maxX, maxY,
        width: maxX - minX,
        height: maxY - minY
    };
};
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
export const routeManhattan = (
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
    const bb = getBoundingBox(machines, connections);
    return { width: bb.width, height: bb.height };
};

/** 在指定點分割連線，返回子連線陣列 (0~2 個)，分割點不包含在子路徑中 */
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

// ═══════════════════════════════════════════════════════════════
// 新版连线系统工具函数
// ═══════════════════════════════════════════════════════════════

/** 尝试单 L 形路径：从 start 沿 firstAxis 走第一段，再垂直走到 end */
export const trySingleLRoute = (
    start: Point,
    end: Point,
    firstAxis: Direction,
    grid: Uint8Array,
    gridW: number,
    gridH: number
): Point[] | null => {
    const path: Point[] = [];

    // firstAxis 水平(1=Right, 3=Left) → corner = (end.x, start.y)
    // firstAxis 垂直(0=Up, 2=Down) → corner = (start.x, end.y)
    const horizontalFirst = firstAxis === 1 || firstAxis === 3;
    const corner: Point = horizontalFirst
        ? { x: end.x, y: start.y }
        : { x: start.x, y: end.y };

    // 第一段方向向量
    const step1 = firstAxis === 1 ? { x: 1, y: 0 }
        : firstAxis === 3 ? { x: -1, y: 0 }
        : firstAxis === 2 ? { x: 0, y: 1 }
        : { x: 0, y: -1 };

    let cx = start.x;
    let cy = start.y;

    // 第一段：start → corner
    while (cx !== corner.x || cy !== corner.y) {
        cx += step1.x;
        cy += step1.y;
        if (cx < 0 || cx >= gridW || cy < 0 || cy >= gridH) return null;
        if (grid[cy * gridW + cx]) return null;
        path.push({ x: cx, y: cy });
    }

    // 第二段：corner → end（垂直方向）
    if (corner.x !== end.x || corner.y !== end.y) {
        const step2 = end.x > corner.x ? { x: 1, y: 0 }
            : end.x < corner.x ? { x: -1, y: 0 }
            : end.y > corner.y ? { x: 0, y: 1 }
            : { x: 0, y: -1 };

        while (cx !== end.x || cy !== end.y) {
            cx += step2.x;
            cy += step2.y;
            if (cx < 0 || cx >= gridW || cy < 0 || cy >= gridH) return null;
            if (grid[cy * gridW + cx]) return null;
            path.push({ x: cx, y: cy });
        }
    }

    return path;
};

/** 计算路径的 headFacing：直路径=路径方向，L 形=第二段方向 */
export const computeHeadFacing = (path: Point[], tailFacing: Direction): Direction => {
    if (path.length <= 1) return tailFacing;
    const n = path.length;
    return dirFromPoints(path[n - 2], path[n - 1]);
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
