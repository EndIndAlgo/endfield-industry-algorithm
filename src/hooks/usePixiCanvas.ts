import { useRef, useEffect } from 'react';
import { PixiSceneManager } from '@/pixi/PixiSceneManager';

/**
 * React hook：管理 PixiJS Application 的生命周期
 *
 * 返回一个 ref 挂到宿主 div 上，mount 时异步初始化 PixiJS，
 * unmount 时销毁 Application 释放资源。
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
      // 如果在 init 完成前组件已卸载，立即销毁
      if (cancelled) {
        manager.destroy();
      }
    });

    return () => {
      cancelled = true;
      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  return containerRef;
}
