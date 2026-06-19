# 终末地工业算法 — 明日方舟：终末地 基建规划工具

《明日方舟：终末地》网页版基建规划工具，用于规划工厂布局、管理蓝图、生成分享链接。

**仓库地址：[github.com/EndIndAlgo/endfield-industry-algorithm](https://github.com/EndIndAlgo/endfield-industry-algorithm)**

**[在线体验](https://endindalgo.github.io/endfield-industry-algorithm/)**

## 主要功能

- **可视化编辑器**：基于 DOM 的网格画布，支持缩放/平移，机器放置、旋转、传送带与管道连接
- **43 台机器**：涵盖核心、物流、仓储存取、基础生产、合成制造、电力六大分类
- **智能连线**：L 形曼哈顿路由自动寻路，点击端口自动吸附，自动放置物流桥/管道桥，支持续接
- **蓝图系统**：保存/加载蓝图到本地，支持框选+批量移动/复制/删除，V3 紧凑二进制分享链接
- **撤销/重做**：50 步历史记录，Ctrl+Z/Y
- **繁简切换**：opencc-js 实时繁简中文转换，MutationObserver 监听增量 DOM

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 19 |
| 语言 | TypeScript 5.9 (strict) |
| 构建工具 | Vite 7 |
| UI 组件库 | Chakra UI v3 |
| CSS | Emotion + SCSS |
| 状态管理 | Zustand 5（切片模式，细粒度 selector） |
| 图标 | lucide-react + @iconify/react |
| 截图 | html2canvas |
| 繁简转换 | opencc-js |

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器
npm run build        # 类型检查 + 生产构建
npm run lint         # ESLint 检查
npm run test         # 运行测试
npm run preview      # 预览生产构建
```

## 操作指南

### 通用

| 操作 | 快捷键 |
|------|--------|
| 平移画布 | 鼠标中键拖拽 |
| 缩放画布 | 滚轮（以鼠标位置为锚点） |
| 撤销 | `Ctrl + Z` |
| 重做 | `Ctrl + Y` 或 `Ctrl + Shift + Z` |
| 保存/另存 | `Ctrl + S` |
| 取消当前操作 | `Escape` 或 右键 |

### 建造模式 (BUILD)

| 操作 | 快捷键 |
|------|--------|
| 旋转待放置机器 | `R` |
| 放置机器 | 左键点击 |
| 连续放置 | `Ctrl + 左键` |
| 长按拾取已放置机器 | 左键按住 500ms |

### 连线模式 — 传送带 (E) / 管道 (Q)

| 操作 | 说明 |
|------|------|
| 开始连线 | 点击机器输出端口或其外侧单元格 |
| 切换 L 形策略 | `R`（auto → 垂直优先 → 同向 三态循环） |
| 完成连线 | 点击目标机器输入端口 |
| 取消连线 | `Escape` 或 右键 |

### 框选模式 (X)

| 操作 | 说明 |
|------|------|
| 框选 | 左键拖拽 |
| 反选 | `Shift + 左键` 拖拽 |
| 批量移动 | 选中后按 `M` 或拖拽已选中项 |
| 批量复制 | 选中后按 `Ctrl + C` |
| 批量删除 | 选中后按 `F` |

### 蓝图

| 操作 | 快捷键 |
|------|--------|
| 打开蓝图列表 | `F1` |
| 插入蓝图到当前地图 | 蓝图列表 → 选择插入模式 |
| 插入蓝图到新地图 | 蓝图列表 → 新建地图放置 |

## 项目结构

```
src/
├── main.tsx                         # 入口：StrictMode + ChakraProvider
├── App.tsx                          # 根组件：uiView 条件路由 + 全局 Ctrl+Z/Y/S 快捷键
├── App.css                          # #root flex column 布局
├── index.css                        # CSS 变量 + 简中系统字体栈
├── types.ts                         # 共享类型 + 掩码常量 + GameMode
├── types/
│   └── opencc-js.d.ts               # opencc-js 类型声明
├── store/
│   ├── gameStore.ts                 # Zustand thin wrapper（组合 6 个切片 + devtools）
│   ├── settingsStore.ts             # 独立 persist store（语言设置）
│   └── slices/
│       ├── types.ts                 # 6 个切片接口 + HistorySnapshot
│       ├── canvasSlice.ts           # zoom / pan / gridWidth / gridHeight
│       ├── machinesSlice.ts         # machines[] / mode / addMachine / removeMachine
│       ├── connectionSlice.ts       # connections[] / 连线流程 / 预览 / 提交
│       ├── selectionSlice.ts        # 框选 / 批量移动 / 复制 / 删除
│       ├── historySlice.ts          # 撤销/重做（50 步上限）
│       └── blueprintSlice.ts        # uiView / 蓝图列表 / 加载 / 插入
├── config/
│   ├── machines.ts                  # 43 台机器配置
│   ├── materials.ts                 # 76 种材料
│   ├── constants.ts                 # GRID_SIZE / GRID_PRESETS / 端口箭头旋转
│   ├── memberInfo.ts                # 团队成员信息
│   └── zIndex.ts                    # 3 段式 z-index 常量表
├── utils/
│   ├── grid/
│   │   ├── index.ts                 # barrel 文件
│   │   ├── collision.ts             # 碰撞检测 / 内容尺寸计算
│   │   ├── direction.ts             # 方向向量 / facing 计算
│   │   ├── occupancy.ts             # 占用网格构建（掩码系统）
│   │   ├── pathfinding.ts           # 双 L 形曼哈顿路由
│   │   ├── port.ts                  # 端口坐标 / 分割连线 / 吸附
│   │   └── routeValidation.ts       # 路径冲突验证
│   ├── machineUtils.ts              # 旋转尺寸/端口 + 供电网格 + 机器掩码
│   ├── portPosition.ts              # 端口定位样式 + SVG 路径渲染
│   ├── shareUtils.ts                # V3 二进制分享编码/解码 + 截图
│   ├── storage.ts                   # localStorage 蓝图 CRUD
│   └── toaster.ts                   # Toast 单例
├── hooks/
│   ├── useGridEvents.ts             # 画布事件调度层（组合 4 个子 hook）
│   ├── useChineseConverter.ts       # 繁简实时转换
│   └── grid/
│       ├── usePanZoom.ts            # 平移/缩放/坐标转换
│       ├── useWireMode.ts           # CONVEYOR/PIPE 连线模式
│       ├── useSelectionMode.ts      # 框选 + 批量移动
│       └── useKeyboardShortcuts.ts  # 全局快捷键
├── styles/
│   └── cssCustomProps.ts            # CSS 自定义属性工厂函数
├── components/
│   ├── Grid.tsx                     # 核心画布（纯渲染外壳）
│   ├── Grid.scss                    # 网格背景 + 连线/管道样式
│   ├── ConnectionSVGLayer.tsx       # SVG 连线图层（React.memo）
│   ├── Machine.tsx                  # 已放置机器（React.memo）
│   ├── Machine.scss                 # 机器容器 + 端口样式
│   ├── GhostPreview.tsx             # BUILD 模式放置预览（React.memo）
│   ├── GhostPreview.scss            # ghost 虚线动画
│   ├── SelectionBox.tsx             # 框选矩形（React.memo）
│   ├── BatchMovePreview.tsx         # 批量移动预览（React.memo）
│   ├── Header.tsx                   # 顶部栏（logo + 网格尺寸 + 操作按钮）
│   ├── Header.scss                  # 顶部栏布局
│   ├── Toolbar.tsx                  # 底部工具栏（6 分类 + 模式切换）
│   ├── Toolbar.scss                 # 毛玻璃背景 + 按钮动画
│   ├── OperationHints.tsx           # 操作提示面板
│   ├── OperationHints.scss          # 键盘图标样式
│   ├── BlueprintList.tsx            # 蓝图管理
│   ├── ShareModal.tsx               # 分享弹窗
│   ├── SaveDialog.tsx               # 保存命名对话框
│   ├── Settings.tsx                 # 语言设置
│   ├── About.tsx                    # 关于页面
│   ├── LoadingScreen.tsx            # 启动加载画面
│   ├── LoadingScreen.scss           # 启动动画
│   ├── ErrorBoundary.tsx            # React 错误边界
│   ├── IconButton.tsx               # 通用图标按钮
│   ├── IconButton.scss              # 按钮 + tooltip 样式
│   └── ui/
│       ├── tooltip.tsx              # Chakra Tooltip 封装
│       └── About.scss               # 成员图标样式
├── __tests__/
│   ├── setup.ts                     # jsdom mock
│   ├── testWrapper.tsx              # ChakraProvider 包裹器
│   ├── pureFunctions.test.ts        # 纯函数测试（碰撞/寻路/掩码/端口）
│   ├── store.test.ts                # Zustand 切片测试
│   ├── Machine.test.tsx             # Machine 组件测试
│   ├── Toolbar.test.tsx             # Toolbar 组件测试
│   └── useChineseConverter.test.tsx # 繁简转换测试
└── assets/
    ├── logo-header.png              # Header 用 logo（96px 高，2x retina）
    ├── loading.png                  # 加载画面插图
    ├── members/                     # 团队成员头像
    ├── machines/                    # 机器图标 .webp
    └── items/                       # 材料图标
```

## 许可证

本专案为闭源专案，保留所有权利。未经作者书面许可，禁止散布、修改或商业使用。

## 免责声明

所有游戏相关图像与商标权归原厂所有。本工具仅为玩家社群制作的辅助工具，与游戏官方无任何关联，不进行任何商业营利行为。

## 作者

- 大木
- ChasingLight

（顺序不分先后）
