import type { StateCreator } from 'zustand';
import type { ConnectionSlice, GameState } from './types';
import type { Connection, Point, Direction, PlacedMachine } from '../../types';
import { sideToDir, GameMode, portTypeToMask, MASK_SOLID_LOGISTICS, MASK_LIQUID_LOGISTICS } from '../../types';
import { getMachineMask, getMachineCellMask } from '../../utils/machineUtils';
import { MACHINES } from '../../config/machines';
import {
    trySingleLRoute,
    computeHeadFacing,
    getInputPortOuterCells,
    findMachineAt,
    splitConnectionAt,
    buildMergedGrid,
    buildConnectionGrid,
    getCornerPoints,
} from '../../utils/grid';
import { getRotatedDimensions } from '../../utils/machineUtils';

/** portDir 的垂直方向（取两个垂直方向中与目标更接近的那个） */
const perpendicularDir = (dir: Direction, start: Point, end: Point): Direction => {
    // 垂直方向有两个候选，取能让第一步更接近目标的方向
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dir === 0 || dir === 2) {
        // 垂直端口(上/下)，垂直方向是水平
        return dx > 0 ? 1 : dx < 0 ? 3 : 1;
    }
    // 水平端口(左/右)，垂直方向是垂直
    return dy > 0 ? 2 : dy < 0 ? 0 : 2;
};

