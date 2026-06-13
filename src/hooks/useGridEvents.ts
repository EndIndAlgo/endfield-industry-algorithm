import { useRef, useEffect, useCallback, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameMode } from '../types';
import type { Point } from '../types';
import { findPortOuterCellAt, findMachineAt, getPortOuterCells } from '../utils/gridUtils';
import { GRID_SIZE } from '../config/constants';

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

interface UseGridEventsReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoverPos: Point | null;
  isPanning: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseUp: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleClick: (e: React.MouseEvent) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
  handleWheel: (e: React.WheelEvent) => void;
}

export const useGridEvents = (): UseGridEventsReturn => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });
  const [hoverPos, setHoverPos] = useState<Point | null>(null);
  const hoverPosRef = useRef<Point | null>(null);

  const getGridPos = useCallback((e: React.MouseEvent): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const s = useGameStore.getState();
    const x = Math.floor(((e.clientX - rect.left) - s.pan.x) / (GRID_SIZE * s.zoom));
    const y = Math.floor(((e.clientY - rect.top) - s.pan.y) / (GRID_SIZE * s.zoom));
    return { x, y };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const pos = getGridPos(e);
    const s = useGameStore.getState();

    if (s.mode === GameMode.DEVICE_SELECT && e.button === 0) {
      s.setBoxSelection(pos, pos);
    }
  }, [getGridPos]);

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    setIsPanning(false);
    const s = useGameStore.getState();
    if (s.mode === GameMode.DEVICE_SELECT && s.selectionStart) {
      s.commitBoxSelection(_e.shiftKey);
    }
  }, []);

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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      const s = useGameStore.getState();
      s.setPan(clampPan({
        x: s.pan.x + deltaX,
        y: s.pan.y + deltaY
      }, s.gridWidth, s.gridHeight));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const pos = getGridPos(e);
    setHoverPos(pos);
    hoverPosRef.current = pos;

    const s = useGameStore.getState();
    if (s.isConnecting) {
      s.updatePreview(pos);
    }

    if (s.mode === GameMode.DEVICE_SELECT && s.selectionStart && e.buttons === 1) {
      s.setBoxSelection(s.selectionStart, pos);
    }
  }, [isPanning, getGridPos]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isPanning) return;

    const pos = getGridPos(e);
    const s = useGameStore.getState();

    // ── 连线模式（传送带/管道） ──
    if (s.mode === GameMode.CONVEYOR || s.mode === GameMode.PIPE) {
      if (s.isConnecting) {
        if (s.isValidPath) {
          s.takeSnapshot();
          s.commitConnection();
        }
        return;
      }

      const portType = s.mode === GameMode.CONVEYOR ? 'Solid' : 'Liquid';

      const machine = findMachineAt(pos, s.machines);
      if (machine) {
        const ports = getPortOuterCells(machine, portType);
        if (ports.length > 0) {
          s.startConnecting(ports, portType);
          if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
        }
        return;
      }

      const outerResult = findPortOuterCellAt(pos, s.machines, portType);
      if (outerResult) {
        s.startConnecting([{ pos: outerResult.pos, facing: outerResult.facing }], portType);
        if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
        return;
      }

      return;
    }

    // ── 原有模式逻辑 ──
    if (s.mode === GameMode.BUILD && s.selectedMachineId) {
      s.takeSnapshot();
      s.addMachine(s.selectedMachineId, pos.x, pos.y, s.previewRotation);
      if (!e.ctrlKey) {
        s.selectMachine(null);
      }
    } else if (s.mode === GameMode.MOVE_SELECTION || s.mode === GameMode.BLUEPRINT_PLACE) {
      s.takeSnapshot();
      s.commitBatchMove(pos);
    }
  }, [isPanning, getGridPos]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    useGameStore.getState().cancelOperation();
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverPos(null);
    setIsPanning(false);
  }, []);

  // ── 快捷键 E / Q / R / X / F / F1 / M / Ctrl+C / Escape ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      const isPlacing = !!s.selectedMachineId;

      if (e.key.toLowerCase() === 'e') {
        if (isPlacing) return;
        if (s.mode === GameMode.CONVEYOR) {
          s.cancelConnection();
        } else {
          if (s.isConnecting) s.cancelConnection();
          s.setMode(GameMode.CONVEYOR);
        }
      } else if (e.key.toLowerCase() === 'q') {
        if (isPlacing) return;
        if (s.mode === GameMode.PIPE) {
          s.cancelConnection();
        } else {
          if (s.isConnecting) s.cancelConnection();
          s.setMode(GameMode.PIPE);
        }
      } else if (e.key.toLowerCase() === 'r') {
        if (s.isConnecting) {
          s.toggleLShape();
          if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
        } else {
          s.rotatePreview();
        }
      } else if (e.key.toLowerCase() === 'x') {
        if (isPlacing) return;
        s.setMode(s.mode === GameMode.DEVICE_SELECT ? GameMode.BUILD : GameMode.DEVICE_SELECT);
      } else if (e.key.toLowerCase() === 'f') {
        s.takeSnapshot();
        s.deleteSelected();
      } else if (e.key === 'F1') {
        e.preventDefault();
        s.setBlueprintListMode('insert');
        s.setUiView('list');
      } else if (e.key.toLowerCase() === 'm') {
        if (hoverPosRef.current) {
          s.startBatchMove(hoverPosRef.current);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (hoverPosRef.current) {
          s.startCopySelection(hoverPosRef.current);
        }
      } else if (e.key === 'Escape') {
        s.cancelOperation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    containerRef,
    hoverPos,
    isPanning,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleClick,
    handleContextMenu,
    handleMouseLeave,
    handleWheel,
  };
};
