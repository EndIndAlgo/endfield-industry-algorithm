import { describe, it, expect } from 'vitest';
import {
    getBoundingBox,
    routeManhattan,
    trySingleLRoute,
    getCornerPoints,
    splitConnectionAt,
    dirFromPoints,
    buildMergedGrid,
    buildConnectionGrid,
    buildExistingCornerGrid,
    validateRouteConflicts,
    findRouteForMachine,
    findRouteToGround,
} from '../utils/grid';
import { getRotatedPorts, getRotatedDimensions } from '../utils/machineUtils';
import type { Connection, Direction, PortConfig, PortType, PlacedMachine } from '../types';
import { MASK_SOLID_LOGISTICS } from '../types';

// ─── helpers ───

const makeConn = (overrides: Partial<Connection> = {}): Connection => ({
    id: 'test-conn',
    tailFacing: 0 as Direction,
    headFacing: 2 as Direction,
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
        // pco is 9x9
        expect(bb.minX).toBe(2);
        expect(bb.minY).toBe(3);
        expect(bb.maxX).toBe(17); // 8+9
        expect(bb.maxY).toBe(14);  // 5+9
        expect(bb.width).toBe(15);
        expect(bb.height).toBe(11);
    });

    it('仅有连线的包围盒', () => {
        const conns = [{ path: [{ x: 5, y: 3 }, { x: 5, y: 7 }, { x: 10, y: 7 }] }];
        const bb = getBoundingBox([], conns);
        expect(bb.minX).toBe(5);
        expect(bb.minY).toBe(3);
        expect(bb.maxX).toBe(11); // 10+1
        expect(bb.maxY).toBe(8);  // 7+1
    });

    it('机器+连线混合包围盒', () => {
        const machines = [{ id: 'a', machineId: 'pco', x: 0, y: 0, rotation: 0 as Direction }];
        const conns = [{ path: [{ x: 10, y: 10 }] }];
        const bb = getBoundingBox(machines, conns);
        expect(bb.minX).toBe(0);
        expect(bb.minY).toBe(0);
        expect(bb.maxX).toBe(11); // max(pco(9), conn(11)) = 11
        expect(bb.maxY).toBe(11); // max(pco(9), conn(11)) = 11
    });
});

// ======================================================================
// getRotatedDimensions
// ======================================================================
describe('getRotatedDimensions', () => {
    it('rotation=0 不交换宽高', () => {
        expect(getRotatedDimensions(3, 5, 0 as Direction)).toEqual({ width: 3, height: 5 });
    });

    it('rotation=1 (90°) 交换宽高', () => {
        expect(getRotatedDimensions(3, 5, 1 as Direction)).toEqual({ width: 5, height: 3 });
    });

    it('rotation=2 (180°) 不交换宽高', () => {
        expect(getRotatedDimensions(3, 5, 2 as Direction)).toEqual({ width: 3, height: 5 });
    });

    it('rotation=3 (270°) 交换宽高', () => {
        expect(getRotatedDimensions(3, 5, 3 as Direction)).toEqual({ width: 5, height: 3 });
    });

    it('正方形旋转不变', () => {
        expect(getRotatedDimensions(4, 4, 1 as Direction)).toEqual({ width: 4, height: 4 });
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
        const r = getRotatedPorts(ports, 3, 3, 0 as Direction);
        expect(r[0]).toEqual({ ...ports[0] });
        expect(r[1]).toEqual({ ...ports[1] });
    });

    it('rotation=1 (顺时针90°) 端口坐标和方向正确旋转', () => {
        const r = getRotatedPorts(ports, 3, 3, 1 as Direction);
        // port(0,1,right) on 3x3: x'=3-1-1=1, y'=0, side right→bottom
        expect(r[0].x).toBe(1);
        expect(r[0].y).toBe(0);
        expect(r[0].side).toBe('bottom');
    });

    it('rotation=2 (180°) 端口反向', () => {
        const r = getRotatedPorts(ports, 3, 3, 2 as Direction);
        // sides rotate twice: right→bottom→left, bottom→left→top
        expect(r[0].side).toBe('left');
        expect(r[1].side).toBe('top');
    });

    it('rotation=3 (逆时针90°)', () => {
        const r = getRotatedPorts(ports, 3, 3, 3 as Direction);
        // sides rotate 3 times
        expect(r[0].side).toBe('top');
        expect(r[1].side).toBe('right');
    });

    it('多端口不丢失', () => {
        const many = [
            makePort(0, 0, 'top'),
            makePort(1, 0, 'top'),
            makePort(2, 0, 'top'),
            makePort(0, 2, 'bottom'),
        ];
        const r = getRotatedPorts(many, 3, 3, 1 as Direction);
        expect(r).toHaveLength(4);
    });
});

