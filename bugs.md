# Bugs

## 📋 全项目审查（2026-07-17 渲染/碰撞/数据/交互四路并行审查 → 修复）

> 四路只读审查（渲染与场景同步 / 碰撞与寻路 / 数据模型与同步 / 交互与手感）
> 共确认 P1×9、P2×15，另核销若干疑似项。按"连线崩溃 → 历史快照 → 持久化 → 渲染 → 交互"顺序修复。

### 连线 / 碰撞 ✅ 已修复
- **updatePreview 空引用崩溃**：点击已被同向连线占用的输出口 → `checkStartOverlap` 过滤全部端口 → `bestResult!` 读 null 抛 TypeError（每次 mousemove 重复触发）。加 null 兜底取消连线 + 回归测试
- **commitBatchMove 连线不检测机器碰撞**：批量移动/展平复制的连线可落进机器格。对 placedConns 路径格加机器位阻挡检测（掩码位语义保留"液管穿固体物流器"例外）
- **单格连线拆分丢失**：面对面机器产生的 `path=[cell]` 连线被交叉时 `splitConnectionAt` 返回 `[]` 被整体移除。commitConnection/commitBatchMove 拆分改为"空结果保留原样"
- **子蓝图只读守卫失效**：`startConnecting` 用 1×1 判定端口归属（恒不命中）→ 后代输出口可起线；`updatePreview` 可吸附后代输入口；wire.onTap 无归属守卫。三处改为 findMachineAt + isViewingOwn
- **蓝图占位缓存过期**：`childOccupancyCache` 按 CommittedNode 键控，编辑嵌套后代后祖先引用不变 → 命中过期占用格。改为按 doc 引用 + childNodeId 键控

### 历史快照 ✅ 已修复
- **批量移动 undo 删内容**：快照拍在 `startBatchMove` 摘除移动件之后，undo 恢复出"移动件消失"态。takeSnapshot 支持 override，commitBatchMove 以"移动前完整布局"入栈
- **双重快照**：commitBatchMove 外层 modeHandlers 与内部各拍一次 → undo 需按两次。统一收口：快照全部移入 slice 内、真正写入前拍摄（addMachine/commitConnection/deleteSelected/commitBatchMove），事件层不再拍
- **失败操作空转撤销步**：碰撞/越界的 addMachine、commitBatchMove、commitConnection 不再产生与当前状态相同的快照
- **拾取+放置双重快照**：拾取时拍一次（机器摘除前），addMachine 识别 movingMachineBackup 跳过拍摄 → 一次撤销回到原位
- **网格尺寸不进快照**：缩小网格删除越界机器后 undo 只还原内容。HistorySnapshot 纳入 gridWidth/gridHeight，undo/redo 连带还原

### 持久化 / 真相源 ✅ 已修复
- **loadDoc 浅校验白屏**：字段缺失/被篡改的 doc 通过校验后在 findRoots 等处抛异常。改为深度结构校验（节点/机器/连线/childRef/悬空引用），不合格整体回退空文档
- **saveDoc 静默失败**：配额满/隐私模式时提示"保存成功"但刷新即丢。saveDoc 返回 boolean，所有 doc 变更路径失败时 toast
- **刷新/关闭无离开确认**：未保存的检出修改随刷新丢失。beforeunload + isCheckoutDirty
- **分享解码无校验**：非法 rotation（>3）注入后 mask4[rotation] 为 undefined 崩溃；截断输入产生 NaN 坐标。解码加边界检查/rotation 范围/实体上限，抛错由 parseShareUrl 捕获
- **分享编码 1 字节截断**：蓝图跨距 >256 格时坐标 mod-256 截断。编码前检测超限 → 拒绝生成 + toast
- **删除当前蓝图后保存静默失效**：无 viewing 节点时 addMachine 可放置但保存链路 no-op。保存时无 viewing → loadGame 落为新蓝图
- **isCheckoutDirty 不比较网格尺寸 / 顺序敏感**：纯改网格不触发离开确认；批量移动取消改变顺序误报脏。脏检测补网格尺寸比较 + isContentEqual 按 id 排序
- **loadBlueprint 不恢复网格尺寸**：切蓝图后画布网格停留在旧尺寸。loadBlueprint 恢复 node.gridW/gridH
- **重复引用同一子蓝图**：fork 保存丢重复实例。startInsertChild 拒绝已直接引用的重复导入（多实例用展平复制）

