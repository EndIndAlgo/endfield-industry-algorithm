import { Grid } from './components/Grid';
import { Toolbar } from './components/Toolbar';
import { Header } from './components/Header';
import { LoadingScreen } from './components/LoadingScreen';
import { OperationHints } from './components/OperationHints';
import { calculateContentDimensions } from './utils/gridUtils';
import { useState, useEffect } from 'react';
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

// ... imports
import { Settings } from './components/Settings';
import { useChineseConverter } from './hooks/useChineseConverter';

export default function App() {
  const {
    machines,
    connections,
    currentBlueprintId,
    currentBlueprintName,
    loadGame,
    resetGame,
    setCurrentBlueprint,
    undo,
    redo,
    selectedMachineIds,
    selectedConnectionIds,
    uiView,
    setUiView,
    blueprintListMode,
    setBlueprintListMode
  } = useGameStore();

  useChineseConverter();

  // const [view, setView] = useState<'list' | 'editor'>('list'); // Replaced by store state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Blueprint['data'] | null>(null);

  // Initial load logic
  useEffect(() => { (async () => {
    // Share URL takes priority over last blueprint
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
        title: "載入分享藍圖成功",
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
  })(); }, []); // Run once on mount

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
  }, [currentBlueprintId, currentBlueprintName, machines, connections, selectedMachineIds, selectedConnectionIds]);

  const extractSelectionData = (): Blueprint['data'] | null => {
    if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return null;

    const selectedMachines = machines.filter(m => selectedMachineIds.includes(m.id));
    const selectedConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

    if (selectedMachines.length === 0 && selectedConnections.length === 0) return null;

    // Calculate Bounding Box
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

    // Normalize to (0, 0)
    // Use a small padding if desired, or just strict 0,0. 
    // Usually user wants top-leftmost item at 0,0 or 1,1. Let's do 0,0 to be clean.
    const offsetX = minX;
    const offsetY = minY;

    const newMachines = selectedMachines.map(m => ({
      ...m,
      id: crypto.randomUUID(), // New IDs for safe insertion
      x: m.x - offsetX,
      y: m.y - offsetY
    }));

    // Connections 不再依賴機器 ID → 直接克隆並偏移路徑
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
  };

  const handleTriggerSave = () => {
    // Check for selection first
    if (selectedMachineIds.length > 0 || selectedConnectionIds.length > 0) {
      const selectionData = extractSelectionData();
      if (selectionData) {
        setPendingSaveData(selectionData);
        setIsSaveDialogOpen(true);
        return;
      }
    }

    // Normal Save
    if (currentBlueprintId && currentBlueprintName) {
      // Quick Save
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
      // Save As
      setIsSaveDialogOpen(true);
    }
  };

  const handleSaveAs = (name: string) => {
    if (pendingSaveData) {
      // Save Selection
      saveBlueprint(null, name, pendingSaveData);
      toaster.create({
        title: `已將選取內容另存為 "${name}"`,
        type: "success",
        duration: 3000,
      });
      setPendingSaveData(null);
      // Do NOT switch to new blueprint
    } else {
      // Normal Save As
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
        title: "藍圖已建立",
        type: "success",
        duration: 2000,
      });
      // Clear URL params if saving a shared blueprint
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleLoadBlueprint = (bp: Blueprint) => {
    const data = bp.data as any;
    const gw = data.gridWidth ?? Math.max(data.actualWidth + 4, 24);
    const gh = data.gridHeight ?? Math.max(data.actualHeight + 4, 24);
    loadGame(bp.data.machines, bp.data.connections, gw, gh, bp.id, bp.name);
    setLastBlueprintId(bp.id);
    setUiView('editor');
  };

  const handleCreateNew = () => {
    resetGame();
    setLastBlueprintId(null);
    setUiView('editor');
  };

  const handleOpenList = () => {
    setBlueprintListMode('manage');
    setUiView('list');
  };

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

      {/* Loading Screen Overlay */}
      {isLoading && (
        <LoadingScreen onComplete={() => setIsLoading(false)} />
      )}

      {/* Main Content Rendered Behind */}
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


