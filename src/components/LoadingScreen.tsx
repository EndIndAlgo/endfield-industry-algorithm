import React, { useEffect, useState } from 'react';
import './LoadingScreen.scss';
import loadingImg from '../assets/loading.png';

interface LoadingScreenProps {
    onComplete: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
    const [progress, setProgress] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFading, setIsFading] = useState(false);

    useEffect(() => {
        const loadAssets = async () => {
            // 延迟加载 assets/items 所有图片，避免 eager 阻塞启动
            const imageModules = import.meta.glob<{ default: string }>(
                '../assets/items/*.{png,jpg,jpeg,svg,webp}',
                { eager: false, query: '?url', import: 'default' },
            );
            const paths = Object.keys(imageModules);
            const totalAssets = paths.length;

            if (totalAssets === 0) {
                setProgress(100);
                return;
            }

            let loadedCount = 0;

            const updateProgress = () => {
                loadedCount++;
                setProgress(Math.round((loadedCount / totalAssets) * 100));
            };

            // 逐张异步 import 并通过 new Image() 触发浏览器缓存
            await Promise.all(paths.map(async (path) => {
                try {
                    const url = (await imageModules[path]()) as unknown as string;
                    await new Promise<void>((resolve) => {
                        const img = new Image();
                        img.src = url;
                        img.onload = () => { updateProgress(); resolve(); };
                        img.onerror = () => { updateProgress(); resolve(); };
                    });
                } catch {
                    updateProgress();
                }
            }));
        };

        loadAssets();
    }, []);

    useEffect(() => {
        if (progress === 100) {
            // 在 100% 時等待片刻然後展開
            const expandTimer = setTimeout(() => {
                setIsExpanded(true);

                // 展開後淡出
                const fadeTimer = setTimeout(() => {
                    setIsFading(true);

                    // 淡出後完成
                    const completeTimer = setTimeout(() => {
                        onComplete();
                    }, 500); // 0.5秒淡出持續時間
                    return () => clearTimeout(completeTimer);

                }, 600); // 等待展開動畫 (略長於 0.5 秒)
                return () => clearTimeout(fadeTimer);

            }, 200);
            return () => clearTimeout(expandTimer);
        }
    }, [progress, onComplete]);

    return (
        <div className={`loading-screen ${isFading ? 'fade-out' : ''}`}>
            <div
                className={`yellow-bar ${isExpanded ? 'expanded' : ''}`}
                style={{ height: `${progress}%` }}
            ></div>

            <div className="content-container">
                <div className="left-section">
                    <div className="progress-text">
                        <span className="number">{Math.floor(progress)}</span>
                        <span className="percent">%</span>
                    </div>
                    <div className="loading-label">加載中...</div>
                </div>

                <div className="right-section">
                    <img src={loadingImg} alt="Loading..." className="loading-img" />
                    <div className="sub-text">終末地牛逼</div>
                </div>
            </div>
        </div>
    );
};
