# 菲比拉基建 - 项目架构文档

> 《明日方舟：终末地》网页版基建规划工具

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 前端框架 | React 19 |
| 语言 | TypeScript 5.9 (strict) |
| 构建工具 | Vite 7 |
| UI 组件库 | Chakra UI v3 |
| CSS | Emotion (CSS-in-JS) + SCSS |
| 状态管理 | Zustand 5 |
| 动画 | Framer Motion |
| 路由 | 无 (通过状态变量 `uiView` 手动切换视图) |
| 路径别名 | `@` → `src/` |

## 项目结构

```
arknights-endfield-bp-tool/
  index.html                     # SPA 入口 HTML
  package.json                   # NPM 配置
  vite.config.ts                 # Vite 构建配置
  tsconfig.json                  # TS 根配置（references 子配置）
  tsconfig.app.json              # src/ 的 TS 严格模式配置
  tsconfig.node.json             # vite.config.ts 的 TS 配置
  eslint.config.js               # ESLint 9 flat config
  Dockerfile                     # 多阶段 Docker 构建
  rename_items.js                # 素材重命名工具脚本
  public/
    _redirects                   # Cloudflare Pages SPA 重定向规则
    fonts/NaikaiFont-Bold.woff2  # 自定义中文字体
  src/
    main.tsx                     # 应用入口
    App.tsx                      # 根组件（编排器）
    App.css
    index.css                    # 全局样式 + CSS 变量
    types.ts                     # 核心类型定义
    vite-env.d.ts
    assets/                      # 静态资源（图片、图标、字体）
    config/                      # 配置数据
      machines.ts                # 21 种机器定义
      materials.ts               # ~80 种材料定义
      constants.ts               # 网格尺寸预设
      memberInfo.ts              # 团队成员信息
    store/                       # 状态管理
      gameStore.ts               # 主 Store (~1075 行)
      settingsStore.ts           # 设置 Store
    utils/                       # 工具函数
      gridUtils.ts               # A* 寻路 + 碰撞检测
      machineUtils.ts            # 旋转数学 + 电力检测
      shareUtils.ts              # 蓝图分享（压缩/编码/截图）
      storage.ts                 # localStorage 蓝图 CRUD
      toaster.ts                 # Toast 通知实例
    hooks/
      useChineseConverter.ts     # 繁简中文转换
    components/                  # UI 组件
      Grid.tsx                   # 核心画布
      Machine.tsx                # 单个机器
      Toolbar.tsx                # 左侧工具栏
      Header.tsx                 # 顶部栏
      OperationHints.tsx         # 底部快捷键提示
      MaterialSelector.tsx       # 材料选择弹窗
      BlueprintList.tsx          # 蓝图列表页
      SaveDialog.tsx             # 保存命名弹窗
      ShareModal.tsx             # 分享弹窗
      Settings.tsx               # 设置页
      About.tsx                  # 关于页
      IconButton.tsx             # 通用图标按钮
      LoadingScreen.tsx          # 加载动画
      ui/
        tooltip.tsx              # Chakra Tooltip 封装
```

---

## 一、基础设施层

### `index.html`

SPA 入口。设置标题「菲比拉基建」，提供 `<div id="root">` 挂载点，通过 `<script type="module" src="/src/main.tsx">` 加载应用。

### `vite.config.ts`

极简配置：注册 `@vitejs/plugin-react` 插件，设置路径别名 `@ → ./src`。

### TypeScript 配置

三层结构：
- **`tsconfig.json`** — 根配置，仅通过 `references` 索引子配置
- **`tsconfig.app.json`** — 面向 `src/`。关键选项：
  - `strict: true` — 全部严格检查
  - `noUnusedLocals: true` — 未使用变量编译报错
  - `noUnusedParameters: true` — 未使用参数编译报错
  - `erasableSyntaxOnly: true` — 禁止 `enum`、`namespace` 等运行时 TS 语法
  - `verbatimModuleSyntax: true` — import 必须保留原样以兼容 ES 模块
  - `jsx: "react-jsx"` — 无需手动 `import React`
