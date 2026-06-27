import type { StateCreator } from 'zustand';
import type { SelectionSlice, GameState } from './types';
import type { PlacedMachine, Connection, Point } from '@/types';
import { portTypeToMask } from '@/types';
import { MACHINES } from '@/config/machines';
import { Mask } from '@/utils/mask';
import { getMachinePortCheckPositions, getBoundingBox, getCornerPoints, splitConnectionAt } from '@/utils/grid';
import { getRotatedDimensions, getMachineConfigById } from '@/utils/machineUtils';

export const createSelectionSlice: StateCreator<GameState, [], [], SelectionSlice> = (set, get) => ({

    setBoxSelection: (start, end) => {
        const ms = get().modeState;
        if (ms.kind !== 'DEVICE_SELECT') return;
        set({
            modeState: { ...ms, selectionStart: start, selectionEnd: end },
        });
    },

    commitBoxSelection: (isToggle = false) => {
        const ms = get().modeState;
        if (ms.kind !== 'DEVICE_SELECT') return;
        const { selectionStart, selectionEnd, selectedMachineIds: prevMachineIds, selectedConnectionIds: prevConnectionIds } = ms;
        if (!selectionStart || !selectionEnd) return;

        const { machines, connections } = get();

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
            modeState: {
                kind: 'DEVICE_SELECT',
                selectionStart: null,
                selectionEnd: null,
                selectedMachineIds: finalMachineIds,
                selectedConnectionIds: finalConnectionIds,
            },
        });
    },

    clearSelection: () => {
        const ms = get().modeState;
        if (ms.kind !== 'DEVICE_SELECT') return;
        set({
            modeState: { ...ms, selectedMachineIds: [], selectedConnectionIds: [] },
        });
    },

    deleteSelected: () => {
        const ms = get().modeState;
        if (ms.kind !== 'DEVICE_SELECT') return;
        const { selectedMachineIds, selectedConnectionIds } = ms;
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const { machines, connections } = get();

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
            modeState: {
                kind: 'DEVICE_SELECT',
                selectionStart: null,
                selectionEnd: null,
                selectedMachineIds: [],
                selectedConnectionIds: [],
            },
        });
    },

    startBatchMove: () => {
        const ms = get().modeState;
        if (ms.kind !== 'DEVICE_SELECT') return;
        const { selectedMachineIds, selectedConnectionIds } = ms;
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const { machines, connections } = get();

        const movingMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const movingConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        if (movingMachines.length === 0 && movingConnections.length === 0) return;

        const anchor = getBoundingBox(movingMachines, movingConnections);

        const remainingMachines = machines.filter(m => !selectedMachineIds.includes(m.id));
        const remainingConnections = connections.filter(c => !selectedConnectionIds.includes(c.id));

        set({
            modeState: {
                kind: 'MOVE_SELECTION',
                moveAnchor: { x: anchor.minX, y: anchor.minY },
                movingMachinesSnapshot: movingMachines,
                movingConnectionsSnapshot: movingConnections,
                isCopying: false,
                originSelectedMachineIds: selectedMachineIds,
                originSelectedConnectionIds: selectedConnectionIds,
            },
            machines: remainingMachines,
            connections: remainingConnections,
        });
    },

    startCopySelection: () => {
        const ms = get().modeState;
        if (ms.kind !== 'DEVICE_SELECT') return;
        const { selectedMachineIds, selectedConnectionIds } = ms;
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        const { machines, connections } = get();

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
            modeState: {
                kind: 'MOVE_SELECTION',
                moveAnchor: { x: anchor.minX, y: anchor.minY },
                movingMachinesSnapshot: newMachines,
                movingConnectionsSnapshot: newConnections,
                isCopying: true,
                originSelectedMachineIds: selectedMachineIds,
                originSelectedConnectionIds: selectedConnectionIds,
            },
        });
    },

    commitBatchMove: (targetPos) => {
        const ms = get().modeState;
        if (ms.kind !== 'MOVE_SELECTION') return;
        const { moveAnchor, movingMachinesSnapshot, movingConnectionsSnapshot } = ms;
        if (!moveAnchor) return;

        const { machines, gridWidth, gridHeight, connections } = get();

        const offsetX = targetPos.x - moveAnchor.x;
        const offsetY = targetPos.y - moveAnchor.y;

        let collision = false;

        const placedMachines = movingMachinesSnapshot.map(m => ({
            ...m,
            x: m.x + offsetX,
            y: m.y + offsetY
        }));

        // ── 构建剩余实体的掩码网格 ──
        let baseGrid = Mask.Uniform(gridWidth, gridHeight, 0);

        for (const m of machines) {
            const cfg = getMachineConfigById(m.machineId);
            if (!cfg) continue;
            baseGrid.MergeInPlace(cfg.mask4![m.rotation], m.x, m.y);
        }

        for (const c of connections) {
            const cm = portTypeToMask[c.portType];
            if (cm === 0) continue;
            for (const p of c.path) {
                if (p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight) {
                    baseGrid.data[p.y * gridWidth + p.x] |= cm;
                }
            }
        }

        // ── 逐机检测 + 累积掩码（TryMerge = HasCollision + Merge）──
        for (const m of placedMachines) {
            const cfg = getMachineConfigById(m.machineId);
            if (!cfg) continue;
            const rotated = cfg.mask4![m.rotation];

            if (m.x < 0 || m.y < 0 || m.x + rotated.width > gridWidth || m.y + rotated.height > gridHeight) {
                collision = true;
                break;
            }

            const result = baseGrid.TryMerge(rotated, m.x, m.y);
            if (!result) { collision = true; break; }
            baseGrid = result;
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

            const portTypes = [...new Set(placedConns.map(c => c.portType))];

            for (const pt of portTypes) {
                const bridgeId = pt === 'Liquid' ? 'pbr' : 'lbr';
                const bridgeMask = getMachineConfigById(bridgeId)!.mask.maxMask;
                const connMask = portTypeToMask[pt];

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

                const cornerGrid = new Uint8Array(gridWidth * gridHeight);
                for (const c of connections) {
                    if (c.portType !== pt) continue;
                    for (const cp of getCornerPoints(c.path, c.tailFacing, c.headFacing)) {
                        if (cp.x >= 0 && cp.x < gridWidth && cp.y >= 0 && cp.y < gridHeight) {
                            cornerGrid[cp.y * gridWidth + cp.x] = 1;
                        }
                    }
                }

                const fullMask = Mask.Uniform(gridWidth, gridHeight, 0);
                for (const m of allMachines) {
                    const c2 = getMachineConfigById(m.machineId);
                    if (!c2) continue;
                    fullMask.MergeInPlace(c2.mask4![m.rotation], m.x, m.y);
                }
                for (const c of connections) {
                    const cm = portTypeToMask[c.portType];
                    if (cm === 0) continue;
                    for (const p of c.path) {
                        if (p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight) {
                            fullMask.data[p.y * gridWidth + p.x] |= cm;
                        }
                    }
                }
                for (const b of bridgesToCreate) {
                    const bm = getMachineConfigById(b.machineId)!.mask.maxMask;
                    if (b.x >= 0 && b.x < gridWidth && b.y >= 0 && b.y < gridHeight) {
                        fullMask.data[b.y * gridWidth + b.x] |= bm;
                    }
                }
                const fullMaskGrid = fullMask.data;

                for (const conn of placedConns) {
                    if (conn.portType !== pt) continue;

                    const intersectionPoints: Point[] = [];
                    for (const p of conn.path) {
                        const key = `${p.x},${p.y}`;
                        if (!pointToConns.has(key)) continue;

                        if (cornerGrid[p.y * gridWidth + p.x]) { collision = true; break; }

                        const cellMask = fullMaskGrid[p.y * gridWidth + p.x];
                        if ((bridgeMask & cellMask) !== connMask) { collision = true; break; }

                        intersectionPoints.push(p);
                    }
                    if (collision) break;

                    for (const cp of getCornerPoints(conn.path, conn.tailFacing, conn.headFacing)) {
                        if (cp.x >= 0 && cp.x < gridWidth && cp.y >= 0 && cp.y < gridHeight) {
                            if (pointToConns.has(`${cp.x},${cp.y}`)) { collision = true; break; }
                        }
                    }
                    if (collision) break;

                    if (intersectionPoints.length === 0) continue;

                    for (const p of intersectionPoints) {
                        bridgesToCreate.push({
                            id: crypto.randomUUID(),
                            machineId: bridgeId,
                            x: p.x, y: p.y,
                            rotation: 0,
                        });
                        fullMaskGrid[p.y * gridWidth + p.x] |= bridgeMask;
                    }

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

                    for (const part of connsToAdd) {
                        for (const pp of part.path) {
                            const pk = `${pp.x},${pp.y}`;
                            const list = pointToConns.get(pk) || [];
                            list.push(part);
                            pointToConns.set(pk, list);
                        }
                    }

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
                modeState: {
                    kind: 'DEVICE_SELECT',
                    selectionStart: null,
                    selectionEnd: null,
                    selectedMachineIds: placedMachines.map(m => m.id),
                    selectedConnectionIds: finalPlacedConns.map(c => c.id),
                },
            });

            return;
        }

    },
});
