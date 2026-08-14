import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Toaster, Toast } from '@chakra-ui/react';
import { useGameStore } from '@/store/gameStore';
import { useChineseConverter } from '@/hooks/useChineseConverter';
import { parseShareUrl } from '@/utils/shareUtils';
import { getBoundingBox } from '@/utils/grid';
import { findRoots, getNode } from '@/domain/doc';
import { DEFAULT_CONTENT_PADDING } from '@/config/constants';
import { toaster } from '@/utils/toaster';
import { PixiGrid } from '@/components/PixiGrid';
import { Toolbar } from '@/components/Toolbar';
import { Header } from '@/components/Header';
import { BreadcrumbNav } from '@/components/BreadcrumbNav';
import { LoadingScreen } from '@/components/LoadingScreen';
import { OperationHints } from '@/components/OperationHints';
import { SaveDialog } from '@/components/SaveDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './App.css';

const BlueprintList = lazy(() => import('./components/BlueprintList').then(m => ({ default: m.BlueprintList })));
const About = lazy(() => import('./components/About').then(m => ({ default: m.About })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));

export default function App() {
  const loadGame = useGameStore(s => s.loadGame);
  const resetGame = useGameStore(s => s.resetGame);
  const undo = useGameStore(s => s.undo);
  const redo = useGameStore(s => s.redo);
  const uiView = useGameStore(s => s.uiView);
  const setUiView = useGameStore(s => s.setUiView);
  const createBlueprint = useGameStore(s => s.createBlueprint);
  const saveCurrentBlueprint = useGameStore(s => s.saveCurrentBlueprint);
  useChineseConverter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<{
    machines: import('@/types').PlacedMachine[];
    connections: import('@/types').Connection[];
    actualWidth: number;
    actualHeight: number;
  } | null>(null);

  // ── 新建回调 ──
  const handleCreateNew = useCallback(() => {
    resetGame();
    createBlueprint();
    setUiView('editor');
  }, [resetGame, createBlueprint, setUiView]);

  // ── 初始加载 ──
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
        title: '加载分享蓝图成功',
        type: 'success',
        duration: 3000,
      });
      return;
    }

    // 恢复上次编辑的蓝图（doc 已随 store 初始化从 localStorage 加载）
    const roots = findRoots(useGameStore.getState().doc);
    if (roots.length > 0) {
      useGameStore.getState().loadBlueprint(roots[0]);
      setUiView('editor');
      setIsLoading(false);
      return;
    }

    handleCreateNew();
    setIsLoading(false);
  })(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 保存逻辑 ──
  const handleTriggerSave = useCallback(() => {
    const store = useGameStore.getState();
    const { machines, connections, modeState, currentViewingNodeId, doc } = store;

    // 有选区 → 提取选区数据另存为新蓝图
    const selMachineIds = modeState.kind === 'DEVICE_SELECT' ? modeState.selectedMachineIds : [];
    const selConnectionIds = modeState.kind === 'DEVICE_SELECT' ? modeState.selectedConnectionIds : [];

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
              y: m.y - offsetY,
            })),
            connections: selectedConnections.map(c => ({
              ...c,
              id: crypto.randomUUID(),
              path: c.path.map(p => ({ x: p.x - offsetX, y: p.y - offsetY })),
            })),
            actualWidth: bb.width,
            actualHeight: bb.height,
          });
          setIsSaveDialogOpen(true);
          return;
        }
      }
    }

    // 无选区 → 保存当前蓝图
    if (currentViewingNodeId) {
      const viewingName = getNode(doc, currentViewingNodeId)?.name;
      // 未命名或默认名 → 弹出命名对话框
      if (!viewingName || viewingName === '未命名蓝图') {
        setIsSaveDialogOpen(true);
        return;
      }
      saveCurrentBlueprint(viewingName);
      toaster.create({
        title: '保存成功',
        type: 'success',
        duration: 2000,
      });
    } else {
      setIsSaveDialogOpen(true);
    }
  }, [saveCurrentBlueprint]);

  // ── 全局快捷键 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      const isY = e.key.toLowerCase() === 'y';
      const isShiftZ = e.key.toLowerCase() === 'z' && e.shiftKey;
      if ((e.ctrlKey || e.metaKey) && (isY || isShiftZ)) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleTriggerSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleTriggerSave]);

  const handleSaveAs = useCallback((name: string) => {
    if (pendingSaveData) {
      // 选区另存：用 loadGame 创建新蓝图包含选区数据
      const { loadGame: lg } = useGameStore.getState();
      lg(
        pendingSaveData.machines,
        pendingSaveData.connections,
        Math.max(pendingSaveData.actualWidth + DEFAULT_CONTENT_PADDING, 24),
        Math.max(pendingSaveData.actualHeight + DEFAULT_CONTENT_PADDING, 24),
        null,
        name,
      );

      toaster.create({
        title: `已将选区另存为 "${name}"`,
        type: 'success',
        duration: 3000,
      });
      setPendingSaveData(null);
    } else {
      // 无选区 → 另存为
      saveCurrentBlueprint(name);
      toaster.create({
        title: '蓝图已创建',
        type: 'success',
        duration: 2000,
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [pendingSaveData, saveCurrentBlueprint]);

  const handleOpenList = useCallback(() => {
    setUiView('list');
  }, [setUiView]);

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
              onCreateNew={handleCreateNew}
            />
          )}

          {uiView === 'editor' && (
            <>
              <Header onSave={handleTriggerSave} onOpen={handleOpenList} />
              <BreadcrumbNav />
              <div className="app-content">
                <PixiGrid />
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
