import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
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
      const ms = s.modeState;
      const isPlacing = ms.kind === 'BUILD' && ms.placing !== null;
      const isConnecting = ms.kind === 'WIRE' && ms.connecting !== null;

      if (e.key.toLowerCase() === 'e') {
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
      } else if (e.key.toLowerCase() === 'q') {
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
      } else if (e.key.toLowerCase() === 'r') {
        if (isConnecting) {
          s.toggleLShape();
          if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
        } else {
          s.rotatePreview();
        }
      } else if (e.key.toLowerCase() === 'x') {
        if (isPlacing) return;
        s.setMode(ms.kind === 'DEVICE_SELECT' ? 'BUILD' : 'DEVICE_SELECT');
      } else if (e.key.toLowerCase() === 'f') {
        s.takeSnapshot();
        s.deleteSelected();
      } else if (e.key === 'F1') {
        e.preventDefault();
        s.setBlueprintListMode('insert');
        s.setUiView('list');
      } else if (e.key.toLowerCase() === 'm') {
        if (hoverPosRef.current) {
          s.startBatchMove();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (hoverPosRef.current) {
          s.startCopySelection();
        }
      } else if (e.key === 'Escape') {
        s.cancelOperation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoverPosRef]);
}
