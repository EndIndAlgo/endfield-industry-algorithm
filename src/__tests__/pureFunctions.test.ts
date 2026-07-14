import { describe, it, expect } from 'vitest';
import {
    getBoundingBox,
    trySingleLRoute,
    getCornerPoints,
    splitConnectionAt,
    dirFromPoints,
    buildConnectionGrid,
    buildExistingCornerGrid,
    validateRouteConflicts,
    findRouteForMachine,
    findRouteToGround,
} from '@/utils/grid';
import { Mask } from '@/utils/mask';
import { getRotatedPorts, getRotatedDimensions } from '@/utils/machineUtils';
import { MACHINES } from '@/config/machines';
import type { Connection, Direction, PortConfig, PortType, PlacedMachine } from '@/types';
import { MASK_SOLID_LOGISTICS, DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_UP } from '@/types';

// ─── helpers ───

const makeConn = (overrides: Partial<Connection> = {}): Connection => ({
    id: 'test-conn',
    tailFacing: DIR_UP,
    headFacing: DIR_DOWN,
    path: [],
    portType: 'Solid' as PortType,
    ...overrides,
});

const makePort = (x: number, y: number, side: 'top' | 'right' | 'bottom' | 'left', type: PortType = 'Solid'): PortConfig => ({
    x, y, side, type, autoConnect: false,
});

// ======================================================================
// getBoundingBox
// ======================================================================
describe('getBoundingBox', () => {
    it('空输入返回零包围盒', () => {
        const bb = getBoundingBox([], []);
        expect(bb).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
    });

    it('仅有机器的包围盒', () => {
        const machines = [
            { id: 'a', machineId: 'pco', x: 2, y: 3, rotation: 0 as Direction },
            { id: 'b', machineId: 'pco', x: 8, y: 5, rotation: 0 as Direction },
        ];
        const bb = getBoundingBox(machines, []);
        expect(bb.minX).toBe(2);
        expect(bb.minY).toBe(3);
        expect(bb.maxX).toBe(17);
        expect(bb.maxY).toBe(14);
        expect(bb.width).toBe(15);
        expect(bb.height).toBe(11);
    });

    it('仅有连线的包围盒', () => {
        const conns = [{ path: [{ x: 5, y: 3 }, { x: 5, y: 7 }, { x: 10, y: 7 }] }];
        const bb = getBoundingBox([], conns);
        expect(bb.minX).toBe(5);
        expect(bb.minY).toBe(3);
        expect(bb.maxX).toBe(11);
        expect(bb.maxY).toBe(8);
    });

    it('机器+连线混合包围盒', () => {
        const machines = [{ id: 'a', machineId: 'pco', x: 0, y: 0, rotation: 0 as Direction }];
        const conns = [{ path: [{ x: 10, y: 10 }] }];
        const bb = getBoundingBox(machines, conns);
        expect(bb.minX).toBe(0);
        expect(bb.minY).toBe(0);
        expect(bb.maxX).toBe(11);
        expect(bb.maxY).toBe(11);
    });
});

// ======================================================================
// getRotatedDimensions
// ======================================================================
describe('getRotatedDimensions', () => {
    it('rotation=0 不交换宽高', () => {
        expect(getRotatedDimensions(3, 5, DIR_UP)).toEqual({ width: 3, height: 5 });
    });

    it('rotation=1 (90°) 交换宽高', () => {
        expect(getRotatedDimensions(3, 5, DIR_RIGHT)).toEqual({ width: 5, height: 3 });
    });

    it('rotation=2 (180°) 不交换宽高', () => {
        expect(getRotatedDimensions(3, 5, DIR_DOWN)).toEqual({ width: 3, height: 5 });
    });

    it('rotation=3 (270°) 交换宽高', () => {
        expect(getRotatedDimensions(3, 5, DIR_LEFT)).toEqual({ width: 5, height: 3 });
    });

    it('正方形旋转不变', () => {
        expect(getRotatedDimensions(4, 4, DIR_RIGHT)).toEqual({ width: 4, height: 4 });
    });
});

