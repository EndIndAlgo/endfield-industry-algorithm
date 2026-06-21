import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Toaster, Toast } from '@chakra-ui/react';
import { useGameStore } from '@/store/gameStore';
import { useChineseConverter } from '@/hooks/useChineseConverter';
import { saveBlueprint, type Blueprint, getLastBlueprintId, loadBlueprint, setLastBlueprintId } from '@/utils/storage';
import { parseShareUrl } from '@/utils/shareUtils';
import { calculateContentDimensions, getBoundingBox } from '@/utils/grid';
import { DEFAULT_CONTENT_PADDING } from '@/config/constants';
import { toaster } from '@/utils/toaster';
import { Grid } from '@/components/Grid';
import { Toolbar } from '@/components/Toolbar';
import { Header } from '@/components/Header';
import { LoadingScreen } from '@/components/LoadingScreen';
import { OperationHints } from '@/components/OperationHints';
import { SaveDialog } from '@/components/SaveDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './App.css';

const BlueprintList = lazy(() => import('./components/BlueprintList').then(m => ({ default: m.BlueprintList })));
const About = lazy(() => import('./components/About').then(m => ({ default: m.About })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));

export default function App() {
  // ── 细粒度 store selector（仅订阅渲染所需的动作和状态） ──
  const loadGame = useGameStore(s => s.loadGame);
  const resetGame = useGameStore(s => s.resetGame);
  const undo = useGameStore(s => s.undo);
  const redo = useGameStore(s => s.redo);
  const uiView = useGameStore(s => s.uiView);
  const setUiView = useGameStore(s => s.setUiView);
  const blueprintListMode = useGameStore(s => s.blueprintListMode);
  const setBlueprintListMode = useGameStore(s => s.setBlueprintListMode);

  useChineseConverter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Blueprint['data'] | null>(null);

  // ── 加载 / 新建回调 ──
  const handleLoadBlueprint = useCallback((bp: Blueprint) => {
    const data = bp.data as Blueprint['data'] & { gridWidth?: number; gridHeight?: number };
    const gw = data.gridWidth ?? Math.max(data.actualWidth + DEFAULT_CONTENT_PADDING, 24);
    const gh = data.gridHeight ?? Math.max(data.actualHeight + DEFAULT_CONTENT_PADDING, 24);
    loadGame(bp.data.machines, bp.data.connections, gw, gh, bp.id, bp.name);
    setLastBlueprintId(bp.id);
    setUiView('editor');
  }, [loadGame, setUiView]);

  const handleCreateNew = useCallback(() => {
    resetGame();
    setLastBlueprintId(null);
    setUiView('editor');
  }, [resetGame, setUiView]);

  // ── 初始加载（仅挂载时执行一次） ──
  useEffect(() => { (async () => {
    const sharedData = await parseShareUrl();
    if (sharedData) {
      loadGame(
        sharedData.machines,
        sharedData.connections,
        sharedData.gridWidth,
        sharedData.gridHeight,
        null,
        'Shared Blueprint'
      );
      setUiView('editor');
      setIsLoading(false);
      toaster.create({
        title: "加载分享蓝图成功",
        type: "success",
        duration: 3000,
      });
      return;
    }

    const lastId = getLastBlueprintId();
    if (lastId) {
      const bp = loadBlueprint(lastId);
      if (bp) {
        handleLoadBlueprint(bp);
        return;
      }
    }

    handleCreateNew();
    // 初始化逻辑，仅在挂载时执行一次 — 不添加 handleCreateNew/handleLoadBlueprint/loadGame/setUiView 到依赖数组
  })(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 保存逻辑（通过 getState() 读取最新 store 状态，引用稳定） ──
  const handleTriggerSave = useCallback(() => {
    const { machines, connections, modeState, currentBlueprintId, currentBlueprintName } = useGameStore.getState();

    // 从 modeState 提取选区（仅在 DEVICE_SELECT 模式下有意义）
    const selMachineIds = modeState.kind === 'DEVICE_SELECT' ? modeState.selectedMachineIds : [];
    const selConnectionIds = modeState.kind === 'DEVICE_SELECT' ? modeState.selectedConnectionIds : [];

    // 有选区 → 提取选区数据另存
    if (selMachineIds.length > 0 || selConnectionIds.length > 0) {
      const selectedMachines = machines.filter(m => selMachineIds.includes(m.id));
      const selectedConnections = connections.filter(c => selConnectionIds.includes(c.id));

      if (selectedMachines.length > 0 || selectedConnections.length > 0) {
        const bb = getBoundingBox(selectedMachines, selectedConnections);
        if (bb.width > 0 || bb.height > 0) {
          const offsetX = bb.minX;
          const offsetY = bb.minY;
          setPendingSaveData({
            machines: selectedMachines.map(m => ({
              ...m,
              id: crypto.randomUUID(),
              x: m.x - offsetX,
              y: m.y - offsetY
            })),
            connections: selectedConnections.map(c => ({
              ...c,
              id: crypto.randomUUID(),
              path: c.path.map(p => ({ x: p.x - offsetX, y: p.y - offsetY }))
            })),
            actualWidth: bb.width,
            actualHeight: bb.height
          });
          setIsSaveDialogOpen(true);
          return;
        }
      }
    }

    // 无选区 → 直接覆盖保存当前蓝图
    if (currentBlueprintId && currentBlueprintName) {
      const { width, height } = calculateContentDimensions(machines, connections);
      saveBlueprint(currentBlueprintId, currentBlueprintName, {
        machines,
        connections,
        actualWidth: width,
        actualHeight: height
      });
      toaster.create({
        title: "保存成功",
        type: "success",
        duration: 2000,
      });
    } else {
      setIsSaveDialogOpen(true);
    }
  }, []);

  // ── 全局快捷键 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z (Undo)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Y or Ctrl+Shift+Z (Redo)
      const isY = e.key.toLowerCase() === 'y';
      const isShiftZ = e.key.toLowerCase() === 'z' && e.shiftKey;

      if ((e.ctrlKey || e.metaKey) && (isY || isShiftZ)) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleTriggerSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleTriggerSave]); // 三者均为稳定引用 → effect 仅执行一次

  const handleSaveAs = useCallback((name: string) => {
    if (pendingSaveData) {
      saveBlueprint(null, name, pendingSaveData);
      toaster.create({
        title: `已将选区另存为 "${name}"`,
        type: "success",
        duration: 3000,
      });
      setPendingSaveData(null);
    } else {
      const { machines, connections, setCurrentBlueprint } = useGameStore.getState();
      const { width, height } = calculateContentDimensions(machines, connections);
      const newBp = saveBlueprint(null, name, {
        machines,
        connections,
        actualWidth: width,
        actualHeight: height
      });
      setCurrentBlueprint(newBp.id, newBp.name);
      setLastBlueprintId(newBp.id);
      toaster.create({
        title: "蓝图已创建",
        type: "success",
        duration: 2000,
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [pendingSaveData]);

  const handleOpenList = useCallback(() => {
    setBlueprintListMode('manage');
    setUiView('list');
  }, [setBlueprintListMode, setUiView]);

  return (
    <>
      <Toaster toaster={toaster}>
        {(toast) => (
          <Toast.Root key={toast.id}
            minWidth="320px"
            p={4}
            rounded="md"
            shadow="lg"
            listStyleType="none"
          >
            <Toast.Title fontWeight="bold" color="white">{toast.title}</Toast.Title>
            <Toast.Description color="var(--gray-light)">{toast.description}</Toast.Description>
          </Toast.Root>
        )}
      </Toaster>

      <ErrorBoundary>
        {isLoading && (
          <LoadingScreen onComplete={() => setIsLoading(false)} />
        )}

        <Suspense fallback={null}>
          {uiView === 'list' && (
            <BlueprintList
              onSelect={handleLoadBlueprint}
              onCreateNew={handleCreateNew}
              mode={blueprintListMode}
            />
          )}

          {uiView === 'editor' && (
            <>
              <Header onSave={handleTriggerSave} onOpen={handleOpenList} />
              <div className="app-content">
                <Grid />
                <Toolbar />
                <OperationHints />
              </div>
              <SaveDialog
                isOpen={isSaveDialogOpen}
                onClose={() => { setIsSaveDialogOpen(false); setPendingSaveData(null); }}
                onSave={handleSaveAs}
              />
            </>
          )}

          {uiView === 'about' && (
            <About />
          )}

          {uiView === 'settings' && (
            <Settings />
          )}
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
