import { Application, Container, Graphics, extensions, CullerPlugin } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { useGameStore } from '@/store/gameStore';
import { GridLayer } from './layers/GridLayer';
import { MachineRenderer } from './renderers/MachineRenderer';
import { ConnectionRenderer } from './renderers/ConnectionRenderer';
import { OverlayRenderer } from './renderers/OverlayRenderer';
import { preloadMachineTextures } from './TextureLoader';
import { createModeHandlers, snapToCell, type NormalizedPointer } from './modeHandlers';
import { getMachineConfig } from '@/config/machines';
import { getRotatedDimensions, buildPowerGrid } from '@/utils/machineUtils';
import { clampPan, findMachineAt } from '@/utils/grid';
import { isViewingOwn } from '@/utils/blueprintGuard';
import type { GameState } from '@/store/slices/types';
import type { PlacedMachine, Connection, PortType, Point } from '@/types';
import { GRID_SIZE } from '@/config/constants';

// 注册视口裁剪插件（提前于 Application.init）
extensions.add(CullerPlugin);

/** buildPowerGrid 结果缓存：按 machines 数组引用 + 网格尺寸命中（machines 引用不变则复用） */
const powerGridCache = new WeakMap<PlacedMachine[], { gw: number; gh: number; grid: Uint8Array }>();

/** 长按拾取触发时长（ms）：按住自有机器 500ms 触发 pickupMachine */
const LONG_PRESS_MS = 500;

/**
 * 当前激活的画布控制器（attach 时注册、detach 时清除），
 * 供分享截图等画布外功能取用 PixiJS canvas。
 */
export const activeCanvasController: { current: CanvasController | null } = { current: null };

function getPowerGrid(machines: PlacedMachine[], gw: number, gh: number): Uint8Array {
  const hit = powerGridCache.get(machines);
  if (hit && hit.gw === gw && hit.gh === gh) return hit.grid;
  const grid = buildPowerGrid(machines, gw, gh, getMachineConfig);
  powerGridCache.set(machines, { gw, gh, grid });
  return grid;
}

/** 连线选中态缓存：outline Graphics → isSelected（供轻量高亮更新，避免每次全量重画） */
const connSelectedCache = new WeakMap<Graphics, boolean>();

/** attach 选项 */
export interface CanvasControllerOptions {
  /** 平移状态变化回调（PixiGrid 用它驱动 .panning 类名） */
  onPanningChange?: (isPanning: boolean) => void;
}

/**
 * 画布控制器（无框架 TS 类）
 *
 * 负责：PixiJS Application 生命周期、事件归一化与分发、Zustand 订阅 → diff → 增量更新场景图。
 * 生命周期用 attach/detach 幂等状态机 + 代数令牌（attachGen），StrictMode 双挂载安全：
 * 不产生双实例、双订阅、双 canvas。
 */
export class CanvasController {
  /** 平移状态变化回调（PixiGrid 用它驱动 .panning 类名） */
  onPanningChange: ((isPanning: boolean) => void) | null = null;

  private app: Application | null = null;
  private root!: Container;
  private world!: Container;
  private gridLayer!: GridLayer;
  private machineLayer!: Container;
  private connectionSolidLayer!: Container;
  private connectionLiquidLayer!: Container;
  private overlayLayer!: Container;

  /** 机器对象池 */
  private machinePool = new Map<string, Container>();
  /** 已确认连线对象池：connectionId → [outline, fill] */
  private connectionPool = new Map<string, Graphics[]>();
  /** 预览连线 Graphics 引用（用于清除） */
  private previewLines: Graphics[] = [];
  /** 叠加层 Graphics 引用（Ghost、选框、批量移动预览、蓝图轮廓等） */
  private overlayGraphics: Container[] = [];

  private unsubscribe: (() => void) | null = null;
  private _attached = false;
  private _ready = false;
  /** attach 代数令牌：detach / 重新 attach 会使 in-flight attach 失效 */
  private attachGen = 0;

  private isPanning = false;
  private lastMousePos: Point = { x: 0, y: 0 };
  private lastHoverGridPos: Point | null = null;
  /** 当前显示 hover 标签的机器 id（越界/换机时隐藏旧标签） */
  private hoverLabelMachineId: string | null = null;
  /** 长按拾取定时器（按住机器 500ms 触发 pickupMachine） */
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  /** 长按拾取目标机器 id（指针移出该机器/松开/越界即取消） */
  private longPressMachineId: string | null = null;