// ======================================================================
// routeManhattan
// ======================================================================
describe('routeManhattan', () => {
    const mkGrid = (w: number, h: number): Uint8Array => new Uint8Array(w * h);

    it('水平优先: 起点终点同行(无转弯)', () => {
        const path = routeManhattan({ x: 2, y: 5 }, { x: 6, y: 5 }, mkGrid(10, 10), 10);
        expect(path).not.toBeNull();
        expect(path).toHaveLength(4); // 走4步
        // 全部在 y=5 上
        expect(path!.every(p => p.y === 5)).toBe(true);
    });

    it('垂直优先: |dy| > |dx| 垂直先行', () => {
        const grid = mkGrid(10, 10);
        const path = routeManhattan({ x: 3, y: 2 }, { x: 4, y: 8 }, grid, 10);
        expect(path).not.toBeNull();
        // 应先垂直再水平 (主导轴=垂直)
        expect(path![0].y).toBe(3); // y+1
    });

    it('水平优先: dx绝对值大时水平先行', () => {
        const grid = mkGrid(10, 10);
        const path = routeManhattan({ x: 1, y: 1 }, { x: 8, y: 2 }, grid, 10);
        expect(path).not.toBeNull();
        // 应先水平再垂直
        expect(path![0].x).toBe(2); // x+1
    });

    it('同点退化: 返回空数组(起点=终点)', () => {
        const path = routeManhattan({ x: 5, y: 5 }, { x: 5, y: 5 }, mkGrid(10, 10), 10);
        expect(path).toEqual([]);
    });

    it('障碍物阻挡: 主路线遇障, 备选路线遇障, 返回 null', () => {
        const grid = mkGrid(10, 10);
        // 在 (3,3) 放障碍，起点(2,3)→终点(4,3): 水平路径必经(3,3)
        grid[3 * 10 + 3] = 1;
        const path = routeManhattan({ x: 2, y: 3 }, { x: 4, y: 3 }, grid, 10);
        // 水平路径受阻,(3,3) 被阻挡 → 尝试垂直优先 L: 先走 dy=0, 再 dx=0... 也受阻
        // 最终会尝试另一条 L: 垂直先 → (2,4)... 这也经过不需要的地方
        // 实际上: 水平优先试 (3,3)→受阻; 垂直优先: 先 dy, 但 dy=0 不走; 再 dx, 同样遇到 (3,3)
        // 两条L都会经过(3,3), 所以都应返回 null
        expect(path).toBeNull();
    });

    it('备选路线成功: 水平不通走垂直', () => {
        const grid = mkGrid(10, 10);
        // 起点(2,2)→终点(3,5): |dx|=1, |dy|=3, 水平优先 → 先水平到(3,2)再向下
        // 阻挡(3,2): 水平路径遇障 → 尝试垂直优先 → 先下到(2,5)再向右
        // 阻挡(3,2): 垂直路径: 垂直段: (2,3),(2,4),(2,5), 再水平: (3,5) ✓
        grid[2 * 10 + 3] = 1; // (3,2) blocked
        const path = routeManhattan({ x: 2, y: 2 }, { x: 3, y: 5 }, grid, 10);
        expect(path).not.toBeNull();
        // 路径: (2,3)→(2,4)→(2,5)→(3,5)
        expect(path).toEqual([
            { x: 2, y: 3 },
            { x: 2, y: 4 },
            { x: 2, y: 5 },
            { x: 3, y: 5 },
        ]);
    });

    it('边界网格: 大坐标正常工作', () => {
        const grid = mkGrid(100, 100);
        const path = routeManhattan({ x: 10, y: 10 }, { x: 90, y: 80 }, grid, 100);
        expect(path).not.toBeNull();
        expect(path![path!.length - 1]).toEqual({ x: 90, y: 80 });
    });

    it('对角线: dx==dy', () => {
        const grid = mkGrid(10, 10);
        const path = routeManhattan({ x: 1, y: 1 }, { x: 5, y: 5 }, grid, 10);
        expect(path).not.toBeNull();
        // horizontal dominant (|4| >= |4|), so horizontal first
        expect(path!.length).toBe(8);
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
        // 单点且 entryDir===exitDir 不算转弯
        const corners = getCornerPoints([{ x: 5, y: 5 }], 1 as Direction, 1 as Direction);
        expect(corners).toEqual([]);
    });

    it('单点+方向变化(entry!=exit)即转弯', () => {
        const corners = getCornerPoints([{ x: 5, y: 5 }], 0 as Direction, 1 as Direction);
        expect(corners).toEqual([{ x: 5, y: 5 }]);
    });

    it('直线路径无转弯', () => {
        const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
        const corners = getCornerPoints(path, 1 as Direction, 1 as Direction);
        expect(corners).toEqual([]);
    });

    it('L形路径检测到单个转弯', () => {
        const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
        // (0,0)→(1,0)=right, (1,0)→(1,1)=down → corner at (1,0)
        const corners = getCornerPoints(path, undefined, undefined);
        expect(corners).toEqual([{ x: 1, y: 0 }]);
    });

    it('U形路径检测到两个转弯', () => {
        const path = [
            { x: 0, y: 0 }, { x: 1, y: 0 },
            { x: 1, y: 1 }, { x: 1, y: 2 },
            { x: 0, y: 2 },
        ];
        const corners = getCornerPoints(path, undefined, undefined);
        expect(corners).toEqual([
            { x: 1, y: 0 },  // right→down
            { x: 1, y: 2 },  // down→left
        ]);
    });
});