### 渲染 ✅ 已修复
- **机器黑边被端口盖住**：Pixi 版端口指示器贴边 px=0 且 zIndex 高于边框，1×1 物流机器（lbr/spl/mrg/iip 等）四边全是端口时 3px 黑边被整段覆盖；DOM 版端口是带边框父元素内的子元素、永远在黑边内侧。端口统一内缩 3px 到黑边内侧
- **Ghost 放置预览丢失碰撞检测**：迁移时 isValid 硬编码 true（TODO 残留），越界/碰撞无红边反馈。恢复旧 DOM GhostPreview 的 checkPlacementCollision 实时检测，非法位置 ghost 显示红边
- **attach 竞态误伤新一代**：preload 后 gen 失配走 `cleanup()` 销毁新一代共享状态（StrictMode）。改为与其它分支一致只丢弃本地 app
- **液体连线压住 pbr 管道桥**：connectionLiquidLayer 位于 machineLayer 之上，液体线盖住桥体/机器端口。两层连线都移到机器层之下（与掩码 z 序语义一致）
- **Ghost 供电范围未旋转**：2×3 机器旋转成 3×2 后范围框错位。改用旋转后尺寸
- **hover 标签重建后消失**：供电/选中变化重建动态子元素后标签隐藏且同 id 短路不重显。同 id 命中时显式置可见

### 交互 / 手感 ✅ 已修复
- **DEVICE_SELECT 拖拽已选机器不移动**：迁移丢失，仅 M 键可用。按下已选机器 + 6px 阈值 → startBatchMove；未越阈值保留点击/Shift 反选
- **BLUEPRINT_SELECT 无法拖拽移动子蓝图**：commitMove 成死代码。按住选中子蓝图拖动 → BLUEPRINT_MOVE(isInserting=false)，moveAnchor 存抓取偏移，校验排除自身展平内容，松手 commitMove
- **多格机器 1×1 命中**：BLUEPRINT_SELECT 点击多格机器非左上格不选中。改 findMachineAt 全占地命中
- **快捷键无聚焦守卫**：对话框输入时 E/Q/F/Ctrl+Z 误触模式/删除。输入框聚焦时屏蔽全局快捷键（两处 hook）
- **keydown e.repeat 抖动**：按住 X/B/R 高频翻转/连续旋转。e.repeat 跳过
- **M/Ctrl+C 依赖 hover**：指针在画布外静默失效。去掉 hover 前提
- **setMode 丢拾取备份**：工具栏 E/Q/X 覆盖 modeState 丢弃 movingMachineBackup。setMode 前置还原
- **addMachine 静默失败**：碰撞/越界无反馈。加 warning toast
- **点击空白不能清空选区**：只能 Esc 重进。单击空白格（无移动/无命中/非 Shift）清空选区
- **clampPan 非对称**：高缩放下无法平移到网格右/下边缘。改为正负对称 ±2 倍网格
- **中键平移无光标**：`.panning` 类无样式。补 grabbing 光标

### 核实为设计意图（未修改）
- 后代机器不做 alpha 淡化（用无端口/无缺电图标表达只读，与 CLAUDE.md 一致）
- 机器颜色 alpha 0.3/0.35 被渲染固定 0.7 取代（保证可读性）
- 机器 cullArea 不随 machineId/rotation 变化（当前语义下不可变，不触发）
- 历史快照不去重、撤销不含视口、Gas 未实现——见 ARCHITECTURE.md 已知限制

## 📋 架构收敛重构（2026-07-16 审查 → 修复）

> 蓝图树重构（99b9153）与 PixiJS 迁移（ce6d019 起）的专项审查发现，
> 按 P0 止血 → P1 领域收敛 → P2 画布集成 → P3 性能 → P4 功能补全 顺序修复。
> 设计决策见 `docs/ARCHITECTURE.md`。

