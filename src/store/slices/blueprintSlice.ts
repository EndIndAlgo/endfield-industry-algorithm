import type { StateCreator } from 'zustand';
import type { BlueprintSlice, GameState } from './types';
import type { PlacedMachine, Connection, BlueprintSnapshot, ModeState } from '@/types';
import { getBoundingBox } from '@/utils/grid';
import { blueprintLibrary, RegistryEngine } from '@/engine';
import { syncStoreFromViewing } from '@/utils/blueprintTree';
import { toaster } from '@/utils/toaster';

/** 同步 Zustand 中的 blueprintRegistry 到引擎最新状态 */
function _syncRegistryToStore(set: (p: Partial<GameState>) => void): void {
    set({ blueprintRegistry: blueprintLibrary.toObject() });
}

/** 从 store 状态重建当前 viewing 的 BlueprintSnapshot */
function _rebuildSnapshot(get: () => GameState): BlueprintSnapshot | null {
    const { machines, connections, currentViewingNodeId } = get();
    if (!currentViewingNodeId) return null;
    const existing = blueprintLibrary.read(currentViewingNodeId);
    if (!existing) return null;

    const ownMachines = machines.filter((m) => m.blueprintNodeId === currentViewingNodeId);
    const ownConnections = connections.filter((c) => c.blueprintNodeId === currentViewingNodeId);

    return blueprintLibrary.rebuildMasks(
        existing,
        ownMachines,
        ownConnections,
        get().gridWidth,
        get().gridHeight,
    );
}

