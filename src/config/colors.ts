/**
 * PixiJS 渲染用颜色常量
 *
 * 与 index.css 的 CSS 变量一一对应，保证 DOM 和 WebGL 两侧视觉一致。
 * 所有 PixiJS 渲染器（Machine/Connection/Overlay/Grid）统一引用此处，
 * 不再各自硬编码。
 */

// ── CSS 变量映射 ──
export const GRAY_LIGHT      = 0xe5e1e1; // --gray-light
export const GRAY             = 0xc4c1c1; // --gray
export const GRAY_DARK        = 0x5f5d5d; // --gray-dark
export const YELLOW_LIGHT     = 0xf5f08a; // --yellow-light
export const YELLOW           = 0xfffa00; // --yellow
export const BLACK_LIGHT      = 0x3d3d3d; // --black-light
export const BLACK            = 0x1d1d1d; // --black
export const BLACK_DARK       = 0x121212; // --black-dark
export const GREEN            = 0xabcd41; // --green
export const ORANGE_LIGHT     = 0xffcc00; // --orange-light
export const ORANGE           = 0xe79c3a; // --orange
export const ORANGE_DARK      = 0xd17700; // --orange-dark

// ── 语义化颜色 ──

/** Solid 传送带连线填充色 */
export const CONVEYOR_FILL     = YELLOW_LIGHT;
/** Liquid 管道连线填充色 */
export const PIPE_FILL         = 0x7cc4f0;
/** 连线预览 / Ghost 无效状态 */
export const INVALID_RED       = 0xff4444;

/** 机器选中高亮 */
export const SELECTION_BLUE    = 0x4dabf7;
/** 连线选中高亮 */
export const CONN_SELECTION_BLUE = 0x4dadf7;
/** 框选矩形填充 */
export const BOX_SELECTION_FILL = 0x4287f5;

/** Ghost 放置预览填充 */
export const GHOST_FILL        = 0xcccccc;
/** Ghost 端口箭头 / 供电范围 */
export const GHOST_ARROW       = 0xffcc00;

/** 子蓝图选中轮廓 */
export const BLUEPRINT_OUTLINE = 0xffcc00;
/** 蓝图移动预览 */
export const BLUEPRINT_MOVE    = 0x64c8ff;