// ======================================================================
// getRotatedPorts
// ======================================================================
describe('getRotatedPorts', () => {
    const ports: PortConfig[] = [
        makePort(0, 1, 'right'),
        makePort(2, 0, 'bottom'),
    ];

    it('rotation=0 保持不变', () => {
        const r = getRotatedPorts(ports, 3, 3, DIR_UP);
        expect(r[0]).toEqual({ ...ports[0] });
        expect(r[1]).toEqual({ ...ports[1] });
    });

    it('rotation=1 端口坐标和方向正确旋转', () => {
        const r = getRotatedPorts(ports, 3, 3, DIR_RIGHT);
        expect(r[0].x).toBe(1);
        expect(r[0].y).toBe(0);
        expect(r[0].side).toBe('bottom');
    });

    it('rotation=2 端口反向', () => {
        const r = getRotatedPorts(ports, 3, 3, DIR_DOWN);
        expect(r[0].side).toBe('left');
        expect(r[1].side).toBe('top');
    });

    it('rotation=3 端口旋转', () => {
        const r = getRotatedPorts(ports, 3, 3, DIR_LEFT);
        expect(r[0].side).toBe('top');
        expect(r[1].side).toBe('right');
    });

    it('多端口不丢失', () => {
        const many = [makePort(0, 0, 'top'), makePort(1, 0, 'top'), makePort(2, 0, 'top'), makePort(0, 2, 'bottom')];
        const r = getRotatedPorts(many, 3, 3, DIR_RIGHT);
        expect(r).toHaveLength(4);
    });
});

// ======================================================================
// getCornerPoints
// ======================================================================
describe('getCornerPoints', () => {
    it('空路径返回空', () => {
        expect(getCornerPoints([], undefined, undefined)).toEqual([]);
    });

    it('单点无转弯', () => {
        const corners = getCornerPoints([{ x: 5, y: 5 }], DIR_RIGHT, DIR_RIGHT);
        expect(corners).toEqual([]);
    });

    it('单点+方向变化即转弯', () => {
        const corners = getCornerPoints([{ x: 5, y: 5 }], DIR_UP, DIR_RIGHT);
        expect(corners).toEqual([{ x: 5, y: 5 }]);
    });

    it('直线路径无转弯', () => {
        const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
        const corners = getCornerPoints(path, DIR_RIGHT, DIR_RIGHT);
        expect(corners).toEqual([]);
    });

    it('L形路径检测到单个转弯', () => {
        const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
        const corners = getCornerPoints(path, undefined, undefined);
        expect(corners).toEqual([{ x: 1, y: 0 }]);
    });

    it('U形路径检测到两个转弯', () => {
        const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }];
        const corners = getCornerPoints(path, undefined, undefined);
        expect(corners).toEqual([{ x: 1, y: 0 }, { x: 1, y: 2 }]);
    });
});

