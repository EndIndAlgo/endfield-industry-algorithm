# Changelog

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
