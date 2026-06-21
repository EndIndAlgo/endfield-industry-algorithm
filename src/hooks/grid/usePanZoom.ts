import { useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point } from '@/types';
import { GRID_SIZE } from '@/config/constants';

/** 限制平移范围，防止无限滚入空白区域 */
const clampPan = (pan: Point, gridW: number, gridH: number): Point => {
  const maxX = gridW * GRID_SIZE * 2;
  const maxY = gridH * GRID_SIZE * 2;
  const minX = -gridW * GRID_SIZE;
  const minY = -gridH * GRID_SIZE;
  return {
    x: Math.max(minX, Math.min(maxX, pan.x)),
    y: Math.max(minY, Math.min(maxY, pan.y)),
  };
};

/**
 * 平移/缩放/坐标转换 hook
 * 提供画布基础交互：中键平移、滚轮缩放（锚定鼠标位置）、屏幕坐标→网格坐标转换
 */
export function usePanZoom() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });

  /** 屏幕坐标 → 网格坐标 */
  const getGridPos = useCallback((e: { clientX: number; clientY: number }): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const s = useGameStore.getState();
    const x = Math.floor(((e.clientX - rect.left) - s.pan.x) / (GRID_SIZE * s.zoom));
    const y = Math.floor(((e.clientY - rect.top) - s.pan.y) / (GRID_SIZE * s.zoom));
    return { x, y };
  }, []);

  /** 屏幕坐标 → 小数网格坐标（不取整，用于拾取偏移计算） */
  const getGridPosFrac = useCallback((e: { clientX: number; clientY: number }): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const s = useGameStore.getState();
    const x = ((e.clientX - rect.left) - s.pan.x) / (GRID_SIZE * s.zoom);
    const y = ((e.clientY - rect.top) - s.pan.y) / (GRID_SIZE * s.zoom);
    return { x, y };
  }, []);

  /** 开始平移（中键按下） */
  const startPan = useCallback((e: { clientX: number; clientY: number }) => {
    setIsPanning(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  /** 平移中移动 */
  const movePan = useCallback((e: { clientX: number; clientY: number }) => {
    const deltaX = e.clientX - lastMousePos.current.x;
    const deltaY = e.clientY - lastMousePos.current.y;
    const s = useGameStore.getState();
    s.setPan(clampPan({
      x: s.pan.x + deltaX,
      y: s.pan.y + deltaY,
    }, s.gridWidth, s.gridHeight));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  /** 结束平移 */
  const stopPan = useCallback(() => {
    setIsPanning(false);
  }, []);

  /** 滚轮缩放（锚定鼠标位置） */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return;
    const s = useGameStore.getState();
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - s.pan.x) / s.zoom;
    const worldY = (mouseY - s.pan.y) / s.zoom;

    const delta = -Math.sign(e.deltaY) * 0.1;
    const newZoom = Math.min(Math.max(s.zoom + delta, 0.18), 3.0);

    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    s.setZoom(newZoom);
    s.setPan(clampPan({ x: newPanX, y: newPanY }, s.gridWidth, s.gridHeight));
  }, []);

  return {
    containerRef,
    isPanning,
    getGridPos,
    getGridPosFrac,
    handleWheel,
    startPan,
    movePan,
    stopPan,
  };
}