  private handlers = createModeHandlers({
    getHoverGridPos: () => this.lastHoverGridPos,
  });

  // ═══════════════════════════════════════════════════════════
  // 生命周期（幂等状态机）
  // ═══════════════════════════════════════════════════════════

  /** 挂载画布到容器（幂等：已 attached 时直接返回） */
  async attach(el: HTMLElement, opts?: CanvasControllerOptions): Promise<void> {
    if (this._attached) return;
    this._attached = true;
    const gen = ++this.attachGen;
    if (opts?.onPanningChange) {
      this.onPanningChange = opts.onPanningChange;
    }

    // 提前订阅 store — async init 期间 store 可能已变化，subscribe 必须在此之前就绪
    this.unsubscribe = useGameStore.subscribe((state, prevState) => {
      this.onStoreChange(state, prevState);
    });

    let app: Application | null = null;
    try {
      app = new Application();
      await app.init({
        resizeTo: el,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        preference: 'webgl',
      });
      // attach 期间被 detach（StrictMode 双挂载）→ 丢弃本次资源
      if (gen !== this.attachGen) {
        app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
        return;
      }
      this.app = app;
      activeCanvasController.current = this;

      if (!el.contains(app.canvas)) {
        el.appendChild(app.canvas);
      }
      app.canvas.style.position = 'absolute';
      app.canvas.style.top = '0';
      app.canvas.style.left = '0';

      await preloadMachineTextures();
      if (gen !== this.attachGen) {
        // 过期 attach（StrictMode detach→重新 attach）：detach 的 cleanup 已销毁本代 app，
        // 直接返回即可——调 this.cleanup() 会误伤新一代 attach 的共享状态（订阅/app/注册）
        return;
      }

      this.buildSceneGraph();
      this.bindEvents();
      this._ready = true;
      // fullSync 使用最新 state（subscribe 已在 init 前就绪，fullSync 保证首次完整性）
      this.fullSync(useGameStore.getState());
    } catch (err) {
      console.error('[CanvasController] 初始化失败', err);
      if (gen !== this.attachGen) {
        // 过期 attach：只销毁本次本地 app，不动当前代共享状态
        app?.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
      } else if (this.app !== app) {
        // 当前 attach 但 app 尚未赋给 this.app（init 阶段抛错）→ 手动销毁本地 app
        app?.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
      }
      // 当前 attach 且 this.app === app → 由 cleanup 统一销毁（避免双重 destroy）
      if (gen === this.attachGen) this.cleanup();
      throw err;
    }
  }

  /** 卸载画布（幂等） */
  detach(): void {
    if (!this._attached) return;
    this._attached = false;
    this.attachGen++; // 使 in-flight attach 失效
    this.cleanup();
  }