### P0 ✅ 已修复
- **B1 嵌套保存位置归零**：`saveCurrentBlueprint` 先 removeChild 再读旧引用 → 恒 undefined。先读 oldChildRef 再 removeChild（34ed8bb）
- **B3 蓝图成环无防护**：`addChild` 拒绝自引用/祖先引用；`findAncestorPath`/`buildTree`/`isInSubtree` 加 visited；UI 禁用成环导入；commitInsert 失败 toast（e801006）
- **B2 fork 孤儿根**：非共享（含根）保存改为原地提交 nodeId 不变；仅共享时分叉且分叉自旧版本（其他调用方引用不变，顺带修复共享编辑泄漏旧版本的深层问题）；recalcDependents 重算父级掩码（39c8983）

### P1 ✅ 已修复（单一真相源）
- **H4 undo/redo 不写回引擎**：引擎整体删除。历史快照 = { machines, connections, doc }，undo/redo 直接恢复并落盘
- **H2/H6 保存后刷新加载过期/空根**：无 fork 孤儿产生；App 启动加载 findRoots()[0] 稳定
- **H5 导航静默丢编辑**：检出式语义，离开当前蓝图前 `isCheckoutDirty()` + confirm
- **M8 clearLegacyData 静默删数据**：旧格式直接废弃，无清理逻辑

### P2 ✅ 已修复（画布集成层，CanvasController）
- **P1 坐标归一化**：所有事件只在 `CanvasController.toNormalized()` 一处取 `e.global`，click 子路径（连线起点/框选/批量移动提交/蓝图选择）偏移消除
- **P2/H1 机器池 stale-key**：`MachineRenderer.update` 无条件同步 position，machineId/rotation 变化重建静态三件套（39bb840）
- **P3/H2 Ghost 不跟随鼠标**：hoverPosFrac 进入 diff 清单 → Ghost 跟随
- **P4/H3 MOVE_SELECTION 无预览**：syncOverlays 增加批量移动虚影分支（BATCH_BASE 基底）
- **M1 中键误触发 click**：click 仅 button 0
- **M2 右键弹浏览器菜单**：canvas 原生 contextmenu preventDefault
- **M3 触屏/触控笔失效**：tap / pointertap 映射提交
- **M4 指针越界**：globalpointermove 越界清 hover
- **M5 平移/缩放不 clamp**：统一 clampPan
- **M9 destroy 竞态**：attachGen 代数令牌 + 先退订再销毁 + init 失败清理

### P3 ✅ 已修复（性能与视觉）
- **H4 modeState 全量重建**：WIRE 预览只重画预览线；选中集变化只更高亮；powerGrid WeakMap 缓存（39bb840）
- **M7 机器标签永不显示**：CanvasController hover 命中显示/隐藏 + zoom 反缩放（fa0bfd9）
- **M1(渲染) 端口中心 8px 偏移**：CELL_CENTER 改回格中心 20（9e16042）
- **L4 GridLayer 纹理缓存污染**：模块级单例（fa0bfd9）
- **L3 动态 URL 打包风险**：已验证 dist 包含全部 23 个图标，关闭
- 附带修复：MachineRenderer 首次 update 未补建动态子元素（hasDynamic 标记）

### P4 ✅ 已修复（功能补全）
- **B5 commitMove/cloneBlueprint 死代码 + Copy 按钮假实现**：`startFlattenCopy` 展平复制（含后代）真实现，Copy 按钮接入（9b5afd9、54048b6）

## 🔴 已修复（旧记录）

### 13. ~~地图边缘端口越界1格传送带~~ ✅ 已修复 (2026-06-27)
- **文件**: `connectionSlice.ts:38-58`, `connectionSlice.ts:180-192`
- **现象**: 点击地图边缘机器朝外端口后，`getPortOuterCells` 返回越界坐标，`startConnecting` 未过滤。若 `hoverPosRef.current` 为 null（鼠标未移动），`updatePreview` 不触发，`isValidPath` 保持 `true`，`commitConnection` 直接提交越界连线
- **触发**: 1) 地图边缘机器端口朝外 2) 鼠标移入画布前就点击端口 3) 再次点击即提交越界路径
- **修复**: `startConnecting` 过滤越界端口 + `commitConnection` 防御性边界检查

## 🟡 中等

