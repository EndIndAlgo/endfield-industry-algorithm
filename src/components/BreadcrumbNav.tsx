import React from 'react';
import { Flex, Text } from '@chakra-ui/react';
import { ChevronRight } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';

export const BreadcrumbNav: React.FC = () => {
    const currentViewingNodeId = useGameStore((s) => s.currentViewingNodeId);
    const currentAncestorPath = useGameStore((s) => s.currentAncestorPath);
    const doc = useGameStore((s) => s.doc);
    const loadBlueprint = useGameStore((s) => s.loadBlueprint);

    if (!currentViewingNodeId) return null;

    const currentName = doc.nodes[currentViewingNodeId]?.name ?? '未命名';

    // 构建完整路径：[...ancestors, currentViewing]
    const pathItems = [
        ...currentAncestorPath.map((nodeId) => ({
            nodeId,
            name: doc.nodes[nodeId]?.name ?? '?',
        })),
        { nodeId: currentViewingNodeId, name: currentName },
    ];

    if (pathItems.length <= 1) return null;

    const handleNavigate = (nodeId: string) => {
        // 检出式：离开当前蓝图前确认未保存修改
        if (useGameStore.getState().isCheckoutDirty()
            && !window.confirm('当前蓝图有未保存的修改，切换蓝图将丢弃这些修改。继续？')) {
            return;
        }
        loadBlueprint(nodeId);
    };

    return (
        <Flex
            align="center"
            gap={1}
            px={4}
            py={1.5}
            bg="gray.900"
            borderBottom="1px solid"
            borderColor="gray.700"
            fontSize="sm"
            color="gray.400"
        >
            {pathItems.map((item, i) => (
                <React.Fragment key={item.nodeId}>
                    {i > 0 && <ChevronRight size={14} />}
                    <Text
                        as="span"
                        fontWeight={i === pathItems.length - 1 ? 'bold' : 'normal'}
                        color={i === pathItems.length - 1 ? 'white' : 'gray.400'}
                        cursor={i < pathItems.length - 1 ? 'pointer' : 'default'}
                        _hover={i < pathItems.length - 1 ? { color: 'yellow.300' } : undefined}
                        onClick={() => {
                            if (i < pathItems.length - 1) {
                                handleNavigate(item.nodeId);
                            }
                        }}
                    >
                        {item.name}
                    </Text>
                </React.Fragment>
            ))}
        </Flex>
    );
};
