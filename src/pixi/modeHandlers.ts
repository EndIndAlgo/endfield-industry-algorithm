import { useGameStore } from '@/store/gameStore';
import type { Point } from '@/types';
import type { FactoryDoc, CommittedNode } from '@/domain/doc';
import { findPortOuterCellAt, findMachineAt, getPortOuterCells } from '@/utils/grid';
import { validateChildPlacement } from '@/utils/blueprintPlacement';
import { isViewingOwn } from '@/utils/blueprintGuard';

/**
 * 纯函数模式处理器
 *
 * 从 useWireMode / useSelectionMode / useBlueprintSelectMode 逐条搬移，
 * 只接收已归一化的指针事件（画布空间坐标 + 网格坐标），不再接触坐标系差异。
 */

/** 归一化后的指针事件（画布空间像素坐标 + 已换算网格坐标） */
export interface NormalizedPointer {
  /** 画布空间像素坐标（PixiJS e.global，与 world.toLocal 同系） */
  x: number;
  y: number;
  /** 整数网格坐标 */
  grid: Point;
  /** 小数网格坐标 */
  gridFrac: Point;
  button: number;
  buttons: number;
  shiftKey: boolean;
  ctrlKey: boolean;
}

export interface ModeHandlerContext {
  /** 最近一次画布内 hover 的网格坐标（指针越界后为 null） */
  getHoverGridPos: () => Point | null;
}

export interface ModeHandlers {
  onDown: (e: NormalizedPointer) => void;
  onUp: (e: NormalizedPointer) => void;
  onMove: (e: NormalizedPointer) => void;
  /** click(左键)/tap/pointertap 统一提交入口，按 modeState.kind 分发 */
  onTap: (e: NormalizedPointer) => void;
}

/**
 * 网格包含约定：格 (n,n) 对应连续坐标范围 [n, n+1) × [n, n+1)。
 * 所有"连续分数坐标 → 目标格"的转换统一用 floor（与 screenToGrid 一致），
 * 禁止用 Math.round——round 会让 (0,0) 格错误对应 (-0.5, 0.5) 范围，
 * 造成批量移动/蓝图放置的预览与提交错位半格。
 */
export function snapToCell(frac: Point): Point {
  return { x: Math.floor(frac.x), y: Math.floor(frac.y) };
}

// ── BLUEPRINT_SELECT 命中辅助（来自 useBlueprintSelectMode） ──

function isInSubtree(
  nodeId: string,
  rootId: string,
  doc: FactoryDoc,
  visited: Set<string> = new Set(),
): boolean {
  // 环防护：异常数据下防止无限递归
  if (visited.has(rootId)) return false;
  visited.add(rootId);

  const snapshot = doc.nodes[rootId];
  if (!snapshot) return false;
  for (const child of snapshot.children) {
    if (child.childNodeId === nodeId) return true;
    if (isInSubtree(nodeId, child.childNodeId, doc, visited)) return true;
  }
  return false;
}

function findDirectChildContaining(
  nodeId: string,
  viewing: CommittedNode,
  doc: FactoryDoc,
): string | null {
  for (const child of viewing.children) {
    if (child.childNodeId === nodeId || isInSubtree(nodeId, child.childNodeId, doc)) {
      return child.childNodeId;
    }
  }
  return null;
}

