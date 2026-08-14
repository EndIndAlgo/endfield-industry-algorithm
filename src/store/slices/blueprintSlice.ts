import type { StateCreator } from 'zustand';
import type { BlueprintSlice, GameState } from './types';
import type { PlacedMachine, Connection, ModeState, BlueprintSummary } from '@/types';
import { getBoundingBox } from '@/utils/grid';
import { toaster } from '@/utils/toaster';
import {
    DEFAULT_BLUEPRINT_NAME,
    createEmptyDoc,
    createNodeWithContent,
    getNode,
    refCount,
    findAncestorPath,
    canInsertChild,
    commitNode,
    forkCommit,
    addChild,
    removeChild,
    moveChild,
    deleteNode,
    flattenNode,
    flattenDescendants,
    isContentEqual,
} from '@/domain/doc';
import { loadDoc, saveDoc } from '@/domain/persist';
import { validateChildPlacement } from '@/utils/blueprintPlacement';

/** 提取工作视图中当前 viewing 节点的自有内容 */
function _ownContent(get: () => GameState, viewingNodeId: string | null) {
    if (!viewingNodeId) return null;
    const { machines, connections } = get();
    return {
        machines: machines.filter((m) => m.blueprintNodeId === viewingNodeId),
        connections: connections.filter((c) => c.blueprintNodeId === viewingNodeId),
    };
}

/**
 * 引用自己时产生的待插入 fork 副本登记表。
 * 取消插入（Escape/右键）时由 modeSlice 调 discardPendingInsertFork 清理，
 * 避免 fork 副本残留为孤儿根节点。
 */
const pendingInsertForks = new Set<string>();

/** 清理取消插入后残留的 fork 副本（仅对引用自己产生的节点生效） */
export function discardPendingInsertFork(
    get: () => GameState,
    set: (p: Partial<GameState>) => void,
    nodeId: string,
): void {
    if (!pendingInsertForks.delete(nodeId)) return;
    const { doc } = get();
    const nextDoc = deleteNode(doc, nodeId);
    persistOrToast(nextDoc);
    set({ doc: nextDoc });
}

/** 落盘失败（配额满/隐私模式）时给用户可见提示，避免"提示保存成功但刷新即丢" */
function persistOrToast(nextDoc: import('@/domain/doc').FactoryDoc): void {
    if (!saveDoc(nextDoc)) {
        toaster.create({
            title: '保存失败：本地存储不可用或已满',
            type: 'warning',
            duration: 4000,
        });
    }
}