### 1. ~~`?? 0` 回退静默降级~~ ✅ 已修复
- **文件**: `connectionSlice.ts:233`, `selectionSlice.ts:273,314`, `Machine.tsx:125`
- **现象**: `getMachineConfigById(id)?.mask.maxMask ?? 0` — 旧代码 `getMachineMask` 找不到配置时返回 255（阻止一切），新代码返回 0（不阻止任何内容）
- **修复**: `machineUtils.ts` 启动时验证 `REQUIRED_IDS = ['lbr', 'pbr', 'pco']`，缺失即 throw；桥掩码 3 处 `?.mask.maxMask ?? 0` 改为 `!.mask.maxMask`

### 2. ~~Machine.tsx 冗余配置查找~~ ✅ 已修复
- **文件**: `Machine.tsx:125`
- **现象**: 组件 L23 已通过 `getMachineConfig(data.machineId)` 拿到 `config`，L117 确认非空，L125 却重新 `getMachineConfigById` 再查一次 Map
- **修复**: 直接用 `config.mask.maxMask`，移除 `getMachineConfigById` import

---

## 🟢 低

### 3. ~~FromConnection 空路径崩溃~~ ✅ 已修复
- **文件**: `mask.ts:108-129`
- **现象**: `path.length === 0` 时包围盒为 Infinity，`new Uint8Array(-Infinity)` 抛 RangeError
- **修复**: 加空路径守卫 `if (path.length === 0) return new Mask(new Uint8Array(0), 0, 0, 0)`

### 4. ~~`if (cm === 0) continue` 不统一~~ ✅ 已修复
- **文件**: `collision.ts:78` vs `occupancy.ts`, `connectionSlice.ts`, `selectionSlice.ts`
- **现象**: 只在 `collision.ts` 加了零掩码跳过优化，其余三处连线循环未加
- **修复**: `occupancy.ts` + `connectionSlice.ts` + `selectionSlice.ts`×2 统一加 `if (cm === 0) continue`

### 5. ~~Mask.data 直接写入绕过 maxMax 追踪~~ ✅ 已修复
- **文件**: `collision.ts:81`, `occupancy.ts:55`, `connectionSlice.ts:249`, `selectionSlice.ts:234,307,315,353`
- **修复**: 新增 `Mask.WriteValue(x,y,value)` 方法——单点按位或写入 + 同步更新 maxMask；7 处 `grid.data[...] |=` 全部替换为 `grid.WriteValue(...)`

### 6. ~~buildMergedGrid 创建 Mask 后又丢弃~~ ✅ 已修复
- **文件**: `occupancy.ts` 3 个 builder + `pathfinding.ts` + `routeValidation.ts` + `connectionSlice.ts`
- **修复**: 3 个 builder 改为返回 Mask；下游 `trySingleLRoute`/`validateRouteConflicts`/`findRouteForMachine`/`findRouteToGround` 签名适配（`Uint8Array,gw` → `Mask`）；GridCache 类型适配；`routeManhattan` 删除（无调用方）

### 7. ~~TryMerge 每台机器分配全网格副本~~ ✅ 已修复
- **文件**: `selectionSlice.ts:251-253`
- **修复**: Mask 新增 `TryMergeInPlace` — HasCollision + MergeInPlace，零分配；`commitBatchMove` 逐台循环改用 `TryMergeInPlace`，`baseGrid` let→const

---

## ⚪ 已验证关闭

### 8-11. 确认安全，关闭
- **#8** HasCollision 越界语义：3 调用方均有前置越界守卫
- **#9** readonly maxMask 类型转换：仅在私有方法内部
- **#10** import type 循环依赖：编译期擦除，无运行时循环
- **#11** Gas 端口掩码 0x00：预留字段，所有连线循环有 `if (cm === 0) continue`

### 12. ~~bridgeMask 预览/提交不一致~~ ✅ 已修复
- **文件**: `connectionSlice.ts:80` vs `connectionSlice.ts:248`
- **修复**: `updatePreview` 改为与 `commitConnection` 一致——`getMachineConfigById(bridgeId)!.mask.maxMask`；移除 `MASK_SOLID_LOGISTICS`/`MASK_LIQUID_LOGISTICS` import
