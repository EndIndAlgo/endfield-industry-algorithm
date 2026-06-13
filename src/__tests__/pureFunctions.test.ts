import { describe, it, expect } from 'vitest';
import {
    getBoundingBox,
    routeManhattan,
    getCornerPoints,
    splitConnectionAt,
    dirFromPoints,
} from '../utils/gridUtils';
import { getRotatedPorts, getRotatedDimensions } from '../utils/machineUtils';
import type { Connection, Direction, PortConfig, PortType } from '../types';

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
