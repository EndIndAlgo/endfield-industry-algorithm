import { useRef, useState, useCallback, useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point } from '@/types';
import type { PixiSceneManager } from '@/pixi/PixiSceneManager';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { useWireMode } from './useWireMode';
import { useSelectionMode } from './useSelectionMode';
import { useBlueprintSelectMode } from './useBlueprintSelectMode';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useWASDPan } from './useWASDPan';

/**
 * PixiJS 原生事件 hook — 替代 useGridEvents
 *
 * 使用 PixiJS FederatedEvent 替代 DOM 事件，
 * 坐标转换通过 PixiSceneManager.worldContainer.toLocal()，
 * canvas 不再需要 pointer-events: none。
 */
export function usePixiEvents(
  managerRef: React.RefObject<PixiSceneManager | null>,
  ready: boolean,
) {
  const [hoverPos, _setHoverPos] = useState<Point | null>(null);
  const hoverPosRef = useRef<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });

  const setHoverPos = useCallback((pos: Point | null) => {
    hoverPosRef.current = pos;
    _setHoverPos(pos);
  }, []);

  const getManager = useCallback(() => managerRef.current, [managerRef]);

  // ── 坐标转换 ──
  const getGridPos = useCallback((e: { clientX: number; clientY: number }): Point => {
    const m = getManager();
    if (!m) return { x: 0, y: 0 };
    return m.screenToGrid(e.clientX, e.clientY);
  }, [getManager]);

  const getGridPosFrac = useCallback((e: { clientX: number; clientY: number }): Point => {
    const m = getManager();
    if (!m) return { x: 0, y: 0 };
    return m.screenToGridFrac(e.clientX, e.clientY);
  }, [getManager]);

  // ── 子 hook ──
  const wire = useWireMode({ getGridPos, hoverPosRef });
  const select = useSelectionMode({ getGridPos, hoverPosRef });
  const bpSelect = useBlueprintSelectMode({ getGridPos });
  useKeyboardShortcuts({ hoverPosRef });
  useWASDPan();

  // ── 回调 refs（避免 useEffect 重绑定） ──
  const callbacksRef = useRef({ wire, select, bpSelect, getGridPos, getGridPosFrac });
  callbacksRef.current = { wire, select, bpSelect, getGridPos, getGridPosFrac };

  // ── 平移 ──
  const startPan = useCallback((clientX: number, clientY: number) => {
    isPanningRef.current = true;
    setIsPanning(true);
    lastMousePos.current = { x: clientX, y: clientY };
  }, []);

  const movePan = useCallback((clientX: number, clientY: number) => {
    const s = useGameStore.getState();
    s.setPan({
      x: s.pan.x + clientX - lastMousePos.current.x,
      y: s.pan.y + clientY - lastMousePos.current.y,
    });
    lastMousePos.current = { x: clientX, y: clientY };
  }, []);

  const stopPan = useCallback(() => {
    isPanningRef.current = false;
    setIsPanning(false);
  }, []);

  // ── 缩放 ──
  const handleWheel = useCallback((clientX: number, clientY: number, deltaY: number) => {
    const m = getManager();
    if (!m) return;
    const s = useGameStore.getState();
    const frac = m.screenToGridFrac(clientX, clientY);
    const worldPX = frac.x * 40; // GRID_SIZE
    const worldPY = frac.y * 40;

    const delta = -Math.sign(deltaY) * 0.1;
    const newZoom = Math.min(Math.max(s.zoom + delta, 0.18), 3.0);

    s.setZoom(newZoom);
    s.setPan({ x: clientX - worldPX * newZoom, y: clientY - worldPY * newZoom });
  }, [getManager]);

  // ── PixiJS 事件绑定（仅 mount/unmount 时执行） ──
  useEffect(() => {
    if (!ready) return;
    const m = managerRef.current;
    if (!m?.app) return;

    const stage = m.app.stage;
    stage.eventMode = 'static';

    const onPointerDown = (e: FederatedPointerEvent) => {
      const px = e.global.x ?? 0;
      const py = e.global.y ?? 0;
      if ((e.button ?? 0) === 1) {
        e.preventDefault?.();
        startPan(px, py);
        return;
      }
      callbacksRef.current.select.onMouseDown(e);
    };

    const onPointerUp = (e: FederatedPointerEvent) => {
      stopPan();
      callbacksRef.current.select.onMouseUp(e);
    };

    const onPointerMove = (e: FederatedPointerEvent) => {
      const px = e.global.x ?? 0;
      const py = e.global.y ?? 0;
      if (isPanningRef.current) {
        movePan(px, py);
        return;
      }
      const pos = callbacksRef.current.getGridPos({ clientX: px, clientY: py });
      setHoverPos(pos);
      useGameStore.getState().setHoverPosFrac(
        callbacksRef.current.getGridPosFrac({ clientX: px, clientY: py }),
      );
      callbacksRef.current.wire.onMouseMove(pos);
      callbacksRef.current.select.onMouseMove(pos, e.buttons ?? 0);
    };

    const onClick = (e: FederatedPointerEvent) => {
      if (isPanningRef.current) return;
      const s = useGameStore.getState();
      const ms = s.modeState;

      if (ms.kind === 'WIRE') {
        callbacksRef.current.wire.onClick(e);
        return;
      }
      if (ms.kind === 'MOVE_SELECTION') {
        callbacksRef.current.select.onClickCommit(e);
        return;
      }
      if (ms.kind === 'BLUEPRINT_SELECT') {
        callbacksRef.current.bpSelect.onClick(e);
        return;
      }
      if (ms.kind === 'BLUEPRINT_MOVE') {
        const frac = s.hoverPosFrac;
        const gridPos = frac
          ? { x: Math.round(frac.x), y: Math.round(frac.y) }
          : callbacksRef.current.getGridPos({ clientX: e.global.x ?? 0, clientY: e.global.y ?? 0 });
        s.commitInsert(gridPos.x, gridPos.y);
        return;
      }
      if (ms.kind === 'BUILD' && ms.placing) {
        const frac = s.hoverPosFrac;
        const gridPos = frac
          ? { x: Math.round(frac.x - ms.placing.buildOffset.x), y: Math.round(frac.y - ms.placing.buildOffset.y) }
          : callbacksRef.current.getGridPos({ clientX: e.global.x ?? 0, clientY: e.global.y ?? 0 });
        s.takeSnapshot();
        s.addMachine(ms.placing.selectedMachineId, gridPos.x, gridPos.y, ms.placing.previewRotation);
        if (!(e.ctrlKey ?? e.metaKey)) {
          s.selectMachine(null);
        }
      }
    };

    const onWheel = (e: FederatedWheelEvent) => {
      handleWheel(
        e.global.x ?? 0,
        e.global.y ?? 0,
        e.deltaY ?? 0,
      );
    };

    const onRightClick = (e: FederatedPointerEvent) => {
      e.preventDefault?.();
      useGameStore.getState().cancelOperation();
    };

    stage.on('pointerdown', onPointerDown);
    stage.on('pointerup', onPointerUp);
    stage.on('pointerupoutside', onPointerUp);
    stage.on('globalpointermove', onPointerMove);
    stage.on('click', onClick);
    stage.on('wheel', onWheel);
    stage.on('rightclick', onRightClick);

    return () => {
      stage.off('pointerdown', onPointerDown);
      stage.off('pointerup', onPointerUp);
      stage.off('pointerupoutside', onPointerUp);
      stage.off('globalpointermove', onPointerMove);
      stage.off('click', onClick);
      stage.off('wheel', onWheel);
      stage.off('rightclick', onRightClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return { hoverPos, isPanning };
}
