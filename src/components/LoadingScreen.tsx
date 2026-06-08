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
            // 從 assets/items 獲取所有圖片檔案
            const imageModules = import.meta.glob('../assets/items/*.{png,jpg,jpeg,svg,webp}', { eager: true, query: '?url', import: 'default' });
            const imageUrls = Object.values(imageModules) as string[];
            const totalAssets = imageUrls.length;

            if (totalAssets === 0) {
                setProgress(100);
                return;
            }

            let loadedCount = 0;

            const updateProgress = () => {
                loadedCount++;
                const newProgress = Math.round((loadedCount / totalAssets) * 100);
                setProgress(newProgress);
            };

            // 預加載每張圖片
            imageUrls.forEach(url => {
                const img = new Image();
                img.src = url;
                img.onload = updateProgress;
                img.onerror = updateProgress; // 將錯誤計為已加載，以避免卡住
            });
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
