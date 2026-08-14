import { Assets, Texture } from 'pixi.js';
import { MACHINES } from '@/config/machines';
import { getMachineIconUrl } from '@/utils/machineIcons';

/** 机器图标纹理缓存：machineId → Texture */
const textureCache = new Map<string, Texture | null>();

/** 图标加载是否已完成 */
let preloadDone = false;

/**
 * 批量预加载所有机器图标纹理
 * 应在 Application 初始化后、首帧渲染前调用。
 * URL 来自 import.meta.glob 静态映射，保证产物打包完整（无图标返回 null 走文字后备）。
 */
export async function preloadMachineTextures(): Promise<void> {
  if (preloadDone) return;

  // 只加载确实存在的图标；缺失的机器由 Assets.get 兜底置 null
  const manifests = MACHINES
    .map((m) => {
      const src = getMachineIconUrl(m.id);
      return src ? { alias: `machine-${m.id}`, src } : null;
    })
    .filter((x): x is { alias: string; src: string } => x !== null);

  await Assets.load(manifests, { strategy: 'skip' });

  // 缓存已加载的纹理
  for (const m of MACHINES) {
    try {
      const tex = Assets.get<Texture>(`machine-${m.id}`);
      textureCache.set(m.id, tex ?? null);
    } catch {
      textureCache.set(m.id, null);
    }
  }

  preloadDone = true;
}

/** 获取某机器的图标纹理（已缓存），无图标时返回 null */
export function getMachineTexture(machineId: string): Texture | null {
  return textureCache.get(machineId) ?? null;
}
