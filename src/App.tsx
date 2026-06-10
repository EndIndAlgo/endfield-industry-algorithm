import { Grid } from './components/Grid';
import { Toolbar } from './components/Toolbar';
import { Header } from './components/Header';
import { LoadingScreen } from './components/LoadingScreen';
import { OperationHints } from './components/OperationHints';
import { calculateContentDimensions } from './utils/gridUtils';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from './store/gameStore';
import { BlueprintList } from './components/BlueprintList';

import { About } from './components/About';
import { SaveDialog } from './components/SaveDialog';
import { saveBlueprint, type Blueprint, getLastBlueprintId, loadBlueprint, setLastBlueprintId } from './utils/storage';
import { Toaster, Toast } from '@chakra-ui/react';
import { toaster } from './utils/toaster';
import { MACHINES } from './config/machines';
import { getRotatedDimensions } from './utils/machineUtils';
import './App.css';
import { parseShareUrl } from './utils/shareUtils';

import { Settings } from './components/Settings';
import { useChineseConverter } from './hooks/useChineseConverter';

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

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    selectedMachines.forEach(m => {
      const config = MACHINES.find(c => c.id === m.machineId);
      if (config) {
        const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
        minX = Math.min(minX, m.x);
        minY = Math.min(minY, m.y);
        maxX = Math.max(maxX, m.x + width);
        maxY = Math.max(maxY, m.y + height);
      }
    });

    selectedConnections.forEach(c => {
      c.path.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + 1);
        maxY = Math.max(maxY, p.y + 1);
      });
    });

    const offsetX = minX;
    const offsetY = minY;

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

    const width = maxX - minX;
    const height = maxY - minY;

    return {
      machines: newMachines,
      connections: newConnections,
      actualWidth: width,
      actualHeight: height
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

  const handleLoadBlueprint = useCallback((bp: Blueprint) => {
    const data = bp.data as any;
    const gw = data.gridWidth ?? Math.max(data.actualWidth + 4, 24);
    const gh = data.gridHeight ?? Math.max(data.actualHeight + 4, 24);
    loadGame(bp.data.machines, bp.data.connections, gw, gh, bp.id, bp.name);
    setLastBlueprintId(bp.id);
    setUiView('editor');
  }, [loadGame, setUiView]);

  const handleCreateNew = useCallback(() => {
    resetGame();
    setLastBlueprintId(null);
    setUiView('editor');
  }, [resetGame, setUiView]);

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
    </>
  );
}