// ======================================================================
// dirFromPoints
// ======================================================================
describe('dirFromPoints', () => {
    it('right=1', () => expect(dirFromPoints({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1));
    it('left=3', () => expect(dirFromPoints({ x: 5, y: 0 }, { x: 3, y: 0 })).toBe(3));
    it('down=2', () => expect(dirFromPoints({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(2));
    it('up=0', () => expect(dirFromPoints({ x: 0, y: 5 }, { x: 0, y: 3 })).toBe(0));
});

// ======================================================================
// splitConnectionAt
// ======================================================================
describe('splitConnectionAt', () => {
    it('分割点不在路径上: 返回原连线', () => {
        const conn = makeConn({
            path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
            tailFacing: 1 as Direction,
            headFacing: 1 as Direction,
        });
        const result = splitConnectionAt(conn, { x: 5, y: 5 });
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(conn);
    });

    it('分割点在头部(第一个点): 删除头点, 保留尾部子路径', () => {
        const conn = makeConn({
            path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
            tailFacing: 1 as Direction,
            headFacing: 1 as Direction,
        });
        const result = splitConnectionAt(conn, { x: 0, y: 0 });
        expect(result).toHaveLength(1);
        // 保留 idx>0 后的子路径 (idx+1 到末尾)
        expect(result[0].path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
        // tailFacing 应改为 dirFromPoints(conn.path[0], conn.path[1]) = right (1)
        expect(result[0].tailFacing).toBe(1);
    });

    it('分割点在尾部(最后一个点): 删除尾点, 保留头部子路径', () => {
        const conn = makeConn({
            path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
            tailFacing: 1 as Direction,
            headFacing: 1 as Direction,
        });
        const result = splitConnectionAt(conn, { x: 2, y: 0 });
        expect(result).toHaveLength(1);
        expect(result[0].path).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
        // headFacing 应改为 right (1)
        expect(result[0].headFacing).toBe(1);
    });

    it('分割点在中间: 返回两个子路径(都不含分割点)', () => {
        const conn = makeConn({
            path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
            tailFacing: 1 as Direction,
            headFacing: 1 as Direction,
        });
        const result = splitConnectionAt(conn, { x: 1, y: 0 });
        expect(result).toHaveLength(2);
        // 前半: [{x:0,y:0}], headFacing=right(1)
        expect(result[0].path).toEqual([{ x: 0, y: 0 }]);
        expect(result[0].headFacing).toBe(1);
        // 后半: [{x:2,y:0},{x:3,y:0}], tailFacing=right(1)
        expect(result[1].path).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }]);
        expect(result[1].tailFacing).toBe(1);
    });

    it('单点路径: 分割后为空', () => {
        const conn = makeConn({ path: [{ x: 5, y: 5 }] });
        const result = splitConnectionAt(conn, { x: 5, y: 5 });
        // idx=0 → idx>0? no (0>0=false). idx<len-1? no (0<0=false)
        expect(result).toEqual([]);
    });

    it('L形路径中间转弯点分割', () => {
        const conn = makeConn({
            path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
            tailFacing: 1 as Direction,
            headFacing: 2 as Direction,
        });
        // 在转弯点(1,1)分割
        const result = splitConnectionAt(conn, { x: 1, y: 1 });
        expect(result).toHaveLength(2);
        // 前半: [(0,0), (1,0)], headFacing=down(2)
        expect(result[0].path).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
        expect(result[0].headFacing).toBe(2);
        // 后半: [(1,2)], tailFacing=down(2)
        expect(result[1].path).toEqual([{ x: 1, y: 2 }]);
        expect(result[1].tailFacing).toBe(2);
    });
});

// ======================================================================
// trySingleLRoute
// ======================================================================
describe('trySingleLRoute', () => {
    const mkGrid = (w: number, h: number): Uint8Array => new Uint8Array(w * h);

    it('方向=1(右): 水平先, L形到右下', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, 1 as Direction, grid, 10, 10);
        expect(path).not.toBeNull();
        // 先水平右到(5,2)，再垂直下到(5,4)
        expect(path).toEqual([
            { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
            { x: 5, y: 3 }, { x: 5, y: 4 },
        ]);
    });

    it('方向=2(下): 垂直先, L形到右下', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, 2 as Direction, grid, 10, 10);
        expect(path).not.toBeNull();
        // 先垂直下到(2,4)，再水平右到(5,4)
        expect(path).toEqual([
            { x: 2, y: 3 }, { x: 2, y: 4 },
            { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 },
        ]);
    });

    it('方向=0(上): 垂直先, L形到左上', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 5, y: 5 }, { x: 2, y: 2 }, 0 as Direction, grid, 10, 10);
        expect(path).not.toBeNull();
        // 先垂直上到(5,2)，再水平左到(2,2)
        expect(path).toEqual([
            { x: 5, y: 4 }, { x: 5, y: 3 }, { x: 5, y: 2 },
            { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 },
        ]);
    });

    it('方向=3(左): 水平先, L形到左上', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 5, y: 5 }, { x: 2, y: 2 }, 3 as Direction, grid, 10, 10);
        expect(path).not.toBeNull();
        // 先水平左到(2,5)，再垂直上到(2,2)
        expect(path).toEqual([
            { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 },
            { x: 2, y: 4 }, { x: 2, y: 3 }, { x: 2, y: 2 },
        ]);
    });

    it('起点=终点: 返回空路径', () => {
        const grid = mkGrid(10, 10);
        const path = trySingleLRoute({ x: 3, y: 3 }, { x: 3, y: 3 }, 1 as Direction, grid, 10, 10);
        expect(path).toEqual([]);
    });

    it('越界(负坐标): 返回 null', () => {
        const grid = mkGrid(10, 10);
        // 从(0,0)往左走，第一步就会越界
        const path = trySingleLRoute({ x: 0, y: 0 }, { x: -2, y: 3 }, 3 as Direction, grid, 10, 10);
        expect(path).toBeNull();
    });

    it('越界(超出网格): 返回 null', () => {
        const grid = mkGrid(10, 10);
        // 从(9,9)往右走，第一步就会越界
        const path = trySingleLRoute({ x: 9, y: 9 }, { x: 12, y: 5 }, 1 as Direction, grid, 10, 10);
        expect(path).toBeNull();
    });

    it('第一段遇障: 返回 null', () => {
        const grid = mkGrid(10, 10);
        grid[2 * 10 + 3] = 1; // (3,2) blocked
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, 1 as Direction, grid, 10, 10);
        expect(path).toBeNull();
    });

    it('第二段遇障: 返回 null', () => {
        const grid = mkGrid(10, 10);
        grid[4 * 10 + 5] = 1; // (5,4) blocked (first axis=right, corner at (5,2), then vertical to (5,4))
        // Block (5,3) instead, which is on the vertical segment
        grid[3 * 10 + 5] = 1; // (5,3) blocked on second segment
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, 1 as Direction, grid, 10, 10);
        expect(path).toBeNull();
    });

    it('mask=0 忽略障碍', () => {
        const grid = mkGrid(10, 10);
        grid[2 * 10 + 3] = 1; // (3,2) blocked with mask=1
        // 用 mask=0 可通过
        const path = trySingleLRoute({ x: 2, y: 2 }, { x: 5, y: 4 }, 1 as Direction, grid, 10, 10, 0);
        expect(path).not.toBeNull();
        expect(path).toHaveLength(5);
    });
});

