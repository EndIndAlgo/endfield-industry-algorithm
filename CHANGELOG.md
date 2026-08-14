# Changelog

## Sprint 13 (2026-07-16) — 架构收敛重构（蓝图树 + PixiJS 迁移审查修复）

审查发现并修复蓝图树重构与 PixiJS 迁移引入的缺陷，收敛为单一真相源架构。详见 `docs/ARCHITECTURE.md` 与 `bugs.md`。

- **P0 数据安全**（34ed8bb → 39c8983）：嵌套保存位置归零（先读 oldChildRef 再 removeChild）；蓝图循环引用防护（addChild 环检测 + 递归遍历 visited + UI 禁用成环导入）；保存策略修正（仅被共享时分叉、非共享原地保存，共享分叉不再污染旧版本）
- **P1 单一真相源**（63a93df、1dd095d）：FactoryDoc 进入 store 成为唯一持久化对象（`src/domain/`），检出式 commit/fork 语义；删除 RegistryEngine 引擎双真相与旧 storage/blueprintTree/flatten；历史快照 = { machines, connections, doc } 且 undo/redo 落盘；离开蓝图前 dirty 确认；旧 localStorage 数据直接废弃
- **P4 展平复制**（9b5afd9、54048b6）：`startFlattenCopy` 展平目标蓝图（含后代）为普通内容进入放置态；蓝图列表 Copy 按钮接入真实现
- **P2 画布集成层**（f0b84bc、39bb840、03f055b）：CanvasController 单类收敛（事件归一化只在 e.global 一处、attach/detach 幂等状态机 + attachGen 代数令牌）；modeHandlers 纯函数处理器表；删除 8 个旧 hook/管理器；修复坐标偏移/机器池位置同步/Ghost 跟随/MOVE_SELECTION 虚影预览/中键误触发/右键菜单/触屏/越界 hover/clampPan/生命周期竞态
- **P3 性能与视觉**（9e16042、fa0bfd9）：端口中心 8px 偏移修复；机器 hover 标签显示 + zoom 反缩放；cullArea/isRenderGroup/网格纹理单例；首次 update 动态子元素补建修复

## Sprint 12 (2026-06-19 → 06-22) — GameMode → ModeState 判别联合重构

5 个 commit (c1443a3 → f59961a)：扁平字符串替换为带子状态的判别联合，CONVEYOR+PIPE → WIRE，BLUEPRINT_PLACE → MOVE_SELECTION，新增 modeSlice + selectors.ts；`_archive/items/` 132 张死图归档 + opencc-js 延迟加载 + LoadingScreen 瘦身

## Sprint 11 (2026-06-19) — 资产瘦身

logo 压缩 (1.5MB → 10KB) / 17MB 字体移除 / 幽灵 Inter 删除 / eslint-disable 消除 (2 处) / meta 标签补全

## Sprint 10 (2026-06-19) — 占用网格重构

掩码系统 + buildMergedGrid 统一三处网格构建；useGridEvents 拆为 4 子 hook；updatePreview 拆为 5 纯函数；路由懒加载；Zustand devtools；占用网格缓存；寻路边界测试 (131 total)

## Sprint 9 (2026-06-13) — 项目清理

垃圾文件 / 许可证修正 / 文档重写 / 数据结构化

## Sprint 7–8 (2026-06-13) — 技术债清尾

ESLint 25 → 0 / framer-motion 移除 / `any` 清零

## Sprint 6 (2026-06-13) — 架构瘦身

Grid.tsx 拆出 ConnectionSVGLayer + useGridEvents + GhostPreview + SelectionBox + BatchMovePreview；gridUtils 拆为 5 模块

## Sprint 4–5 (2026-06-13) — 类型安全 + 测试

any 清零 / 繁→简收尾 / 5 文件 100+ 测试用例 / CI/CD

## Sprint 3 (2026-06-11) — 功能修复

43 台机器补全 / commitBatchMove 连线碰撞 / 网格越界清除 / 历史上限 50 步 / 平移约束

## Sprint 1–2 (2026-06-10) — 性能止血

细粒度 selector + React.memo + useCallback + getBoundingBox 去重 + ErrorBoundary