- **`tsconfig.node.json`** — 仅面向 `vite.config.ts`

### `eslint.config.js`

ESLint 9 flat config。继承：JS 推荐规则 + TypeScript-ESLint 推荐规则 + React Hooks 插件 + React Refresh Vite 插件。检查 `**/*.{ts,tsx}`，排除 `dist/`。

### `Dockerfile`

两阶段构建：`node:20-slim` 执行 `npm install` + `npm run build` → 产物 `/app/dist` 复制到 `nginx:stable-alpine`，暴露 80 端口。

### `public/_redirects`

Cloudflare Pages 的 SPA 回退规则：`/* /index.html 200`，确保所有路由请求都返回 `index.html`。

---

## 二、类型系统 (`src/types.ts`)

整个项目的数据模型根基：

```typescript
Point               { x: number; y: number }
Side                'top' | 'right' | 'bottom' | 'left'
Direction           0 | 1 | 2 | 3  // 顺时针：上右下左

MachineConfig       机器原型：id, width, height, inputs/outputs (PortConfig[]),
                    power, supplyRange?, color, category, allowedMaterials?

PortConfig          端口：相对坐标 x/y + 朝向 side

PlacedMachine       机器实例：唯一 id (UUID), machineId (引用 MachineConfig),
                    x/y (网格坐标), rotation (Direction), selectedMaterialId?

Connection          传送带连接：id, fromOriginal (起点机器+端口),
                    toOriginal (终点, 可为 null), path (Point[] 路径)

Material            材料：id, name, icon (图标编号)

GameMode            'BUILD' | 'WIRE' | 'BOX_SELECT' | 'MOVE_SELECTION'
```

---

## 三、配置数据层

### `config/machines.ts`

导出 `MACHINES: MachineConfig[]` 数组，共 21 种机器：

| 分类 | 机器 | 尺寸 | 说明 |
|---|---|---|---|
| core | `protocol-core` | 9×9 | 核心建筑，14输入6输出 |
| logistics | `logistics-bridge` | 1×1 | 物流桥，连线自动生成 |
| logistics | `splitter` | 1×1 | 分流器，1入3出 |
| logistics | `merger` | 1×1 | 汇流器，3入1出 |
| logistics | `item-input-port` | 1×1 | 物品准入口 |
| storage | `protocol-storage` | 3×3 | 协议储存箱 |
| storage | `warehouse-storage-port` | 1×3 | 仓库存货口 |
| storage | `warehouse-pickup-port` | 1×3 | 仓库取货口 |
| storage | `warehouse-storage-pickup-line-*` | 4×8 / 4×4 | 仓库线部件 |
| production | `refinery` | 3×3 | 精炼炉 |
| production | `crusher` | 3×3 | 粉碎机 |
| production | `assembler` | 3×3 | 配件机 |
| production | `molder` | 3×3 | 塑型机 |
| production | `seedHarvester` | 5×5 | 采种机 |
| production | `planter` | 5×5 | 种植机 |
| processing | `component-assembler` | 4×6 | 装备原件机 |
| processing | `filler` | 4×6 | 灌装机 |
| processing | `sealer` | 4×6 | 封装机 |
| processing | `grinder` | 4×6 | 研磨机 |
| processing | `reactor` | 5×5 | 反应池 |
| processing | `tian-you-hong-furnace` | 5×5 | 天有洪炉 |
| power | `supply-pole` | 2×2 | 供电桩，supplyRange 12 |
| power | `thermal-pool` | 2×2 | 热能池 |

每台机器通过 `allowedMaterials` 指定可处理的材料列表，也导出 `getMachineConfig(id)` 查询函数。

### `config/materials.ts`