// ======================================================================
// dirFromPoints
// ======================================================================
describe('dirFromPoints', () => {
    it('right=1', () => expect(dirFromPoints({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(DIR_RIGHT));
    it('left=3', () => expect(dirFromPoints({ x: 5, y: 0 }, { x: 3, y: 0 })).toBe(DIR_LEFT));
    it('down=2', () => expect(dirFromPoints({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(DIR_DOWN));
    it('up=0', () => expect(dirFromPoints({ x: 0, y: 5 }, { x: 0, y: 3 })).toBe(DIR_UP));
});

// ======================================================================
// splitConnectionAt
// ======================================================================
describe('splitConnectionAt', () => {
    it('分割点不在路径上: 返回原连线', () => {
        const conn = makeConn({ path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT });
        const result = splitConnectionAt(conn, { x: 5, y: 5 });
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(conn);
    });

    it('分割点在头部: 删除头点保留尾部', () => {
        const conn = makeConn({ path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT });
        const result = splitConnectionAt(conn, { x: 0, y: 0 });
        expect(result).toHaveLength(1);
        expect(result[0].path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
        expect(result[0].tailFacing).toBe(DIR_RIGHT);
    });

    it('分割点在尾部: 保留头部', () => {
        const conn = makeConn({ path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT });
        const result = splitConnectionAt(conn, { x: 2, y: 0 });
        expect(result).toHaveLength(1);
        expect(result[0].path).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
        expect(result[0].headFacing).toBe(DIR_RIGHT);
    });

    it('分割点在中间: 返回两个子路径', () => {
        const conn = makeConn({ path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT });
        const result = splitConnectionAt(conn, { x: 1, y: 0 });
        expect(result).toHaveLength(2);
        expect(result[0].path).toEqual([{ x: 0, y: 0 }]);
        expect(result[0].headFacing).toBe(DIR_RIGHT);
        expect(result[1].path).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }]);
        expect(result[1].tailFacing).toBe(DIR_RIGHT);
    });

    it('单点路径: 分割后为空', () => {
        const conn = makeConn({ path: [{ x: 5, y: 5 }] });
        const result = splitConnectionAt(conn, { x: 5, y: 5 });
        expect(result).toEqual([]);
    });

    it('L形路径中间转弯点分割', () => {
        const conn = makeConn({ path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }], tailFacing: DIR_RIGHT, headFacing: DIR_DOWN });
        const result = splitConnectionAt(conn, { x: 1, y: 1 });
        expect(result).toHaveLength(2);
        expect(result[0].path).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
        expect(result[0].headFacing).toBe(DIR_DOWN);
        expect(result[1].path).toEqual([{ x: 1, y: 2 }]);
        expect(result[1].tailFacing).toBe(DIR_DOWN);
    });
});

// ======================================================================
// trySingleLRoute
// ======================================================================
describe('trySingleLRoute', () => {
    const mkGrid = (w: number, h: number): Mask => Mask.Uniform(w, h, 0);

    it('方向=右: 水平先, L形到右下', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, DIR_RIGHT, grid);
        expect(path).not.toBeNull();
        expect(path).toEqual([
            { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
            { x: 5, y: 3 }, { x: 5, y: 4 },
        ]);
    });

    it('方向=下: 垂直先, L形到右下', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, DIR_DOWN, grid);
        expect(path).not.toBeNull();
        expect(path).toEqual([
            { x: 2, y: 3 }, { x: 2, y: 4 },
            { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 },
        ]);
    });

    it('方向=上: 垂直先, L形到左上', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 5, y: 5 }, { x: 2, y: 2 }, DIR_UP, grid);
        expect(path).not.toBeNull();
        expect(path).toEqual([
            { x: 5, y: 4 }, { x: 5, y: 3 }, { x: 5, y: 2 },
            { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 },
        ]);
    });

    it('方向=左: 水平先, L形到左上', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 5, y: 5 }, { x: 2, y: 2 }, DIR_LEFT, grid);
        expect(path).not.toBeNull();
        expect(path).toEqual([
            { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 },
            { x: 2, y: 4 }, { x: 2, y: 3 }, { x: 2, y: 2 },
        ]);
    });

    it('起点=终点: 返回空路径', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 3, y: 3 }, { x: 3, y: 3 }, DIR_RIGHT, grid);
        expect(path).toEqual([]);
    });

    it('越界(负坐标): 返回 null', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 0, y: 0 }, { x: -2, y: 3 }, DIR_LEFT, grid);
        expect(path).toBeNull();
    });

    it('越界(超出网格): 返回 null', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 9, y: 9 }, { x: 12, y: 5 }, DIR_RIGHT, grid);
        expect(path).toBeNull();
    });

    it('第一段遇障: 返回 null', () => {
        const grid = mkGrid(10, 10);
        grid.WriteValue(3, 2, 1);
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, DIR_RIGHT, grid);
        expect(path).toBeNull();
    });

    it('第二段遇障: 返回 null', () => {
        const grid = mkGrid(10, 10);
        grid.WriteValue(5, 3, 1);
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, DIR_RIGHT, grid);
        expect(path).toBeNull();
    });

    it('mask=0 忽略障碍', () => {
        const grid = mkGrid(10, 10);
        grid.WriteValue(3, 2, 1);
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, DIR_RIGHT, grid, 0);
        expect(path).not.toBeNull();
        expect(path).toHaveLength(5);
    });
});

