import type { StateCreator } from 'zustand';
import type { SelectionSlice, GameState } from './types';
import type { PlacedMachine, Connection, Point } from '@/types';
import { GameMode, portTypeToMask } from '@/types';
import { MACHINES } from '@/config/machines';
import { getMachinePortCheckPositions, getBoundingBox, getCornerPoints, splitConnectionAt } from '@/utils/grid';
import { getRotatedDimensions, getMachineCellMask, getMachineMask } from '@/utils/machineUtils';

export const createSelectionSlice: StateCreator<GameState, [], [], SelectionSlice> = (set, get) => ({
    selectionStart: null,
    selectionEnd: null,
    selectedMachineIds: [],
    selectedConnectionIds: [],
    moveAnchor: null,
    movingMachinesSnapshot: [],
    movingConnectionsSnapshot: [],
    isCopying: false,

    setBoxSelection: (start, end) => set({ selectionStart: start, selectionEnd: end }),

    commitBoxSelection: (isToggle = false) => {
        const { selectionStart, selectionEnd, machines, connections, selectedMachineIds: prevMachineIds, selectedConnectionIds: prevConnectionIds } = get();
        if (!selectionStart || !selectionEnd) return;

        const x1 = Math.min(selectionStart.x, selectionEnd.x);
        const y1 = Math.min(selectionStart.y, selectionEnd.y);
        const x2 = Math.max(selectionStart.x, selectionEnd.x);
        const y2 = Math.max(selectionStart.y, selectionEnd.y);

        const machineIdsInBox = machines.filter(m => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (!config) return false;
            const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
            const mx1 = m.x;
            const my1 = m.y;
            const mx2 = m.x + width;
            const my2 = m.y + height;
            return !(x2 < mx1 || x1 >= mx2 || y2 < my1 || y1 >= my2);
        }).map(m => m.id);

        const connectionIdsInBox = connections.filter(c => {
            return c.path.some(p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
        }).map(c => c.id);

        let finalMachineIds: string[];
        let finalConnectionIds: string[];

        if (isToggle) {
            const boxSet = new Set(machineIdsInBox);
            finalMachineIds = prevMachineIds.filter(id => !boxSet.has(id));
            const boxConnSet = new Set(connectionIdsInBox);
            finalConnectionIds = prevConnectionIds.filter(id => !boxConnSet.has(id));
        } else {
            const unionMachines = new Set([...prevMachineIds, ...machineIdsInBox]);
            finalMachineIds = [...unionMachines];
            const unionConns = new Set([...prevConnectionIds, ...connectionIdsInBox]);
            finalConnectionIds = [...unionConns];
        }

        set({
            selectedMachineIds: finalMachineIds,
            selectedConnectionIds: finalConnectionIds,
            selectionStart: null,
            selectionEnd: null
        });
    },

    clearSelection: () => set({ selectedMachineIds: [], selectedConnectionIds: [] }),

    deleteSelected: () => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const machinesToRemove = new Set(selectedMachineIds);
        const connectionsToRemove = new Set(selectedConnectionIds);

        const deletedPortPositions = new Set<string>();
        for (const m of machines) {
            if (!machinesToRemove.has(m.id)) continue;
            const positions = getMachinePortCheckPositions(m);
            for (const pos of positions) {
                deletedPortPositions.add(`${pos.x},${pos.y}`);
            }
        }

        for (const c of connections) {
            const first = c.path[0];
            const last = c.path[c.path.length - 1];
            if (deletedPortPositions.has(`${first.x},${first.y}`) ||
                deletedPortPositions.has(`${last.x},${last.y}`)) {
                connectionsToRemove.add(c.id);
            }
        }

        const newMachines = machines.filter(m => !machinesToRemove.has(m.id));
        const newConnections = connections.filter(c => !connectionsToRemove.has(c.id));

        set({
            machines: newMachines,
            connections: newConnections,
            selectedMachineIds: [],
            selectedConnectionIds: []
        });
    },

    startBatchMove: () => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const movingMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const movingConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        if (movingMachines.length === 0 && movingConnections.length === 0) return;

        const anchor = getBoundingBox(movingMachines, movingConnections);

        const remainingMachines = machines.filter(m => !selectedMachineIds.includes(m.id));
        const remainingConnections = connections.filter(c => !selectedConnectionIds.includes(c.id));

        set({
            mode: GameMode.MOVE_SELECTION,
            moveAnchor: { x: anchor.minX, y: anchor.minY },
            movingMachinesSnapshot: movingMachines,
            movingConnectionsSnapshot: movingConnections,
            machines: remainingMachines,
            connections: remainingConnections,
            selectedMachineIds: [],
            selectedConnectionIds: [],
            isCopying: false
        });
    },

    startCopySelection: () => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const sourceMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const sourceConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        if (sourceMachines.length === 0 && sourceConnections.length === 0) return;

        const anchor = getBoundingBox(sourceMachines, sourceConnections);

        const idMap: Record<string, string> = {};

        const newMachines: PlacedMachine[] = sourceMachines.map(m => {
            const newId = crypto.randomUUID();
            idMap[m.id] = newId;
            return { ...m, id: newId };
        });

        const newConnections: Connection[] = sourceConnections.map(c => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map(p => ({ ...p }))
        }));

        set({
            mode: GameMode.MOVE_SELECTION,
            moveAnchor: { x: anchor.minX, y: anchor.minY },
            movingMachinesSnapshot: newMachines,
            movingConnectionsSnapshot: newConnections,
            selectedMachineIds: [],
            selectedConnectionIds: [],
            isCopying: true
        });
    },

    commitBatchMove: (targetPos) => {
        const { moveAnchor, movingMachinesSnapshot, movingConnectionsSnapshot, machines, gridWidth, gridHeight, connections } = get();
        if (!moveAnchor) return;

        const offsetX = targetPos.x - moveAnchor.x;
        const offsetY = targetPos.y - moveAnchor.y;

        let collision = false;

        const placedMachines = movingMachinesSnapshot.map(m => ({
            ...m,
            x: m.x + offsetX,
            y: m.y + offsetY
        }));

        // ── 构建剩余实体的掩码网格 ──
        const baseGrid = new Uint8Array(gridWidth * gridHeight);

        // 剩余机器掩码
        for (const m of machines) {
            const cfg = MACHINES.find(c => c.id === m.machineId);
            if (!cfg) continue;
            const { width: mw, height: mh } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
            const mx2 = Math.min(m.x + mw, gridWidth);
            const my2 = Math.min(m.y + mh, gridHeight);
            for (let my = Math.max(m.y, 0); my < my2; my++) {
                const row = my * gridWidth;
                for (let mx = Math.max(m.x, 0); mx < mx2; mx++) {
                    baseGrid[row + mx] |= getMachineCellMask(m.machineId, mx - m.x, my - m.y);
                }
            }
        }

        // 剩余连线掩码 (所有类型)
        for (const c of connections) {
            const cm = portTypeToMask[c.portType];
            for (const p of c.path) {
                if (p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight) {
                    baseGrid[p.y * gridWidth + p.x] |= cm;
                }
            }
        }

        // ── 逐机检测 + 累积掩码 ──
        for (const m of placedMachines) {
            const cfg = MACHINES.find(c => c.id === m.machineId);
            if (!cfg) continue;
            const { width: mw, height: mh } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);

            // 越界
            if (m.x < 0 || m.y < 0 || m.x + mw > gridWidth || m.y + mh > gridHeight) {
                collision = true;
                break;
            }

            // 掩码逐格 AND
            let maskHit = false;
            for (let cy = m.y; cy < m.y + mh && !maskHit; cy++) {
                const row = cy * gridWidth;
                for (let cx = m.x; cx < m.x + mw && !maskHit; cx++) {
                    if (getMachineCellMask(m.machineId, cx - m.x, cy - m.y) & baseGrid[row + cx]) {
                        maskHit = true;
                    }
                }
            }
            if (maskHit) { collision = true; break; }

            // 无冲突 → 累积掩码（后续机器可见）
            for (let cy = m.y; cy < m.y + mh; cy++) {
                const row = cy * gridWidth;
                for (let cx = m.x; cx < m.x + mw; cx++) {
                    baseGrid[row + cx] |= getMachineCellMask(m.machineId, cx - m.x, cy - m.y);
                }
            }
        }

        // ── 连线交叉检测 + 桥生成 ──
        if (!collision) {
            const allMachines = machines.concat(placedMachines);
            const placedConns = movingConnectionsSnapshot.map(c => ({
                ...c,
                path: c.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
            }));

            const bridgesToCreate: PlacedMachine[] = [];
            const connsToRemove = new Set<string>();
            const connsToAdd: Connection[] = [];
            const splitPlaced = new Map<string, Connection[]>();

            // 按 portType 分组 (Solid 先, Liquid 后, bridgeMask 自然排斥同格)
            const portTypes = [...new Set(placedConns.map(c => c.portType))];

            for (const pt of portTypes) {
                const bridgeId = pt === 'Liquid' ? 'pbr' : 'lbr';
                const bridgeMask = getMachineMask(bridgeId);
                const connMask = portTypeToMask[pt];

                // pointToConns: 剩余同类型路径格 → 连线
                const pointToConns = new Map<string, Connection[]>();
                for (const c of connections) {
                    if (c.portType !== pt) continue;
                    for (const p of c.path) {
                        const key = `${p.x},${p.y}`;
                        const list = pointToConns.get(key) || [];
                        list.push(c);
                        pointToConns.set(key, list);
                    }
                }

                // 剩余同类型连线 corner (桥不能放在已有线的拐弯上)
                const cornerGrid = new Uint8Array(gridWidth * gridHeight);
                for (const c of connections) {
                    if (c.portType !== pt) continue;
                    for (const cp of getCornerPoints(c.path, c.tailFacing, c.headFacing)) {
                        if (cp.x >= 0 && cp.x < gridWidth && cp.y >= 0 && cp.y < gridHeight) {
                            cornerGrid[cp.y * gridWidth + cp.x] = 1;
                        }
                    }
                }

                // fullMaskGrid: 全部机器 + 全部剩余连线 + 已生成的桥
                const fullMaskGrid = new Uint8Array(gridWidth * gridHeight);
                for (const m of allMachines) {
                    const c2 = MACHINES.find(c => c.id === m.machineId);
                    if (!c2) continue;
                    const { width: mw, height: mh } = getRotatedDimensions(c2.width, c2.height, m.rotation);
                    const mx2 = Math.min(m.x + mw, gridWidth);
                    const my2 = Math.min(m.y + mh, gridHeight);
                    for (let my = Math.max(m.y, 0); my < my2; my++) {
                        const row = my * gridWidth;
                        for (let mx = Math.max(m.x, 0); mx < mx2; mx++) {
                            fullMaskGrid[row + mx] |= getMachineCellMask(m.machineId, mx - m.x, my - m.y);
                        }
                    }
                }
                for (const c of connections) {
                    const cm = portTypeToMask[c.portType];
                    for (const p of c.path) {
                        if (p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight) {
                            fullMaskGrid[p.y * gridWidth + p.x] |= cm;
                        }
                    }
                }
                for (const b of bridgesToCreate) {
                    const bm = getMachineMask(b.machineId);
                    if (b.x >= 0 && b.x < gridWidth && b.y >= 0 && b.y < gridHeight) {
                        fullMaskGrid[b.y * gridWidth + b.x] |= bm;
                    }
                }

                // 逐条处理此类型的移动连线
                for (const conn of placedConns) {
                    if (conn.portType !== pt) continue;

                    // 收集交叉点
                    const intersectionPoints: Point[] = [];
                    for (const p of conn.path) {
                        const key = `${p.x},${p.y}`;
                        if (!pointToConns.has(key)) continue;

                        // 交叉点不能是剩余线拐弯（桥不能放拐弯上）
                        if (cornerGrid[p.y * gridWidth + p.x]) { collision = true; break; }

                        // 桥掩码验证：bridgeMask 不能与 cellMask 的异类型位冲突
                        const cellMask = fullMaskGrid[p.y * gridWidth + p.x];
                        if ((bridgeMask & cellMask) !== connMask) { collision = true; break; }

                        intersectionPoints.push(p);
                    }
                    if (collision) break;

                    // 自身拐弯不能落在剩余同类型线上
                    for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
                        if (cp.x >= 0 && cp.x < gridWidth && cp.y >= 0 && cp.y < gridHeight) {
                            if (pointToConns.has(`${cp.x},${cp.y}`)) { collision = true; break; }
                        }
                    }
                    if (collision) break;

                    if (intersectionPoints.length === 0) continue;

                    // 创建桥
                    for (const p of intersectionPoints) {
                        bridgesToCreate.push({
                            id: crypto.randomUUID(),
                            machineId: bridgeId,
                            x: p.x, y: p.y,
                            rotation: 0,
                        });
                        fullMaskGrid[p.y * gridWidth + p.x] |= bridgeMask;
                    }

                    // 拆分被穿越的剩余连线 + 递归拆碎片
                    for (const p of intersectionPoints) {
                        const key = `${p.x},${p.y}`;
                        const crossed = pointToConns.get(key) || [];
                        for (const orig of crossed) {
                            if (connsToRemove.has(orig.id)) continue;
                            connsToRemove.add(orig.id);
                            connsToAdd.push(...splitConnectionAt(orig, p));
                        }
                        const pending = [...connsToAdd];
                        connsToAdd.length = 0;
                        for (const part of pending) {
                            if (part.path.some(pt => pt.x === p.x && pt.y === p.y)) {
                                connsToAdd.push(...splitConnectionAt(part, p));
                            } else {
                                connsToAdd.push(part);
                            }
                        }
                    }

                    // 碎片注册回 pointToConns（后续移动连线可见）
                    for (const part of connsToAdd) {
                        for (const pp of part.path) {
                            const pk = `${pp.x},${pp.y}`;
                            const list = pointToConns.get(pk) || [];
                            list.push(part);
                            pointToConns.set(pk, list);
                        }
                    }

                    // 拆分移动连线自身
                    let parts = [conn];
                    for (const p of intersectionPoints) {
                        parts = parts.flatMap(c => splitConnectionAt(c, p));
                    }
                    splitPlaced.set(conn.id, parts);
                }
                if (collision) break;
            }

            if (collision) return;

            const finalPlacedConns = placedConns.flatMap(c =>
                splitPlaced.get(c.id) ?? [c]
            );

            get().takeSnapshot();

            set({
                machines: [...machines, ...placedMachines, ...bridgesToCreate],
                connections: [
                    ...connections.filter(c => !connsToRemove.has(c.id)),
                    ...connsToAdd,
                    ...finalPlacedConns,
                ],
                movingMachinesSnapshot: [],
                movingConnectionsSnapshot: [],
                moveAnchor: null,
                mode: GameMode.DEVICE_SELECT,
                selectedMachineIds: placedMachines.map(m => m.id),
                selectedConnectionIds: finalPlacedConns.map(c => c.id),
                isCopying: false
            });

            return;
        }

    },
});
