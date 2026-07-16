import classNames from 'classnames';
import { useGameStore } from '@/store/gameStore';
import { usePixiCanvas } from '@/hooks/usePixiCanvas';
import { useGridEvents } from '@/hooks/grid/useGridEvents';
import './Grid.scss';

/**
 * PixiJS 画布组件 — 完整替代 Grid.tsx
 *
 * 渲染架构：
 * - 外层 div（grid-container）→ DOM 事件捕获（复用 useGridEvents hooks）
 * - 内层 div → PixiJS canvas mount 点（视觉渲染层）
 * - canvas 设置 pointer-events: none，事件穿透到外层
 */
export const PixiGrid = () => {
  // PixiJS canvas 挂载点
  const pixiContainerRef = usePixiCanvas();

  // 复用现有 DOM 事件系统（containerRef 绑定到外层 div 以读取 getBoundingClientRect）
  const {
    containerRef,
    isPanning,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleClick,
    handleContextMenu,
    handleMouseLeave,
    handleWheel,
  } = useGridEvents();

  const modeKind = useGameStore(s => s.modeState.kind);

  return (
    <div
      ref={containerRef}
      className={classNames('grid-container', {
        'wiring-mode': modeKind === 'WIRE',
        'panning': isPanning,
      })}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      style={{ position: 'relative' }}
    >
      {/* PixiJS canvas 容器（事件穿透，纯视觉层） */}
      <div
        ref={pixiContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