// ======================================================================
// Mask.FromOccupancy (was buildMergedGrid)
// ======================================================================
describe('Mask.FromOccupancy', () => {
    const mkEntry = (overrides: Partial<PlacedMachine> = {}) => {
        const cfg = MACHINES.find(m => m.id === (overrides.machineId || 'pco'))!;
        const rot = overrides.rotation ?? DIR_UP;
        return { mask: cfg.mask4![rot], x: overrides.x ?? 2, y: overrides.y ?? 2 };
    };

    it('空机器和空连线返回全零网格', () => {
        const grid = Mask.FromOccupancy({ machines: [], connections: [], gridW: 10, gridH: 10 });
        expect(grid.data.every(v => v === 0)).toBe(true);
    });

    it('机器占用格非零', () => {
        const grid = Mask.FromOccupancy({ machines: [mkEntry()], connections: [], gridW: 10, gridH: 10 });
        expect(grid.data[2 * 10 + 2]).not.toBe(0);
    });

    it('excludePortType 排除同类型连线，异类型进入', () => {
        const solidConn: Connection = {
            id: 'c1', tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT,
            path: [{ x: 5, y: 5 }], portType: 'Solid',
        };
        const liqConn: Connection = {
            id: 'c2', tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT,
            path: [{ x: 6, y: 6 }], portType: 'Liquid',
        };
        const grid = Mask.FromOccupancy({ machines: [], connections: [solidConn, liqConn], gridW: 10, gridH: 10, excludePortType: 'Solid' });
        expect(grid.data[5 * 10 + 5]).toBe(0);
        expect(grid.data[6 * 10 + 6]).not.toBe(0);
    });
});

// ======================================================================
// buildConnectionGrid
// ======================================================================
describe('buildConnectionGrid', () => {
    it('空连线返回全零', () => {
        const grid = buildConnectionGrid([], 10, 10);
        expect(grid.data.every(v => v === 0)).toBe(true);
    });

    it('连线路径格标记为1', () => {
        const conns: Connection[] = [{ id: 'c1', tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT, path: [{ x: 3, y: 3 }, { x: 4, y: 3 }], portType: 'Solid' }];
        const grid = buildConnectionGrid(conns, 10, 10);
        expect(grid.data[3 * 10 + 3]).toBe(1);
        expect(grid.data[3 * 10 + 4]).toBe(1);
    });

    it('按 portType 过滤', () => {
        const solid: Connection = { id: 'cs', tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT, path: [{ x: 3, y: 3 }], portType: 'Solid' };
        const liquid: Connection = { id: 'cl', tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT, path: [{ x: 5, y: 5 }], portType: 'Liquid' };
        const grid = buildConnectionGrid([solid, liquid], 10, 10, 'Solid');
        expect(grid.data[3 * 10 + 3]).toBe(1);
        expect(grid.data[5 * 10 + 5]).toBe(0);
    });

    it('越界连线点被忽略', () => {
        const conns: Connection[] = [{ id: 'cx', tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT, path: [{ x: -1, y: 5 }, { x: 100, y: 5 }], portType: 'Solid' }];
        const grid = buildConnectionGrid(conns, 10, 10);
        expect(grid.data.every(v => v === 0)).toBe(true);
    });
});

