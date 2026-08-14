/**
 * FactoryDoc 持久化（唯一存储出口）
 *
 * 旧格式数据（zmd_registry / zmd_blueprints 等）不再读取，
 * 按项目决策直接废弃（快速开发阶段，允许破坏性变更）。
 */
import type { FactoryDoc } from './doc';

const DOC_KEY = 'zmd_doc_v1';

export function loadDoc(): FactoryDoc | null {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null
      && (parsed as { version?: unknown }).version === 1
      && typeof (parsed as { nodes?: unknown }).nodes === 'object'
      && (parsed as { nodes?: unknown }).nodes !== null
    ) {
      return parsed as FactoryDoc;
    }
    return null;
  } catch (e) {
    console.error('加载蓝图文档失败', e);
    return null;
  }
}

export function saveDoc(doc: FactoryDoc): void {
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify(doc));
  } catch (e) {
    console.error('保存蓝图文档失败', e);
  }
}
