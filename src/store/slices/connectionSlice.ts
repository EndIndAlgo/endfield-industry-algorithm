import type { StateCreator } from 'zustand';
import type { ConnectionSlice, GameState } from './types';
import type { Connection, Point, Direction, PlacedMachine, PortType } from '@/types';
import { portTypeToMask } from '@/types';
import { Mask } from '@/utils/mask';
import { getMachineConfigById, resolveMachineMasks } from '@/utils/machineUtils';
import { isViewingOwn } from '@/utils/blueprintGuard';
import { buildDescendantLineMask } from '@/utils/blueprintPlacement';
import { toaster } from '@/utils/toaster';
import {
    findMachineAt,
    splitConnectionAt,
    buildConnectionGrid,
    buildExistingCornerGrid,
    findRouteForMachine,
    findRouteToGround,
    checkStartOverlap,
    getCornerPoints,
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
    mergedGrid: Mask;
    sameConnGrid: Mask;
    existingCornerGrid: Mask;
}
let _gridCache: GridCache | null = null;

export const createConnectionSlice: StateCreator<GameState, [], [], ConnectionSlice> = (set, get) => ({
    connections: [],

    startConnecting: (ports, portType) => {
        // Guard + 边界过滤
        const { gridWidth, gridHeight, currentViewingNodeId, machines } = get();
        const gw = gridWidth || 100;
        const gh = gridHeight || 100;
        const validPorts = ports.filter((p) => {
            if (p.pos.x < 0 || p.pos.x >= gw || p.pos.y < 0 || p.pos.y >= gh) return false;
            // 端口外侧格按机器旋转后占地命中（多格机器整格覆盖，旧 1×1 判定永远不命中）
            const m = findMachineAt(p.pos, machines);
            if (m && !isViewingOwn(m, currentViewingNodeId)) return false;
            return true;
        });
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

        const { connections, machines, gridWidth, gridHeight, currentViewingNodeId } = get();
        const { availablePorts, portType, lShapeMode, isContinuing } = { portType: ms.portType, ...ms.connecting };
        if (availablePorts.length === 0) return;

        // ── 构建占用网格（提前构建，所有端口共用）──
        const gw = gridWidth || 100;
        const gh = gridHeight || 100;
        const connMask = portTypeToMask[portType];
        const bridgeId = portType === 'Solid' ? 'lbr' : 'pbr';
        const bridgeMask = getMachineConfigById(bridgeId)!.mask.maxMask;

        let mergedGrid: Mask;
        let sameConnGrid: Mask;
        let existingCornerGrid: Mask;

        if (_gridCache &&
            _gridCache.machines === machines &&
            _gridCache.connections === connections &&
            _gridCache.gw === gw && _gridCache.gh === gh &&
            _gridCache.portType === portType) {
            mergedGrid = _gridCache.mergedGrid;
            sameConnGrid = _gridCache.sameConnGrid;
            existingCornerGrid = _gridCache.existingCornerGrid;
        } else {
            // 自有连线参与常规占用/交叉逻辑（同类型可通过、交叉放桥）；
            // 后代连线整体视为不可穿透障碍（子蓝图不可变：不交叉、不架桥、不拆分）
            const ownConns = connections.filter(c => isViewingOwn(c, currentViewingNodeId));
            mergedGrid = Mask.FromOccupancy({ machines: resolveMachineMasks(machines), connections: ownConns, gridW: gw, gridH: gh, excludePortType: portType });
            for (const c of connections) {
                if (isViewingOwn(c, currentViewingNodeId)) continue;
                const v = portTypeToMask[c.portType];
                if (!v) continue;
                for (const p of c.path) {
                    if (p.x >= 0 && p.x < gw && p.y >= 0 && p.y < gh) {
                        // 0xFF：任何类型的连线都不可通过（含异类型视觉交叉）
                        mergedGrid.WriteValue(p.x, p.y, 0xFF);
                    }
                }
            }
            sameConnGrid = buildConnectionGrid(ownConns, gw, gh, portType);
            existingCornerGrid = buildExistingCornerGrid(ownConns, gw, gh, portType);
            _gridCache = { machines, connections, gw, gh, portType, mergedGrid, sameConnGrid, existingCornerGrid };
        }

        // ── 查找目标机器（提前计算，所有端口共用）──
        let targetMachine = findMachineAt(mouseGridPos, machines);
        // 子蓝图只读：自有连线不得吸附到后代机器的输入端口
        if (targetMachine && !isViewingOwn(targetMachine, currentViewingNodeId)) {
            targetMachine = null;
        }

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
                    gh, isContinuing, mouseGridPos
                );
                if (result.isValid) { bestStartPos = startPos; bestTailFacing = tailFacing; bestResult = result; break; }
                if (!bestResult) { bestStartPos = startPos; bestTailFacing = tailFacing; bestResult = result; }
            } else {
                const result = findRouteToGround(
                    startPos, tailFacing, mouseGridPos, lShapeMode,
                    mergedGrid, sameConnGrid, existingCornerGrid, bridgeMask, connMask,
                    gh, isContinuing
                );
                const wrapper = { ...result, targetIsMachine: false };
                if (result.isValid) { bestStartPos = startPos; bestTailFacing = tailFacing; bestResult = wrapper; break; }
                if (!bestResult) { bestStartPos = startPos; bestTailFacing = tailFacing; bestResult = wrapper; }
            }
        }

        // 所有候选端口都被起点重叠检查过滤（点击已被连线占用的输出口）：
        // 无可用路径 → 取消连线状态，避免 bestResult 空引用崩溃
        if (!bestResult) {
            set({ modeState: { kind: 'WIRE', portType: ms.portType, connecting: null } });
            return;
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

        const { connections, machines, currentViewingNodeId } = get();
        const viewingNodeId = currentViewingNodeId ?? undefined;
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

        // ── 交叉检测与桥生成（只对自有连线做交叉/拆分；后代连线不可变） ──
        const pointToConns = new Map<string, Connection[]>();
        for (const conn of connections) {
            if (conn.portType !== wiringPortType) continue;
            if (!isViewingOwn(conn, currentViewingNodeId)) continue;
            for (const p of conn.path) {
                const key = `${p.x},${p.y}`;
                const list = pointToConns.get(key) || [];
                list.push(conn);
                pointToConns.set(key, list);
            }
        }

        // 已有同类型连线拐弯点 (桥不能放在已有线的拐弯处)；仅自有连线
        const { gridWidth: gw2, gridHeight: gh2 } = get();
        const w = gw2 || 100; const h = gh2 || 100;
        const ownConnsAll = connections.filter(c => isViewingOwn(c, currentViewingNodeId));
        const existingCornerGrid2 = buildExistingCornerGrid(ownConnsAll, w, h, wiringPortType);

        // ── 子蓝图不可变：新连线不得穿过后代连线区域（同类型/异类型均拒绝） ──
        const descLineMask = buildDescendantLineMask(connections, currentViewingNodeId, w, h);
        const newConnCells = [...path, ...getCornerPoints(path, tailFacing, headFacing)];
        if (newConnCells.some(p =>
            p.x >= 0 && p.x < w && p.y >= 0 && p.y < h
            && descLineMask.get(p.x, p.y) !== 0)) {
            toaster.create({
                title: '连线与子蓝图区域冲突，无法提交',
                type: 'warning',
                duration: 3000,
            });
            set({ modeState: { kind: 'WIRE', portType: wiringPortType, connecting: null } });
            return;
        }

        const intersectionPoints: Point[] = [];
        for (const p of path) {
            // 续接时首格与上一段重合是有意为之，不放桥
            if (isContinuing && p.x === path[0].x && p.y === path[0].y) continue;
            const key = `${p.x},${p.y}`;
            if (pointToConns.has(key)) {
                // 交叉点在已有线拐弯处 → 不放桥，不拆分
                if (existingCornerGrid2.get(p.x, p.y)) continue;
                intersectionPoints.push(p);
            }
        }

        const bridgeId = wiringPortType === 'Liquid' ? 'pbr' : 'lbr';
        const bridgeMask = getMachineConfigById(bridgeId)!.mask.maxMask;
        const connMask2 = portTypeToMask[wiringPortType];

        // 构建全量掩码网格 (机器 + 全部连线)
        const { gridWidth: gw3, gridHeight: gh3 } = get();
        const w3 = gw3 || 100; const h3 = gh3 || 100;
        const fullMask = Mask.FromOccupancy({ machines: resolveMachineMasks(machines), connections, gridW: w3, gridH: h3 });
        const bridgesToCreate: PlacedMachine[] = [];
        for (const p of intersectionPoints) {
            const cellMask = fullMask.get(p.x, p.y);
            // bridgeMask 与 cellMask 的冲突不能超出同类型连线层
            if ((bridgeMask & cellMask) !== connMask2) continue;
            bridgesToCreate.push({
                id: crypto.randomUUID(),
                machineId: bridgeId,
                x: p.x, y: p.y,
                rotation: 0,
                blueprintNodeId: viewingNodeId,
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
                const parts = splitConnectionAt(orig, p);
                // 单格连线（面对面机器）无法分割 → 保留原样，不丢失
                if (parts.length === 0) continue;
                connsToRemove.add(orig.id);
                connsToAdd.push(...parts);
            }
            // 递归拆分新增碎片（若碎片仍经过交叉点）
            const pending = [...connsToAdd];
            connsToAdd = [];
            for (const part of pending) {
                if (part.path.some(pt => pt.x === p.x && pt.y === p.y)) {
                    const sub = splitConnectionAt(part, p);
                    connsToAdd.push(...(sub.length > 0 ? sub : [part]));
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
            blueprintNodeId: viewingNodeId,
        }];
        for (const p of intersectionPoints) {
            newConns = newConns.flatMap(c => {
                const parts = splitConnectionAt(c, p);
                return parts.length > 0 ? parts : [c];
            });
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

        // 快照在真正写入前拍摄（无效提交的早期 return 不产生空转撤销步）
        get().takeSnapshot();

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
