import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { GameMode } from '@/types';
import type { Point } from '@/types';

interface UseKeyboardShortcutsDeps {
  hoverPosRef: React.MutableRefObject<Point | null>;
}

/**
 * 全局键盘快捷键 hook
 * 监听 window keydown 事件，分发 E/Q/R/X/F/F1/M/Ctrl+C/Escape 到对应 store 方法
 */
export function useKeyboardShortcuts({ hoverPosRef }: UseKeyboardShortcutsDeps): void {
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
  }, [hoverPosRef]);
}
