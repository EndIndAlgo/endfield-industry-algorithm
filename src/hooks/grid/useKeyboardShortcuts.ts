import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { Point } from '@/types';

interface UseKeyboardShortcutsDeps {
  /** 最近一次画布内 hover 的网格坐标（由 CanvasController 提供） */
  getHoverGridPos: () => Point | null;
}

/**
 * 全局键盘快捷键 hook
 * 监听 window keydown 事件，分发 E/Q/R/X/F/F1/M/Ctrl+C/Escape 到对应 store 方法
 */
export function useKeyboardShortcuts({ getHoverGridPos }: UseKeyboardShortcutsDeps): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      const ms = s.modeState;
      const isPlacing = ms.kind === 'BUILD' && ms.placing !== null;
      const isConnecting = ms.kind === 'WIRE' && ms.connecting !== null;

      // WASD 由 useWASDPan 独立处理，此处早期退出避免无效遍历
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') return;

      if (key === 'e') {
        if (isPlacing) return;
        if (ms.kind === 'WIRE' && ms.portType === 'Solid') {
          if (ms.connecting) {
            s.cancelConnection();     // 连线中 → 取消连线，停在 WIRE/Solid 空闲
          } else {
            s.setMode('BUILD');       // 空闲 → 退出，回到 BUILD（toggle）
          }
        } else {
          if (isConnecting) s.cancelConnection();
          s.setMode('WIRE_SOLID');
        }
      } else if (key === 'q') {
        if (isPlacing) return;
        if (ms.kind === 'WIRE' && ms.portType === 'Liquid') {
          if (ms.connecting) {
            s.cancelConnection();     // 连线中 → 取消连线，停在 WIRE/Liquid 空闲
          } else {
            s.setMode('BUILD');       // 空闲 → 退出，回到 BUILD（toggle）
          }
        } else {
          if (isConnecting) s.cancelConnection();
          s.setMode('WIRE_LIQUID');
        }
      } else if (key === 'r') {
        if (isConnecting) {
          s.toggleLShape();
          const hover = getHoverGridPos();
          if (hover) s.updatePreview(hover);
        } else {
          s.rotatePreview();
        }
      } else if (key === 'x') {
        if (isPlacing) return;
        s.setMode(ms.kind === 'DEVICE_SELECT' ? 'BUILD' : 'DEVICE_SELECT');
      } else if (key === 'b') {
        if (isPlacing || isConnecting) return;
        s.setMode(ms.kind === 'BLUEPRINT_SELECT' ? 'BUILD' : 'BLUEPRINT_SELECT');
      } else if (key === 'f') {
        s.takeSnapshot();
        s.deleteSelected();
      } else if (e.key === 'F1') {
        e.preventDefault();
        s.setUiView('list');
      } else if (key === 'm') {
        const hover = getHoverGridPos();
        if (hover) {
          s.startBatchMove();
        }
      } else if ((e.ctrlKey || e.metaKey) && key === 'c') {
        const hover = getHoverGridPos();
        if (hover) {
          s.startCopySelection();
        }
      } else if (e.key === 'Escape') {
        s.cancelOperation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [getHoverGridPos]);
}