// ======================================================================
// routeManhattan 边界情况
// ======================================================================
describe('routeManhattan 边界情况', () => {
    const mkGrid = (w: number, h: number): Uint8Array => new Uint8Array(w * h);

    it('mask=0 忽略全部障碍', () => {
        const grid = mkGrid(10, 10);
        // 布满障碍
        for (let i = 0; i < 10; i++) grid[5 * 10 + i] = 1;
        const path = routeManhattan({ x: 2, y: 2 }, { x: 8, y: 2 }, grid, 10, 0);
        expect(path).not.toBeNull();
        expect(path![path!.length - 1]).toEqual({ x: 8, y: 2 });
    });

    it('路径经过网格边缘 (0,0) 正常工作', () => {
        const grid = mkGrid(20, 20);
        const path = routeManhattan({ x: 0, y: 0 }, { x: 3, y: 3 }, grid, 20);
        expect(path).not.toBeNull();
        expect(path![0]).toEqual({ x: 1, y: 0 });
    });

    it('路径在网格最右边缘正常工作', () => {
        const grid = mkGrid(20, 20);
        const path = routeManhattan({ x: 18, y: 5 }, { x: 19, y: 5 }, grid, 20);
        expect(path).not.toBeNull();
        expect(path).toEqual([{ x: 19, y: 5 }]);
    });
});

