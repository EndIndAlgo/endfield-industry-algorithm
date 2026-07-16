import { Assets, Texture } from 'pixi.js';
import { MACHINES } from '@/config/machines';

/** 机器图标纹理缓存：machineId → Texture */
const textureCache = new Map<string, Texture | null>();

/** 图标加载是否已完成 */
let preloadDone = false;

/**
 * 批量预加载所有机器图标纹理
 * 应在 Application 初始化后、首帧渲染前调用
 */
export async function preloadMachineTextures(): Promise<void> {
  if (preloadDone) return;

  const manifests = MACHINES.map(m => ({
    alias: `machine-${m.id}`,
    // Vite 的静态资源路径：相对于 src 目录
    src: new URL(`../assets/machines/${m.id}.webp`, import.meta.url).href,
  }));

  // 批量加载，skip 策略：缺少图标的机器不阻塞其他加载
  await Assets.load(manifests, {
    strategy: 'skip',
    onError: (_err, url) => {
      const id = typeof url === 'string'
        ? url.match(/machine-(\w+)\.webp/)?.[1]
        : (url as { alias?: string })?.alias?.replace('machine-', '');
      if (id) {
        console.debug(`[TextureLoader] 机器 "${id}" 无图标，将使用文字后备`);
        textureCache.set(id, null);
      }
    },
  });

  // 缓存已加载的纹理
  for (const m of MACHINES) {
    try {
      const tex = Assets.get<Texture>(`machine-${m.id}`);
      if (tex) textureCache.set(m.id, tex);
      else textureCache.set(m.id, null);
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
