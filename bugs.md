# Bugs

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