export function createModeHandlers(ctx: ModeHandlerContext): ModeHandlers {
  // ── WIRE：连线交互（来自 useWireMode） ──
  const wire = {
    onTap(e: NormalizedPointer) {
      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind !== 'WIRE') return;

      if (ms.connecting) {
        if (ms.connecting.isValidPath) {
          s.commitConnection(); // 快照由 commitConnection 在真正写入前拍摄
        }
        return;
      }

      const portType = ms.portType;
      const machine = findMachineAt(e.grid, s.machines);
      if (machine) {
        // 子蓝图只读：后代机器的输出口不可作为连线起点
        if (!isViewingOwn(machine, s.currentViewingNodeId)) return;
        const ports = getPortOuterCells(machine, portType);
        if (ports.length > 0) {
          s.startConnecting(ports, portType);
          const hover = ctx.getHoverGridPos();
          if (hover) s.updatePreview(hover);
        }
        return;
      }

      const outerResult = findPortOuterCellAt(e.grid, s.machines, portType);
      if (outerResult) {
        s.startConnecting([{ pos: outerResult.pos, facing: outerResult.facing }], portType);
        const hover = ctx.getHoverGridPos();
        if (hover) s.updatePreview(hover);
      }
    },
    onMove(e: NormalizedPointer) {
      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind === 'WIRE' && ms.connecting) {
        s.updatePreview(e.grid);
      }
    },
  };

  // ── DEVICE_SELECT：框选 + 拖拽已选中机器进入批量移动 + 批量移动提交（来自 useSelectionMode） ──
  // 拖拽判定：按在已选中机器上，移动超过阈值像素后 startBatchMove；
  // 未超过阈值松开 → 走 commitBoxSelection（点击/Shift 反选语义不变）
  const DRAG_THRESHOLD_PX = 6;
  let dragOrigin: { x: number; y: number } | null = null;
  let dragArmed = false;   // 按下时落在已选中机器上
  let dragStarted = false; // 已越过阈值触发批量移动

  const select = {
    onDown(e: NormalizedPointer) {
      const s = useGameStore.getState();
      dragOrigin = null;
      dragArmed = false;
      dragStarted = false;
      if (s.modeState.kind === 'DEVICE_SELECT' && e.button === 0) {
        const ms = s.modeState;
        const hit = findMachineAt(e.grid, s.machines);
        dragArmed = hit != null && ms.selectedMachineIds.includes(hit.id);
        dragOrigin = { x: e.x, y: e.y };
        s.setBoxSelection(e.grid, e.grid);
      }
    },
    onUp(e: NormalizedPointer) {
      const s = useGameStore.getState();
      const ms = s.modeState;
      const started = dragStarted;
      dragOrigin = null;
      dragArmed = false;
      dragStarted = false;
      if (ms.kind === 'DEVICE_SELECT' && ms.selectionStart && !started) {
        // 单击空白格（无移动、无实体命中、非 Shift）→ 清空选区（否则只能 Esc 退出模式重进）
        const sameCell = ms.selectionEnd
          && ms.selectionStart.x === ms.selectionEnd.x
          && ms.selectionStart.y === ms.selectionEnd.y;
        if (sameCell && !e.shiftKey) {
          const hitMachine = findMachineAt(e.grid, s.machines);
          const hitConn = s.connections.some(c => c.path.some(p => p.x === e.grid.x && p.y === e.grid.y));
          if (!hitMachine && !hitConn) {
            s.clearSelection();
            return;
          }
        }
        s.commitBoxSelection(e.shiftKey);
      }
    },
    onMove(e: NormalizedPointer) {
      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind !== 'DEVICE_SELECT' || !ms.selectionStart || e.buttons !== 1) return;

      if (dragArmed && !dragStarted && dragOrigin) {
        const dx = e.x - dragOrigin.x;
        const dy = e.y - dragOrigin.y;
        if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          dragStarted = true;
          s.startBatchMove();
          return;
        }
      }
      s.setBoxSelection(ms.selectionStart, e.grid);
    },
    onTapCommit(e: NormalizedPointer) {
      const s = useGameStore.getState();
      // 快照由 commitBatchMove 内部在提交前统一拍摄（避免双重快照导致 undo 需按两次）
      s.commitBatchMove(e.grid);
    },
  };

  // ── BLUEPRINT_SELECT：子蓝图命中 + 拖拽移动已有子蓝图（来自 useBlueprintSelectMode） ──
  // 拖拽判定与 DEVICE_SELECT 一致：按住选中的子蓝图超过阈值像素 → BLUEPRINT_MOVE(isInserting=false)
  let bpDragOrigin: { x: number; y: number } | null = null;
  let bpDragArmed = false;
  let bpDragStarted = false;

  const bpSelect = {
    onDown(e: NormalizedPointer) {
      bpDragOrigin = null;
      bpDragArmed = false;
      bpDragStarted = false;
      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind !== 'BLUEPRINT_SELECT' || e.button !== 0 || !ms.selectedChildNodeId) return;
      const { doc, currentViewingNodeId } = s;
      if (!currentViewingNodeId) return;
      const viewing = doc.nodes[currentViewingNodeId];
      const childRef = viewing?.children.find(c => c.childNodeId === ms.selectedChildNodeId);
      const childNode = doc.nodes[ms.selectedChildNodeId];
      if (!viewing || !childRef || !childNode) return;
      const g = e.grid;
      if (g.x >= childRef.x && g.x < childRef.x + childNode.gridW
          && g.y >= childRef.y && g.y < childRef.y + childNode.gridH) {
        bpDragArmed = true;
        bpDragOrigin = { x: e.x, y: e.y };
      }
    },
    onMove(e: NormalizedPointer) {
      if (!bpDragArmed || bpDragStarted || !bpDragOrigin) return;
      const dx = e.x - bpDragOrigin.x;
      const dy = e.y - bpDragOrigin.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      bpDragStarted = true;

      const s = useGameStore.getState();
      const ms = s.modeState;
      if (ms.kind !== 'BLUEPRINT_SELECT' || !ms.selectedChildNodeId) {
        bpDragArmed = false;
        return;
      }
      const { doc, currentViewingNodeId } = s;
      if (!currentViewingNodeId) return;
      const viewing = doc.nodes[currentViewingNodeId];
      const childRef = viewing?.children.find(c => c.childNodeId === ms.selectedChildNodeId);
      const childNode = doc.nodes[ms.selectedChildNodeId];
      if (!viewing || !childRef || !childNode) return;

      useGameStore.setState({
        modeState: {
          kind: 'BLUEPRINT_MOVE',
          childNodeId: ms.selectedChildNodeId,
          childSummary: {
            nodeId: childNode.nodeId,
            name: childNode.name,
            gridW: childNode.gridW,
            gridH: childNode.gridH,
          },
          // moveAnchor 存"抓取点相对锚点的偏移"（childRef 位置 − 按下格）：
          // 预览/提交位置 = 指针格 + moveAnchor，插入流（moveAnchor 0,0）共用同一公式
          moveAnchor: { x: childRef.x - e.grid.x, y: childRef.y - e.grid.y },
          previewOffset: null,
          isCopying: false,
          isInserting: false,
          isValidPosition: true,
        },
      });
    },
    onUp() {
      bpDragArmed = false;
      bpDragOrigin = null;
      bpDragStarted = false;
    },
    onTap(e: NormalizedPointer) {
      const s = useGameStore.getState();
      if (s.modeState.kind !== 'BLUEPRINT_SELECT') return;

      const pos = e.grid;
      const { machines, doc, currentViewingNodeId } = s;
      if (!currentViewingNodeId) return;

      const viewing = doc.nodes[currentViewingNodeId];
      if (!viewing || viewing.children.length === 0) return;

      // 多格机器按完整占地命中（findMachineAt 用旋转后尺寸判定，避免只能点左上角 1 格）
      const clickedMachine = findMachineAt(pos, machines);

      if (!clickedMachine || !clickedMachine.blueprintNodeId) {
        useGameStore.setState({
          modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null },
        });
        return;
      }

      if (clickedMachine.blueprintNodeId === currentViewingNodeId) {
        useGameStore.setState({
          modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: null },
        });
        return;
      }

      const childNodeId = findDirectChildContaining(
        clickedMachine.blueprintNodeId,
        viewing,
        doc,
      );

      useGameStore.setState({
        modeState: { kind: 'BLUEPRINT_SELECT', selectedChildNodeId: childNodeId },
      });
    },
  };

  return {
    onDown: (e) => {
      select.onDown(e);
      bpSelect.onDown(e);
    },
    onUp: (e) => {
      select.onUp(e);
      bpSelect.onUp();
    },
    onMove: (e) => {
      wire.onMove(e);
      select.onMove(e);
      bpSelect.onMove(e);
      // BLUEPRINT_MOVE：预览偏移跟随指针（floor 包含约定）+ moveAnchor 抓取偏移，并实时校验位置合法性
      const ms = useGameStore.getState().modeState;
      if (ms.kind === 'BLUEPRINT_MOVE') {
        const s = useGameStore.getState();
        const anchor = { x: e.grid.x + ms.moveAnchor.x, y: e.grid.y + ms.moveAnchor.y };
        // 移动已有子蓝图：校验要排除该子蓝图自身的展平内容（否则原位置自碰撞）
        let machines = s.machines;
        let connections = s.connections;
        if (!ms.isInserting) {
          const belongsToChild = (bid: string | undefined): boolean => {
            if (!bid) return false;
            return bid === ms.childNodeId || isInSubtree(bid, ms.childNodeId, s.doc);
          };
          machines = machines.filter(m => !belongsToChild(m.blueprintNodeId));
          connections = connections.filter(c => !belongsToChild(c.blueprintNodeId));
        }
        const valid = validateChildPlacement(
          s.doc,
          ms.childNodeId,
          anchor.x,
          anchor.y,
          {
            machines,
            connections,
            gridWidth: s.gridWidth,
            gridHeight: s.gridHeight,
          },
        );
        useGameStore.setState({
          modeState: {
            ...ms,
            previewOffset: anchor,
            isValidPosition: valid,
          },
        });
      }
    },
    onTap: (e) => {
      const s = useGameStore.getState();
      const ms = s.modeState;

      if (ms.kind === 'WIRE') {
        wire.onTap(e);
        return;
      }
      if (ms.kind === 'MOVE_SELECTION') {
        select.onTapCommit(e);
        return;
      }
      if (ms.kind === 'BLUEPRINT_SELECT') {
        bpSelect.onTap(e);
        return;
      }
      if (ms.kind === 'BLUEPRINT_MOVE') {
        const anchor = { x: e.grid.x + ms.moveAnchor.x, y: e.grid.y + ms.moveAnchor.y };
        if (ms.isInserting) {
          // 插入流：锚点 = 指针所在格（commitInsert 内部校验合法性）
          s.commitInsert(e.grid.x, e.grid.y);
        } else {
          // 移动流：锚点 = 指针格 + 抓取偏移（commitMove 落 doc 并重展平）
          s.commitMove(ms.childNodeId, anchor.x, anchor.y);
        }
        return;
      }
      if (ms.kind === 'BUILD' && ms.placing) {
        const frac = s.hoverPosFrac;
        const gridPos = frac
          ? {
              x: Math.round(frac.x - ms.placing.buildOffset.x),
              y: Math.round(frac.y - ms.placing.buildOffset.y),
            }
          : e.grid;
        // 快照由 addMachine 在真正写入前拍摄（碰撞/越界失败不产生空转撤销步）
        s.addMachine(ms.placing.selectedMachineId, gridPos.x, gridPos.y, ms.placing.previewRotation);
        if (!e.ctrlKey) {
          s.selectMachine(null);
        }
      }
    },
  };
}