// ======================================================================
// buildMergedGrid
// ======================================================================
describe('buildMergedGrid', () => {
    const mkMachine = (overrides: Partial<PlacedMachine> = {}): PlacedMachine => ({
        id: 'test-m',
        machineId: 'pco',
        x: 2, y: 2,
        rotation: 0 as Direction,
        ...overrides,
    });

    it('空机器和空连线返回全零网格', () => {
        const grid = buildMergedGrid([], [], 10, 10, 'Solid');
        expect(grid).toHaveLength(100);
        expect(grid.every(v => v === 0)).toBe(true);
    });

    it('机器占用格非零', () => {
        const grid = buildMergedGrid([mkMachine()], [], 10, 10, 'Solid');
        // pco 是 9x9，从 (2,2) 开始
        expect(grid[2 * 10 + 2]).not.toBe(0);
    });

    it('异类型连线进入网格，同类型不进入', () => {
        const solidConn: Connection = {
            id: 'c1', tailFacing: 1 as Direction, headFacing: 1 as Direction,
            path: [{ x: 5, y: 5 }], portType: 'Solid',
        };
        const liqConn: Connection = {
            id: 'c2', tailFacing: 1 as Direction, headFacing: 1 as Direction,
            path: [{ x: 6, y: 6 }], portType: 'Liquid',
        };
        // portType='Solid' → Solid 连线同类型不进入，Liquid 异类型进入
        const grid = buildMergedGrid([], [solidConn, liqConn], 10, 10, 'Solid');
        // Solid 同类型不进入 → (5,5) 应为 0
        expect(grid[5 * 10 + 5]).toBe(0);
        // Liquid 异类型进入 → (6,6) 应有 Liquid 掩码
        expect(grid[6 * 10 + 6]).not.toBe(0);
    });
});

