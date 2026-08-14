/**
 * 机器图标静态 URL 映射（生产打包安全）
 *
 * import.meta.glob 让 Vite 静态分析并打包 machines/ 下全部 webp；
 * 此前 `new URL(\`../assets/machines/${id}.webp\`, import.meta.url)` 的动态拼接
 * 无法被完整静态分析，导致 pco.webp 等漏打包（生产 404 → 图标静默消失）。
 */
const iconUrlMap = import.meta.glob(
  '../assets/machines/*.webp',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

/** 获取机器图标 URL；无图标时返回 null（调用方降级为文字） */
export function getMachineIconUrl(machineId: string): string | null {
  return iconUrlMap[`../assets/machines/${machineId}.webp`] ?? null;
}
