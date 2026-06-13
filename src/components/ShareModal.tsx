import {
    Dialog,
    VStack,
    Box,
    Input,
    Button,
    HStack,
    Image,
    Text,
    Spinner,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { captureBlueprintScreenshot, generateShareUrl } from '../utils/shareUtils';
import { toaster } from '../utils/toaster';
import { useGameStore } from '../store/gameStore';
import { IconButton } from "@chakra-ui/react"
import { Icon } from '@iconify/react';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ShareModal = ({ isOpen, onClose }: ShareModalProps) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [shareLink, setShareLink] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);

    const { machines, connections, gridWidth, gridHeight } = useGameStore();

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // 1. 生成链接
            const data = {
                machines,
                connections,
                gridWidth,
                gridHeight,
                // 加载时我们会重新建立 '实际' 尺寸...
                // 解析逻辑需要处理此数据结构
            };
            const url = generateShareUrl(data);
            setShareLink(url);

            // 2. 生成截图 — 等待下一帧确保 DOM 稳定
            requestAnimationFrame(async () => {
                const img = await captureBlueprintScreenshot();
                setImageUrl(img);
                setIsGenerating(false);
            });

        } catch (e) {
            console.error(e);
            toaster.create({ title: '生成分享信息失败', type: 'error' });
            setIsGenerating(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            handleGenerate();
        } else {
            // 清理
            setImageUrl(null);
            setShareLink('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareLink);
        toaster.create({ title: '复制成功', type: 'success' });
    };

    const handleDownloadImage = () => {
        if (imageUrl) {
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = 'blueprint.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()} size="lg">
            <Dialog.Backdrop />
            <Dialog.Positioner>
                <Dialog.Content backgroundColor="var(--gray-light)">
                    <Dialog.Header>
                        <Dialog.Title>
                            <Box borderLeft={"4px solid var(--gray-dark)"} pl={"8px"}>
                                <Text color={"var(--gray-dark)"} fontSize={"xl"} fontWeight={"bold"}>
                                    分享蓝图
                                </Text>
                            </Box>
                        </Dialog.Title>
                    </Dialog.Header>
                    <Dialog.Body>
                        <VStack gap={6} align="stretch">
                            {/* 截图区域 */}
                            <Box
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                overflow="hidden"
                                p={"8px"}
                            >
                                {isGenerating ? (
                                    <VStack>
                                        <Spinner size="lg" color="blue.500" />
                                        <Text color="gray.400" fontSize="sm">生成预览图中...</Text>
                                    </VStack>
                                ) : imageUrl ? (
                                    <Image boxShadow="md" src={imageUrl} alt="Blueprint Preview" maxH="300px" objectFit="contain" />
                                ) : (
                                    <Text color="red.400">生成预览图失败</Text>
                                )}
                            </Box>

                            {/* 链接区域 */}
                            <VStack align="stretch" gap={2}>
                                <Box borderLeft={"4px solid var(--gray-dark)"} pl={"8px"}>
                                    <Text color={"var(--gray-dark)"} fontSize={"md"} fontWeight={"bold"}>
                                        分享链接
                                    </Text>
                                </Box>
                                <HStack>
                                    <Input
                                        value={shareLink}
                                        readOnly
                                        variant="subtle"
                                        backgroundColor={"var(--gray-light)"}
                                        border={"3px solid var(--gray)"}
                                        color={"var(--gray-dark)"}
                                    />
                                    <IconButton aria-label="Search database" onClick={handleCopyLink}>
                                        <Icon icon="iconamoon:copy" color="var(--gray-light)" />
                                    </IconButton>
                                </HStack>
                            </VStack>
                        </VStack>
                    </Dialog.Body>
                    <Dialog.Footer>
                        <Button
                            variant="outline"
                            className="gray-btn"
                            onClick={onClose}
                        >
                            关闭
                        </Button>
                        <Button
                            variant="outline"
                            className="yellow-btn"
                            onClick={handleDownloadImage}
                            disabled={!imageUrl || isGenerating}
                        >
                            下载图片
                        </Button>
                    </Dialog.Footer>
                    <Dialog.CloseTrigger />
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
