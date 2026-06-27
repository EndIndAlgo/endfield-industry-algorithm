import type { StateCreator } from 'zustand';
import type { ConnectionSlice, GameState } from './types';
import type { Connection, Point, Direction, PlacedMachine, PortType } from '@/types';
import { portTypeToMask, MASK_SOLID_LOGISTICS, MASK_LIQUID_LOGISTICS } from '@/types';
import { Mask } from '@/utils/mask';
import { getMachineConfigById } from '@/utils/machineUtils';
import {
    findMachineAt,
    splitConnectionAt,
    buildMergedGrid,
    buildConnectionGrid,
    buildExistingCornerGrid,
    findRouteForMachine,
    findRouteToGround,
    getCornerPoints,
    checkStartOverlap,
} from '@/utils/grid';

// ── 占用网格缓存 ──
// 连线模式下每帧 updatePreview 重建三个网格，但 machines/connections 在帧之间不变。
// 用引用相等检测（Zustand 每次 mutation 创建新数组引用），零成本命中。
interface GridCache {
    machines: PlacedMachine[];
    connections: Connection[];
    gw: number;
    gh: number;
    portType: PortType;
    mergedGrid: Uint8Array;
    sameConnGrid: Uint8Array;
    existingCornerGrid: Uint8Array;
}
let _gridCache: GridCache | null = null;

