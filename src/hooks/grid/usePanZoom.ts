import { useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point, GridPointerEvent } from '@/types';
import { GRID_SIZE } from '@/config/constants';
import { clampPan } from '@/utils/grid';

/**
 * 平移/缩放/坐标转换 hook
 *
 * 事件源无关：通过 containerRef.getBoundingClientRect() 做 DOM 坐标转换，
 * 既可用于 DOM 事件 (React.MouseEvent 满足 GridPointerEvent)，
 * 也可用于 PixiJS 事件 (FederatedPointerEvent 满足 GridPointerEvent)。
 */
export function usePanZoom() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });

  /** 屏幕坐标 → 网格坐标 */
  const getGridPos = useCallback((pos: { clientX: number; clientY: number }): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const s = useGameStore.getState();
    const x = Math.floor(((pos.clientX - rect.left) - s.pan.x) / (GRID_SIZE * s.zoom));
    const y = Math.floor(((pos.clientY - rect.top) - s.pan.y) / (GRID_SIZE * s.zoom));
    return { x, y };
  }, []);

  /** 屏幕坐标 → 小数网格坐标 */
  const getGridPosFrac = useCallback((pos: { clientX: number; clientY: number }): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const s = useGameStore.getState();
    const x = ((pos.clientX - rect.left) - s.pan.x) / (GRID_SIZE * s.zoom);
    const y = ((pos.clientY - rect.top) - s.pan.y) / (GRID_SIZE * s.zoom);
    return { x, y };
  }, []);

  /** 将 GridPointerEvent 转为 getGridPos 接受的 {clientX, clientY} */
  const eventToPoint = useCallback((e: GridPointerEvent) => ({
    clientX: e.clientX,
    clientY: e.clientY,
  }), []);

  /** 网格坐标转换（接受 GridPointerEvent） */
  const getGridPosFromEvent = useCallback((e: GridPointerEvent): Point => {
    return getGridPos(eventToPoint(e));
  }, [getGridPos, eventToPoint]);

  /** 小数网格坐标转换（接受 GridPointerEvent） */
  const getGridPosFracFromEvent = useCallback((e: GridPointerEvent): Point => {
    return getGridPosFrac(eventToPoint(e));
  }, [getGridPosFrac, eventToPoint]);

  const startPan = useCallback((e: GridPointerEvent) => {
    setIsPanning(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const movePan = useCallback((e: GridPointerEvent) => {
    const deltaX = e.clientX - lastMousePos.current.x;
    const deltaY = e.clientY - lastMousePos.current.y;
    const s = useGameStore.getState();
    s.setPan(clampPan({
      x: s.pan.x + deltaX,
      y: s.pan.y + deltaY,
    }, s.gridWidth, s.gridHeight));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const stopPan = useCallback(() => {
    setIsPanning(false);
  }, []);

  /** 滚轮缩放（锚定鼠标位置）— 接受 wheel delta + 鼠标位置 */
  const zoomAt = useCallback((clientX: number, clientY: number, deltaY: number) => {
    if (!containerRef.current) return;
    const s = useGameStore.getState();
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const worldX = (mouseX - s.pan.x) / s.zoom;
    const worldY = (mouseY - s.pan.y) / s.zoom;

    const delta = -Math.sign(deltaY) * 0.1;
    const newZoom = Math.min(Math.max(s.zoom + delta, 0.18), 3.0);

    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    s.setZoom(newZoom);
    s.setPan(clampPan({ x: newPanX, y: newPanY }, s.gridWidth, s.gridHeight));
  }, []);

  return {
    containerRef,
    isPanning,
    getGridPos: getGridPosFromEvent,
    getGridPosFrac: getGridPosFracFromEvent,
    zoomAt,
    startPan,
    movePan,
    stopPan,
    /** 原始 getGridPos（接受 {clientX, clientY}），供 PixiJS 路径使用 */
    getGridPosRaw: getGridPos,
    getGridPosFracRaw: getGridPosFrac,
  };
}