export const createBlueprintSlice: StateCreator<GameState, [], [], BlueprintSlice> = (set, get) => ({
    uiView: 'editor',
    doc: loadDoc() ?? createEmptyDoc(),
    currentViewingNodeId: null,
    currentAncestorPath: [],

    // ── 新建蓝图 ──

    createBlueprint: () => {
        const { gridWidth, gridHeight, doc } = get();
        const node = createNodeWithContent(DEFAULT_BLUEPRINT_NAME, gridWidth, gridHeight, {
            machines: [],
            connections: [],
        });
        const nextDoc = { ...doc, nodes: { ...doc.nodes, [node.nodeId]: node } };
        persistOrToast(nextDoc);
        set({
            doc: nextDoc,
            currentViewingNodeId: node.nodeId,
            currentAncestorPath: [],
            machines: [],
            connections: [],
            modeState: { kind: 'BUILD', placing: null },
            history: { past: [], future: [] },
        });
        return node.nodeId;
    },

    // ── 保存蓝图（检出式提交：共享时 fork 写时复制，非共享原地提交）──

    saveCurrentBlueprint: (name) => {
        const { doc, currentViewingNodeId, currentAncestorPath, gridWidth, gridHeight } = get();
        if (!currentViewingNodeId || !getNode(doc, currentViewingNodeId)) return;

        const content = _ownContent(get, currentViewingNodeId)!;

        // 未被共享（含根节点）：原地提交，nodeId 不变
        if (refCount(doc, currentViewingNodeId) <= 1) {
            const nextDoc = commitNode(doc, currentViewingNodeId, content, name, gridWidth, gridHeight);
            persistOrToast(nextDoc);
            set({ doc: nextDoc });
            return;
        }

        // 被多个父节点共享：fork 自旧版本（保持其他调用方引用不变），再写入本次编辑
        const { doc: forkedDoc, newNodeId } = forkCommit(doc, currentViewingNodeId, content, name, gridWidth, gridHeight);

        // 当前父链的引用重指到新版本（保留原插入位置）
        let nextDoc = forkedDoc;
        const parentNodeId = currentAncestorPath.length > 0
            ? currentAncestorPath[currentAncestorPath.length - 1]
            : null;
        if (parentNodeId) {
            const parent = getNode(nextDoc, parentNodeId);
            if (parent) {
                const oldRef = parent.children.find((c) => c.childNodeId === currentViewingNodeId);
                nextDoc = removeChild(nextDoc, parentNodeId, currentViewingNodeId);
                nextDoc = addChild(nextDoc, parentNodeId, newNodeId, oldRef?.x ?? 0, oldRef?.y ?? 0);
            }
        }

        persistOrToast(nextDoc);
        set({ doc: nextDoc });
        get().loadBlueprint(newNodeId);
    },

    // ── 加载蓝图（进入检出：用节点已提交内容替换工作视图）──

    loadBlueprint: (nodeId) => {
        const node = getNode(get().doc, nodeId);
        if (!node) return;

        // 清理活跃操作：避免未提交的移动/复制快照随导航残留（过期 modeState
        // 会在下次点击时把幽灵内容提交到意外位置）
        get().cancelOperation();

        const viewingMachines: PlacedMachine[] = node.machines.map((m) => ({
            ...m,
            blueprintNodeId: nodeId,
        }));
        const viewingConnections: Connection[] = node.connections.map((c) => ({
            ...c,
            path: c.path.map((p) => ({ ...p })),
            blueprintNodeId: nodeId,
        }));

        set({
            currentViewingNodeId: nodeId,
            currentAncestorPath: findAncestorPath(get().doc, nodeId),
            machines: viewingMachines,
            connections: viewingConnections,
            // 网格尺寸随蓝图恢复（否则一直停留在上一个蓝图的尺寸，越界机器无法放置/保存）
            gridWidth: node.gridW,
            gridHeight: node.gridH,
            modeState: { kind: 'BUILD', placing: null },
            history: { past: [], future: [] },
        });

        get().syncStoreFromViewing();
    },

    // ── 子蓝图导入 ──

    startInsertChild: (nodeId) => {
        const { doc, currentViewingNodeId } = get();

        // 已直接引用过同一子蓝图 → 拒绝重复导入（fork 保存只重指一条引用，
        // 重复实例会在 fork 时丢失；需要多实例时用"展平复制"）
        if (currentViewingNodeId) {
            const viewing = getNode(doc, currentViewingNodeId);
            if (viewing?.children.some((c) => c.childNodeId === nodeId)) {
                toaster.create({
                    title: '当前蓝图已引用该子蓝图，如需第二份请使用展平复制',
                    type: 'warning',
                    duration: 3000,
                });
                return;
            }
        }

        // 引用自己：fork 出一份副本再引用（写时复制语义，避免成环）。
        // 副本登记进 pendingInsertForks，取消插入时清理。
        let targetId = nodeId;
        if (nodeId === currentViewingNodeId) {
            const source = getNode(doc, nodeId);
            if (source) {
                const { doc: forkedDoc, newNodeId } = forkCommit(
                    doc,
                    nodeId,
                    { machines: source.machines, connections: source.connections },
                    source.name,
                    source.gridW,
                    source.gridH,
                );
                persistOrToast(forkedDoc);
                set({ doc: forkedDoc });
                pendingInsertForks.add(newNodeId);
                targetId = newNodeId;
            }
        }

        const node = getNode(get().doc, targetId);
        if (!node) return;

        const childSummary: BlueprintSummary = {
            nodeId: targetId,
            name: node.name,
            gridW: node.gridW,
            gridH: node.gridH,
        };

        set({
            modeState: {
                kind: 'BLUEPRINT_MOVE',
                childNodeId: targetId,
                childSummary,
                moveAnchor: { x: 0, y: 0 },
                isCopying: true,
                isInserting: true,
                isValidPosition: true,
                previewOffset: null,
            },
        });
    },

    commitInsert: (ox, oy) => {
        const ms = get().modeState as Extract<ModeState, { kind: 'BLUEPRINT_MOVE' }>;
        if (ms.kind !== 'BLUEPRINT_MOVE') return;

        const { childNodeId } = ms;
        const { currentViewingNodeId, doc } = get();
        if (!currentViewingNodeId) return;

        if (!canInsertChild(doc, currentViewingNodeId, childNodeId)) {
            toaster.create({
                title: '无法插入蓝图：会形成循环引用',
                type: 'warning',
                duration: 3000,
            });
            set({ modeState: { kind: 'BUILD', placing: null } });
            return;
        }

        // 位置校验：越界或与现有内容重叠 → 拒绝并保持 BLUEPRINT_MOVE 允许调整位置
        if (!validateChildPlacement(doc, childNodeId, ox, oy, {
            machines: get().machines,
            connections: get().connections,
            gridWidth: get().gridWidth,
            gridHeight: get().gridHeight,
        })) {
            toaster.create({
                title: '无法插入蓝图：位置越界或与现有内容重叠',
                type: 'warning',
                duration: 3000,
            });
            return;
        }

        get().takeSnapshot();
        const nextDoc = addChild(doc, currentViewingNodeId, childNodeId, ox, oy);
        pendingInsertForks.delete(childNodeId);
        persistOrToast(nextDoc);
        set({ doc: nextDoc, modeState: { kind: 'BUILD', placing: null } });
        get().syncStoreFromViewing();
    },

    // ── 展平复制 ──

    startFlattenCopy: (nodeId) => {
        const { doc, currentViewingNodeId } = get();
        if (!currentViewingNodeId) return;

        // 展平目标蓝图（含全部后代），作为普通机器/连线副本放置，不建立引用关系
        const flat = flattenNode(doc, nodeId);
        if (flat.machines.length === 0 && flat.connections.length === 0) {
            toaster.create({
                title: '该蓝图没有可复制的内容',
                type: 'warning',
                duration: 3000,
            });
            return;
        }

        const anchor = getBoundingBox(flat.machines, flat.connections);

        const newMachines: PlacedMachine[] = flat.machines.map((m) => ({
            ...m,
            id: crypto.randomUUID(),
            blueprintNodeId: currentViewingNodeId,
        }));
        const newConnections: Connection[] = flat.connections.map((c) => ({
            ...c,
            id: crypto.randomUUID(),
            path: c.path.map((p) => ({ ...p })),
            blueprintNodeId: currentViewingNodeId,
        }));

        set({
            modeState: {
                kind: 'MOVE_SELECTION',
                moveAnchor: { x: anchor.minX, y: anchor.minY },
                movingMachinesSnapshot: newMachines,
                movingConnectionsSnapshot: newConnections,
                isCopying: true,
                originSelectedMachineIds: [],
                originSelectedConnectionIds: [],
            },
            uiView: 'editor',
        });
    },

    commitMove: (nodeId, ox, oy) => {
        const { currentViewingNodeId, doc } = get();
        if (!currentViewingNodeId) return;

        get().takeSnapshot();
        const nextDoc = moveChild(doc, currentViewingNodeId, nodeId, ox, oy);
        persistOrToast(nextDoc);
        set({ doc: nextDoc, modeState: { kind: 'BUILD', placing: null } });
        get().syncStoreFromViewing();
    },

    removeChild: (nodeId) => {
        const { currentViewingNodeId, doc } = get();
        if (!currentViewingNodeId) return;

        get().takeSnapshot();
        let nextDoc = removeChild(doc, currentViewingNodeId, nodeId);
        // 引用计数归零 → 一并删除节点
        if (refCount(nextDoc, nodeId) === 0) {
            nextDoc = deleteNode(nextDoc, nodeId);
        }
        persistOrToast(nextDoc);
        set({ doc: nextDoc });
        get().syncStoreFromViewing();
    },

    deleteBlueprint: (nodeId) => {
        const { doc, currentViewingNodeId } = get();
        if (refCount(doc, nodeId) > 0) return;

        get().takeSnapshot();
        const nextDoc = deleteNode(doc, nodeId);
        persistOrToast(nextDoc);
        set({
            doc: nextDoc,
            ...(currentViewingNodeId === nodeId
                ? {
                    currentViewingNodeId: null,
                    currentAncestorPath: [],
                    machines: [],
                    connections: [],
                    modeState: { kind: 'BUILD', placing: null } as ModeState,
                }
                : {}),
        });
    },

    // ── 导航（BreadcrumbNav 使用；离开前由调用方确认脏状态）──

    navigateInto: (nodeId) => {
        const node = getNode(get().doc, nodeId);
        if (!node) return;
        get().loadBlueprint(nodeId);
    },

    navigateToParent: () => {
        const { currentAncestorPath } = get();
        if (currentAncestorPath.length === 0) return;
        get().loadBlueprint(currentAncestorPath[currentAncestorPath.length - 1]);
    },

    // ── 同步工作视图 ──

    syncStoreFromViewing: () => {
        const { currentViewingNodeId, machines, connections, doc } = get();
        if (!currentViewingNodeId) return;

        const ownMachines = machines.filter((m) => m.blueprintNodeId === currentViewingNodeId);
        const ownConnections = connections.filter((c) => c.blueprintNodeId === currentViewingNodeId);
        const desc = flattenDescendants(doc, currentViewingNodeId);

        set({
            machines: [...ownMachines, ...desc.machines],
            connections: [...ownConnections, ...desc.connections],
        });
    },

    /** 工作视图自有内容 vs 已提交内容（离开前确认用） */
    isCheckoutDirty: () => {
        const { currentViewingNodeId, doc } = get();
        const node = getNode(doc, currentViewingNodeId);
        const content = _ownContent(get, currentViewingNodeId);
        if (!node || !content) return false;
        const contentChanged = !isContentEqual(
            { machines: content.machines, connections: content.connections },
            { machines: node.machines, connections: node.connections },
        );
        // 网格尺寸也是提交内容的一部分（gridW/gridH 随保存写入 doc）
        const gridChanged = get().gridWidth !== node.gridW || get().gridHeight !== node.gridH;
        return contentChanged || gridChanged;
    },

    // ── 兼容旧接口（分享导入 / 选区另存）──

    loadGame: (machines, connections, gridWidth, gridHeight, _blueprintId, blueprintName) => {
        const node = createNodeWithContent(blueprintName, gridWidth, gridHeight, {
            machines: machines.map((m) => ({ ...m, blueprintNodeId: '' })),
            connections: connections.map((c) => ({
                ...c,
                path: c.path.map((p) => ({ ...p })),
                blueprintNodeId: '',
            })),
        });
        // 统一归属标记
        const taggedMachines = node.machines.map((m) => ({ ...m, blueprintNodeId: node.nodeId }));
        const taggedConnections = node.connections.map((c) => ({ ...c, blueprintNodeId: node.nodeId }));

        const nextNode = {
            ...node,
            machines: taggedMachines,
            connections: taggedConnections,
        };
        const { doc } = get();
        const nextDoc = { ...doc, nodes: { ...doc.nodes, [node.nodeId]: nextNode } };
        persistOrToast(nextDoc);

        set({
            doc: nextDoc,
            machines: taggedMachines,
            connections: taggedConnections,
            gridWidth,
            gridHeight,
            currentViewingNodeId: node.nodeId,
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
});
