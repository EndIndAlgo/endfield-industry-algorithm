import { Grid } from './components/Grid';
import { Toolbar } from './components/Toolbar';
import { Header } from './components/Header';
import { LoadingScreen } from './components/LoadingScreen';
import { OperationHints } from './components/OperationHints';
import { calculateContentDimensions, getBoundingBox } from './utils/gridUtils';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from './store/gameStore';
import { BlueprintList } from './components/BlueprintList';

import { About } from './components/About';
import { SaveDialog } from './components/SaveDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { saveBlueprint, type Blueprint, getLastBlueprintId, loadBlueprint, setLastBlueprintId } from './utils/storage';
import { Toaster, Toast } from '@chakra-ui/react';
import { toaster } from './utils/toaster';
import './App.css';
import { parseShareUrl } from './utils/shareUtils';

import { Settings } from './components/Settings';
import { useChineseConverter } from './hooks/useChineseConverter';
import { DEFAULT_CONTENT_PADDING } from './config/constants';

export default function App() {
  // ── 细粒度 store selector ──
  const machines = useGameStore(s => s.machines);
  const connections = useGameStore(s => s.connections);
  const currentBlueprintId = useGameStore(s => s.currentBlueprintId);
  const currentBlueprintName = useGameStore(s => s.currentBlueprintName);
  const loadGame = useGameStore(s => s.loadGame);
  const resetGame = useGameStore(s => s.resetGame);
  const setCurrentBlueprint = useGameStore(s => s.setCurrentBlueprint);
  const undo = useGameStore(s => s.undo);
  const redo = useGameStore(s => s.redo);
  const selectedMachineIds = useGameStore(s => s.selectedMachineIds);
  const selectedConnectionIds = useGameStore(s => s.selectedConnectionIds);
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
  })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 提取选区数据 ──
  const extractSelectionData = useCallback((): Blueprint['data'] | null => {
    if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return null;

    const selectedMachines = machines.filter(m => selectedMachineIds.includes(m.id));
    const selectedConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

    if (selectedMachines.length === 0 && selectedConnections.length === 0) return null;

    const bb = getBoundingBox(selectedMachines, selectedConnections);
    if (bb.width === 0 && bb.height === 0) return null;

    const offsetX = bb.minX;
    const offsetY = bb.minY;

    const newMachines = selectedMachines.map(m => ({
      ...m,
      id: crypto.randomUUID(),
      x: m.x - offsetX,
      y: m.y - offsetY
    }));

    const newConnections = selectedConnections.map(c => ({
      ...c,
      id: crypto.randomUUID(),
      path: c.path.map(p => ({ x: p.x - offsetX, y: p.y - offsetY }))
    }));

    return {
      machines: newMachines,
      connections: newConnections,
      actualWidth: bb.width,
      actualHeight: bb.height
    };
  }, [machines, connections, selectedMachineIds, selectedConnectionIds]);

  // ── 保存逻辑 ──
  const handleTriggerSave = useCallback(() => {
    if (selectedMachineIds.length > 0 || selectedConnectionIds.length > 0) {
      const selectionData = extractSelectionData();
      if (selectionData) {
        setPendingSaveData(selectionData);
        setIsSaveDialogOpen(true);
        return;
      }
    }

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
  }, [machines, connections, currentBlueprintId, currentBlueprintName, selectedMachineIds, selectedConnectionIds, extractSelectionData]);

  // 用 ref 持有最新 handleTriggerSave，避免键盘 effect 依赖频繁变化的值
  const handleTriggerSaveRef = useRef(handleTriggerSave);
  // eslint-disable-next-line react-hooks/refs
  handleTriggerSaveRef.current = handleTriggerSave;

  // ── 全局快捷键（仅注册一次，通过 getState/ref 读取最新状态） ──
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
        handleTriggerSaveRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]); // undo/redo 是 Zustand action，引用稳定 → effect 仅执行一次

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
  }, [pendingSaveData, machines, connections, setCurrentBlueprint]);

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
      </ErrorBoundary>
    </>
  );
}