export const createConnectionSlice: StateCreator<GameState, [], [], ConnectionSlice> = (set, get) => ({
    connections: [],
    isConnecting: false,
    isValidPath: true,
    availablePorts: [],
    portType: 'Solid',
    activeStartPos: { x: 0, y: 0 },
    activeTailFacing: 1 as Direction,
    previewPath: [],
    previewHeadFacing: 1 as Direction,
    lShapeMode: 'auto',
    isContinuing: false,
    continueSourceId: null,
    previewTargetIsMachine: false,

    startConnecting: (ports, portType) => {
        const first = ports[0];
        set({
            isConnecting: true,
            isContinuing: false,
            continueSourceId: null,
            previewTargetIsMachine: false,
            isValidPath: true,
            availablePorts: ports,
            portType,
            lShapeMode: 'auto',
            activeStartPos: first.pos,
            activeTailFacing: first.facing,
            previewPath: [first.pos],
            previewHeadFacing: first.facing,
        });
    },

    updatePreview: (mouseGridPos) => {
        const { availablePorts, portType, lShapeMode, connections, machines, gridWidth, gridHeight,
            isContinuing } = get();
        if (availablePorts.length === 0) return;

        // ── 第1步：从可用端口中选离鼠标最近的一个 ──
        let bestPort = availablePorts[0];
        let bestDist = Math.abs(bestPort.pos.x - mouseGridPos.x) + Math.abs(bestPort.pos.y - mouseGridPos.y);
        for (let i = 1; i < availablePorts.length; i++) {
            const p = availablePorts[i];
            const d = Math.abs(p.pos.x - mouseGridPos.x) + Math.abs(p.pos.y - mouseGridPos.y);
            if (d < bestDist) {
                bestDist = d;
                bestPort = p;
            }
        }
        const startPos = bestPort.pos;
        const tailFacing = bestPort.facing;

        // ── 构建占用网格 (掩码系统) ──
        const gw = gridWidth || 100;
        const gh = gridHeight || 100;
        const connMask = portTypeToMask[portType];
        const bridgeMask = portType === 'Solid' ? MASK_SOLID_LOGISTICS : MASK_LIQUID_LOGISTICS;
        const sameConnGrid = buildConnectionGrid(connections, gw, gh, portType);
        const mergedGrid = buildMergedGrid(machines, connections, gw, gh, portType);

        // 已有同类型连线的拐弯点 (桥不能放在已有线的拐弯上)
        const existingCornerGrid = new Uint8Array(gw * gh);
        for (const conn of connections) {
            if (conn.portType !== portType) continue;
            for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
                if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < gh) {
                    existingCornerGrid[cp.y * gw + cp.x] = 1;
                }
            }
        }

        // ── 检查起点自身 ──
        if (startPos.x < 0 || startPos.x >= gw || startPos.y < 0 || startPos.y >= gh) {
            set({ activeStartPos: startPos, activeTailFacing: tailFacing, previewPath: [startPos, mouseGridPos], previewHeadFacing: tailFacing, isValidPath: false, previewTargetIsMachine: false });
            return;
        }

        // ── 第2步：判断鼠标下方是什么 ──
        const targetMachine = findMachineAt(mouseGridPos, machines);
        const targetPortType = portType;

        if (targetMachine) {
            // 鼠标在机器上 → 找匹配输入端口
            const inputCells = getInputPortOuterCells(targetMachine, targetPortType);

            let bestInput: { pos: Point; side: 'top' | 'right' | 'bottom' | 'left'; path: Point[] } | null = null;
            let bestInputDist = Infinity;

            for (const ic of inputCells) {
                // 确定 firstAxis（auto 模式与 same-dir 一样先试同向）
                const firstAxis = lShapeMode === 'perpendicular'
                    ? perpendicularDir(tailFacing, startPos, ic.pos)
                    : tailFacing;

                // 检查起点已在同类型连线上的情况（拐弯检测）
                if (startPos.x === ic.pos.x && startPos.y === ic.pos.y) {
                    // 起终点相同：检查该格是否被阻
                    if ((mergedGrid[startPos.y * gw + startPos.x] & connMask) === 0) {
                        const entryDir = ((sideToDir[ic.side] + 2) % 4) as Direction;
                        if (!isContinuing && sameConnGrid[startPos.y * gw + startPos.x] && tailFacing !== entryDir) {
                            continue; // 非续接时拐弯在同类型线上 → 不放桥（续接首格豁免）
                        }
                        // 桥掩码冲突检查
                        if (sameConnGrid[startPos.y * gw + startPos.x]) {
                            const cellMask = mergedGrid[startPos.y * gw + startPos.x] | connMask;
                            if ((bridgeMask & cellMask) !== connMask) continue;
                            if (existingCornerGrid[startPos.y * gw + startPos.x]) continue;
                        }
                        bestInput = { pos: ic.pos, side: ic.side, path: [startPos] };
                        bestInputDist = 0;
                        break;
                    }
                    continue;
                }

                // 检查起点是否被阻挡
                if ((mergedGrid[startPos.y * gw + startPos.x] & connMask) !== 0) continue;

                let path = trySingleLRoute(startPos, ic.pos, firstAxis, mergedGrid, gw, gh, connMask);
                if (!path && lShapeMode === 'auto') {
                    path = trySingleLRoute(startPos, ic.pos, perpendicularDir(tailFacing, startPos, ic.pos), mergedGrid, gw, gh, connMask);
                }
                if (!path) continue;

                // 完整路径 = [startPos, ...path]
                const fullPath = [startPos, ...path];

                // 检查新路径拐弯点是否在同类型连线上（自动续接时豁免起点格）
                const entryDir = ((sideToDir[ic.side] + 2) % 4) as Direction;
                let cornerOnSame = false;
                for (const cp of getCornerPoints(fullPath, tailFacing, entryDir)) {
                    if (isContinuing && cp.x === startPos.x && cp.y === startPos.y) continue;
                    if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < gh && sameConnGrid[cp.y * gw + cp.x]) {
                        cornerOnSame = true;
                        break;
                    }
                }
                if (cornerOnSame) continue;

                // 桥掩码冲突检查 (物理冲突 + 拐弯约束)
                let bridgeConflict = false;
                for (const p of fullPath) {
                    if (isContinuing && p.x === startPos.x && p.y === startPos.y) continue;
                    const idx = p.y * gw + p.x;
                    if (!sameConnGrid[idx]) continue;  // 非交叉点，不放桥
                    // 物理冲突: (bridgeMask & cellMask) 不能超出同类型连线层
                    const cellMask = mergedGrid[idx] | connMask;
                    if ((bridgeMask & cellMask) !== connMask) { bridgeConflict = true; break; }
                    // 拐弯约束: 桥不能放在已有线的拐弯上
                    if (existingCornerGrid[idx]) { bridgeConflict = true; break; }
                }
                if (bridgeConflict) continue;

                const dist = Math.abs(ic.pos.x - mouseGridPos.x) + Math.abs(ic.pos.y - mouseGridPos.y);
                if (dist < bestInputDist) {
                    bestInputDist = dist;
                    bestInput = { pos: ic.pos, side: ic.side, path: fullPath };
                }
            }

            if (bestInput) {
                const headFacing = ((sideToDir[bestInput.side] + 2) % 4) as Direction;
                set({
                    activeStartPos: startPos,
                    activeTailFacing: tailFacing,
                    previewPath: bestInput.path,
                    previewHeadFacing: headFacing,
                    isValidPath: true,
                    previewTargetIsMachine: true,
                });
            } else {
                // 无合法路径到机器输入端 → 忽略障碍计算 L 形路径用于视觉预览
                const emptyGrid = new Uint8Array(gw * gh);
                let bestVisual: { path: Point[]; headFacing: Direction; dist: number } | null = null;
                for (const ic of inputCells) {
                    if (startPos.x === ic.pos.x && startPos.y === ic.pos.y) {
                        bestVisual = { path: [startPos], headFacing: ((sideToDir[ic.side] + 2) % 4) as Direction, dist: 0 };
                        break;
                    }
                    const firstAxis = lShapeMode === 'perpendicular'
                        ? perpendicularDir(tailFacing, startPos, ic.pos)
                        : tailFacing;
                    const p = trySingleLRoute(startPos, ic.pos, firstAxis, emptyGrid, gw, gh);
                    if (p) {
                        const d = Math.abs(ic.pos.x - mouseGridPos.x) + Math.abs(ic.pos.y - mouseGridPos.y);
                        const hf = ((sideToDir[ic.side] + 2) % 4) as Direction;
                        if (!bestVisual || d < bestVisual.dist) {
                            bestVisual = { path: [startPos, ...p], headFacing: hf, dist: d };
                        }
                    }
                }
                set({
                    activeStartPos: startPos,
                    activeTailFacing: tailFacing,
                    previewPath: bestVisual?.path ?? [startPos, mouseGridPos],
                    previewHeadFacing: bestVisual?.headFacing ?? tailFacing,
                    isValidPath: false,
                    previewTargetIsMachine: false,
                });
            }
        } else {
            // ── 鼠标在地面 → 终点 = 鼠标位置 ──
            const firstAxis = lShapeMode === 'perpendicular'
                ? perpendicularDir(tailFacing, startPos, mouseGridPos)
                : tailFacing;

            // 检查起点自身 — 被阻挡时仍算 L 形视觉路径（避免跳到斜线）
            if ((mergedGrid[startPos.y * gw + startPos.x] & connMask) !== 0) {
                const emptyGrid = new Uint8Array(gw * gh);
                const visualPath = trySingleLRoute(startPos, mouseGridPos, firstAxis, emptyGrid, gw, gh);
                if (visualPath) {
                    const visualFullPath = [startPos, ...visualPath];
                    const visualHeadFacing = computeHeadFacing(visualFullPath, tailFacing);
                    set({ activeStartPos: startPos, activeTailFacing: tailFacing, previewPath: visualFullPath, previewHeadFacing: visualHeadFacing, isValidPath: false, previewTargetIsMachine: false });
                } else {
                    set({ activeStartPos: startPos, activeTailFacing: tailFacing, previewPath: [startPos, mouseGridPos], previewHeadFacing: tailFacing, isValidPath: false, previewTargetIsMachine: false });
                }
                return;
            }

            let path = trySingleLRoute(startPos, mouseGridPos, firstAxis, mergedGrid, gw, gh, connMask);
            if (!path && lShapeMode === 'auto') {
                path = trySingleLRoute(startPos, mouseGridPos, perpendicularDir(tailFacing, startPos, mouseGridPos), mergedGrid, gw, gh, connMask);
            }
            if (path) {
                const fullPath = [startPos, ...path];
                const headFacing = computeHeadFacing(fullPath, tailFacing);
                // 地面目标：检查新路径拐弯点（自动续接时豁免起点格）
                let valid = true;
                const corners = getCornerPoints(fullPath, tailFacing, headFacing);
                for (const cp of corners) {
                    if (isContinuing && cp.x === startPos.x && cp.y === startPos.y) continue;
                    if (cp.x >= 0 && cp.x < gw && cp.y >= 0 && cp.y < gh && sameConnGrid[cp.y * gw + cp.x]) {
                        valid = false;
                        break;
                    }
                }
                // 桥掩码冲突检查 (物理冲突 + 拐弯约束)
                if (valid) {
                    for (const p of fullPath) {
                        if (isContinuing && p.x === startPos.x && p.y === startPos.y) continue;
                        const idx = p.y * gw + p.x;
                        if (!sameConnGrid[idx]) continue;
                        const cellMask = mergedGrid[idx] | connMask;
                        if ((bridgeMask & cellMask) !== connMask) { valid = false; break; }
                        if (existingCornerGrid[idx]) { valid = false; break; }
                    }
                }
                if (valid) {
                    set({ activeStartPos: startPos, activeTailFacing: tailFacing, previewPath: fullPath, previewHeadFacing: headFacing, isValidPath: true, previewTargetIsMachine: false });
                } else {
                    // 路径被拐弯规则阻挡 → 仍显示 L 形路径，标红标记不合法
                    set({ activeStartPos: startPos, activeTailFacing: tailFacing, previewPath: fullPath, previewHeadFacing: headFacing, isValidPath: false, previewTargetIsMachine: false });
                }
            } else {
                // 真实路径被阻挡 → 忽略障碍计算 L 形路径用于视觉预览（避免突变到直线）
                const emptyGrid = new Uint8Array(gw * gh);
                const visualPath = trySingleLRoute(startPos, mouseGridPos, firstAxis, emptyGrid, gw, gh);
                if (visualPath) {
                    const visualFullPath = [startPos, ...visualPath];
                    const visualHeadFacing = computeHeadFacing(visualFullPath, tailFacing);
                    set({ activeStartPos: startPos, activeTailFacing: tailFacing, previewPath: visualFullPath, previewHeadFacing: visualHeadFacing, isValidPath: false, previewTargetIsMachine: false });
                } else {
                    set({ activeStartPos: startPos, activeTailFacing: tailFacing, previewPath: [startPos, mouseGridPos], previewHeadFacing: tailFacing, isValidPath: false, previewTargetIsMachine: false });
                }
            }
        }
    },

    toggleLShape: () => {
        set(s => {
            const NEXT: Record<string, typeof s.lShapeMode> = {
                'auto': 'perpendicular',
                'perpendicular': 'same-dir',
                'same-dir': 'auto',
            };
            return { lShapeMode: NEXT[s.lShapeMode] };
        });
    },

    commitConnection: () => {
        const { activeTailFacing, previewPath, previewHeadFacing, isValidPath, portType, connections, machines,
            isContinuing, previewTargetIsMachine } = get();
        if (!isValidPath || previewPath.length === 0) {
            get().cancelConnection();
            return;
        }

        const path = [...previewPath];
        const tailFacing = activeTailFacing;
        const headFacing = previewHeadFacing;
        const wiringPortType = portType;

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
                if (existingCornerGrid2[p.y * w + p.x]) {
                    // 交叉点在已有线拐弯处 → 不放桥，不拆分
                    continue;
                }
                intersectionPoints.push(p);
            }
        }

        const bridgeId = wiringPortType === 'Liquid' ? 'pbr' : 'lbr';
        const bridgeMask = getMachineMask(bridgeId);
        const connMask2 = portTypeToMask[wiringPortType];

        // 构建全量掩码网格 (机器 + 全部连线)
        const { gridWidth: gw3, gridHeight: gh3 } = get();
        const w3 = gw3 || 100; const h3 = gh3 || 100;
        const fullMaskGrid = new Uint8Array(w3 * h3);
        for (const m of machines) {
            const cfg = MACHINES.find(c => c.id === m.machineId);
            if (!cfg) continue;
            const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
            const mx2 = Math.min(m.x + width, w3); const my2 = Math.min(m.y + height, h3);
            for (let y = Math.max(m.y, 0); y < my2; y++) {
                const row = y * w3;
                for (let x = Math.max(m.x, 0); x < mx2; x++) {
                    fullMaskGrid[row + x] |= getMachineCellMask(m.machineId, x - m.x, y - m.y);
                }
            }
        }
        for (const c of connections) {
            const cm = portTypeToMask[c.portType];
            for (const p of c.path) {
                if (p.x >= 0 && p.x < w3 && p.y >= 0 && p.y < h3) { fullMaskGrid[p.y * w3 + p.x] |= cm; }
            }
        }

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
                    connsToAdd.push({
                        ...existing,
                        path: mergedPath,
                        headFacing: nc.headFacing,
                    });
                    merged = true;
                    break;
                }
                // 新连线终点 == 已有连线起点（运输方向：新 → 已有）
                const ncEnd = nc.path[nc.path.length - 1];
                const exStart = existing.path[0];
                if (ncEnd.x === exStart.x && ncEnd.y === exStart.y && existing.tailFacing === nc.headFacing) {
                    const mergedPath = [...nc.path, ...existing.path.slice(1)];
                    connsToAdd.splice(i, 1);
                    connsToAdd.push({
                        ...existing,
                        path: mergedPath,
                        tailFacing: nc.tailFacing,
                    });
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
            isConnecting: !shouldNotContinue,
            isValidPath: true,
            availablePorts: shouldNotContinue ? [] : [{ pos: lastPos, facing: continueFacing }],
            activeStartPos: lastPos,
            activeTailFacing: continueFacing,
            previewPath: shouldNotContinue ? [] : [lastPos],
            previewHeadFacing: continueFacing,
            isContinuing: !shouldNotContinue,
            continueSourceId: null,
        }));
    },

    cancelConnection: () => {
        set({
            isConnecting: false,
            isValidPath: true,
            availablePorts: [],
            portType: 'Solid',
            activeStartPos: { x: 0, y: 0 },
            activeTailFacing: 1 as Direction,
            previewPath: [],
            previewHeadFacing: 1 as Direction,
            lShapeMode: 'auto',
            isContinuing: false,
            continueSourceId: null,
            previewTargetIsMachine: false,
        });
        // 回到 BUILD 模式
        get().setMode(GameMode.BUILD);
    },
});
