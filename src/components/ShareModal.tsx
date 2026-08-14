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
import { useState, useEffect, useCallback } from 'react';
import { captureBlueprintScreenshot, generateShareUrl } from '@/utils/shareUtils';
import { toaster } from '@/utils/toaster';
import { useGameStore } from '@/store/gameStore';
import { IconButton } from "@chakra-ui/react"
import { Icon } from '@iconify/react';

interface ShareModalProps {
    onClose: () => void;
}

export const ShareModal = ({ onClose }: ShareModalProps) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [shareLink, setShareLink] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = useCallback(async () => {
        setIsGenerating(true);
        try {
            const { machines, connections } = useGameStore.getState();
            const url = generateShareUrl({ machines, connections });
            if (!url) {
                toaster.create({
                    title: '蓝图尺寸超出分享链接上限（256 格），无法生成链接',
                    type: 'warning',
                    duration: 4000,
                });
            }
            setShareLink(url);

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
    }, []);

    // 组件挂载 = 弹窗打开 → 生成分享数据；父组件通过 key 控制挂载/卸载
    useEffect(() => {
        // set-state-in-effect：挂载初始化数据获取是 effect 的正当用途
        // eslint-disable-next-line react-hooks/set-state-in-effect
        handleGenerate();
    }, [handleGenerate]);

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

    // open 恒为 true：组件存在即弹窗打开，关闭由父组件卸载此组件实现（Header 通过 key 控制挂载/卸载）
    return (
        <Dialog.Root open={true} onOpenChange={(e) => !e.open && onClose()} size="lg">
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