导出 `MATERIALS: Record<string, Material>`，约 80 种材料。键为大写常量名（如 `BLUE_IRON_ORE`），值为 `{ id, name, icon }`。icon 数字对应 `src/assets/items/item_{icon}.webp`。覆盖从矿石 → 粉末 → 块/锭 → 零件/瓶 → 种子 → 溶液 → 最终产物（电池、针剂、爆炸物）的完整生产链。

### `config/constants.ts`

导出 `GRID_PRESETS`：6 个网格尺寸预设，对应游戏中不同等级核心建筑（次級核心 1~3 级：24→32→40，协议核心 1~3 级：40→55→70）。

### `config/memberInfo.ts`

导出团队成员信息数组 `memberInfo`，每个成员包含头像、留言、标签、社交链接。

---

## 四、工具函数层 (`src/utils/`)

### `gridUtils.ts` — 碰撞检测 + A* 寻路

**`checkCollision(candidate, machines)`**
- 将候选位置转换为 AABB 矩形
- 遍历所有已放置机器，用 `isOverlapping` 判断是否相交
- 不重叠返回 `false`，允许放置

**`findPath(start, end, machines, startSide?, endSide?)`** — A* 寻路核心
- 如果有 `startSide`/`endSide`，端口向外偏移一格作为 `realStart`/`realEnd`，避免路径穿入机器
- "贴面端口"快速路径：若两个端口相邻且对向，直接连线
- 机器占用格子标记为障碍物（`isBlocked`）
- 标准 A* 算法：曼哈顿距离启发函数，openList + closedList
- 迭代上限 2000 次防止死循环
- 路径重建时补回端口格子

**`calculateContentDimensions(machines, connections)`**
- 计算所有机器和连线路径的最小包围盒
- 用于保存蓝图时记录实际内容尺寸

### `machineUtils.ts` — 旋转数学 + 电力范围

**`getRotatedDimensions(w, h, rotation)`**
- 旋转 90° / 270° 时宽高互换

**`getRotatedPorts(ports, w, h, rotation)`**
- 每个端口依次做 rotation 次 90° 顺时针旋转
- 同时变换相对坐标和 side 朝向

**`isMachinePowered(target, allMachines, getConfig)`**
- 不需要电力的机器（power ≤ 0）直接返回 true
- 找所有 `supplyRange > 0` 的电力设施
- 计算供电设施中心点和供电范围的 AABB
- 与目标机器矩形做交集判断

### `shareUtils.ts` — 蓝图分享

**`generateShareUrl(blueprint)`**
1. `minifyBlueprint()` — 压缩格式：machines → `[typeIdx, x, y, rotation, materialId?]` 元组；connections → `[fromIdx, fromPort, toIdx, toPort, flatPath]`；类型去重存 `t[]`
2. JSON.stringify → `pako.deflate` 压缩 → `toBase64Url` (替换 `+/=` → `-_` 去掉末尾等号)
3. 拼接为 `{origin}{pathname}?bp={encoded}`

**`parseShareUrl()`**
1. 从 URL 参数 `bp` 取值
2. `fromBase64Url` 解码 → `pako.inflate` 解压 → JSON.parse
3. `expandBlueprint()` 还原为完整数据并重新分配 UUID

**`captureBlueprintScreenshot()`**
1. 克隆 `.zoom-content` 元素
2. 重置 clone 的 transform 为 `none`
3. 用 `html2canvas` 渲染为 canvas → `dataURL` (PNG)

### `storage.ts` — localStorage 蓝图 CRUD

- 所有蓝图存储在 `localStorage` 的 `zmd_blueprints` key 下，JSON 序列化的 `Blueprint[]` 数组
- `Blueprint` 结构：`{ id, name, createdAt, updatedAt, data: { machines, connections, gridWidth, gridHeight, actualWidth, actualHeight } }`
- CRUD：`getBlueprints()`, `saveBlueprint(id|null, name, data)`, `deleteBlueprint(id)`, `loadBlueprint(id)`
- 额外 key `zmd_last_blueprint_id` 记录上次打开蓝图 ID

