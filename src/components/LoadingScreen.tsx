import React, { useEffect, useState } from 'react';
import './LoadingScreen.scss';

interface LoadingScreenProps {
    onComplete: () => void;
}

/**
 * 启动画面 — 纯 CSS 动画，不阻塞首屏。
 * 原预加载 132 张 item 图片的逻辑已移除（图片全项目零引用）。
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
    const [phase, setPhase] = useState<'fill' | 'expand' | 'fade'>('fill');
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // 阶段 1：0→100% 动画计数，200ms（requestAnimationFrame 驱动）
        const start = performance.now();
        const duration = 200;
        let rafId: number;
        const tick = (now: number) => {
            const p = Math.min((now - start) / duration * 100, 100);
            setProgress(Math.round(p));
            if (p < 100) {
                rafId = requestAnimationFrame(tick);
            }
        };
        rafId = requestAnimationFrame(tick);

        let fadeTimer: ReturnType<typeof setTimeout>;
        let completeTimer: ReturnType<typeof setTimeout>;

        const expandTimer = setTimeout(() => {
            setPhase('expand');

            fadeTimer = setTimeout(() => {
                setPhase('fade');

                completeTimer = setTimeout(() => {
                    onComplete();
                }, 200);
            }, 250);
        }, 220);

        return () => {
            clearTimeout(expandTimer);
            clearTimeout(fadeTimer);
            clearTimeout(completeTimer);
            cancelAnimationFrame(rafId);
        };
    }, [onComplete]);

    return (
        <div className={`loading-screen ${phase === 'fade' ? 'fade-out' : ''}`}>
            <div
                className={`yellow-bar ${phase !== 'fill' ? 'expanded' : ''}`}
                style={{ height: `${progress}%` }}
            />

            <div className="content-container">
                <div className="left-section">
                    <div className="progress-text">
                        <span className="number">{progress}</span>
                        <span className="percent">%</span>
                    </div>
                    <div className="loading-label">加载中...</div>
                </div>

                <div className="right-section">
                    <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="菲比拉基建" className="loading-img" />
                    <div className="sub-text">终末地牛逼</div>
                </div>
            </div>
        </div>
    );
};
