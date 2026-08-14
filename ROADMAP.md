# Roadmap

> 最后更新：2026-07-16（架构收敛重构后）

## 🔥 当前阶段（P2 → P4）

- **P2 画布集成层** — CanvasController + 事件坐标归一化 + 完整 diff 契约（进行中）
- **P3 性能收尾** — cullArea + `world` isRenderGroup；机器 hover 标签显示与反缩放；端口中心 8px 偏移（portPosition CELL_CENTER）；GridLayer 纹理缓存单例化
- **P4 收尾** — 蓝图插入碰撞校验（isValidPosition 真实计算 + 预览变红）；CLAUDE.md 同步至重构后结构；Playwright 冒烟

## 🟡 待办（下一轮）

- `commitConnection` / `commitBatchMove` 提取共享纯函数（约 230+245 行重复的交叉检测+桥生成+连线分割逻辑）
- 蓝图插入/移动的越界与碰撞校验（与上面共享受掩码工具）
- 批量框选/移动/复制对后代只读边界的统一过滤（selectionSlice 目前只挡 deleteSelected）
- 分享格式版本字节（重新设计分享格式时一并处理）
- 蓝图 merge（三路合并）— 若产品需要，纯函数域已具备基础

## 🔵 搁置 / 设计决策

- 撤销历史不捕获视图状态 — 撤销只还原数据，保留视口位置
- 历史快照不去重 — 结构共享 + 50 步上限足够
- `Gas` 端口类型 — 为游戏未来内容保留
- 重复材料图标 — 需游戏数据人工对照
- E2E 测试 / a11y / 移动端 / 国际化 — 不在当前范围
