/** 网格单元格像素尺寸，需与 index.css 中的 --grid-size 通过 main.tsx 同步 */
export const GRID_SIZE = 40;

export const GRID_PRESETS = [
    { label: '次級核心1級 (24x24)', width: 24, height: 24 },
    { label: '次級核心2級 (32x32)', width: 32, height: 32 },
    { label: '次級核心3級 (40x40)', width: 40, height: 40 },
    { label: '協議核心1級 (40x40)', width: 40, height: 40 },
    { label: '協議核心2級 (55x55)', width: 55, height: 55 },
    { label: '協議核心3級 (70x70)', width: 70, height: 70 },
];

/** 蓝图/分享内容包围盒的默认边距（格子数） */
export const DEFAULT_CONTENT_PADDING = 4;

/** 成员列表显示上限 */
export const MAX_MEMBERS_DISPLAY = 999;

/** 端口箭头旋转角度：输入箭头指向机器内部，输出箭头指向外部 */
export const PORT_ARROW_ROTATION: Record<string, { input: number; output: number }> = {
    left:   { input: 0,   output: 180 },
    right:  { input: 180, output: 0   },
    top:    { input: 90,  output: 270 },
    bottom: { input: 270, output: 90  },
};
