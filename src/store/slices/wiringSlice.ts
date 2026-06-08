import type { StateCreator } from 'zustand';
import type { WiringSlice, GameState } from './types';
import type { Connection, Point, Direction, PlacedMachine } from '../../types';
import { sideToDir } from '../../types';
import { MACHINES } from '../../config/machines';
import { findPath, getVectorFromSide, dirFromPoints } from '../../utils/gridUtils';
import { getRotatedPorts, getRotatedDimensions } from '../../utils/machineUtils';

/** 在指定點分割連線，返回子連線陣列 (0~2 個)，分割點 (橋位) 不包含在子路徑中 */
const splitConnectionAt = (conn: Connection, point: Point): Connection[] => {
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

export const createWiringSlice: StateCreator<GameState, [], [], WiringSlice> = (set, get) => ({
    connections: [],
    isWiring: false,
    isWiringValid: true,
    wiringSource: null,
    wiringPreviewPath: [],

    startWiring: (tailPos, tailFacing, portType) => {
        set({
            isWiring: true,
            isWiringValid: true,
            wiringSource: { tailPos, tailFacing, portType },
            wiringPreviewPath: [tailPos]
        });
    },

    updateWiringPreview: (mouseGridPos) => {
        const { wiringSource, machines, connections, gridWidth, gridHeight } = get();
        if (!wiringSource) return;

        const start = wiringSource.tailPos;
        const end = mouseGridPos;
        const wiringPortType = wiringSource.portType;

        // 收集 end 位置的所有匹配輸入端口 side
        const candidateSides: ('top' | 'right' | 'bottom' | 'left')[] = [];
        for (const m of machines) {
            const config = MACHINES.find(mc => mc.id === m.machineId);
            if (!config) continue;
            const inputs = getRotatedPorts(config.inputs, config.width, config.height, m.rotation);
            for (const p of inputs) {
                if (wiringPortType && p.type !== wiringPortType) continue;
                const absX = m.x + p.x;
                const absY = m.y + p.y;
                if (absX === end.x && absY === end.y) {
                    candidateSides.push(p.side);
                }
            }
        }

        let endSide: 'top' | 'right' | 'bottom' | 'left' | undefined;
        if (candidateSides.length === 1) {
            endSide = candidateSides[0];
        } else if (candidateSides.length > 1) {
            // 多端口同格（如物流橋），根據 start→end 的接近方向選擇正確端口
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const sidePriority: ('top' | 'right' | 'bottom' | 'left')[] =
                Math.abs(dx) >= Math.abs(dy)
                    ? (dx > 0 ? ['left', 'right', 'top', 'bottom'] : ['right', 'left', 'top', 'bottom'])
                    : (dy > 0 ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'top', 'left', 'right']);
            endSide = sidePriority.find(s => candidateSides.includes(s)) ?? candidateSides[0];
        }

        const segmentPath = findPath(start, end, machines, wiringSource.tailFacing, endSide, gridWidth, gridHeight, connections, wiringPortType);

        if (segmentPath) {
            set({ wiringPreviewPath: segmentPath, isWiringValid: true });
        } else {
            set({ wiringPreviewPath: [start, end], isWiringValid: false });
        }
    },

    commitWiring: () => {
        const { wiringSource, wiringPreviewPath, isWiringValid, machines, connections } = get();
        if (!wiringSource || wiringPreviewPath.length === 0 || !isWiringValid) {
            get().cancelWiring();
            return;
        }

        const path = [...wiringPreviewPath];
        const tailFacing = wiringSource.tailFacing;
        const wiringPortType = wiringSource.portType;

        // headFacing 唯一來源: 從目標輸入端口反推進入方向
        let headFacing: Direction | null = null;
        const lastPos = path[path.length - 1];
        for (const m of machines) {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (!config) continue;
            const inputs = getRotatedPorts(config.inputs, config.width, config.height, m.rotation);
            let found = false;
            for (const p of inputs) {
                if (p.type !== wiringPortType) continue;
                const vec = getVectorFromSide(p.side);
                if (lastPos.x === m.x + p.x + vec.x && lastPos.y === m.y + p.y + vec.y) {
                    headFacing = ((sideToDir[p.side] + 2) % 4) as Direction;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        if (headFacing === null) {
            get().cancelWiring();
            return;
        }

        // 交叉檢測與橋生成: 只處理同類型直線段交叉
        // 拐彎處交叉已由 findPath 攔截, 此處僅處理直線對直線
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

        const intersectionPoints: Point[] = [];
        for (const p of path) {
            const key = `${p.x},${p.y}`;
            if (pointToConns.has(key)) {
                intersectionPoints.push(p);
            }
        }

        const bridgeId = wiringPortType === 'Liquid' ? 'pbr' : 'lbr';
        const bridgesToCreate: PlacedMachine[] = [];
        for (const p of intersectionPoints) {
            const isOccupied = machines.some(m => {
                const config = MACHINES.find(c => c.id === m.machineId);
                if (!config) return false;
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                return p.x >= m.x && p.x < m.x + width && p.y >= m.y && p.y < m.y + height;
            });
            if (!isOccupied) {
                bridgesToCreate.push({ id: crypto.randomUUID(), machineId: bridgeId, x: p.x, y: p.y, rotation: 0 });
            }
        }

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

        let newConns: Connection[] = [{ id: crypto.randomUUID(), tailFacing, path, headFacing, portType: wiringPortType }];
        for (const p of intersectionPoints) {
            newConns = newConns.flatMap(c => splitConnectionAt(c, p));
        }

        set(state => ({
            machines: [...state.machines, ...bridgesToCreate],
            connections: [
                ...state.connections.filter(c => !connsToRemove.has(c.id)),
                ...connsToAdd,
                ...newConns
            ],
            isWiring: false,
            isWiringValid: true,
            wiringSource: null,
            wiringPreviewPath: []
        }));
    },

    cancelWiring: () => {
        set({ isWiring: false, isWiringValid: true, wiringSource: null, wiringPreviewPath: [] });
    },
});