export const createBlueprintSlice: StateCreator<GameState, [], [], BlueprintSlice> = (set, get) => ({
    uiView: 'editor',
    blueprintRegistry: blueprintLibrary.toObject(),
    currentViewingNodeId: null,
    currentAncestorPath: [],

    // ── 新建蓝图 ──

    createBlueprint: () => {
        const { gridWidth, gridHeight } = get();
        const snapshot = RegistryEngine.createEmpty('未命名蓝图', gridWidth, gridHeight);
        blueprintLibrary.save(snapshot);
        const nodeId = snapshot.nodeId;

        _syncRegistryToStore(set);
        set({ currentViewingNodeId: nodeId, currentAncestorPath: [] });
        get().syncStoreFromViewing();
        return nodeId;
    },

    // ── 保存蓝图（共享时 Fork 写时复制，非共享原地保存）──

    saveCurrentBlueprint: (name) => {
        const snapshot = _rebuildSnapshot(get);
        if (!snapshot) return;

        // 重建掩码（内容以 store 工作副本为准）
        const rebuild = blueprintLibrary.rebuildMasks(
            snapshot,
            snapshot.machines,
            snapshot.connections,
            get().gridWidth,
            get().gridHeight,
        );
        const nodeId = rebuild.nodeId;

        // 未被共享（含根节点）：原地保存，nodeId 不变，
        // 避免每次保存 fork 出孤儿根导致刷新后加载过期内容
        if (blueprintLibrary.refCount(nodeId) <= 1) {
            blueprintLibrary.save({ ...rebuild, name }, get().gridWidth, get().gridHeight);
            // 子蓝图内容变化 → 重算所有引用此节点的父级掩码
            blueprintLibrary.recalcDependents(nodeId);
            _syncRegistryToStore(set);
            return;
        }

        // 被多个父节点共享：写时复制。
        // 先从不含本次编辑的旧版本 fork（保持其他调用方引用不变），再把编辑写入新版本
        const forkNodeId = blueprintLibrary.fork(nodeId, get().gridWidth, get().gridHeight);
        if (!forkNodeId) return;

        blueprintLibrary.save(
            { ...rebuild, nodeId: forkNodeId, name },
            get().gridWidth,
            get().gridHeight,
        );

        const { currentAncestorPath } = get();
        const parentNodeId = currentAncestorPath.length > 0
            ? currentAncestorPath[currentAncestorPath.length - 1]
            : null;

        // 更新父节点的 childRef 指向新版本
        if (parentNodeId) {
            const parent = blueprintLibrary.read(parentNodeId);
            if (parent) {
                // 必须在 removeChild 之前读取旧引用位置（removeChild 会替换 children 数组）
                const oldChildRef = parent.children.find(
                    (c) => c.childNodeId === nodeId,
                );
                blueprintLibrary.removeChild(parentNodeId, nodeId);
                blueprintLibrary.addChild(
                    parentNodeId, forkNodeId,
                    oldChildRef?.x ?? 0,
                    oldChildRef?.y ?? 0,
                );
            }
        }

        _syncRegistryToStore(set);
        // 用 loadBlueprint 加载 forked 版本到 store（正确更新 blueprintNodeId）
        get().loadBlueprint(forkNodeId);
    },

    // ── 加载蓝图 ──

    loadBlueprint: (nodeId) => {
        const snapshot = blueprintLibrary.read(nodeId);
        if (!snapshot) return;

        const ancestorPath = blueprintLibrary.findAncestorPath(nodeId);

        // Fork：拷贝 snapshot 的机器/连线到 store
        const viewingMachines: PlacedMachine[] = snapshot.machines.map((m) => ({
            ...m,
            blueprintNodeId: nodeId,
        }));
        const viewingConnections: Connection[] = snapshot.connections.map((c) => ({
            ...c,
            path: c.path.map((p) => ({ ...p })),
            blueprintNodeId: nodeId,
        }));

        set({
            currentViewingNodeId: nodeId,
            currentAncestorPath: ancestorPath,
            machines: viewingMachines,
            connections: viewingConnections,
        });

        get().syncStoreFromViewing();
    },

    // ── 子蓝图导入 ──

    startInsertChild: (nodeId) => {
        const childSnapshot = blueprintLibrary.read(nodeId);
        if (!childSnapshot) return;

        set({
            modeState: {
                kind: 'BLUEPRINT_MOVE',
                childNodeId: nodeId,
                childSnapshot,
                moveAnchor: { x: 0, y: 0 },
                isCopying: true,
                isInserting: true,
                isValidPosition: true,
                previewOffset: null,
            } as Extract<ModeState, { kind: 'BLUEPRINT_MOVE' }>,
        });
    },

    commitInsert: (ox, oy) => {
        const ms = get().modeState as Extract<ModeState, { kind: 'BLUEPRINT_MOVE' }>;
        if (ms.kind !== 'BLUEPRINT_MOVE') return;

        const { childNodeId } = ms;
        const { currentViewingNodeId } = get();
        if (!currentViewingNodeId) return;

        const added = blueprintLibrary.addChild(currentViewingNodeId, childNodeId, ox, oy);
        if (!added) {
            // 环防护：addChild 拒绝自引用/祖先引用，提示用户并取消放置
            toaster.create({
                title: '无法插入蓝图：会形成循环引用',
                type: 'warning',
                duration: 3000,
            });
            set({ modeState: { kind: 'BUILD', placing: null } });
            return;
        }

        _syncRegistryToStore(set);
        set({ modeState: { kind: 'BUILD', placing: null } });
        get().syncStoreFromViewing();
    },

    commitMove: (nodeId, ox, oy) => {
        const { currentViewingNodeId } = get();
        if (!currentViewingNodeId) return;

        blueprintLibrary.moveChild(currentViewingNodeId, nodeId, ox, oy);

        _syncRegistryToStore(set);
        set({ modeState: { kind: 'BUILD', placing: null } });
        get().syncStoreFromViewing();
    },

    removeChild: (nodeId) => {
        const { currentViewingNodeId } = get();
        if (!currentViewingNodeId) return;

        blueprintLibrary.removeChild(currentViewingNodeId, nodeId);
        // 如果引用计数归零，从引擎删除
        if (blueprintLibrary.refCount(nodeId) === 0) {
            blueprintLibrary.delete(nodeId);
        }

        _syncRegistryToStore(set);
        get().syncStoreFromViewing();
    },

    // ── 导航 ──

    navigateInto: (nodeId) => {
        if (!blueprintLibrary.read(nodeId)) return;
        const { currentViewingNodeId, currentAncestorPath } = get();
        set({
            currentAncestorPath: [...currentAncestorPath, currentViewingNodeId!],
            currentViewingNodeId: nodeId,
        });
        get().syncStoreFromViewing();
    },

    navigateToParent: () => {
        const { currentAncestorPath } = get();
        if (currentAncestorPath.length === 0) return;
        const parentNodeId = currentAncestorPath[currentAncestorPath.length - 1];
        set({
            currentViewingNodeId: parentNodeId,
            currentAncestorPath: currentAncestorPath.slice(0, -1),
        });
        get().syncStoreFromViewing();
    },

    // ── 同步 store ──

    syncStoreFromViewing: () => {
        const { currentViewingNodeId, machines: storeMachines, connections: storeConns } = get();
        const viewingOwnMachines = storeMachines.filter(
            (m) => m.blueprintNodeId === currentViewingNodeId,
        );
        const viewingOwnConnections = storeConns.filter(
            (c) => c.blueprintNodeId === currentViewingNodeId,
        );
        const { machines, connections } = syncStoreFromViewing(
            currentViewingNodeId,
            blueprintLibrary.toObject(),
            viewingOwnMachines,
            viewingOwnConnections,
        );
        set({ machines, connections });
    },

    // ── 兼容旧接口 ──

    loadGame: (machines, connections, gridWidth, gridHeight, _blueprintId, blueprintName) => {
        const snapshot = RegistryEngine.createEmpty(blueprintName, gridWidth, gridHeight);
        const nodeId = snapshot.nodeId;

        const ownedMachines: PlacedMachine[] = machines.map((m) => ({
            ...m,
            blueprintNodeId: nodeId,
        }));
        const ownedConnections: Connection[] = connections.map((c) => ({
            ...c,
            blueprintNodeId: nodeId,
        }));

        const rebuilt = blueprintLibrary.rebuildMasks(snapshot, ownedMachines, ownedConnections, gridWidth, gridHeight);
        blueprintLibrary.save(rebuilt, gridWidth, gridHeight);

        _syncRegistryToStore(set);
        set({
            machines: ownedMachines,
            connections: ownedConnections,
            gridWidth,
            gridHeight,
            currentViewingNodeId: nodeId,
            currentAncestorPath: [],
            modeState: { kind: 'BUILD', placing: null },
            history: { past: [], future: [] },
        });
    },

    resetGame: () => {
        set({
            machines: [],
            connections: [],
            currentViewingNodeId: null,
            currentAncestorPath: [],
            modeState: { kind: 'BUILD', placing: null },
            history: { past: [], future: [] },
        });
    },

    setUiView: (view) => set({ uiView: view }),

    /** @deprecated 使用 startInsertChild 替代 */
    startInsertBlueprint: (blueprint) => {
        const { machines: srcMachines, connections: srcConns } = blueprint.data;
        if (srcMachines.length === 0 && srcConns.length === 0) return;

        const bb = getBoundingBox(srcMachines, srcConns);
        if (bb.width === 0 && bb.height === 0) return;

        const anchor = { x: bb.minX, y: bb.minY };

        const newMachines = srcMachines.map((m) => ({ ...m, id: crypto.randomUUID() }));
        const newConnections = srcConns.map((c) => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map((p) => ({ ...p })),
        }));

        set({
            modeState: {
                kind: 'MOVE_SELECTION',
                moveAnchor: anchor,
                movingMachinesSnapshot: newMachines,
                movingConnectionsSnapshot: newConnections,
                isCopying: true,
                originSelectedMachineIds: [],
                originSelectedConnectionIds: [],
            },
            uiView: 'editor',
        });
    },
});
