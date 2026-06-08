
import { Box, VStack, Text, Button, IconButton, Flex, Drawer, Badge } from '@chakra-ui/react';
import { FilePlus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Blueprint, deleteBlueprint, getBlueprints } from '../utils/storage';

import { useGameStore } from '../store/gameStore';

interface BlueprintListProps {
    onSelect: (blueprint: Blueprint) => void;
    onCreateNew: () => void;
    mode: 'manage' | 'insert';
}

export const BlueprintList = ({ onSelect, onCreateNew, mode }: BlueprintListProps) => {
    const startInsertBlueprint = useGameStore(s => s.startInsertBlueprint);
    const startInsertBlueprintOnNewMap = useGameStore(s => s.startInsertBlueprintOnNewMap);
    const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
    const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    useEffect(() => {
        setBlueprints(getBlueprints());
    }, []);

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('確定要刪除此藍圖嗎?')) {
            deleteBlueprint(id);
            setBlueprints(getBlueprints());
            if (selectedBlueprint?.id === id) {
                setIsDrawerOpen(false);
                setSelectedBlueprint(null);
            }
        }
    };

    const handleCardClick = (bp: Blueprint) => {
        setSelectedBlueprint(bp);
        setIsDrawerOpen(true);
    };

    const handleConfirmOpen = () => {
        if (selectedBlueprint) {
            onSelect(selectedBlueprint);
        }
    };

    const handlePasteInsert = () => {
        if (selectedBlueprint) {
            startInsertBlueprint(selectedBlueprint);
        }
    };

    const handleNewMapInsert = () => {
        if (selectedBlueprint) {
            startInsertBlueprintOnNewMap(selectedBlueprint);
        }
    };

    return (
        <Box
            position="fixed"
            inset="0"
            bg="var(--gray-light)"
            zIndex="2000"
            p={8}
        >
            <Box borderLeft={"4px solid var(--gray-dark)"} pl={"8px"}>
                <Text color={"var(--gray-dark)"} fontSize={"xl"} fontWeight={"bold"}>藍圖一覽</Text>
                <Flex alignItems={"flex-end"}>
                    <Text color={"var(--black)"} fontSize={"xl"} fontWeight={"bold"}> {blueprints.length}</Text>
                    <Text color={"var(--black)"} fontSize={"md"} fontWeight={"bold"} pb={"1px"}> / 999</Text>
                </Flex>
            </Box>

            <Flex mx={"32px"} my={"16px"} gap={"16px"} wrap={"wrap"}>
                <Box
                    p={"8px"}
                    cursor="pointer"
                    onClick={onCreateNew}
                    border="2px dashed"
                    borderColor="var(--gray-dark)"
                    borderRadius="4px"
                    bg="transparent"
                    aspectRatio="1/1"
                    w="160px"
                    h="160px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    boxShadow="inset 0px 0px 4px rgba(0, 0, 0, 0.2)"
                    transition="all 0.2s"
                    _hover={{ transform: "translateY(-4px)", shadow: "md" }}
                >
                    <VStack>
                        <FilePlus size={36} color="var(--gray-dark)" />
                        <Text fontSize="lg" fontWeight="bold" color="var(--gray-dark)">新建藍圖</Text>
                    </VStack>
                </Box>

                {blueprints.map(bp => (
                    <Flex
                        key={bp.id}
                        p={"8px"}
                        cursor="pointer"
                        onClick={() => handleCardClick(bp)}
                        border="2px solid"
                        borderColor="var(--gray-dark)"
                        borderRadius="4px"
                        bg="transparent"
                        aspectRatio="1/1"
                        w="160px"
                        h="160px"
                        direction="column"
                        justifyContent="space-between"
                        boxShadow="inset 0px 0px 4px rgba(0, 0, 0, 0.2)"
                        transition="all 0.2s"
                        _hover={{ transform: "translateY(-4px)", shadow: "md" }}
                    >
                        <Box>
                            <Text fontSize="md" color="var(--gray-dark)" fontWeight="bold">{bp.name}</Text>
                            <Text fontSize="xs" color="var(--gray-dark)">
                                {new Date(bp.updatedAt).toLocaleDateString()}
                            </Text>
                            <Text fontSize="xs" color="var(--gray-dark)">
                                {bp.data.actualWidth}x{bp.data.actualHeight}
                            </Text>
                        </Box>
                        <Flex justifyContent="flex-end">
                            <IconButton
                                aria-label="Delete blueprint"
                                size="xs"
                                colorPalette="red"
                                variant="ghost"
                                _hover={{ backgroundColor: "red.300" }}
                                onClick={(e) => handleDelete(e, bp.id)}
                            >
                                <Trash2 size={14} />
                            </IconButton>
                        </Flex>
                    </Flex>
                ))}
            </Flex>

            <Drawer.Root open={isDrawerOpen} onOpenChange={(e) => setIsDrawerOpen(e.open)}>
                <Drawer.Backdrop />
                <Drawer.Positioner>
                    <Drawer.Content backgroundColor={"var(--gray-light)"}>
                        <Drawer.Header backgroundColor={"var(--gray-light)"}>
                            <Drawer.Title color="var(--gray-dark)" >
                                <Box borderLeft={"4px solid var(--gray-dark)"} pl={"8px"}>
                                    <Text color={"var(--gray-dark)"} fontSize={"sm"} fontWeight={"bold"}>藍圖詳情</Text>
                                </Box>
                                <Flex alignItems={"flex-end"} gap={"1px"}>
                                    <Text fontSize={"sm"}>[</Text>
                                    <Text fontSize={"2xl"} pb={"1px"}>{selectedBlueprint?.name || '藍圖名稱'}</Text>
                                    <Text fontSize={"sm"}>]</Text>
                                </Flex>
                            </Drawer.Title>
                        </Drawer.Header>
                        <Drawer.Body
                            backgroundImage="linear-gradient(to bottom, var(--gray-dark), var(--gray-light))"
                            borderTopLeftRadius={"8px"}
                            borderTopRightRadius={"8px"}
                        >
                            {selectedBlueprint && (
                                <Flex direction={"column"} gap={"8px"} fontWeight={"bold"}>
                                    <Box>
                                        <Text color={"var(--yellow)"}>創建日期</Text>
                                        <Text>{new Date(selectedBlueprint.createdAt).toLocaleString()}</Text>
                                    </Box>
                                    <Box>
                                        <Text color={"var(--yellow)"}>內容尺寸</Text>
                                        <Text>{selectedBlueprint.data.actualWidth} x {selectedBlueprint.data.actualHeight}</Text>
                                    </Box>
                                    <Flex wrap={"wrap"} gap={"4px"}>
                                        <Badge>Default</Badge>
                                        <Badge colorPalette="green">Success</Badge>
                                        <Badge colorPalette="red">Removed</Badge>
                                        <Badge colorPalette="purple">New</Badge>
                                    </Flex>
                                </Flex>
                            )}
                        </Drawer.Body>
                        <Drawer.Footer pb={"32px"}>
                            <Drawer.ActionTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="gray-btn"
                                >
                                    關閉
                                </Button>
                            </Drawer.ActionTrigger>
                            {mode === 'insert' ? (
                                <>
                                    <Button onClick={handlePasteInsert}
                                        variant="outline"
                                        className="yellow-btn">
                                        貼上到當前
                                    </Button>
                                    <Button onClick={handleNewMapInsert}
                                        variant="outline"
                                        className="yellow-btn">
                                        新建地圖放置
                                    </Button>
                                </>
                            ) : (
                                <Button onClick={handleConfirmOpen}
                                    variant="outline"
                                    className="yellow-btn">
                                    打開藍圖
                                </Button>
                            )}
                        </Drawer.Footer>
                    </Drawer.Content>
                </Drawer.Positioner>
            </Drawer.Root>
        </Box>
    );
};
