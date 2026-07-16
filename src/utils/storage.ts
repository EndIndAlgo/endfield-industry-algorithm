const REGISTRY_KEY = 'zmd_registry';

/** 清理旧格式数据 + 空快照（引擎初始化前调用） */
export function clearLegacyData(): void {
  localStorage.removeItem('zmd_blueprints');
  localStorage.removeItem('zmd_last_blueprint_id');
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const filtered = (data.snapshots ?? []).filter(
      (s: Record<string, unknown>) => (s.machines as unknown[])?.length > 0
        || (s.connections as unknown[])?.length > 0
        || (s.children as unknown[])?.length > 0,
    );
    if (filtered.length < (data.snapshots ?? []).length) {
      data.snapshots = filtered;
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(data));
    }
  } catch { /* ignore */ }
}

// ── 兼容旧 Blueprint 接口（被废弃） ──

/** @deprecated 旧 Blueprint 接口已废弃 */
export interface Blueprint {
  id: string; name: string; createdAt: number; updatedAt: number;
  data: {
    machines: import('@/types').PlacedMachine[];
    connections: import('@/types').Connection[];
    actualWidth: number; actualHeight: number;
  };
}

/** @deprecated */
export const getBlueprints = (): Blueprint[] => [];
/** @deprecated */
export const saveBlueprint = (): Blueprint => { throw new Error('已废弃，使用 blueprintLibrary'); };
/** @deprecated */
export const deleteBlueprint = (): void => {};
/** @deprecated */
export const loadBlueprint = (): Blueprint | undefined => undefined;
/** @deprecated */
export const getLastBlueprintId = (): string | null => null;
/** @deprecated */
export const setLastBlueprintId = (): void => {};