### `toaster.ts`

创建 Chakra UI `createToaster` 实例（右下角，重叠显示，间距 24px），供全局使用。

---

## 五、状态管理层 (`src/store/`)

### `gameStore.ts` — 主 Store (~1075 行)

整个应用的大脑，一个 Zustand store 管理所有游戏状态。详见下方核心机制。

### `settingsStore.ts` — 设置 Store

仅两个字段：`language: 'zh-TW' | 'zh-CN'` + setter。使用 Zustand `persist` 中间件自动同步到 localStorage `settings-storage` key。

---

## 六、gameStore 核心机制详解

### 撤销/重做系统

- 基于 **快照栈** 实现：`history: { past: HistorySnapshot[], future: HistorySnapshot[] }`
- 每个快照保存完整的 `{ machines, connections, gridWidth, gridHeight }`
- 每次修改操作前调用 `takeSnapshot()` → 当前状态推入 past，清空 future
- `undo()` → 把当前状态推入 future，从 past 弹出上一状态恢复
- `redo()` → 把当前状态推入 past，从 future 弹出下一状态恢复
- 加载新蓝图时清空历史

### 放置机器 (`addMachine`)

```
选机器 (selectMachine) → 鼠标悬停 Grid 计算 ghost 位置
→ 点击 → addMachine(machineId, x, y, rotation)
   ├─ 获取旋转后尺寸
   ├─ 边界检测（不能超出网格）
   ├─ checkCollision（不与现有机器重叠）
   ├─ 如果来自 pickupMachine：保留原 ID，位置变了则清理旧连接
   ├─ takeSnapshot
   ├─ 写入 machines 数组
   └─ 清除 movingMachineBackup
```

### 连线系统 (Wiring)

```
startWiring(machineId, portIndex, absolutePos)
  → 设置 wiringSource + wiringFixedPath = [absolutePos]

鼠标移动 → updateWiringPreview(mouseGridPos)
  → 从最后一个锚点到鼠标位置，调用 findPath A* 寻路
  → 路径追加到 wiringPreviewPath
  → 寻路失败则显示直线 + isWiringValid = false

点击网格 → addWiringAnchor(pos)
  → 从最后锚点到 pos，findPath 寻路 → 追加到 wiringFixedPath（固定锚点）

点击输入端口 → commitWiring
  ├─ 标记终点端口 (toOriginal)
  ├─ 检测新旧路径交叉点
  │   └─ 交叉点不被机器占据 → 自动生成 logistics-bridge
  ├─ takeSnapshot
  ├─ 写入 connections 数组
  └─ 清除连线状态
```

### 框选系统 (`commitBoxSelection`)

```
拖拽 → setBoxSelection(start, end) 设置矩形

松手 → commitBoxSelection(isToggle)
  ├─ 归一化矩形 (x1,y1) ~ (x2,y2)
  ├─ 筛选范围内的 machines（AABB 相交检测）
  └─ 筛选范围内的 connections（路径点是否在框内）

isToggle (Shift 按下) → XOR 逻辑
  ├─ 在框内且未选中 → 加入选中
  ├─ 在框内且已选中 → 移除选中
  └─ 不在框内 → 保持原状态

单格选中优化：若选中了机器，忽略同格的连接线（避免误选）
```

### 批量移动 (`startBatchMove` / `commitBatchMove`)

```
startBatchMove()
  ├─ 提取选中的 machines + connections
  ├─ 计算选中区域的几何中心作为 moveAnchor
  ├─ 从世界中暂移除这些项
  └─ 进入 MOVE_SELECTION 模式

鼠标移动 → Grid 根据 offset 渲染 ghost

commitBatchMove(targetPos)
  ├─ offsetX = targetPos.x - moveAnchor.x
  ├─ 对新位置做碰撞/边界检测
  ├─ 失败 → 不提交，ghost 留在原位
  └─ 成功 → takeSnapshot → 合并回 machines/connections 数组
```