// ======================================================================
// buildExistingCornerGrid
// ======================================================================
describe('buildExistingCornerGrid', () => {
    it('空连线返回全零', () => {
        const grid = buildExistingCornerGrid([], 10, 10, 'Solid');
        expect(grid.data.every(v => v === 0)).toBe(true);
    });

    it('L形连线拐弯点标记为1', () => {
        const conns: Connection[] = [{
            id: 'c1', tailFacing: DIR_RIGHT, headFacing: DIR_DOWN,
            path: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
            portType: 'Solid',
        }];
        const grid = buildExistingCornerGrid(conns, 10, 10, 'Solid');
        expect(grid.data[1 * 10 + 2]).toBe(1);
    });

    it('直线连线无拐弯点', () => {
        const conns: Connection[] = [{
            id: 'c1', tailFacing: DIR_RIGHT, headFacing: DIR_RIGHT,
            path: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
            portType: 'Solid',
        }];
        const grid = buildExistingCornerGrid(conns, 10, 10, 'Solid');
        expect(grid.data.every(v => v === 0)).toBe(true);
    });
});

// ======================================================================
// validateRouteConflicts
// ======================================================================
describe('validateRouteConflicts', () => {
    const gw = 10;
    const connMask = 2;
    const bridgeMask = MASK_SOLID_LOGISTICS;

    const mkMask = (w: number, h: number): Mask => Mask.Uniform(w, h, 0);

    it('无障碍路径返回 true', () => {
        const mergedGrid = mkMask(gw, gw);
        const sameConnGrid = mkMask(gw, gw);
        const cornerGrid = mkMask(gw, gw);
        const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
        const valid = validateRouteConflicts(path, DIR_RIGHT, DIR_DOWN,
            sameConnGrid, mergedGrid, cornerGrid, bridgeMask, connMask,
            { isContinuing: false, startPos: { x: 1, y: 1 } });
        expect(valid).toBe(true);
    });

    it('拐弯点在已有同类型连线上 → false', () => {
        const mergedGrid = mkMask(gw, gw);
        const sameConnGrid = mkMask(gw, gw);
        const cornerGrid = mkMask(gw, gw);
        const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
        sameConnGrid.WriteValue(2, 1, 1);
        const valid = validateRouteConflicts(path, DIR_RIGHT, DIR_DOWN,
            sameConnGrid, mergedGrid, cornerGrid, bridgeMask, connMask,
            { isContinuing: false, startPos: { x: 1, y: 1 } });
        expect(valid).toBe(false);
    });

    it('桥掩码冲突 → false', () => {
        const mergedGrid = mkMask(gw, gw);
        const sameConnGrid = mkMask(gw, gw);
        const cornerGrid = mkMask(gw, gw);
        sameConnGrid.WriteValue(2, 1, 1);
        mergedGrid.WriteValue(2, 1, 3);
        const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
        const valid = validateRouteConflicts(path, DIR_RIGHT, DIR_RIGHT,
            sameConnGrid, mergedGrid, cornerGrid, bridgeMask, connMask,
            { isContinuing: false, startPos: { x: 1, y: 1 } });
        expect(valid).toBe(false);
    });

    it('续接模式豁免起点拐弯', () => {
        const mergedGrid = mkMask(gw, gw);
        const sameConnGrid = mkMask(gw, gw);
        const cornerGrid = mkMask(gw, gw);
        const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
        sameConnGrid.WriteValue(1, 1, 1);
        const valid = validateRouteConflicts(path, DIR_RIGHT, DIR_DOWN,
            sameConnGrid, mergedGrid, cornerGrid, bridgeMask, connMask,
            { isContinuing: true, startPos: { x: 1, y: 1 } });
        expect(valid).toBe(true);
    });
});