// ======================================================================
// buildConnectionGrid
// ======================================================================
describe('buildConnectionGrid', () => {
    it('空连线返回全零', () => {
        const grid = buildConnectionGrid([], 10, 10);
        expect(grid.every(v => v === 0)).toBe(true);
    });

    it('连线路径格标记为1', () => {
        const conns: Connection[] = [{
            id: 'c1', tailFacing: 1 as Direction, headFacing: 1 as Direction,
            path: [{ x: 3, y: 3 }, { x: 4, y: 3 }], portType: 'Solid',
        }];
        const grid = buildConnectionGrid(conns, 10, 10);
        expect(grid[3 * 10 + 3]).toBe(1);
        expect(grid[3 * 10 + 4]).toBe(1);
    });

    it('按 portType 过滤', () => {
        const solid: Connection = {
            id: 'cs', tailFacing: 1 as Direction, headFacing: 1 as Direction,
            path: [{ x: 3, y: 3 }], portType: 'Solid',
        };
        const liquid: Connection = {
            id: 'cl', tailFacing: 1 as Direction, headFacing: 1 as Direction,
            path: [{ x: 5, y: 5 }], portType: 'Liquid',
        };
        const grid = buildConnectionGrid([solid, liquid], 10, 10, 'Solid');
        expect(grid[3 * 10 + 3]).toBe(1);
        expect(grid[5 * 10 + 5]).toBe(0);
    });

    it('越界连线点被忽略', () => {
        const conns: Connection[] = [{
            id: 'cx', tailFacing: 1 as Direction, headFacing: 1 as Direction,
            path: [{ x: -1, y: 5 }, { x: 100, y: 5 }], portType: 'Solid',
        }];
        const grid = buildConnectionGrid(conns, 10, 10);
        expect(grid.every(v => v === 0)).toBe(true);
    });
});

// ======================================================================
// buildExistingCornerGrid
// ======================================================================
describe('buildExistingCornerGrid', () => {
    it('空连线返回全零', () => {
        const grid = buildExistingCornerGrid([], 10, 10, 'Solid');
        expect(grid.every(v => v === 0)).toBe(true);
    });

    it('L形连线拐弯点标记为1', () => {
        const conns: Connection[] = [{
            id: 'c1', tailFacing: 1 as Direction, headFacing: 2 as Direction,
            path: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
            portType: 'Solid',
        }];
        const grid = buildExistingCornerGrid(conns, 10, 10, 'Solid');
        // 转弯在 (2,1)
        expect(grid[1 * 10 + 2]).toBe(1);
    });

    it('直线连线无拐弯点', () => {
        const conns: Connection[] = [{
            id: 'c1', tailFacing: 1 as Direction, headFacing: 1 as Direction,
            path: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
            portType: 'Solid',
        }];
        const grid = buildExistingCornerGrid(conns, 10, 10, 'Solid');
        expect(grid.every(v => v === 0)).toBe(true);
    });
});