### 批量复制 (`startCopySelection`)

与批量移动类似，但：
- 源数据克隆并分配全新 UUID（ID 映射表）
- `isCopying = true`，意味着取消时直接丢弃副本而非恢复
- 源机器保持原位置不动

### 其他关键 Action

- **`pickupMachine(id)`** — 从网格移除机器，状态存为 `movingMachineBackup`，旋转保留，连线暂不动
- **`deleteSelected()`** — 级联删除：选中机器 + 选中连接 + 所有关联被删机器的连接
- **`startInsertBlueprint(blueprint)`** — 蓝图以粘贴模式插入：分配新 UUID，计算中心锚点，进入 MOVE_SELECTION 模式
- **`loadGame(...)`** — 加载蓝图：设置机器/连接/网格尺寸 + 清空历史栈

---

## 七、应用入口与编排层

### `main.tsx`

```tsx
StrictMode → ChakraProvider(defaultSystem) → App
```

无自定义主题，使用 Chakra UI v3 默认预设。

### `App.tsx` — 根组件 (~360 行)

**启动流程** (useEffect on mount)：
1. 检查 `localStorage` → 有上次蓝图 ID → 加载蓝图
2. 检查 URL `?bp=` → 有分享参数 → 解压加载
3. 都没有 → 新建空白编辑器 (`resetGame()`)
4. 最后通过 `setIsLoading(false)` 隐藏 LoadingScreen

**全局快捷键**：`Ctrl+Z` → undo, `Ctrl+Y` / `Ctrl+Shift+Z` → redo, `Ctrl+S` → 保存

**保存逻辑** (`handleTriggerSave`)：
- 有选中 → 提取 selection 数据 → 弹出 SaveDialog
- 已命名蓝图 → 快速覆盖保存
- 新蓝图 → 弹出 SaveDialog 另存为

**选中提取** (`extractSelectionData`)：
- 计算最小包围盒 → 归一化到 (0,0) → 重新映射 UUID → 返回 Blueprint['data']

**视图路由**：通过 `uiView` 状态值切换四个视图：

| uiView | 渲染 |
|---|---|
| `'editor'` | Header + Grid + Toolbar + OperationHints + SaveDialog + MaterialSelector |
| `'list'` | BlueprintList |
| `'about'` | About |
| `'settings'` | Settings |

### `index.css` — 全局样式

- `@font-face` 加载 `NaikaiFont-Bold.woff2` 自定义中文字体
- CSS 变量定义颜色体系：灰阶 (`--gray-light`/`--gray`/`--gray-dark`)、黄色、黑色、绿色、橙色
- `body` 禁止滚动 (`overflow: hidden`)
- `.gray-btn` / `.yellow-btn`：通用按钮样式（圆角胶囊、内阴影、hover 上浮 2px）
- `body[lang="zh-CN"]`：简体中文字体栈

---

## 八、UI 组件层

### `Grid.tsx` — 核心画布 (~400 行)

最复杂的 UI 组件。渲染层次：

```
.grid-container (鼠标事件处理)
  └─ .zoom-content (transform: translate(pan) scale(zoom))
       ├─ .grid-background    (CSS 网格背景，尺寸 = gridW*40 × gridH*40)
       ├─ <svg> connections    (SVG 连线层，pointer-events: none)
       │    ├─ polyline × N    (已确认连线：描粗边 + 画细线 = 双色效果)
       │    └─ polyline × 1    (预览连线：有效=白, 无效=红)
       ├─ Machine × N          (已放置机器)
       ├─ Ghost machine        (放置预览：透明正常, 红色=碰撞/越界)
       ├─ Selection box        (框选矩形)
       └─ Batch move ghosts    (批量移动预览)
```

