import type { PlacedMachine, Connection, BlueprintSnapshot, BlueprintChildRef } from '@/types';
import { isVirtualMachine } from '@/types';
import { Mask } from '@/utils/mask';
import { resolveMachineMasks } from '@/utils/machineUtils';

interface PersistedSnapshot {
    nodeId: string; blueprintId: string; name: string; version: number;
    machines: PlacedMachine[]; connections: Connection[];
    children: { childNodeId: string; x: number; y: number }[];
    gridWidth: number; gridHeight: number;
    createdAt: number; updatedAt: number;
}

interface PersistedData {
    snapshots: PersistedSnapshot[];
}

const STORAGE_KEY = 'zmd_registry';
const DEFAULT_GRID = 24;

export class RegistryEngine {
    private _map = new Map<string, BlueprintSnapshot>();

    constructor() {
        this._load();
    }

    // ═══════════════════════════════════════════════════════════
    // 存取
    // ═══════════════════════════════════════════════════════════

    save(snapshot: BlueprintSnapshot, gridW?: number, gridH?: number): void {
        this._map.set(snapshot.nodeId, snapshot);
        this.persist(snapshot.nodeId, gridW, gridH);
    }

    delete(nodeId: string): boolean {
        if (this.refCount(nodeId) > 0) return false;

        for (const snap of this._map.values()) {
            const before = snap.children.length;
            snap.children = snap.children.filter((c) => c.childNodeId !== nodeId);
            if (snap.children.length !== before) {
                this._recalcChildrenMask(snap);
                this._recalcTotalMask(snap);
            }
        }

        const result = this._map.delete(nodeId);
        if (result) this._fullPersist();
        return result;
    }

    read(nodeId: string): BlueprintSnapshot | undefined {
        return this._map.get(nodeId);
    }

    // ═══════════════════════════════════════════════════════════
    // Fork
    // ═══════════════════════════════════════════════════════════

    fork(nodeId: string, gridW?: number, gridH?: number): string | null {
        const snap = this._map.get(nodeId);
        if (!snap) return null;

        const cloned: BlueprintSnapshot = {
            ...snap,
            nodeId: crypto.randomUUID(),
            version: snap.version + 1,
            ownMask: snap.ownMask.Clone(),
            childrenMask: snap.childrenMask.Clone(),
            totalMask: snap.totalMask.Clone(),
            machines: snap.machines.map((m) => ({ ...m })),
            connections: snap.connections.map((c) => ({
                ...c,
                path: c.path.map((p) => ({ ...p })),
            })),
            children: snap.children.map((c) => ({ ...c })),
            updatedAt: Date.now(),
        };

        this.save(cloned, gridW, gridH);
        return cloned.nodeId;
    }

    // ═══════════════════════════════════════════════════════════
    // Mask 重建（纯函数，不写 Map）
    // ═══════════════════════════════════════════════════════════

    rebuildMasks(
        snapshot: BlueprintSnapshot,
        ownMachines: PlacedMachine[],
        ownConnections: Connection[],
        gridW: number,
        gridH: number,
    ): BlueprintSnapshot {
        const ownMask = Mask.FromOccupancy({
            machines: resolveMachineMasks(
                ownMachines.filter((m) => !isVirtualMachine(m.machineId)),
            ),
            connections: ownConnections,
            gridW, gridH,
        });

        const childrenMask = Mask.Uniform(gridW, gridH, 0);
        for (const ref of snapshot.children) {
            const cs = this._map.get(ref.childNodeId);
            if (cs) childrenMask.MergeInPlace(cs.totalMask, ref.x, ref.y);
        }

        const totalMask = ownMask.Clone();
        totalMask.MergeInPlace(childrenMask, 0, 0);

        return {
            ...snapshot,
            machines: ownMachines,
            connections: ownConnections,
            ownMask,
            childrenMask,
            totalMask,
            updatedAt: Date.now(),
        };
    }

    // ═══════════════════════════════════════════════════════════
    // 子蓝图关系
    // ═══════════════════════════════════════════════════════════

    addChild(parentId: string, childNodeId: string, x: number, y: number, gridW?: number, gridH?: number): boolean {
        const parent = this._map.get(parentId);
        const child = this._map.get(childNodeId);
        if (!parent || !child) return false;

        // 环防护：拒绝自引用，以及把 parent 的祖先作为子节点插入
        if (parentId === childNodeId) return false;
        const parentAncestors = this.findAncestorPath(parentId);
        if (parentAncestors.includes(childNodeId)) return false;

        parent.children = [...parent.children, { childNodeId, x, y }];
        this._recalcChildrenMask(parent);
        this._recalcTotalMask(parent);
        this.persist(parentId, gridW, gridH);
        return true;
    }

    removeChild(parentId: string, childNodeId: string, gridW?: number, gridH?: number): boolean {
        const parent = this._map.get(parentId);
        if (!parent) return false;

        const before = parent.children.length;
        parent.children = parent.children.filter((c) => c.childNodeId !== childNodeId);
        if (parent.children.length === before) return false;

        this._recalcChildrenMask(parent);
        this._recalcTotalMask(parent);
        this.persist(parentId, gridW, gridH);
        return true;
    }

    moveChild(parentId: string, childNodeId: string, x: number, y: number, gridW?: number, gridH?: number): boolean {
        const parent = this._map.get(parentId);
        if (!parent) return false;

        const ref = parent.children.find((c) => c.childNodeId === childNodeId);
        if (!ref) return false;

        ref.x = x;
        ref.y = y;
        this._recalcChildrenMask(parent);
        this._recalcTotalMask(parent);
        this.persist(parentId, gridW, gridH);
        return true;
    }

