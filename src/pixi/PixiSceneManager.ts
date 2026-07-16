import { Application, Container, Graphics, extensions, CullerPlugin } from 'pixi.js';
import { useGameStore } from '@/store/gameStore';
import { GridLayer } from './layers/GridLayer';
import { MachineRenderer } from './renderers/MachineRenderer';
import { ConnectionRenderer } from './renderers/ConnectionRenderer';
import { OverlayRenderer } from './renderers/OverlayRenderer';
import { preloadMachineTextures } from './TextureLoader';
import { getMachineConfig } from '@/config/machines';
import { getRotatedDimensions, buildPowerGrid } from '@/utils/machineUtils';
import type { GameState } from '@/store/slices/types';
import type { PlacedMachine, Connection, PortType, Point } from '@/types';
import { GRID_SIZE } from '@/config/constants';

// 注册视口裁剪插件（提前于 Application.init）
extensions.add(CullerPlugin);

/**
 * PixiJS 场景管理器
 *
 * 负责：Application 生命周期、场景图构建、Zustand store 订阅与同步。
 * 采用命令式同步模式：store 变化 → diff → 增量更新 PixiJS 场景图，
 * 不经过 React 渲染周期。
 */
export class PixiSceneManager {
  app!: Application;
  root!: Container;
  world!: Container;
  gridLayer!: GridLayer;
  machineLayer!: Container;
  connectionSolidLayer!: Container;
  connectionLiquidLayer!: Container;
  overlayLayer!: Container;

  /** 机器对象池 */
  private machinePool = new Map<string, Container>();
  /** 已确认连线对象池：connectionId → [outline, fill] */
  private connectionPool = new Map<string, Graphics[]>();
  /** 预览连线 Graphics 引用（用于清除） */
  private previewLines: Graphics[] = [];
  /** 叠加层 Graphics 引用（Ghost、选框、蓝图轮廓等） */
  private overlayGraphics: Container[] = [];

  private unsubscribe: (() => void) | null = null;
  private _mounted = false;

  // ── 生命周期 ──

  async mount(containerEl: HTMLElement): Promise<void> {
    if (this._mounted) return;

    this.app = new Application();
    await this.app.init({
      resizeTo: containerEl,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgl',
    });

    if (!containerEl.contains(this.app.canvas)) {
      containerEl.appendChild(this.app.canvas);
    }
    this.app.canvas.style.position = 'absolute';
    this.app.canvas.style.top = '0';
    this.app.canvas.style.left = '0';

    await preloadMachineTextures();

    this.buildSceneGraph();
    this._mounted = true;

    this.fullSync(useGameStore.getState());

    this.unsubscribe = useGameStore.subscribe((state, prevState) => {
      this.onStoreChange(state, prevState);
    });
  }

