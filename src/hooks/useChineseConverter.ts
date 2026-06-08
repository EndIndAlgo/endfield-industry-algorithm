import { useEffect, useState, useRef } from 'react';
import { useSettingsStore } from '../store/settingsStore';

export const useChineseConverter = () => {
    const { language } = useSettingsStore();
    const [isConverting, setIsConverting] = useState(false);
    const observerRef = useRef<MutationObserver | null>(null);

    useEffect(() => {
        const convertPage = async () => {
            // Clean up previous observer
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }

            if (language === 'zh-CN') {
                setIsConverting(true);
                try {
                    const OpenCC = await import('opencc-js');
                    const converter = OpenCC.Converter({ from: 'tw', to: 'cn' });

                    const walkAndConvert = (node: Node) => {
                        if (node.nodeType === 3) { // Text node
                            if (node.parentElement && (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE')) {
                                return;
                            }
                            if (node.nodeValue && node.nodeValue.trim().length > 0) {
                                const original = node.nodeValue;
                                const converted = converter(original);
                                if (original !== converted) {
                                    node.nodeValue = converted;
                                }
                            }
                        } else {
                            for (let i = 0; i < node.childNodes.length; i++) {
                                walkAndConvert(node.childNodes[i]);
                            }
                        }
                    };

                    // Initial conversion
                    walkAndConvert(document.body);
                    document.documentElement.lang = 'zh-CN';

                    // Observe for changes
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.type === 'childList') {
                                mutation.addedNodes.forEach((node) => {
                                    walkAndConvert(node);
                                });
                            } else if (mutation.type === 'characterData') {
                                if (mutation.target.nodeType === 3) {
                                    walkAndConvert(mutation.target);
                                }
                            }
                        });
                    });

                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        characterData: true
                    });

                    observerRef.current = observer;

                } catch (e) {
                    console.error("OpenCC conversion failed:", e);
                } finally {
                    setIsConverting(false);
                }
            } else {
                // Switching to Traditional
                // Instead of reload, try to convert back using cn -> tw
                // Only if we are currently in CN mode (check lang attribute)
                if (document.documentElement.lang === 'zh-CN') {
                    setIsConverting(true);
                    try {
                        const OpenCC = await import('opencc-js');
                        // Use 'cn' -> 'tw' to restore
                        const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

                        const walkAndRestore = (node: Node) => {
                            if (node.nodeType === 3) { // Text node
                                if (node.parentElement && (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE')) {
                                    return;
                                }
                                if (node.nodeValue && node.nodeValue.trim().length > 0) {
                                    const original = node.nodeValue;
                                    const converted = converter(original);
                                    if (original !== converted) {
                                        node.nodeValue = converted;
                                    }
                                }
                            } else {
                                for (let i = 0; i < node.childNodes.length; i++) {
                                    walkAndRestore(node.childNodes[i]);
                                }
                            }
                        };

                        walkAndRestore(document.body);
                    } catch (e) {
                        console.error("OpenCC restore failed:", e);
                        // Fallback to reload if restore fails catastrophically?
                        // window.location.reload();
                    } finally {
                        setIsConverting(false);
                    }
                }
                document.documentElement.lang = 'zh-TW';
            }
        };

        convertPage();

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [language]);

    return { language, isConverting };
};
