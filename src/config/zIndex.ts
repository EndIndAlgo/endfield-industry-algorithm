/**
 * 渲染图层 z-index 常量表
 *
 * ── 分段方案 (每段 600, 容纳 mask*2+1 最大 511 的偏移) ──
 *     0- 99: 基础层 (供电范围、缺电图标、hover 标签)
 *   100-699: 常态机器+连线 (机器=base+mask*2+1, 连线=base+mask*2)
 *   700-1299: 批量移动预览 (同上公式, 换 base)
 *  1300-1899: 单机器放置预览 Ghost (同上公式, 换 base)
 *  1900+   : 框选、UI 覆盖层、加载画面
 */
export const Z_INDEX = {
  // —— 机器附属 ——
  POWER_ALERT_ICON: 1,
  MACHINE_LABEL: 2,

  // ── 0-99: 基础层 ──
  SUPPLY_RANGE: 5,

  // ── 100-699: 常态机器 + 连线 ──
  STATIC_BASE: 100,

  // ── 700-1299: 批量移动预览 ──
  BATCH_BASE: 700,

  // ── 1300-1899: 单机器放置预览 (Ghost) ──
  GHOST_BASE: 1300,
  /** Ghost 端口箭头 (GHOST_BASE + 512, 在所有 ghost 之上) */
  GHOST_ARROW: 1812,

  // ── 1900+: 选择 / UI 覆盖层 ──
  SELECTION_BOX: 1900,

  // ── UI 组件 ──
  OPERATION_HINTS: 2000,
  TOOLBAR: 2100,
  HEADER: 2200,

  // ── 工具提示 ──
  ICON_TOOLTIP: 3000,

  // ── 启动加载画面 ──
  LOADING_SCREEN: 9999,
  LOADING_BAR: 10000,
  LOADING_CONTENT: 10005,
} as const;

/** 连线渲染 z-index = base + mask * 2 */
export const connZ = (base: number, mask: number): number => base + mask * 2;

/** 机器渲染 z-index = base + mask * 2 + 1 (同高度压连线) */
export const machineZ = (base: number, mask: number): number => base + mask * 2 + 1;
