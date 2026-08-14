import { useEffect, useRef, useState, useCallback } from 'react';
import classNames from 'classnames';
import { useGameStore } from '@/store/gameStore';
import { CanvasController } from '@/pixi/CanvasController';
import { useKeyboardShortcuts } from '@/hooks/grid/useKeyboardShortcuts';
import { useWASDPan } from '@/hooks/grid/useWASDPan';
import './Grid.scss';

/**
 * PixiJS 画布组件
 *
 * 生命周期与事件全部收敛到 CanvasController：
 * - useEffect 只做 attach/detach（幂等，StrictMode 双挂载安全）
 * - 事件坐标在 controller 内统一归一化（e.global → 网格坐标）
 * - .panning 类名由 controller 的 onPanningChange 回调驱动
 */
export const PixiGrid = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // useState 惰性初始化：controller 只创建一次，随组件生命周期存活
  const [controller] = useState(() => new CanvasController());
  const [isPanning, setIsPanning] = useState(false);
  const modeKind = useGameStore(s => s.modeState.kind);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    controller.attach(el, { onPanningChange: setIsPanning }).catch((err) => {
      console.error('[PixiGrid] 画布初始化失败', err);
    });
    return () => {
      controller.detach();
    };
  }, [controller]);

  // 键盘快捷键需要最近 hover 网格坐标（供 M / Ctrl+C / R 使用）
  const getHoverGridPos = useCallback(
    () => controller.getLastHoverGridPos(),
    [controller],
  );
  useKeyboardShortcuts({ getHoverGridPos });
  useWASDPan();

  return (
    <div
      ref={containerRef}
      className={classNames('grid-container', {
        'wiring-mode': modeKind === 'WIRE',
        'panning': isPanning,
      })}
      style={{ position: 'relative' }}
    />
  );
};
