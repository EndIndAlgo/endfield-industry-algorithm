import { useRef, useEffect } from 'react';
import { PixiSceneManager } from '@/pixi/PixiSceneManager';

/**
 * React hook：管理 PixiJS Application 的生命周期
 *
 * 返回 { containerRef, managerRef }：
 * - containerRef 挂到宿主 div 上
 * - managerRef 供 usePixiEvents 等 hook 获取 PixiSceneManager 实例
 */
export function usePixiCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<PixiSceneManager | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const manager = new PixiSceneManager();
    managerRef.current = manager;

    manager.mount(el).then(() => {
      if (cancelled) {
        manager.destroy();
        managerRef.current = null;
      }
    });

    return () => {
      cancelled = true;
      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  return { containerRef, managerRef };
}
