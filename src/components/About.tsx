import { Box, Text, Flex, Heading, CloseButton, IconButton } from '@chakra-ui/react';
import { Tooltip } from "@/components/ui/tooltip"
import { useGameStore } from '../store/gameStore';
import { memberInfo } from '../config/memberInfo';
import { Icon } from '@iconify/react';
import "@/components/ui/About.scss"
import AuthorImg from "@/assets/members/author.gif"
import { toaster } from '../utils/toaster';

export const About = () => {
    const { setUiView } = useGameStore();

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toaster.create({
            title: `${label} 已複製`,
            type: 'success',
            duration: 2000,
        });
    };

    return (
        <Box width="100vw" height="100vh" bg="var(--gray-light)" p={8}>
            <Flex justify="space-between" align="center" mb={8} color="var(--gray-dark)">
                <Heading size="xl">// 關於</Heading>
                <CloseButton size="sm" onClick={() => setUiView('editor')} />
            </Flex>

            <Box mb="16px" p={6} borderRadius="lg" bg="var(--black-light)" border="1px solid var(--gray)" alignSelf="stretch">
                <Text fontSize="sm" color="var(--gray)" lineHeight="1.6">
                    本工具僅為玩家社群製作的輔助工具，與遊戲官方無任何關聯。
                    <br />
                    網站內使用的遊戲素材（包括但不限於圖片、圖標、設計元素）其版權均歸屬於遊戲官方及原作者所有。
                    <br />
                    本工具不進行任何商業營利行為。若有任何侵權問題，請聯繫作者信箱進行刪除或更換。
                </Text>
            </Box>

            <Flex
                mb="8px"
                borderLeft={`4px solid var(--yellow)`}
                w="fit-content"
                bg="linear-gradient(to right, rgba(255, 255, 0, 0.4), transparent)"
                pl="8px"
                gap={"8px"}
                alignItems={"center"}
            >
                <Icon icon="tdesign:member-filled" color="var(--gray-dark)" />
                <Text fontSize="lg" fontWeight="bold" color="var(--gray-dark)">成員 {memberInfo.length + 1} / 999</Text>
            </Flex>

            <Flex w="100%" direction="column" gap="16px">
                <Flex
                    bg="var(--black-light)"
                    p={4}
                    borderRadius="lg"
                    mr={4}
                    w="100%"
                    gap={"12px"}
                    boxShadow="md"
                    position="relative"
                    overflow="hidden"
                    border="4px solid"
                    borderImageSource="linear-gradient(to right, var(--yellow), var(--black-light))"
                    borderImageSlice={1}
                >
                    <Box
                        position="absolute"
                        top="-75%"
                        right="20%"
                        width="300px"
                        height="300px"
                        backgroundImage={`url(${AuthorImg})`}
                        backgroundSize="contain"
                        backgroundRepeat="no-repeat"
                        opacity="0.2"
                        pointerEvents="none"
                        maskImage="linear-gradient(to right, transparent, black 30%, black 70%, transparent)"
                    />

                    <Box
                        w="80px"
                        h="80px"
                        minWidth="80px"
                        minHeight="80px"
                        border="2px solid var(--gray-light)"
                        borderRadius="1px"
                        position="relative"
                    >
                        <img
                            src={AuthorImg}
                            alt={'大木'}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <Box
                            position="absolute"
                            top="0"
                            left="0"
                            width="100%"
                            height="100%"
                            boxShadow="
                                inset 0 0 12px var(--black-dark)
                                "
                            pointerEvents="none"
                        />
                    </Box>
                    <Flex justify="space-between" w="100%">
                        <Flex direction="column" justifyContent={"space-between"}>
                            <Box>
                                <Text fontSize="lg" fontWeight="bold">大木</Text>
                                <Text color="var(--gray)" pl={"8px"}>咕咕嘎嘎</Text>
                            </Box>
                            <Flex gap={"8px"}>
                                <Box
                                    bg="var(--black-dark)"
                                    color="var(--gray-light)"
                                    borderRadius="999px"
                                    p={1}
                                >
                                    <Box
                                        borderLeft={`2px solid var(--yellow)`}
                                        pl="4px"
                                        mx={"8px"}
                                    >
                                        <Text fontSize="xs" fontWeight="bold">作者</Text>
                                    </Box>
                                </Box>
                                <Box
                                    bg="var(--black-dark)"
                                    color="var(--gray-light)"
                                    borderRadius="999px"
                                    p={1}
                                >
                                    <Box
                                        borderLeft={`2px solid var(--green)`}
                                        pl="4px"
                                        mx={"8px"}
                                    >
                                        <Text fontSize="xs" fontWeight="bold">W公司員工</Text>
                                    </Box>
                                </Box>
                            </Flex>
                        </Flex>
                        <Flex alignItems="center" gap={"8px"}>
                            <Tooltip content="Mail">
                                <IconButton
                                    rounded="full"
                                    className='member-icon-btn'
                                    onClick={() => handleCopy('eddyqwq@gmail.com', 'Mail')}
                                >
                                    <Icon icon="material-symbols:mail" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip content="Github">
                                <IconButton
                                    rounded="full"
                                    className='member-icon-btn'
                                    onClick={() => handleCopy('https://github.com/eddy3721', 'Github')}
                                >
                                    <Icon icon="mingcute:github-fill" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip content="Discord">
                                <IconButton
                                    rounded="full"
                                    className='member-icon-btn'
                                    onClick={() => handleCopy('https://discord.gg/rQAJv5kUPQ', 'Discord')}
                                >
                                    <Icon icon="ic:outline-discord" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip content="QQ">
                                <IconButton
                                    rounded="full"
                                    className='member-icon-btn'
                                    onClick={() => handleCopy('1082846038', 'QQ')}
                                >
                                    <Icon icon="ri:qq-fill" />
                                </IconButton>
                            </Tooltip>
                        </Flex>
                    </Flex>
                </Flex>

                {memberInfo.map((member, index) => (
                    <Flex key={index}
                        bg="var(--black-light)"
                        p={4}
                        borderRadius="lg"
                        mr={4}
                        w="100%"
                        gap={"12px"}
                        boxShadow="md"
                        position="relative"
                        overflow="hidden"
                    >
                        {member.avatar && (
                            <Box
                                position="absolute"
                                top="-80%"
                                right="20%"
                                width="300px"
                                height="300px"
                                backgroundImage={`url(${member.avatar})`}
                                backgroundSize="contain"
                                backgroundRepeat="no-repeat"
                                opacity="0.2"
                                pointerEvents="none"
                                maskImage="linear-gradient(to right, transparent, black 20%, black 90%, transparent)"
                            />
                        )}
                        <Box
                            w="80px"
                            h="80px"
                            minWidth="80px"
                            minHeight="80px"
                            border="2px solid var(--green)"
                            borderRadius="1px"
                            position="relative"
                        >
                            {member.avatar && (
                                <img
                                    src={member.avatar}
                                    alt={member.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            )}
                            <Box
                                position="absolute"
                                top="0"
                                left="0"
                                width="100%"
                                height="100%"
                                boxShadow="
                                inset 0 0 12px var(--black-dark),
                                inset 0 0 12px var(--black-dark)
                                "
                                pointerEvents="none"
                            />
                        </Box>
                        <Flex justify="space-between" w="100%">
                            <Flex direction="column" justifyContent={"space-between"}>
                                <Box>
                                    <Text fontSize="lg" fontWeight="bold">{member.name}</Text>
                                    <Text color="var(--gray)" pl={"8px"}>{member.message}</Text>
                                </Box>
                                <Flex gap={"8px"}>
                                    {
                                        member.tags.map((tag, index) => (
                                            <Box
                                                key={index}
                                                bg="var(--black-dark)"
                                                color="var(--gray-light)"
                                                borderRadius="999px"
                                                p={1}
                                            >
                                                <Box
                                                    borderLeft={`2px solid var(--${tag.color})`}
                                                    pl="4px"
                                                    mx={"8px"}
                                                >
                                                    <Text fontSize="xs" fontWeight="bold">{tag.name}</Text>
                                                </Box>
                                            </Box>
                                        ))
                                    }
                                </Flex>
                            </Flex>
                            <Flex alignItems="center" gap={"8px"}>
                                {member.mail &&
                                    <Tooltip content="Mail">
                                        <IconButton
                                            rounded="full"
                                            className='member-icon-btn'
                                            onClick={() => handleCopy(member.mail!, "Mail")}
                                        >
                                            <Icon icon="material-symbols:mail" />
                                        </IconButton>
                                    </Tooltip>
                                }
                                {member.github &&
                                    <Tooltip content="Github">
                                        <IconButton
                                            rounded="full"
                                            className='member-icon-btn'
                                            onClick={() => handleCopy(member.github!, "Github")}
                                        >
                                            <Icon icon="mingcute:github-fill" />
                                        </IconButton>
                                    </Tooltip>
                                }
                                {member.discord &&
                                    <Tooltip content="Discord">
                                        <IconButton
                                            rounded="full"
                                            className='member-icon-btn'
                                            onClick={() => handleCopy(member.discord!, "Discord")}
                                        >
                                            <Icon icon="ic:outline-discord" />
                                        </IconButton>
                                    </Tooltip>
                                }
                                {member.qq &&
                                    <Tooltip content="QQ">
                                        <IconButton
                                            rounded="full"
                                            className='member-icon-btn'
                                            onClick={() => handleCopy(member.qq!, "QQ")}
                                        >
                                            <Icon icon="ri:qq-fill" />
                                        </IconButton>
                                    </Tooltip>
                                }
                            </Flex>
                        </Flex>
                    </Flex>
                ))}
            </Flex>
        </Box >
    );
};