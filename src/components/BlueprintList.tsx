import { Box, Text, Flex, Heading, CloseButton, IconButton } from '@chakra-ui/react';
import { Tooltip } from '@/components/ui/tooltip';
import { Pencil, Link, Copy, Trash2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { type Blueprint, getBlueprints } from '@/utils/storage';
import { useGameStore } from '@/store/gameStore';
import { blueprintLibrary } from '@/engine';
import { Icon } from '@iconify/react';

interface BlueprintListProps {
    onCreateNew: () => void;
}

interface TreeNode {
    nodeId: string;
    name: string;
    version: number;
    updatedAt: number;
    blueprintId: string;
    children: TreeNode[];
}

function buildTree(): TreeNode[] {
    const { blueprintRegistry } = useGameStore.getState();
    const entries = Object.values(blueprintRegistry);
    if (entries.length === 0) return [];

    const childNodeIds = new Set<string>();
    for (const snap of entries) {
        for (const child of snap.children) {
            childNodeIds.add(child.childNodeId);
        }
    }

    const roots = entries.filter((s) => !childNodeIds.has(s.nodeId));

    function buildNode(snapshot: typeof entries[0]): TreeNode {
        return {
            nodeId: snapshot.nodeId,
            name: snapshot.name,
            version: snapshot.version,
            updatedAt: snapshot.updatedAt,
            blueprintId: snapshot.blueprintId,
            children: snapshot.children
                .map((c) => {
                    const child = useGameStore.getState().blueprintRegistry[c.childNodeId];
                    return child ? buildNode(child) : null;
                })
                .filter(Boolean) as TreeNode[],
        };
    }

    return roots.map(buildNode);
}

function formatDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 收集树中所有 nodeId（扁平化） */
function flattenTree(nodes: TreeNode[]): TreeNode[] {
    return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export const BlueprintList = ({ onCreateNew }: BlueprintListProps) => {
    const startInsertChild = useGameStore((s) => s.startInsertChild);
    const loadBlueprint = useGameStore((s) => s.loadBlueprint);
    const removeChild = useGameStore((s) => s.removeChild);
    const setUiView = useGameStore((s) => s.setUiView);
    // 订阅 registry 变更以触发重渲染（数据来自 engine）
    useGameStore((s) => s.blueprintRegistry);
    const currentViewingNodeId = useGameStore((s) => s.currentViewingNodeId);

    const [oldBlueprints] = useState<Blueprint[]>(() => getBlueprints());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<'all' | 'root'>('all');

    const tree = buildTree();
    const allNodes = flattenTree(tree);
    const rootNodes = tree;
    const displayNodes = activeTab === 'root' ? rootNodes : allNodes;

    const toggle = (nodeId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
            return next;
        });
    };

    const handleEdit = (nodeId: string) => {
        loadBlueprint(nodeId);
        setUiView('editor');
    };

    const handleImportRef = (nodeId: string) => {
        // 如果当前没有 viewing 蓝图，先创建一个作为父蓝图
        if (!currentViewingNodeId) {
            useGameStore.getState().createBlueprint();
        }
        startInsertChild(nodeId);
        setUiView('editor');
    };

    const handleDelete = (nodeId: string) => {
        const refCount = blueprintLibrary.refCount(nodeId);
        if (refCount > 0) return;
        if (!confirm('确定要删除此蓝图吗？')) return;
        if (currentViewingNodeId) {
            removeChild(nodeId);
        }
    };

    const computeDepth = (node: TreeNode): number => {
        for (const root of tree) {
            const d = findDepth(node.nodeId, root, 0);
            if (d >= 0) return d;
        }
        return 0;
    };

    function findDepth(targetId: string, node: TreeNode, depth: number): number {
        if (node.nodeId === targetId) return depth;
        for (const child of node.children) {
            const d = findDepth(targetId, child, depth + 1);
            if (d >= 0) return d;
        }
        return -1;
    }

    const borderColors = ['var(--yellow)', 'var(--green)', '#3399ff', '#ff9933'];

    return (
        <Box width="100vw" height="100vh" bg="var(--gray-light)" p={8}>
            {/* 头部 */}
            <Flex justify="space-between" align="center" mb={6} color="var(--gray-dark)">
                <Heading size="xl">// 蓝图管理</Heading>
                <Flex gap={2}>
                    <Tooltip content="新建蓝图">
                        <IconButton
                            rounded="full"
                            className="member-icon-btn"
                            onClick={onCreateNew}
                            aria-label="新建蓝图"
                        >
                            <Plus size={20} />
                        </IconButton>
                    </Tooltip>
                    <CloseButton size="sm" onClick={() => setUiView('editor')} />
                </Flex>
            </Flex>

            {/* 标签切换 */}
            <Flex gap={4} mb={4}>
                <Text
                    fontSize="sm" fontWeight={activeTab === 'all' ? 'bold' : 'normal'}
                    color={activeTab === 'all' ? 'var(--yellow)' : 'var(--gray)'}
                    cursor="pointer"
                    onClick={() => setActiveTab('all')}
                >
                    全部蓝图 ({allNodes.length})
                </Text>
                <Text
                    fontSize="sm" fontWeight={activeTab === 'root' ? 'bold' : 'normal'}
                    color={activeTab === 'root' ? 'var(--yellow)' : 'var(--gray)'}
                    cursor="pointer"
                    onClick={() => setActiveTab('root')}
                >
                    根蓝图 ({rootNodes.length})
                </Text>
            </Flex>

            {/* 蓝图卡片列表 */}
            <Flex w="100%" direction="column" gap="16px" overflow="auto" maxH="calc(100vh - 180px)">
                {displayNodes.length === 0 && (
                    <Text color="var(--gray)" textAlign="center" py={8}>
                        暂无蓝图，点击右上角 + 新建
                    </Text>
                )}

                {displayNodes.map((node) => {
                    const depth = computeDepth(node);
                    const borderColor = borderColors[depth % borderColors.length];
                    const refCount = blueprintLibrary.refCount(node.nodeId);
                    const canDelete = refCount === 0;
                    const hasChildren = node.children.length > 0;
                    const isExpanded = expanded.has(node.nodeId);

                    return (
                        <Flex key={node.nodeId}
                            bg="var(--black-light)"
                            p={4}
                            borderRadius="lg"
                            w="100%"
                            gap="12px"
                            boxShadow="md"
                            position="relative"
                            border="2px solid var(--gray)"
                            ml={`${depth * 24}px`}
                            maxW={`calc(100% - ${depth * 24}px)`}
                        >
                            {/* 左侧色条 */}
                            <Box
                                position="absolute"
                                left={0} top={0} bottom={0}
                                w="4px"
                                bg={borderColor}
                                borderRadius="999px 0 0 999px"
                            />

                            {/* 展开/折叠 */}
                            <Flex align="center" minW="24px">
                                {hasChildren ? (
                                    <IconButton
                                        size="2xs"
                                        variant="ghost"
                                        onClick={() => toggle(node.nodeId)}
                                        aria-label={isExpanded ? '折叠' : '展开'}
                                        color="var(--gray)"
                                    >
                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </IconButton>
                                ) : (
                                    <Box w="24px" />
                                )}
                            </Flex>

                            {/* 信息 */}
                            <Flex direction="column" justifyContent="space-between" flex={1}>
                                <Box>
                                    <Flex align="center" gap={2}>
                                        <Text fontSize="md" fontWeight="bold" color="var(--gray-dark)">
                                            {node.name}
                                        </Text>
                                        <Text fontSize="xs" color="var(--gray)">
                                            v{node.version}
                                        </Text>
                                    </Flex>
                                    <Flex gap={4} mt={1}>
                                        <Text fontSize="xs" color="var(--gray)">
                                            更新于 {formatDate(node.updatedAt)}
                                        </Text>
                                        {hasChildren && (
                                            <Text fontSize="xs" color="var(--gray)">
                                                {node.children.length} 个子蓝图
                                            </Text>
                                        )}
                                        {refCount > 0 && (
                                            <Text fontSize="xs" color="var(--gray)">
                                                被 {refCount} 个蓝图引用
                                            </Text>
                                        )}
                                    </Flex>
                                </Box>
                            </Flex>

                            {/* 操作按钮 */}
                            <Flex alignItems="center" gap="8px">
                                <Tooltip content="编辑蓝图">
                                    <IconButton
                                        rounded="full"
                                        className="member-icon-btn"
                                        onClick={() => handleEdit(node.nodeId)}
                                        aria-label="编辑"
                                    >
                                        <Pencil size={16} />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip content="作为子蓝图导入（引用）">
                                    <IconButton
                                        rounded="full"
                                        className="member-icon-btn"
                                        onClick={() => handleImportRef(node.nodeId)}
                                        aria-label="导入引用"
                                    >
                                        <Link size={16} />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip content="展平复制导入">
                                    <IconButton
                                        rounded="full"
                                        className="member-icon-btn"
                                        onClick={() => handleImportRef(node.nodeId)}
                                        aria-label="导入复制"
                                    >
                                        <Copy size={16} />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip content={canDelete ? '删除蓝图' : `被 ${refCount} 个蓝图引用，无法删除`}>
                                    <IconButton
                                        rounded="full"
                                        className="member-icon-btn"
                                        disabled={!canDelete}
                                        onClick={() => handleDelete(node.nodeId)}
                                        aria-label="删除"
                                    >
                                        <Trash2 size={16} />
                                    </IconButton>
                                </Tooltip>
                            </Flex>

                            {/* 子蓝图图标指示 */}
                            {hasChildren && (
                                <Box position="absolute" top={2} right={2} color="var(--gray)" opacity={0.3}>
                                    <Icon icon="ph:tree-structure" width="24" height="24" />
                                </Box>
                            )}
                        </Flex>
                    );
                })}

                {oldBlueprints.length > 0 && (
                    <Text fontSize="xs" color="var(--gray)" textAlign="center" mt={2}>
                        旧格式蓝图已废弃，仅显示新格式蓝图
                    </Text>
                )}
            </Flex>
        </Box>
    );
};