// ======================================================================
// validateRouteConflicts
// ======================================================================
describe('validateRouteConflicts', () => {
    const gw = 10;
    const connMask = 2; // Solid mask
    const bridgeMask = MASK_SOLID_LOGISTICS;

    it('无障碍路径返回 true', () => {
        const mergedGrid = new Uint8Array(gw * gw);
        const sameConnGrid = new Uint8Array(gw * gw);
        const cornerGrid = new Uint8Array(gw * gw);
        const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
        const valid = validateRouteConflicts(path, 1 as Direction, 2 as Direction,
            sameConnGrid, mergedGrid, cornerGrid, bridgeMask, connMask, gw,
            { isContinuing: false, startPos: { x: 1, y: 1 } });
        expect(valid).toBe(true);
    });

    it('拐弯点在已有同类型连线上 → false', () => {
        const mergedGrid = new Uint8Array(gw * gw);
        const sameConnGrid = new Uint8Array(gw * gw);
        const cornerGrid = new Uint8Array(gw * gw);
        // L 形路径，转弯在 (2,1)
        const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
        // (2,1) 已有同类型连线
        sameConnGrid[1 * gw + 2] = 1;
        const valid = validateRouteConflicts(path, 1 as Direction, 2 as Direction,
            sameConnGrid, mergedGrid, cornerGrid, bridgeMask, connMask, gw,
            { isContinuing: false, startPos: { x: 1, y: 1 } });
        expect(valid).toBe(false);
    });

    it('桥掩码冲突 → false', () => {
        // 场景：Solid 连接线穿过已有 Solid 物流器所在格
        // Solid connMask=2, bridgeMask=3(lbr)
        // mergedGrid 中已有 Solid 物流器掩码=3 (bit0+bit1)
        // (bridgeMask & (mergedCell | connMask)) = 3 & (3 | 2) = 3 & 3 = 3 ≠ 2 → 冲突
        const mergedGrid = new Uint8Array(gw * gw);
        const sameConnGrid = new Uint8Array(gw * gw);
        const cornerGrid = new Uint8Array(gw * gw);
        sameConnGrid[1 * gw + 2] = 1;
        mergedGrid[1 * gw + 2] = 3; // Solid 物流器掩码 (bit0+bit1=3)
        const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
        const valid = validateRouteConflicts(path, 1 as Direction, 1 as Direction,
            sameConnGrid, mergedGrid, cornerGrid, bridgeMask, connMask, gw,
            { isContinuing: false, startPos: { x: 1, y: 1 } });
        expect(valid).toBe(false);
    });

    it('续接模式豁免起点拐弯', () => {
        const mergedGrid = new Uint8Array(gw * gw);
        const sameConnGrid = new Uint8Array(gw * gw);
        const cornerGrid = new Uint8Array(gw * gw);
        // L 形路径，转弯在起点 (1,1)——续接场景
        const path = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
        // (1,1) 有同类型连线
        sameConnGrid[1 * gw + 1] = 1;
        const valid = validateRouteConflicts(path, 1 as Direction, 2 as Direction,
            sameConnGrid, mergedGrid, cornerGrid, bridgeMask, connMask, gw,
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

    // 构造一个简单的 2x2 机器，有输入端口在左侧
    const targetMachine: PlacedMachine = {
        id: 'target', machineId: 'ref', x: 10, y: 10, rotation: 0 as Direction,
    };

    it('无可用输入端口时返回视觉 fallback', () => {
        const mergedGrid = new Uint8Array(gw * gh);
        const sameConnGrid = new Uint8Array(gw * gh);
        const cornerGrid = new Uint8Array(gw * gh);
        // 用不匹配的 portType 查询——应该找不到端口
        const result = findRouteForMachine(
            { x: 5, y: 10 }, 1 as Direction, targetMachine, 'Liquid', 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, 4, gw, gh,
            false, { x: 5, y: 10 }
        );
        // ref 机器没有 Liquid 输入端口——返回 fallback
        expect(result.isValid).toBe(false);
    });

    it('找到匹配输入端口并返回合法路径', () => {
        const mergedGrid = new Uint8Array(gw * gh);
        const sameConnGrid = new Uint8Array(gw * gh);
        const cornerGrid = new Uint8Array(gw * gh);
        // ref 有 Solid 输入端口，从左侧 (5,10) 水平右到 (9,10) 附近
        const result = findRouteForMachine(
            { x: 5, y: 10 }, 1 as Direction, targetMachine, 'Solid', 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gw, gh,
            false, { x: 5, y: 10 }
        );
        // 应该找到合法路径
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

    it('无障碍时返回合法 L 形路径', () => {
        const mergedGrid = new Uint8Array(gw * gh);
        const sameConnGrid = new Uint8Array(gw * gh);
        const cornerGrid = new Uint8Array(gw * gh);
        const result = findRouteToGround(
            { x: 5, y: 5 }, 1 as Direction, { x: 10, y: 8 }, 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gw, gh, false
        );
        expect(result.isValid).toBe(true);
        expect(result.path[0]).toEqual({ x: 5, y: 5 });
        expect(result.path[result.path.length - 1]).toEqual({ x: 10, y: 8 });
    });

    it('起点被阻挡 → 视觉 fallback (isValid=false)', () => {
        const mergedGrid = new Uint8Array(gw * gh);
        const sameConnGrid = new Uint8Array(gw * gh);
        const cornerGrid = new Uint8Array(gw * gh);
        mergedGrid[5 * gw + 5] = connMask; // 起点被阻挡
        const result = findRouteToGround(
            { x: 5, y: 5 }, 1 as Direction, { x: 10, y: 8 }, 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gw, gh, false
        );
        expect(result.isValid).toBe(false);
    });

    it('路径被阻挡 → 视觉 fallback', () => {
        const mergedGrid = new Uint8Array(gw * gh);
        const sameConnGrid = new Uint8Array(gw * gh);
        const cornerGrid = new Uint8Array(gw * gh);
        // 水平优先 L 形：从 (5,5) 先水平到 (10,5)，再垂直到 (10,8)
        // 阻挡 (6,5)，即水平段第一步
        mergedGrid[5 * gw + 6] = connMask;
        const result = findRouteToGround(
            { x: 5, y: 5 }, 1 as Direction, { x: 10, y: 8 }, 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gw, gh, false
        );
        // auto 模式会尝试备选 L 形——垂直优先：先下到 (5,8) 再右到 (10,8)
        // 如果垂直优先也受阻才 fallback
        // 这里只阻了水平方向(6,5)，垂直方向 (5,6) 应该通畅
        expect(result.isValid).toBe(true);
    });

    it('两条 L 形都被阻挡 → 视觉 fallback', () => {
        const mergedGrid = new Uint8Array(gw * gh);
        const sameConnGrid = new Uint8Array(gw * gh);
        const cornerGrid = new Uint8Array(gw * gh);
        // 阻挡水平路径 (6,5) 和垂直备选路径 (5,6)
        mergedGrid[5 * gw + 6] = connMask;
        mergedGrid[6 * gw + 5] = connMask;
        const result = findRouteToGround(
            { x: 5, y: 5 }, 1 as Direction, { x: 10, y: 8 }, 'auto',
            mergedGrid, sameConnGrid, cornerGrid, bridgeMask, connMask, gw, gh, false
        );
        expect(result.isValid).toBe(false);
    });
});