export const createConnectionSlice: StateCreator<GameState, [], [], ConnectionSlice> = (set, get) => ({
    connections: [],

    startConnecting: (ports, portType) => {
        // 过滤越界端口（边缘机器朝外端口的外侧格可能在地图外）
        const { gridWidth, gridHeight } = get();
        const gw = gridWidth || 100;
        const gh = gridHeight || 100;
        const validPorts = ports.filter(p =>
            p.pos.x >= 0 && p.pos.x < gw && p.pos.y >= 0 && p.pos.y < gh
        );
        if (validPorts.length === 0) return;

        const first = validPorts[0];
        set({
            modeState: {
                kind: 'WIRE',
                portType: portType as 'Solid' | 'Liquid',
                connecting: {
                    availablePorts: validPorts,
                    activeStartPos: first.pos,
                    activeTailFacing: first.facing,
                    previewPath: [first.pos],
                    previewHeadFacing: first.facing,
                    isValidPath: true,
                    lShapeMode: 'auto',
                    isContinuing: false,
                    continueSourceId: null,
                    previewTargetIsMachine: false,
                },
            },
        });
    },

    updatePreview: (mouseGridPos) => {
        const ms = get().modeState;
        if (ms.kind !== 'WIRE' || !ms.connecting) return;

        const { connections, machines, gridWidth, gridHeight } = get();
        const { availablePorts, portType, lShapeMode, isContinuing } = { portType: ms.portType, ...ms.connecting };
        if (availablePorts.length === 0) return;

        // ── 构建占用网格（提前构建，所有端口共用）──
        const gw = gridWidth || 100;
        const gh = gridHeight || 100;
        const connMask = portTypeToMask[portType];
        const bridgeMask = portType === 'Solid' ? MASK_SOLID_LOGISTICS : MASK_LIQUID_LOGISTICS;

        let mergedGrid: Uint8Array;
        let sameConnGrid: Uint8Array;
        let existingCornerGrid: Uint8Array;

        if (_gridCache &&
            _gridCache.machines === machines &&
            _gridCache.connections === connections &&
            _gridCache.gw === gw && _gridCache.gh === gh &&
            _gridCache.portType === portType) {
            mergedGrid = _gridCache.mergedGrid;
            sameConnGrid = _gridCache.sameConnGrid;
            existingCornerGrid = _gridCache.existingCornerGrid;
        } else {
            mergedGrid = buildMergedGrid(machines, connections, gw, gh, portType);
            sameConnGrid = buildConnectionGrid(connections, gw, gh, portType);
            existingCornerGrid = buildExistingCornerGrid(connections, gw, gh, portType);
            _gridCache = { machines, connections, gw, gh, portType, mergedGrid, sameConnGrid, existingCornerGrid };
        }

        // ── 查找目标机器（提前计算，所有端口共用）──
        const targetMachine = findMachineAt(mouseGridPos, machines);

        // ── 按距离排序，逐个尝试端口，选第一个能连通的 ──
        const sortedPorts = [...availablePorts].sort((a, b) =>
            (Math.abs(a.pos.x - mouseGridPos.x) + Math.abs(a.pos.y - mouseGridPos.y)) -
            (Math.abs(b.pos.x - mouseGridPos.x) + Math.abs(b.pos.y - mouseGridPos.y))
        );

        let bestStartPos = sortedPorts[0].pos;
        let bestTailFacing = sortedPorts[0].facing;
        let bestResult: { path: Point[]; headFacing: Direction; isValid: boolean; targetIsMachine: boolean } | null = null;

        for (const port of sortedPorts) {
            const startPos = port.pos;
            const tailFacing = port.facing;

            // 边界检查
            if (startPos.x < 0 || startPos.x >= gw || startPos.y < 0 || startPos.y >= gh) continue;
            // 起点重叠检查（续接豁免）
            if (!checkStartOverlap(startPos, tailFacing, connections, portType, isContinuing)) continue;

            if (targetMachine) {
                const result = findRouteForMachine(
                    startPos, tailFacing, targetMachine, portType, lShapeMode,
                    mergedGrid, sameConnGrid, existingCornerGrid, bridgeMask, connMask,
                    gw, gh, isContinuing, mouseGridPos
                );
                if (result.isValid) { bestStartPos = startPos; bestTailFacing = tailFacing; bestResult = result; break; }
                if (!bestResult) { bestStartPos = startPos; bestTailFacing = tailFacing; bestResult = result; }
            } else {
                const result = findRouteToGround(
                    startPos, tailFacing, mouseGridPos, lShapeMode,
                    mergedGrid, sameConnGrid, existingCornerGrid, bridgeMask, connMask,
                    gw, gh, isContinuing
                );
                const wrapper = { ...result, targetIsMachine: false };
                if (result.isValid) { bestStartPos = startPos; bestTailFacing = tailFacing; bestResult = wrapper; break; }
                if (!bestResult) { bestStartPos = startPos; bestTailFacing = tailFacing; bestResult = wrapper; }
            }
        }

        set({
            modeState: {
                kind: 'WIRE',
                portType: ms.portType,
                connecting: {
                    ...ms.connecting,
                    activeStartPos: bestStartPos,
                    activeTailFacing: bestTailFacing,
                    previewPath: bestResult!.path,
                    previewHeadFacing: bestResult!.headFacing,
                    isValidPath: bestResult!.isValid,
                    previewTargetIsMachine: bestResult!.targetIsMachine,
                },
            },
        });
    },

    toggleLShape: () => {
        const ms = get().modeState;
        if (ms.kind !== 'WIRE' || !ms.connecting) return;

        const NEXT: Record<string, typeof ms.connecting.lShapeMode> = {
            'auto': 'perpendicular',
            'perpendicular': 'same-dir',
            'same-dir': 'auto',
        };

        set({
            modeState: {
                kind: 'WIRE',
                portType: ms.portType,
                connecting: { ...ms.connecting, lShapeMode: NEXT[ms.connecting.lShapeMode] },
            },
        });
    },

    commitConnection: () => {
        const ms = get().modeState;
        if (ms.kind !== 'WIRE' || !ms.connecting) return;

        const { connections, machines } = get();
        const { activeTailFacing, previewPath, previewHeadFacing, isValidPath, isContinuing, previewTargetIsMachine } = ms.connecting;
        const wiringPortType = ms.portType;

        if (!isValidPath || previewPath.length === 0) {
            set({ modeState: { kind: 'WIRE', portType: wiringPortType, connecting: null } });
            return;
        }

        // ── 防御性边界检查：路径点全部必须在网格内 ──
        const { gridWidth: gwChk, gridHeight: ghChk } = get();
        const wChk = gwChk || 100; const hChk = ghChk || 100;
        if (previewPath.some(p => p.x < 0 || p.x >= wChk || p.y < 0 || p.y >= hChk)) {
            set({ modeState: { kind: 'WIRE', portType: wiringPortType, connecting: null } });
            return;
        }

        // ── 起点重叠检查（续接豁免，作为防御性二次校验）──
        if (!checkStartOverlap(previewPath[0], activeTailFacing, connections, wiringPortType, isContinuing)) {
            set({ modeState: { kind: 'WIRE', portType: wiringPortType, connecting: null } });
            return;
        }

        const path = [...previewPath];
        const tailFacing = activeTailFacing;
        const headFacing = previewHeadFacing;

        // ── 交叉检测与桥生成 ──
        const pointToConns = new Map<string, Connection[]>();
        for (const conn of connections) {
            if (conn.portType !== wiringPortType) continue;
            for (const p of conn.path) {
                const key = `${p.x},${p.y}`;
                const list = pointToConns.get(key) || [];
                list.push(conn);
                pointToConns.set(key, list);
            }
        }

        // 已有同类型连线拐弯点 (桥不能放在已有线的拐弯处)
        const { gridWidth: gw2, gridHeight: gh2 } = get();
        const existingCornerGrid2 = new Uint8Array((gw2 || 100) * (gh2 || 100));
        for (const conn of connections) {
            if (conn.portType !== wiringPortType) continue;
            for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
                const w = gw2 || 100;
                if (cp.x >= 0 && cp.x < w && cp.y >= 0 && cp.y < (gh2 || 100)) {
                    existingCornerGrid2[cp.y * w + cp.x] = 1;
                }
            }
        }

        const intersectionPoints: Point[] = [];
        for (const p of path) {
            // 续接时首格与上一段重合是有意为之，不放桥
            if (isContinuing && p.x === path[0].x && p.y === path[0].y) continue;
            const key = `${p.x},${p.y}`;
            if (pointToConns.has(key)) {
                const w = gw2 || 100;
                // 交叉点在已有线拐弯处 → 不放桥，不拆分
                if (existingCornerGrid2[p.y * w + p.x]) continue;
                intersectionPoints.push(p);
            }
        }

        const bridgeId = wiringPortType === 'Liquid' ? 'pbr' : 'lbr';
        const bridgeMask = getMachineConfigById(bridgeId)!.mask.maxMask;
        const connMask2 = portTypeToMask[wiringPortType];

        // 构建全量掩码网格 (机器 + 全部连线)
        const { gridWidth: gw3, gridHeight: gh3 } = get();
        const w3 = gw3 || 100; const h3 = gh3 || 100;
        const fullMask = Mask.Uniform(w3, h3, 0);
        for (const m of machines) {
            const cfg = getMachineConfigById(m.machineId);
            if (!cfg) continue;
            fullMask.MergeInPlace(cfg.mask4![m.rotation], m.x, m.y);
        }
        for (const c of connections) {
            const cm = portTypeToMask[c.portType];
            for (const p of c.path) {
                if (p.x >= 0 && p.x < w3 && p.y >= 0 && p.y < h3) { fullMask.data[p.y * w3 + p.x] |= cm; }
            }
        }
        const fullMaskGrid = fullMask.data;

        const bridgesToCreate: PlacedMachine[] = [];
        for (const p of intersectionPoints) {
            const cellMask = fullMaskGrid[p.y * w3 + p.x];
            // bridgeMask 与 cellMask 的冲突不能超出同类型连线层
            if ((bridgeMask & cellMask) !== connMask2) continue;
            bridgesToCreate.push({
                id: crypto.randomUUID(),
                machineId: bridgeId,
                x: p.x, y: p.y,
                rotation: 0,
            });
        }

        // ── 拆分被穿越的已有连线 ──
        const connsToRemove = new Set<string>();
        let connsToAdd: Connection[] = [];
        for (const p of intersectionPoints) {
            const key = `${p.x},${p.y}`;
            const crossed = pointToConns.get(key) || [];
            for (const orig of crossed) {
                if (connsToRemove.has(orig.id)) continue;
                connsToRemove.add(orig.id);
                connsToAdd.push(...splitConnectionAt(orig, p));
            }
            // 递归拆分新增碎片（若碎片仍经过交叉点）
            const pending = [...connsToAdd];
            connsToAdd = [];
            for (const part of pending) {
                if (part.path.some(pt => pt.x === p.x && pt.y === p.y)) {
                    connsToAdd.push(...splitConnectionAt(part, p));
                } else {
                    connsToAdd.push(part);
                }
            }
        }

        // ── 拆分新连线 ──
        let newConns: Connection[] = [{
            id: crypto.randomUUID(),
            tailFacing,
            path,
            headFacing,
            portType: wiringPortType,
        }];
        for (const p of intersectionPoints) {
            newConns = newConns.flatMap(c => splitConnectionAt(c, p));
        }

        // ── 续接：将上一段连线从 store 搬到 connsToAdd 参与合并 ──
        if (isContinuing) {
            const prevConn = connections.find(c => {
                if (c.portType !== wiringPortType) return false;
                if (connsToRemove.has(c.id)) return false; // 已被其他交点拆分，跳过
                const last = c.path[c.path.length - 1];
                return last.x === path[0].x && last.y === path[0].y && c.headFacing === tailFacing;
            });
            if (prevConn) {
                connsToRemove.add(prevConn.id);
                connsToAdd.push(prevConn);
            }
        }

        // ── 合并检测：新连线起点 = 已有连线终点 → 合并为一条 ──
        const finalConns: Connection[] = [];
        const usedNewIds = new Set<string>();

        for (const nc of newConns) {
            let merged = false;
            for (let i = 0; i < connsToAdd.length; i++) {
                const existing = connsToAdd[i];
                if (existing.portType !== nc.portType) continue;
                // 新连线起点 == 已有连线终点（运输方向：已有 → 新）
                const ncStart = nc.path[0];
                const exEnd = existing.path[existing.path.length - 1];
                if (ncStart.x === exEnd.x && ncStart.y === exEnd.y && nc.tailFacing === existing.headFacing) {
                    const mergedPath = [...existing.path, ...nc.path.slice(1)];
                    connsToAdd.splice(i, 1);
                    connsToAdd.push({ ...existing, path: mergedPath, headFacing: nc.headFacing });
                    merged = true;
                    break;
                }
                // 新连线终点 == 已有连线起点（运输方向：新 → 已有）
                const ncEnd = nc.path[nc.path.length - 1];
                const exStart = existing.path[0];
                if (ncEnd.x === exStart.x && ncEnd.y === exStart.y && existing.tailFacing === nc.headFacing) {
                    const mergedPath = [...nc.path, ...existing.path.slice(1)];
                    connsToAdd.splice(i, 1);
                    connsToAdd.push({ ...existing, path: mergedPath, tailFacing: nc.tailFacing });
                    merged = true;
                    break;
                }
            }
            if (!merged) {
                finalConns.push(nc);
                usedNewIds.add(nc.id);
            }
        }

        // ── 写入 store ──
        const lastPos = path[path.length - 1];
        const continueFacing = headFacing;

        // 不续接的情况：
        // 1. 最后一格放了桥（交叉点，不是自然延伸方向）
        // 2. 用户点击了机器来结束连线（物流引导已完成）
        const lastPosHasBridge = bridgesToCreate.some(b => b.x === lastPos.x && b.y === lastPos.y);
        const shouldNotContinue = lastPosHasBridge || previewTargetIsMachine;

        set(s => ({
            machines: [...s.machines, ...bridgesToCreate],
            connections: [
                ...s.connections.filter(c => !connsToRemove.has(c.id)),
                ...connsToAdd,
                ...finalConns,
            ],
            modeState: shouldNotContinue
                ? { kind: 'WIRE', portType: wiringPortType, connecting: null }
                : {
                    kind: 'WIRE',
                    portType: wiringPortType,
                    connecting: {
                        availablePorts: [{ pos: lastPos, facing: continueFacing }],
                        activeStartPos: lastPos,
                        activeTailFacing: continueFacing,
                        previewPath: [lastPos],
                        previewHeadFacing: continueFacing,
                        isValidPath: true,
                        lShapeMode: 'auto',
                        isContinuing: true,
                        continueSourceId: null,
                        previewTargetIsMachine: false,
                    },
                },
        }));
    },

    cancelConnection: () => {
        const ms = get().modeState;
        const portType = ms.kind === 'WIRE' ? ms.portType : 'Solid';
        set({
            modeState: { kind: 'WIRE', portType, connecting: null },
        });
    },
});
