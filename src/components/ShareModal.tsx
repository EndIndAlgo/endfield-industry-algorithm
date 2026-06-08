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

    useEffect(() => {
        if (isOpen) {
            handleGenerate();
        } else {
            // 清理
            setImageUrl(null);
            setShareLink('');
        }
    }, [isOpen]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // 1. 生成連結
            const data = {
                machines,
                connections,
                gridWidth,
                gridHeight,
                // 載入時我們會重新建立 '實際' 尺寸...
                // 解析邏輯需要處理此資料結構
            };
            const url = generateShareUrl(data);
            setShareLink(url);

            // 2. 生成截圖
            // 等待 UI 穩定？
            setTimeout(async () => {
                const img = await captureBlueprintScreenshot();
                setImageUrl(img);
                setIsGenerating(false);
            }, 100);

        } catch (e) {
            console.error(e);
            toaster.create({ title: '生成分享資訊失敗', type: 'error' });
            setIsGenerating(false);
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareLink);
        toaster.create({ title: '複製成功', type: 'success' });
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
                                    分享藍圖
                                </Text>
                            </Box>
                        </Dialog.Title>
                    </Dialog.Header>
                    <Dialog.Body>
                        <VStack gap={6} align="stretch">
                            {/* 截圖區域 */}
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
                                        <Text color="gray.400" fontSize="sm">生成預覽圖中...</Text>
                                    </VStack>
                                ) : imageUrl ? (
                                    <Image boxShadow="md" src={imageUrl} alt="Blueprint Preview" maxH="300px" objectFit="contain" />
                                ) : (
                                    <Text color="red.400">生成預覽圖失敗</Text>
                                )}
                            </Box>

                            {/* 連結區域 */}
                            <VStack align="stretch" gap={2}>
                                <Box borderLeft={"4px solid var(--gray-dark)"} pl={"8px"}>
                                    <Text color={"var(--gray-dark)"} fontSize={"md"} fontWeight={"bold"}>
                                        分享連結
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
                            關閉
                        </Button>
                        <Button
                            variant="outline"
                            className="yellow-btn"
                            onClick={handleDownloadImage}
                            disabled={!imageUrl || isGenerating}
                        >
                            下載圖片
                        </Button>
                    </Dialog.Footer>
                    <Dialog.CloseTrigger />
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