**坐标换算**（screen ↔ world）：
```typescript
getGridPos(e): Point {
  worldX = Math.floor((screenX - pan.x) / (zoom * GRID_SIZE))
  worldY = Math.floor((screenY - pan.y) / (zoom * GRID_SIZE))
}
```

**事件处理管线**：
- `mousedown(中键)` → 开始平移
- `mousedown(左键, BOX_SELECT)` → 开始框选
- `mousemove(平移)` → 更新 pan
- `mousemove(连线)` → A* 预览更新
- `mousemove(框选)` → 更新矩形
- `click(BUILD + 有选中机器)` → addMachine（Ctrl+click 连续）
- `click(WIRE)` → addWiringAnchor
- `click(MOVE_SELECTION)` → commitBatchMove
- `wheel` → 以鼠标为中心缩放（zoom 范围 0.18~3.0）
- `contextmenu` → cancelOperation (右键取消)

**键盘快捷键**（组件内注册）：
- E → 切换连线模式 | R → 旋转预览 | X → 切换框选
- F → 删除选中 | F1 → 插入蓝图 | M → 批量移动
- Ctrl+C → 复制选中 | Escape → 取消操作

### `Machine.tsx` — 单个机器 (~300 行)

**核心渲染**：

1. **端口定位** (`getPortStyle`) — 根据端口相对坐标和 side，计算在机器容器内的绝对像素位置
2. **端口碰撞处理** (`getPortClasses`) — 对窄型机器（1×1），检测同格多端口情况：
   - 对向端口 → `shrink-depth`（缩减深度）
   - 相邻端口 → `shrink-length`（缩减长度）
3. **端口交互**：
   - 点击输出端口 → `startWiring(id, portIndex, absolutePos)`
   - 点击输入端口 → `commitWiring()`
4. **点击机器本体** → `openMaterialSelector(id)`
5. **长按 500ms** → `pickupMachine(id)`（移动模式）
6. **无电警告** → 中心显示闪电图标 (`isMachinePowered` 返回 false)
7. **已选材料** → 中心显示材料小图标
8. **标签反缩放** → 文字 `transform: scale(1/zoom)` 保持可读

### `Toolbar.tsx` — 左侧工具栏

**模式按钮**（顶部）：
- 鼠标指针（选择/移动模式）| 闪电（连线模式，E）| 框选（X）
- 均为 toggle 行为，再次点击回到 BUILD 模式

**机器面板**（底部）：
- 6 个 Chakra UI Tabs 标签：核心、物流、仓储存取、基础生产、合成制造、电力
- 过滤 `MACHINES` 显示当前分类机器
- 每个按钮含图标 (`assets/machines/{id}.webp`) + 名称，选中时高亮

### `Header.tsx` — 顶部栏

- 左侧 logo
- 中间网格尺寸下拉（Chakra `Select`，绑定 `GRID_PRESETS`）
- 右侧 5 个按钮：保存、蓝图列表、分享、设置、关于

### `OperationHints.tsx` — 操作提示

底部固定显示的快捷键提示条。根据当前 `mode` / `selectedMachineId` / 选中状态动态切换内容。

### `LoadingScreen.tsx` — 加载动画

- `import.meta.glob` 获取所有物品图片 URL
- 逐张 `new Image()` 预加载，跟踪进度
- 动画：黄色竖条从底部涨到 100% → 展开 → 淡出 → `onComplete`
- 左侧百分比 + 右侧插图 + "終末地牛逼"

### `MaterialSelector.tsx` — 材料选择弹窗

- 根据 `materialSelectorMachineId` 找到对应机器配置
- 渲染 `allowedMaterials` 网格：图标 + 名称
- 点击材料 → `setMachineMaterial` → 自动关闭

### `BlueprintList.tsx` — 蓝图列表页

两种模式：
- **manage**（管理）：点击卡片 → Drawer 详情 → "打开蓝图"
- **insert**（插入/F1）：点击卡片 → `startInsertBlueprint` 以粘贴模式插入