  destroy(): void {
    if (!this._mounted) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.machinePool.clear();
    this.connectionPool.clear();
    this.previewLines = [];
    this.app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    );
    this._mounted = false;
  }

  // ── 场景图构建 ──

  private buildSceneGraph(): void {
    this.root = new Container({ label: 'root' });
    this.world = new Container({ label: 'world' });

    this.gridLayer = new GridLayer();
    this.gridLayer.label = 'gridLayer';

    this.machineLayer = new Container({ label: 'machineLayer', sortableChildren: true });
    this.connectionSolidLayer = new Container({ label: 'connectionSolidLayer', sortableChildren: true });
    this.connectionLiquidLayer = new Container({ label: 'connectionLiquidLayer', sortableChildren: true });
    this.overlayLayer = new Container({ label: 'overlayLayer', sortableChildren: true });

    this.world.addChild(
      this.gridLayer,
      this.connectionSolidLayer,
      this.machineLayer,
      this.connectionLiquidLayer,
      this.overlayLayer,
    );

    this.root.addChild(this.world);
    this.app.stage.addChild(this.root);
  }

  // ── 坐标转换（供 PixiJS 事件 hook 使用） ──

  /** 屏幕像素坐标 → 世界坐标 → 网格坐标（整数） */
  screenToGrid(clientX: number, clientY: number): Point {
    const local = this.world.toLocal({ x: clientX, y: clientY });
    return {
      x: Math.floor(local.x / GRID_SIZE),
      y: Math.floor(local.y / GRID_SIZE),
    };
  }

  /** 屏幕像素坐标 → 小数网格坐标 */
  screenToGridFrac(clientX: number, clientY: number): Point {
    const local = this.world.toLocal({ x: clientX, y: clientY });
    return {
      x: local.x / GRID_SIZE,
      y: local.y / GRID_SIZE,
    };
  }

  // ── Store 同步 ──

  private fullSync(state: GameState): void {
    this.syncViewport(state);
    this.gridLayer.update(state.gridWidth, state.gridHeight);
    this.syncMachines(state.machines, state);
    this.syncConnections(state.connections, state);
    this.syncPreview(state);
    this.syncOverlays(state);
  }

  private onStoreChange(state: GameState, prevState: GameState): void {
    if (state.zoom !== prevState.zoom || state.pan !== prevState.pan) {
      this.syncViewport(state);
    }
    if (state.gridWidth !== prevState.gridWidth || state.gridHeight !== prevState.gridHeight) {
      this.gridLayer.update(state.gridWidth, state.gridHeight);
    }
    if (state.machines !== prevState.machines) {
      this.syncMachines(state.machines, state);
    }
    if (state.connections !== prevState.connections) {
      this.syncConnections(state.connections, state);
    }
    // modeState 变化：更新选中状态 + 预览 + 叠加层
    if (state.modeState !== prevState.modeState) {
      this.syncMachines(state.machines, state);
      this.syncConnections(state.connections, state);
      this.syncPreview(state);
      this.syncOverlays(state);
    }
  }

  private syncViewport(state: GameState): void {
    this.world.position.set(state.pan.x, state.pan.y);
    this.world.scale.set(state.zoom);
  }

  // ── 机器同步 ──

  private syncMachines(machines: PlacedMachine[], state: GameState): void {
    const { gridWidth, gridHeight, zoom, currentViewingNodeId: viewingNodeId } = state;

    const powerGrid = buildPowerGrid(machines, gridWidth, gridHeight, getMachineConfig);
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
      } else {
        const [outline, fill] = graphics;
        ConnectionRenderer.updateLines(
          outline, fill,
          conn.path, conn.tailFacing, conn.headFacing,
          conn.portType, isSelected,
        );
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
          // 供电范围
          if (config.supplyDistance > 0) {
            const range = OverlayRenderer.createSupplyRange(
              ghostPos, config.width, config.height, config.supplyDistance,
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

      case 'BLUEPRINT_SELECT': {
        // 子蓝图轮廓
        if (ms.selectedChildNodeId && state.blueprintRegistry[ms.selectedChildNodeId]) {
          // 找到子蓝图在当前 viewing node 中的位置
          const viewingNode = state.currentViewingNodeId
            ? state.blueprintRegistry[state.currentViewingNodeId]
            : null;
          const childRef = viewingNode?.children.find(
            c => c.childNodeId === ms.selectedChildNodeId,
          );
          if (childRef) {
            const snap = state.blueprintRegistry[ms.selectedChildNodeId];
            const outline = OverlayRenderer.createSubBlueprintOutline(
              childRef.x, childRef.y,
              snap.totalMask.width, snap.totalMask.height,
            );
            this.overlayLayer.addChild(outline);
            this.overlayGraphics.push(outline);
          }
        }
        break;
      }

      case 'BLUEPRINT_MOVE': {
        // 蓝图移动预览
        if (ms.previewOffset && state.blueprintRegistry[ms.childNodeId]) {
          const snap = state.blueprintRegistry[ms.childNodeId];
          const preview = OverlayRenderer.createBlueprintMovePreview(
            ms.previewOffset.x, ms.previewOffset.y,
            snap.totalMask.width, snap.totalMask.height,
          );
          this.overlayLayer.addChild(preview);
          this.overlayGraphics.push(preview);
        }
        break;
      }
    }
  }
}
