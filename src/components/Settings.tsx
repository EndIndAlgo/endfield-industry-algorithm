import { Box, Flex, Heading, CloseButton, Tabs } from '@chakra-ui/react';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore, type Language } from '../store/settingsStore';
import "@/components/ui/About.scss";

export const Settings = () => {
    const { setUiView } = useGameStore();
    const { language, setLanguage } = useSettingsStore();

    const handleLanguageChange = (details: { value: string }) => {
        setLanguage(details.value as Language);
    };

    return (
        <Box width="100vw" height="100vh" bg="var(--gray-light)" p={8}>
            <Flex justify="space-between" align="center" mb={8} color="var(--gray-dark)">
                <Heading size="xl">// 設定</Heading>
                <CloseButton size="sm" onClick={() => setUiView('editor')} />
            </Flex>

            <Flex direction="column" gap="16px">
                <Box mb="16px" p={6} borderRadius="lg" bg="var(--black-light)" border="1px solid var(--gray)" alignSelf="stretch">
                    <Heading size="md" mb={4} color="var(--gray-light)">語言 / Language</Heading>
                    <Tabs.Root
                        value={language}
                        onValueChange={handleLanguageChange}
                        variant="subtle"
                        width="fit-content"
                        size="sm"
                    >
                        <Tabs.List bg="var(--black-dark)" p="1" borderRadius="md">
                            <Tabs.Trigger
                                value="zh-TW"
                                _selected={{ bg: "var(--yellow)", color: "var(--black-dark)" }}
                                color="var(--gray)"
                                px={4} py={2}
                                borderRadius="sm"
                                fontWeight="bold"
                            >
                                繁體中文
                            </Tabs.Trigger>
                            <Tabs.Trigger
                                value="zh-CN"
                                _selected={{ bg: "var(--yellow)", color: "var(--black-dark)" }}
                                color="var(--gray)"
                                px={4} py={2}
                                borderRadius="sm"
                                fontWeight="bold"
                            >
                                简体中文
                            </Tabs.Trigger>
                        </Tabs.List>
                    </Tabs.Root>
                </Box>
            </Flex>
        </Box>
    );
};
