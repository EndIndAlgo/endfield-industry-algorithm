import classNames from 'classnames';
import { useGameStore } from '@/store/gameStore';
import { usePixiCanvas } from '@/hooks/usePixiCanvas';
import { usePixiEvents } from '@/hooks/grid/usePixiEvents';
import './Grid.scss';

/**
 * PixiJS 画布组件
 *
 * 事件层已从 DOM 迁移至 PixiJS FederatedEvent：
 * - usePixiEvents 绑定 pointerdown/move/up/click/wheel 到 PixiJS stage
 * - 坐标转换通过 PixiSceneManager.screenToGrid()（worldContainer.toLocal）
 * - canvas 不再需要 pointer-events: none
 */
export const PixiGrid = () => {
  const { containerRef, managerRef } = usePixiCanvas();
  const { isPanning } = usePixiEvents(managerRef);

  const modeKind = useGameStore(s => s.modeState.kind);

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