// ======================================================================
// findRouteForMachine
// ======================================================================
describe('findRouteForMachine', () => {
    const gw = 20, gh = 20;
    const connMask = 2;
    const bridgeMask = MASK_SOLID_LOGISTICS;
    const mkMask = (w: number, h: number): Mask => Mask.Uniform(w, h, 0);

    const targetMachine: PlacedMachine = {
        id: 'target', machineId: 'ref', x: 10, y: 10, rotation: DIR_UP,
    };

    it('无可用输入端口时返回视觉 fallback', () => {
        const mergedGrid = mkMask(gw, gh);
        const sameConnGrid = mkMask(gw, gh);
        const cornerGrid = mkMask(gw, gh);
        const result = findRouteForMachine(
            { x: 5, y: 10 }, DIR_RIGHT, targetMachine, 'Liquid', 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, 4, gh,
            false, { x: 5, y: 10 }
        );
        expect(result.isValid).toBe(false);
    });

    it('找到匹配输入端口并返回合法路径', () => {
        const mergedGrid = mkMask(gw, gh);
        const sameConnGrid = mkMask(gw, gh);
        const cornerGrid = mkMask(gw, gh);
        const result = findRouteForMachine(
            { x: 5, y: 10 }, DIR_RIGHT, targetMachine, 'Solid', 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gh,
            false, { x: 5, y: 10 }
        );
        expect(result.isValid).toBe(true);
        expect(result.targetIsMachine).toBe(true);
        expect(result.path.length).toBeGreaterThan(0);
    });
});

// ======================================================================
// findRouteToGround
// ======================================================================
describe('findRouteToGround', () => {
    const gw = 20, gh = 20;
    const connMask = 2;
    const bridgeMask = MASK_SOLID_LOGISTICS;
    const mkMask = (w: number, h: number): Mask => Mask.Uniform(w, h, 0);

    it('无障碍时返回合法 L 形路径', () => {
        const mergedGrid = mkMask(gw, gh);
        const sameConnGrid = mkMask(gw, gh);
        const cornerGrid = mkMask(gw, gh);
        const result = findRouteToGround(
            { x: 5, y: 5 }, DIR_RIGHT, { x: 10, y: 8 }, 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gh, false
        );
        expect(result.isValid).toBe(true);
        expect(result.path[0]).toEqual({ x: 5, y: 5 });
        expect(result.path[result.path.length - 1]).toEqual({ x: 10, y: 8 });
    });

    it('起点被阻挡 → 视觉 fallback', () => {
        const mergedGrid = mkMask(gw, gh);
        const sameConnGrid = mkMask(gw, gh);
        const cornerGrid = mkMask(gw, gh);
        mergedGrid.WriteValue(5, 5, connMask);
        const result = findRouteToGround(
            { x: 5, y: 5 }, DIR_RIGHT, { x: 10, y: 8 }, 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gh, false
        );
        expect(result.isValid).toBe(false);
    });

    it('主路径被阻挡时自动尝试备选 L 形', () => {
        const mergedGrid = mkMask(gw, gh);
        const sameConnGrid = mkMask(gw, gh);
        const cornerGrid = mkMask(gw, gh);
        mergedGrid.WriteValue(6, 5, connMask);
        const result = findRouteToGround(
            { x: 5, y: 5 }, DIR_RIGHT, { x: 10, y: 8 }, 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gh, false
        );
        expect(result.isValid).toBe(true);
    });

    it('两条 L 形都被阻挡 → 视觉 fallback', () => {
        const mergedGrid = mkMask(gw, gh);
        const sameConnGrid = mkMask(gw, gh);
        const cornerGrid = mkMask(gw, gh);
        mergedGrid.WriteValue(6, 5, connMask);
        mergedGrid.WriteValue(5, 6, connMask);
        const result = findRouteToGround(
            { x: 5, y: 5 }, DIR_RIGHT, { x: 10, y: 8 }, 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gh, false
        );
        expect(result.isValid).toBe(false);
    });
});
