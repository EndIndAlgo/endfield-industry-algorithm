import { useRef, useState, useEffect } from 'react';
import { PixiSceneManager } from '@/pixi/PixiSceneManager';

/**
 * React hook：管理 PixiJS Application 的生命周期
 *
 * 返回 { containerRef, managerRef, ready }：
 * - containerRef 挂到宿主 div 上
 * - managerRef 供 usePixiEvents 获取 PixiSceneManager 实例
 * - ready 在 mount() 完成后变为 true，触发 usePixiEvents 的事件绑定
 */
export function usePixiCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<PixiSceneManager | null>(null);
  const [ready, setReady] = useState(false);

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
      } else {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      manager.destroy();
      managerRef.current = null;
      setReady(false);
    };
  }, []);

  return { containerRef, managerRef, ready };
}
