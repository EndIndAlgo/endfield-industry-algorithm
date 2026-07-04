import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { clampPan } from '@/utils/grid';

const MAX_SPEED = 600;   // px/s
const FRICTION = 0.88;   // 每帧衰减系数

const DIR_MAP: Record<string, { dx: number; dy: number }> = {
  w: { dx: 0, dy: 1 },
  a: { dx: 1, dy: 0 },
  s: { dx: 0, dy: -1 },
  d: { dx: -1, dy: 0 },
};

/**
 * WASD 动量平移 hook
 * 按住方向键 → 匀速移动；松键 → 惯性滑行衰减；支持 W+A 等对角线组合
 */
export function useWASDPan() {
  const keysRef = useRef(new Set<string>());
  const velRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    const loop = (time: number) => {
      const dt = Math.min((time - lastRef.current) / 1000, 0.1);
      lastRef.current = time;

      // 计算按键方向向量（归一化）
      let tdx = 0, tdy = 0;
      for (const k of keysRef.current) {
        const d = DIR_MAP[k];
        if (d) { tdx += d.dx; tdy += d.dy; }
      }
      const mag = Math.sqrt(tdx * tdx + tdy * tdy);
      if (mag > 0) { tdx /= mag; tdy /= mag; }

      const v = velRef.current;

      if (mag > 0) {
        v.x = tdx * MAX_SPEED;
        v.y = tdy * MAX_SPEED;
      } else {
        v.x *= FRICTION;
        v.y *= FRICTION;
        if (Math.abs(v.x) < 1) v.x = 0;
        if (Math.abs(v.y) < 1) v.y = 0;
      }

      // 应用位移
      if (v.x !== 0 || v.y !== 0) {
        const s = useGameStore.getState();
        s.setPan(clampPan({
          x: s.pan.x + v.x * dt,
          y: s.pan.y + v.y * dt,
        }, s.gridWidth, s.gridHeight));
      }

      if (keysRef.current.size > 0 || Math.abs(v.x) > 0.5 || Math.abs(v.y) > 0.5) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = 0;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!DIR_MAP[key]) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (document.activeElement?.getAttribute('contenteditable') === 'true') return;

      e.preventDefault();
      keysRef.current.add(key);
      if (!rafRef.current) {
        lastRef.current = performance.now();
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const handleBlur = () => {
      keysRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
}