功能：新建蓝图卡片、蓝图列表（名称/日期/尺寸）、删除（带 confirm）、Drawer 详情抽屉。

### `SaveDialog.tsx` — 保存弹窗

输入框 + 取消/保存按钮。支持 Enter 提交。

### `ShareModal.tsx` — 分享弹窗

打开时自动：生成分享链接 + 截取画布截图。显示截图预览和只读链接输入框。操作：复制链接、下载 PNG。

### `Settings.tsx` — 设置页

语言切换：兩個 Tab（繁體中文 / 简体中文），点击触发 `useChineseConverter` 繁简转换。

### `About.tsx` — 关于页

免责声明 + 成员卡片列表。作者卡片金色高亮。社交按钮点击复制到剪贴板。

### `IconButton.tsx` — 图标按钮

`<button>` + `@iconify/react <Icon>` 封装。支持 `tooltip`（CSS 伪元素实现）。

### `ui/tooltip.tsx` — Chakra Tooltip 封装

对 Chakra UI `Tooltip` 的二次封装，支持控制箭头、Portal、禁用状态。

---

## 九、Hooks

### `useChineseConverter.ts`

- 监听 `settingsStore.language` 变化
- `zh-CN`：动态 import `opencc-js` → 创建 `tw→cn` 转换器 → 递归遍历 DOM 文本节点转换 → 设置 `<html lang="zh-CN">`
- `zh-TW`：创建 `cn→tw` 反向转换器还原 → 设置 `<html lang="zh-TW">`
- 挂载 `MutationObserver` 监听 DOM 变化，自动转换新插入文本
- 跳过 `<script>` 和 `<style>` 标签
- 组件卸载时断开 observer

---

## 十、数据流总结

```
用户操作 → Grid/Machine 组件捕获事件 → 调用 gameStore action
                                              │
                                              ├─ takeSnapshot()（修改前）
                                              ├─ 执行逻辑（碰撞、寻路...）
                                              └─ set() 更新状态
                                              │
Zustand 响应式更新 ─────────────────────────────┘
                                              │
组件重新渲染 ← useGameStore() 订阅状态变化
```

---

## 十一、关键交互流程

### 放置机器完整流程

```
1. Toolbar 点击机器 → selectMachine(machineId)
   → selectedMachineId 被设置, mode = BUILD

2. 鼠标移入 Grid → hoverPos 更新
   → ghost 渲染 (getRotatedDimensions + checkCollision)
   → 碰撞变红, 越界变红

3. 点击 → addMachine(machineId, hoverPos, rotation)
   → 碰撞检测通过 → takeSnapshot → machines 追加
   → Ctrl 不松 → 不取消选中, 可连续放置
   → Ctrl 松 → selectMachine(null), 回到指针模式

4. 取消: 右键 → cancelOperation()
   → 清除 selectedMachineId
```

### 连线完整流程

```
1. 按 E 进入 WIRE 模式

2. 点击机器输出端口 → startWiring(id, portIdx, pos)
   → isWiring = true, wiringFixedPath = [pos]

3. 鼠标移动 → updateWiringPreview(hoverPos)
   → findPath(最后锚点 → hoverPos) → wiringPreviewPath

4. 点击空白 → addWiringAnchor(hoverPos)
   → 固定路径段到 wiringFixedPath

5. 点击输入端口 → commitWiring()
   → 检测交叉 → 生成物流桥 → takeSnapshot → 写入 connections
```

### 框选 + 批量操作流程

```
1. 按 X 进入 BOX_SELECT 模式

2. 拖拽矩形 → commitBoxSelection()
   → 选中范围内的 machines + connections

3. 按 M → startBatchMove()
   → 暂移除选中项, 进入 MOVE_SELECTION

4. 移动鼠标 → ghost 跟随
5. 点击 → commitBatchMove()
   → 碰撞检测通过 → 合并回世界

6. 按 Ctrl+C → startCopySelection()
   → 克隆 + 新 UUID, 源保留
```