    // ═══════════════════════════════════════════════════════════
    // 查询
    // ═══════════════════════════════════════════════════════════

    findRoots(): string[] {
        const childIds = new Set<string>();
        for (const snap of this._map.values()) {
            for (const child of snap.children) {
                childIds.add(child.childNodeId);
            }
        }
        return [...this._map.keys()].filter((id) => !childIds.has(id));
    }

    findAncestorPath(nodeId: string, _visited: Set<string> = new Set()): string[] {
        // 环防护：历史数据或异常状态下防止无限递归
        if (_visited.has(nodeId)) return [];
        _visited.add(nodeId);

        for (const snap of this._map.values()) {
            for (const child of snap.children) {
                if (child.childNodeId === nodeId) {
                    return [...this.findAncestorPath(snap.nodeId, _visited), snap.nodeId];
                }
            }
        }
        return [];
    }

    findChildren(nodeId: string): string[] {
        const snap = this._map.get(nodeId);
        return snap ? snap.children.map((c) => c.childNodeId) : [];
    }

    refCount(nodeId: string): number {
        let count = 0;
        for (const snap of this._map.values()) {
            for (const child of snap.children) {
                if (child.childNodeId === nodeId) count++;
            }
        }
        return count;
    }

    childRefs(nodeId: string): BlueprintChildRef[] {
        return this._map.get(nodeId)?.children ?? [];
    }

    all(): BlueprintSnapshot[] {
        return [...this._map.values()];
    }

    toObject(): Record<string, BlueprintSnapshot> {
        return Object.fromEntries(this._map);
    }

    size(): number {
        return this._map.size;
    }

    // ═══════════════════════════════════════════════════════════
    // 静态工厂
    // ═══════════════════════════════════════════════════════════

    static createEmpty(name: string, gridW: number, gridH: number): BlueprintSnapshot {
        const emptyMask = Mask.Uniform(gridW, gridH, 0);
        return {
            nodeId: crypto.randomUUID(),
            blueprintId: crypto.randomUUID(),
            name,
            version: 1,
            machines: [],
            connections: [],
            children: [],
            ownMask: emptyMask.Clone(),
            childrenMask: emptyMask.Clone(),
            totalMask: emptyMask.Clone(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    // ═══════════════════════════════════════════════════════════
    // 内部
    // ═══════════════════════════════════════════════════════════

    private _load(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data: PersistedData = JSON.parse(raw);

            for (const ps of data.snapshots) {
                const gw = ps.gridWidth || DEFAULT_GRID;
                const gh = ps.gridHeight || DEFAULT_GRID;
                const ownMask = this._buildOwnMask(ps.machines, ps.connections, gw, gh);
                const empty = Mask.Uniform(gw, gh, 0);
                this._map.set(ps.nodeId, {
                    nodeId: ps.nodeId,
                    blueprintId: ps.blueprintId,
                    name: ps.name,
                    version: ps.version,
                    machines: ps.machines,
                    connections: ps.connections,
                    children: ps.children.map((c) => ({ childNodeId: c.childNodeId, x: c.x, y: c.y })),
                    ownMask,
                    childrenMask: empty.Clone(),
                    totalMask: ownMask.Clone(),
                    createdAt: ps.createdAt,
                    updatedAt: ps.updatedAt,
                });
            }

            // 第二遍：补全 childrenMask
            for (const snap of this._map.values()) {
                this._recalcChildrenMask(snap);
                this._recalcTotalMask(snap);
            }
        } catch (e) {
            console.error('加载蓝图注册表失败', e);
        }
    }

    /** 增量持久化：更新单个 snapshot 对应项（高效） */
    private persist(_nodeId: string, gridW?: number, gridH?: number): void {
        this._fullPersist(gridW, gridH);
    }

    /** 全量序列化写入 localStorage */
    private _fullPersist(gridW?: number, gridH?: number): void {
        const snapshots: PersistedSnapshot[] = [];
        for (const snap of this._map.values()) {
            snapshots.push({
                nodeId: snap.nodeId,
                blueprintId: snap.blueprintId,
                name: snap.name,
                version: snap.version,
                machines: snap.machines,
                connections: snap.connections,
                children: snap.children.map((c) => ({ childNodeId: c.childNodeId, x: c.x, y: c.y })),
                gridWidth: gridW ?? DEFAULT_GRID,
                gridHeight: gridH ?? DEFAULT_GRID,
                createdAt: snap.createdAt,
                updatedAt: snap.updatedAt,
            });
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ snapshots }));
        } catch (e) {
            console.error('保存蓝图注册表失败', e);
        }
    }

    private _buildOwnMask(
        machines: PlacedMachine[],
        connections: Connection[],
        gw: number,
        gh: number,
    ): Mask {
        return Mask.FromOccupancy({
            machines: resolveMachineMasks(machines.filter((m) => !isVirtualMachine(m.machineId))),
            connections,
            gridW: gw,
            gridH: gh,
        });
    }

    private _recalcChildrenMask(snap: BlueprintSnapshot): void {
        snap.childrenMask = Mask.Uniform(snap.ownMask.width, snap.ownMask.height, 0);
        for (const ref of snap.children) {
            const cs = this._map.get(ref.childNodeId);
            if (cs) snap.childrenMask.MergeInPlace(cs.totalMask, ref.x, ref.y);
        }
    }

    private _recalcTotalMask(snap: BlueprintSnapshot): void {
        snap.totalMask = snap.ownMask.Clone();
        snap.totalMask.MergeInPlace(snap.childrenMask, 0, 0);
    }
}