  /** 完整清理：退订 → 解绑 → 销毁应用 */
  private cleanup(): void {
    if (activeCanvasController.current === this) {
      activeCanvasController.current = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unbindEvents();
    this.hideHoverLabel();
    this.cancelLongPressPickup();
    if (this.app) {
      this.app.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true },
      );
      this.app = null;
    }
    this.machinePool.clear();
    this.connectionPool.clear();
    this.previewLines = [];
    this.overlayGraphics = [];
    this.lastHoverGridPos = null;
    this.isPanning = false;
    this.onPanningChange?.(false);
    this._ready = false;
  }

  // ═══════════════════════════════════════════════════════════
  // 场景图构建
  // ═══════════════════════════════════════════════════════════

  private buildSceneGraph(): void {
    this.root = new Container({ label: 'root' });
    this.world = new Container({ label: 'world', isRenderGroup: true });

    this.gridLayer = new GridLayer();
    this.gridLayer.label = 'gridLayer';

    this.machineLayer = new Container({ label: 'machineLayer', sortableChildren: true });
    this.connectionSolidLayer = new Container({ label: 'connectionSolidLayer', sortableChildren: true });
    this.connectionLiquidLayer = new Container({ label: 'connectionLiquidLayer', sortableChildren: true });
    this.overlayLayer = new Container({ label: 'overlayLayer', sortableChildren: true });

    this.world.addChild(
      this.gridLayer,
      this.connectionSolidLayer,
      this.connectionLiquidLayer,
      this.machineLayer,
      this.overlayLayer,
    );

    this.root.addChild(this.world);
    this.app!.stage.addChild(this.root);
  }

  // ═══════════════════════════════════════════════════════════
  // 坐标转换（画布空间像素坐标 → 网格坐标）
  // ═══════════════════════════════════════════════════════════

  /** 画布空间像素坐标 → 世界坐标 → 网格坐标（整数） */
  screenToGrid(clientX: number, clientY: number): Point {
    const local = this.world.toLocal({ x: clientX, y: clientY });
    return {
      x: Math.floor(local.x / GRID_SIZE),
      y: Math.floor(local.y / GRID_SIZE),
    };
  }

  /** 画布空间像素坐标 → 小数网格坐标 */
  screenToGridFrac(clientX: number, clientY: number): Point {
    const local = this.world.toLocal({ x: clientX, y: clientY });
    return {
      x: local.x / GRID_SIZE,
      y: local.y / GRID_SIZE,
    };
  }

  /** 最近一次画布内 hover 的网格坐标（供键盘快捷键等使用；越界后为 null） */
  getLastHoverGridPos(): Point | null {
    return this.lastHoverGridPos;
  }

  /** 取画布元素（分享截图等外部功能用；未挂载返回 null） */
  getCanvas(): HTMLCanvasElement | null {
    return this.app?.canvas ?? null;
  }

  /** 立即渲染一帧（截图前调用，确保 WebGL 缓冲有最新内容） */
  renderNow(): void {
    this.app?.render();
  }

  // ── 机器 hover 标签 ──

  /** 更新机器 hover 标签显隐：命中机器显示，其余隐藏 */
  private updateHoverLabel(machines: PlacedMachine[], grid: Point): void {
    const hit = machines.find((m) => {
      const cfg = getMachineConfig(m.machineId);
      if (!cfg) return false;
      const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
      return m.x <= grid.x && grid.x < m.x + width && m.y <= grid.y && grid.y < m.y + height;
    });
    const id = hit?.id ?? null;
    // 命中同一机器也要显式置可见：动态子元素重建（供电/选中变化）会把标签重建为隐藏
    if (id === this.hoverLabelMachineId) {
      if (id) {
        const cur = this.machinePool.get(id);
        const curMeta = cur ? MachineRenderer.getMeta(cur) : undefined;
        if (curMeta?.labelContainer) curMeta.labelContainer.visible = true;
      }
      return;
    }

    if (this.hoverLabelMachineId) {
      const prev = this.machinePool.get(this.hoverLabelMachineId);
      const prevMeta = prev ? MachineRenderer.getMeta(prev) : undefined;
      if (prevMeta?.labelContainer) prevMeta.labelContainer.visible = false;
    }
    if (id) {
      const cur = this.machinePool.get(id);
      const curMeta = cur ? MachineRenderer.getMeta(cur) : undefined;
      if (curMeta?.labelContainer) curMeta.labelContainer.visible = true;
    }
    this.hoverLabelMachineId = id;
  }

  /** 隐藏当前 hover 标签（指针越界 / 清理时调用） */
  private hideHoverLabel(): void {
    if (!this.hoverLabelMachineId) return;
    const prev = this.machinePool.get(this.hoverLabelMachineId);
    const prevMeta = prev ? MachineRenderer.getMeta(prev) : undefined;
    if (prevMeta?.labelContainer) prevMeta.labelContainer.visible = false;
    this.hoverLabelMachineId = null;
  }

  // ── 长按拾取（按住机器 500ms → pickupMachine；PixiJS 迁移回归修复） ──

  /** pointerdown 左键：命中自有机器则启动长按定时器 */
  private startLongPressPickup(grid: Point): void {
    const s = useGameStore.getState();
    const ms = s.modeState;
    // 仅在编辑模式支持：BUILD（含放置中）/ DEVICE_SELECT；WIRE/蓝图/批量移动期间不拾取
    if (ms.kind !== 'BUILD' && ms.kind !== 'DEVICE_SELECT') return;
    const m = findMachineAt(grid, s.machines);
    // 后代只读机器不可拾取（子蓝图不可变）
    if (!m || !isViewingOwn(m, s.currentViewingNodeId)) return;
    this.longPressMachineId = m.id;
    this.longPressTimer = setTimeout(() => this.fireLongPressPickup(), LONG_PRESS_MS);
  }

  /** 长按定时器触发：拾取机器进入 BUILD 放置态（与旧 DOM 版语义一致） */
  private fireLongPressPickup(): void {
    const machineId = this.longPressMachineId;
    this.longPressTimer = null;
    this.longPressMachineId = null;
    if (!machineId) return;
    const s = useGameStore.getState();
    const ms = s.modeState;
    // 按住期间模式被切换（Escape 等）或机器已不存在 → 不拾取
    if (ms.kind !== 'BUILD' && ms.kind !== 'DEVICE_SELECT') return;
    if (!s.machines.some((m) => m.id === machineId)) return;
    s.takeSnapshot();
    s.pickupMachine(machineId);
  }

  /** 长按期间指针移动：离开目标机器即取消（等价旧 DOM 的 mouseleave 取消） */
  private trackLongPressTarget(grid: Point): void {
    if (this.longPressTimer === null || this.longPressMachineId === null) return;
    const m = findMachineAt(grid, useGameStore.getState().machines);
    if (m?.id !== this.longPressMachineId) {
      this.cancelLongPressPickup();
    }
  }

  /** 取消长按定时器（松开/越界/移出机器/右键/平移/detach 时调用） */
  private cancelLongPressPickup(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressMachineId = null;
  }

  // ═══════════════════════════════════════════════════════════
  // 事件归一化（唯一接触坐标差异的地方）
  // ═══════════════════════════════════════════════════════════

  /** 指针是否在画布边界内（global 是画布空间坐标，screen 是画布逻辑尺寸） */
  private inCanvas(e: FederatedPointerEvent): boolean {
    const app = this.app;
    if (!app) return false;
    const { width, height } = app.screen;
    const x = e.global.x ?? 0;
    const y = e.global.y ?? 0;
    return x >= 0 && y >= 0 && x <= width && y <= height;
  }

  private toNormalized(e: FederatedPointerEvent): NormalizedPointer {
    const x = e.global.x ?? 0;
    const y = e.global.y ?? 0;
    return {
      x,
      y,
      grid: this.screenToGrid(x, y),
      gridFrac: this.screenToGridFrac(x, y),
      button: e.button ?? 0,
      buttons: e.buttons ?? 0,
      shiftKey: e.shiftKey ?? false,
      ctrlKey: e.ctrlKey ?? e.metaKey ?? false,
    };
  }

  // ── 平移（中键拖拽） ──

  private startPan(n: NormalizedPointer): void {
    this.cancelLongPressPickup();
    this.isPanning = true;
    this.onPanningChange?.(true);
    this.lastMousePos = { x: n.x, y: n.y };
  }

  private movePan(n: NormalizedPointer): void {
    const s = useGameStore.getState();
    s.setPan(clampPan({
      x: s.pan.x + n.x - this.lastMousePos.x,
      y: s.pan.y + n.y - this.lastMousePos.y,
    }, s.gridWidth, s.gridHeight));
    this.lastMousePos = { x: n.x, y: n.y };
  }

  private stopPan(): void {
    if (!this.isPanning) return;
    this.isPanning = false;
    this.onPanningChange?.(false);
  }

  // ── 滚轮缩放（锚定鼠标位置） ──

  private zoomAt(clientX: number, clientY: number, deltaY: number): void {
    const s = useGameStore.getState();
    const frac = this.screenToGridFrac(clientX, clientY);
    const worldPX = frac.x * GRID_SIZE;
    const worldPY = frac.y * GRID_SIZE;

    const delta = -Math.sign(deltaY) * 0.1;
    const newZoom = Math.min(Math.max(s.zoom + delta, 0.18), 3.0);

    s.setZoom(newZoom);
    s.setPan(clampPan({
      x: clientX - worldPX * newZoom,
      y: clientY - worldPY * newZoom,
    }, s.gridWidth, s.gridHeight));
  }

  // ── 事件处理器（箭头函数字段，便于 off） ──

  private onPointerDown = (e: FederatedPointerEvent): void => {
    const n = this.toNormalized(e);
    // 中键 → 平移
    if (n.button === 1) {
      this.startPan(n);
      return;
    }
    // 左键按住机器 → 启动长按拾取（命中判定在方法内）
    if (n.button === 0) {
      this.startLongPressPickup(n.grid);
    }
    this.handlers.onDown(n);
  };

  private onPointerUp = (e: FederatedPointerEvent): void => {
    this.stopPan();
    this.cancelLongPressPickup();
    this.handlers.onUp(this.toNormalized(e));
  };

  private onPointerMove = (e: FederatedPointerEvent): void => {
    const n = this.toNormalized(e);
    if (this.isPanning) {
      this.movePan(n);
      return;
    }
    // 指针越界：清空 hover，跳过预览更新（平移拖拽不受影响）
    if (!this.inCanvas(e)) {
      this.lastHoverGridPos = null;
      this.hideHoverLabel();
      this.cancelLongPressPickup();
      useGameStore.getState().setHoverPosFrac(null);
      return;
    }
    // 长按期间移出目标机器 → 取消拾取
    this.trackLongPressTarget(n.grid);
    this.lastHoverGridPos = n.grid;
    useGameStore.getState().setHoverPosFrac(n.gridFrac);
    this.updateHoverLabel(useGameStore.getState().machines, n.grid);
    this.handlers.onMove(n);
  };

  private onClick = (e: FederatedPointerEvent): void => {
    // PixiJS 对 button 0/1 都合成 click — 中键只平移，不触发提交（M1）
    if (e.button !== 0) return;
    this.onPrimaryTap(e);
  };

  private onTap = (e: FederatedPointerEvent): void => {
    // 触屏 tap（M3）
    this.onPrimaryTap(e);
  };

  private onPointerTap = (e: FederatedPointerEvent): void => {
    // 触控笔只发 pointertap（M3）；鼠标会同时发 click，触屏会同时发 tap，均在此排除
    if (e.pointerType === 'pen') this.onPrimaryTap(e);
  };

  private onPrimaryTap(e: FederatedPointerEvent): void {
    if (this.isPanning) return;
    this.handlers.onTap(this.toNormalized(e));
  }

  private onWheel = (e: FederatedWheelEvent): void => {
    this.zoomAt(e.global.x ?? 0, e.global.y ?? 0, e.deltaY ?? 0);
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
    this.cancelLongPressPickup();
    useGameStore.getState().cancelOperation();
  };

  private bindEvents(): void {
    const app = this.app;
    if (!app) return;
    const stage = app.stage;
    stage.eventMode = 'static';

    stage.on('pointerdown', this.onPointerDown);
    stage.on('pointerup', this.onPointerUp);
    stage.on('pointerupoutside', this.onPointerUp);
    stage.on('globalpointermove', this.onPointerMove);
    stage.on('wheel', this.onWheel);
    stage.on('click', this.onClick);
    stage.on('tap', this.onTap);
    stage.on('pointertap', this.onPointerTap);
    // 右键取消操作走原生 contextmenu（preventDefault 拦截浏览器菜单，M2）
    app.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  private unbindEvents(): void {
    const app = this.app;
    if (!app) return;
    const stage = app.stage;
    stage.off('pointerdown', this.onPointerDown);
    stage.off('pointerup', this.onPointerUp);
    stage.off('pointerupoutside', this.onPointerUp);
    stage.off('globalpointermove', this.onPointerMove);
    stage.off('wheel', this.onWheel);
    stage.off('click', this.onClick);
    stage.off('tap', this.onTap);
    stage.off('pointertap', this.onPointerTap);
    app.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  // ═══════════════════════════════════════════════════════════
  // Store 同步
  // ═══════════════════════════════════════════════════════════

  private fullSync(state: GameState): void {
    this.syncViewport(state);
    this.gridLayer.update(state.gridWidth, state.gridHeight);
    this.syncMachines(state.machines, state);
    this.syncConnections(state.connections, state);
    this.syncPreview(state);
    this.syncOverlays(state);
  }

  private onStoreChange(state: GameState, prevState: GameState): void {
    // 场景图尚未构建时忽略（fullSync 会在 attach 末尾补上）
    if (!this._ready) return;
    if (state.zoom !== prevState.zoom || state.pan !== prevState.pan) {
      this.syncViewport(state);
    }
    if (state.gridWidth !== prevState.gridWidth || state.gridHeight !== prevState.gridHeight) {
      this.gridLayer.update(state.gridWidth, state.gridHeight);
    }

    // 选中 id 集合是否变化（框选拖拽只改 selectionStart/End，不改集合 → 不触发高亮重绘）
    const selChanged = this.selectionIdsChanged(prevState, state);

    if (state.machines !== prevState.machines) {
      this.syncMachines(state.machines, state);
    } else if (selChanged) {
      this.syncSelectionHighlights(state);
    }
    if (state.connections !== prevState.connections) {
      this.syncConnections(state.connections, state);
    } else if (selChanged) {
      this.syncConnectionHighlights(state);
    }

    // modeState 变化：按变化粒度拆分（性能）
    if (state.modeState !== prevState.modeState) {
      const ms = state.modeState;
      const pms = prevState.modeState;
      // WIRE 连线中：只有 preview 字段变化（previewPath/lShapeMode 等）→ 只重画预览线
      const previewOnly = ms.kind === 'WIRE' && pms.kind === 'WIRE'
        && ms.portType === pms.portType
        && (ms.connecting !== null) === (pms.connecting !== null);
      this.syncPreview(state);
      if (!previewOnly) {
        this.syncOverlays(state);
      }
    }
    // hoverPosFrac 变化 → Ghost / 批量移动预览跟随鼠标（P3/P4）
    if (state.hoverPosFrac !== prevState.hoverPosFrac) {
      const ms = state.modeState;
      if (ms.kind === 'BUILD' && ms.placing) {
        this.syncOverlays(state);
      } else if (ms.kind === 'MOVE_SELECTION') {
        this.syncOverlays(state);
      }
    }
  }

  /** 选中 id 集合是否变化（机器 + 连线） */
  private selectionIdsChanged(a: GameState, b: GameState): boolean {
    const aM = this.getSelectedMachineIds(a);
    const bM = this.getSelectedMachineIds(b);
    if (aM.length !== bM.length) return true;
    const bMSet = new Set(bM);
    for (const id of aM) {
      if (!bMSet.has(id)) return true;
    }
    const aC = this.getSelectedConnectionIds(a);
    const bC = this.getSelectedConnectionIds(b);
    if (aC.length !== bC.length) return true;
    const bCSet = new Set(bC);
    for (const id of aC) {
      if (!bCSet.has(id)) return true;
    }
    return false;
  }

  /** 仅更新选中高亮（machines 引用未变时的轻量路径） */
  private syncSelectionHighlights(state: GameState): void {
    const selMachineIds = this.getSelectedMachineIds(state);
    for (const m of state.machines) {
      const container = this.machinePool.get(m.id);
      if (!container) continue;
      const meta = MachineRenderer.getMeta(container);
      if (!meta) continue;
      const selected = selMachineIds.includes(m.id);
      if (meta.isSelected !== selected) {
        MachineRenderer.update(container, m, {
          isPowered: meta.isPowered,
          isSelected: selected,
          isReadonly: meta.isReadonly,
          zoom: state.zoom,
        });
      }
    }
  }

  /** 仅更新连线选中高亮（connections 引用未变时的轻量路径） */
  private syncConnectionHighlights(state: GameState): void {
    const selConnIds = this.getSelectedConnectionIds(state);
    for (const conn of state.connections) {
      const graphics = this.connectionPool.get(conn.id);
      if (!graphics) continue;
      const [outline, fill] = graphics;
      const prevSelected = connSelectedCache.get(outline) ?? false;
      const isSelected = selConnIds.includes(conn.id);
      if (prevSelected !== isSelected) {
        ConnectionRenderer.updateLines(
          outline, fill,
          conn.path, conn.tailFacing, conn.headFacing,
          conn.portType, isSelected,
        );
        connSelectedCache.set(outline, isSelected);
      }
    }
  }

  private syncViewport(state: GameState): void {
    this.world.position.set(state.pan.x, state.pan.y);
    this.world.scale.set(state.zoom);
    // 标签反缩放保持可读性（标签挂在机器容器内，需抵消 world 缩放）
    for (const container of this.machinePool.values()) {
      const meta = MachineRenderer.getMeta(container);
      if (meta?.labelContainer) {
        meta.labelContainer.scale.set(1 / state.zoom);
      }
    }
  }

  // ── 机器同步 ──

  private syncMachines(machines: PlacedMachine[], state: GameState): void {
    const { gridWidth, gridHeight, zoom, currentViewingNodeId: viewingNodeId } = state;

    const powerGrid = getPowerGrid(machines, gridWidth, gridHeight);
    const isPowered = (m: PlacedMachine): boolean => {
      const cfg = getMachineConfig(m.machineId);
      if (!cfg || !cfg.power || cfg.power <= 0) return true;
      const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
      for (let y = m.y; y < m.y + height; y++) {
        for (let x = m.x; x < m.x + width; x++) {
          if (x >= 0 && y >= 0 && x < gridWidth && y < gridHeight && powerGrid[y * gridWidth + x]) {
            return true;
          }
        }
      }
      return false;
    };

    const selMachineIds = this.getSelectedMachineIds(state);

    const currentIds = new Set(machines.map(m => m.id));
    for (const [id, container] of this.machinePool) {
      if (!currentIds.has(id)) {
        this.machineLayer.removeChild(container);
        container.destroy({ children: true });
        this.machinePool.delete(id);
      }
    }

    for (const m of machines) {
      const isReadonly = viewingNodeId != null
        && m.blueprintNodeId != null
        && m.blueprintNodeId !== viewingNodeId;
      const powered = isPowered(m);
      const selected = selMachineIds.includes(m.id);

      let container = this.machinePool.get(m.id);
      if (!container) {
        container = MachineRenderer.create(m, powered, isReadonly);
        MachineRenderer.update(container, m, { isPowered: powered, isSelected: selected, isReadonly, zoom });
        container.cullable = true;
        this.machineLayer.addChild(container);
        this.machinePool.set(m.id, container);
      } else {
        MachineRenderer.update(container, m, { isPowered: powered, isSelected: selected, isReadonly, zoom });
      }
    }
  }

  // ── 连线同步 ──

  private syncConnections(connections: Connection[], state: GameState): void {
    const selConnIds = this.getSelectedConnectionIds(state);
    const { currentViewingNodeId: viewingNodeId } = state;

    const currentIds = new Set(connections.map(c => c.id));

    // 清除不存在的连线
    for (const [id, graphics] of this.connectionPool) {
      if (!currentIds.has(id)) {
        for (const g of graphics) {
          g.removeFromParent();
          g.destroy();
        }
        this.connectionPool.delete(id);
      }
    }

    // 添加/更新连线
    for (const conn of connections) {
      const isSelected = selConnIds.includes(conn.id);
      const isDescendant = viewingNodeId != null
        && conn.blueprintNodeId != null
        && conn.blueprintNodeId !== viewingNodeId;

      const targetLayer = conn.portType === 'Liquid'
        ? this.connectionLiquidLayer
        : this.connectionSolidLayer;

      let graphics = this.connectionPool.get(conn.id);
      if (!graphics) {
        graphics = ConnectionRenderer.createConfirmed(conn, isSelected);
        const zIdx = ConnectionRenderer.layerZIndex(conn.portType);
        for (const g of graphics) {
          g.zIndex = zIdx;
          g.alpha = isDescendant ? 0.5 : 1;
          targetLayer.addChild(g);
        }
        this.connectionPool.set(conn.id, graphics);
        // 同步选中态缓存：否则新建即选中的连线（批量移动提交）在
        // syncConnectionHighlights 中被误判为"从未选中"，退出框选时蓝描边不清理
        connSelectedCache.set(graphics[0], isSelected);
      } else {
        const [outline, fill] = graphics;
        ConnectionRenderer.updateLines(
          outline, fill,
          conn.path, conn.tailFacing, conn.headFacing,
          conn.portType, isSelected,
        );
        connSelectedCache.set(outline, isSelected);
        for (const g of graphics) {
          g.alpha = isDescendant ? 0.5 : 1;
        }
      }
    }
  }

  // ── 预览连线同步 ──

  private syncPreview(state: GameState): void {
    // 清除上一帧的预览
    this.clearPreview();

    const ms = state.modeState;
    if (ms.kind !== 'WIRE' || !ms.connecting) return;

    const { previewPath, activeTailFacing, previewHeadFacing, isValidPath } = ms.connecting;
    if (previewPath.length < 2) return;

    const portType = ms.portType;
    const targetLayer = portType === 'Liquid'
      ? this.connectionLiquidLayer
      : this.connectionSolidLayer;

    const graphics = ConnectionRenderer.createPreview(
      previewPath,
      activeTailFacing,
      previewHeadFacing,
      portType as PortType,
      isValidPath,
    );

    const zIdx = ConnectionRenderer.layerZIndex(portType as PortType);
    for (const g of graphics) {
      g.zIndex = zIdx;
      targetLayer.addChild(g);
    }

    this.previewLines = graphics;
  }

  private clearPreview(): void {
    for (const g of this.previewLines) {
      g.removeFromParent();
      g.destroy();
    }
    this.previewLines = [];
  }

  // ── 辅助 ──

  private getSelectedMachineIds(state: GameState): string[] {
    const ms = state.modeState;
    if (ms.kind === 'DEVICE_SELECT') return ms.selectedMachineIds;
    if (ms.kind === 'MOVE_SELECTION') return ms.originSelectedMachineIds;
    return [];
  }

  private getSelectedConnectionIds(state: GameState): string[] {
    const ms = state.modeState;
    if (ms.kind === 'DEVICE_SELECT') return ms.selectedConnectionIds;
    if (ms.kind === 'MOVE_SELECTION') return ms.originSelectedConnectionIds;
    return [];
  }

  // ── 叠加层同步 ──

  private clearOverlays(): void {
    for (const g of this.overlayGraphics) {
      g.removeFromParent();
      g.destroy();
    }
    this.overlayGraphics = [];
  }

  private syncOverlays(state: GameState): void {
    this.clearOverlays();

    const ms = state.modeState;

    switch (ms.kind) {
      case 'BUILD': {
        // Ghost 放置预览
        if (ms.placing) {
          const config = getMachineConfig(ms.placing.selectedMachineId);
          if (!config) break;
          const hoverFrac = state.hoverPosFrac;
          if (!hoverFrac) break;
          const ghostPos = {
            x: Math.round(hoverFrac.x - ms.placing.buildOffset.x),
            y: Math.round(hoverFrac.y - ms.placing.buildOffset.y),
          };
          // 机器 ghost
          const ghost = OverlayRenderer.createGhostMachine(
            ms.placing.selectedMachineId,
            ms.placing.previewRotation,
            ghostPos,
            true, // TODO: 碰撞检测
          );
          this.overlayLayer.addChild(ghost);
          this.overlayGraphics.push(ghost);
          // 供电范围（用旋转后尺寸，避免 2×3 旋转成 3×2 后范围框错位）
          if (config.supplyDistance > 0) {
            const { width: gw, height: gh } = getRotatedDimensions(
              config.width, config.height, ms.placing.previewRotation,
            );
            const range = OverlayRenderer.createSupplyRange(
              ghostPos, gw, gh, config.supplyDistance,
            );
            this.overlayLayer.addChild(range);
            this.overlayGraphics.push(range);
          }
          // 端口箭头
          const arrows = OverlayRenderer.createGhostArrows(
            ms.placing.selectedMachineId,
            ms.placing.previewRotation,
            ghostPos,
          );
          this.overlayLayer.addChild(arrows);
          this.overlayGraphics.push(arrows);
        }
        break;
      }

      case 'DEVICE_SELECT': {
        // 选框
        if (ms.selectionStart && ms.selectionEnd) {
          const box = OverlayRenderer.createSelectionBox(
            ms.selectionStart, ms.selectionEnd,
          );
          this.overlayLayer.addChild(box);
          this.overlayGraphics.push(box);
        }
        break;
      }

      case 'MOVE_SELECTION': {
        // 批量移动/复制预览：偏移 = 指针所在格 - moveAnchor（floor 包含约定，与 commitBatchMove 一致）
        if (state.hoverPosFrac) {
          const cell = snapToCell(state.hoverPosFrac);
          const offset = {
            x: cell.x - ms.moveAnchor.x,
            y: cell.y - ms.moveAnchor.y,
          };
          const preview = OverlayRenderer.createBatchMovePreview(
            ms.movingMachinesSnapshot,
            ms.movingConnectionsSnapshot,
            offset,
          );
          this.overlayLayer.addChild(preview);
          this.overlayGraphics.push(preview);
        }
        break;
      }

      case 'BLUEPRINT_SELECT': {
        // 子蓝图轮廓
        if (ms.selectedChildNodeId && state.currentViewingNodeId) {
          // 找到子蓝图在当前 viewing node 中的位置
          const viewingNode = state.doc.nodes[state.currentViewingNodeId];
          const childRef = viewingNode?.children.find(
            c => c.childNodeId === ms.selectedChildNodeId,
          );
          const childNode = state.doc.nodes[ms.selectedChildNodeId];
          if (childRef && childNode) {
            const outline = OverlayRenderer.createSubBlueprintOutline(
              childRef.x, childRef.y,
              childNode.gridW, childNode.gridH,
            );
            this.overlayLayer.addChild(outline);
            this.overlayGraphics.push(outline);
          }
        }
        break;
      }

      case 'BLUEPRINT_MOVE': {
        // 蓝图移动预览（isValidPosition 为 false 时变红）
        if (ms.previewOffset && ms.childSummary) {
          const preview = OverlayRenderer.createBlueprintMovePreview(
            ms.previewOffset.x, ms.previewOffset.y,
            ms.childSummary.gridW, ms.childSummary.gridH,
            ms.isValidPosition,
          );
          this.overlayLayer.addChild(preview);
          this.overlayGraphics.push(preview);
        }
        break;
      }
    }
  }
}
