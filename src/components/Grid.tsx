import React, { useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Machine } from './Machine';
import { GameMode } from '../types';
import type { Point } from '../types';
import { MACHINES } from '../config/machines';
import classNames from 'classnames';
import './Grid.scss';
import { checkCollision } from '../utils/gridUtils';
import { getRotatedDimensions, getRotatedPorts } from '../utils/machineUtils';

const GRID_SIZE = 40; // 需與 CSS 中的 --grid-size 保持一致

export const Grid = () => {
    const {
        machines,
        connections,
        mode,
        selectedMachineId,
        addMachine,
        isWiring,
        updateWiringPreview,
        wiringPreviewPath,
        isWiringValid,
        wiringSource,
        previewRotation,
        rotatePreview,
        zoom,
        gridWidth,
        gridHeight,

        setZoom,
        pan,
        setPan,

        // 框選 / 批量移動
        setBoxSelection,
        commitBoxSelection,
        selectionStart,
        selectionEnd,
        selectedMachineIds,
        selectedConnectionIds,

        startBatchMove,
        startCopySelection,
        commitBatchMove,
        deleteSelected,

        moveAnchor,
        movingMachinesSnapshot,
        movingConnectionsSnapshot,
        cancelOperation
    } = useGameStore();

    const containerRef = useRef<HTMLDivElement>(null);
    const [isPanning, setIsPanning] = React.useState(false);
    const lastMousePos = useRef<Point>({ x: 0, y: 0 });

    // 快捷鍵 E 和 R
    const setMode = useGameStore(s => s.setMode);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isPlacing = !!useGameStore.getState().selectedMachineId;

            if (e.key.toLowerCase() === 'e') {
                if (isPlacing) return;
                setMode(mode === GameMode.WIRE ? GameMode.BUILD : GameMode.WIRE);
            } else if (e.key.toLowerCase() === 'r') {
                rotatePreview();
            } else if (e.key.toLowerCase() === 'x') {
                if (isPlacing) return;
                setMode(mode === GameMode.DEVICE_SELECT ? GameMode.BUILD : GameMode.DEVICE_SELECT);
            } else if (e.key.toLowerCase() === 'f') {
                useGameStore.getState().takeSnapshot();
                deleteSelected();
                // 使用者需求：按 F1 開啟藍圖列表
                // 注意：F1 通常會開啟說明，我們可能需要阻止預設行為
            } else if (e.key === 'F1') {
                e.preventDefault();
                useGameStore.getState().setBlueprintListMode('insert');
                useGameStore.getState().setUiView('list');
            } else if (e.key.toLowerCase() === 'm') {
                // 我們需要 hoverPos 作為錨點。由於無法在此監聽器中輕鬆存取 react state...
                // 實際上，如果我們使用 ref 來儲存 hoverPos，是可以運作的。
                if (hoverPosRef.current) {
                    startBatchMove(hoverPosRef.current);
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (hoverPosRef.current) {
                    startCopySelection(hoverPosRef.current);
                }
            } else if (e.key === 'Escape') {
                cancelOperation();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, setMode, rotatePreview, deleteSelected, startBatchMove, cancelOperation]);

    const getGridPos = (e: React.MouseEvent): Point => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        // 調整縮放和平移
        // 視覺變換順序：scale(zoom) translate(pan)
        // 螢幕座標 = (世界座標 * zoom) + pan
        // 世界座標 = (螢幕座標 - pan) / zoom

        const x = Math.floor(((e.clientX - rect.left) - pan.x) / (GRID_SIZE * zoom));
        const y = Math.floor(((e.clientY - rect.top) - pan.y) / (GRID_SIZE * zoom));
        return { x, y };
    };

    const hoverPosRef = useRef<Point | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        // 滑鼠中鍵 (1)
        if (e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const pos = getGridPos(e);

        if (mode === GameMode.DEVICE_SELECT && e.button === 0) {
            setBoxSelection(pos, pos);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        setIsPanning(false);
        if (mode === GameMode.DEVICE_SELECT && selectionStart) {
            commitBoxSelection(e.shiftKey);
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        // 僅在我們想要阻止頁面滾動時阻止預設行為 (通常適用於可縮放畫布)
        if (e.ctrlKey || e.metaKey) {
            // 瀏覽器縮放交互，也許讓它發生？
            // 標準地圖行為：僅滾輪縮放
        }

        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 1. 在縮放前計算滑鼠下的世界座標
        const worldX = (mouseX - pan.x) / zoom;
        const worldY = (mouseY - pan.y) / zoom;

        const delta = -Math.sign(e.deltaY) * 0.1;
        const newZoom = Math.min(Math.max(zoom + delta, 0.18), 3.0);

        // 2. 計算新的平移量以保持世界座標在滑鼠下方
        // mouseX = worldX * newZoom + newPanX
        // newPanX = mouseX - worldX * newZoom
        const newPanX = mouseX - worldX * newZoom;
        const newPanY = mouseY - worldY * newZoom;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
    };

    const [hoverPos, setHoverPos] = React.useState<Point | null>(null);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            const deltaX = e.clientX - lastMousePos.current.x;
            const deltaY = e.clientY - lastMousePos.current.y;

            setPan({
                x: pan.x + deltaX,
                y: pan.y + deltaY
            });

            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const pos = getGridPos(e);
        setHoverPos(pos);
        hoverPosRef.current = pos;

        if (isWiring) {
            updateWiringPreview(pos);
        }

        if (mode === GameMode.DEVICE_SELECT && selectionStart && e.buttons === 1) {
            setBoxSelection(selectionStart, pos);
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if (isPanning) return; // 如果正在平移則阻止點擊 (雖然 mouseUp 會清除它，但在邏輯上可能需要嚴謹一些)
        // 檢查是否實際拖曳過？目前做簡單檢查。

        const pos = getGridPos(e);

        if (mode === GameMode.BUILD && selectedMachineId) {
            useGameStore.getState().takeSnapshot();
            addMachine(selectedMachineId, pos.x, pos.y, previewRotation);
            // 如果未按住 Ctrl，取消選擇機器
            if (!e.ctrlKey) {
                useGameStore.getState().selectMachine(null);
            }
        } else if (mode === GameMode.MOVE_SELECTION || mode === GameMode.BLUEPRINT_PLACE) {
            useGameStore.getState().takeSnapshot();
            commitBatchMove(pos);
        } else if (mode === GameMode.DEVICE_SELECT) {
            // 點擊是否清除選取？
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        useGameStore.getState().cancelOperation();
    };

    // 預覽機器計算
    const ghostConfig = (mode === GameMode.BUILD && selectedMachineId) ? MACHINES.find(m => m.id === selectedMachineId) : null;
    let isGhostInvalid = false;
    let ghostWidth = 0;
    let ghostHeight = 0;
    let ghostPorts: any[] = [];

    if (ghostConfig && hoverPos) {
        const dims = getRotatedDimensions(ghostConfig.width, ghostConfig.height, previewRotation);
        ghostWidth = dims.width;
        ghostHeight = dims.height;

        const candidate = {
            x: hoverPos.x,
            y: hoverPos.y,
            width: ghostWidth,
            height: ghostHeight
        };

        const isOutOfBounds = candidate.x < 0 || candidate.y < 0 ||
            candidate.x + candidate.width > gridWidth ||
            candidate.y + candidate.height > gridHeight;

        isGhostInvalid = isOutOfBounds || checkCollision(candidate, machines);

        ghostPorts = getRotatedPorts(
            [...ghostConfig.inputs, ...ghostConfig.outputs],
            ghostConfig.width,
            ghostConfig.height,
            previewRotation
        ).map((p, i) => ({
            ...p,
            isInput: i < ghostConfig.inputs.length // 保留輸入端口資訊
        }));
    }

    return (
        <div
            className={classNames('grid-container', { 'wiring-mode': mode === GameMode.WIRE, 'panning': isPanning })}
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setHoverPos(null); setIsPanning(false); }}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
        >
            <div
                className="zoom-content"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: '0 0',
                    width: '100%',
                    height: '100%'
                }}
            >
                <div
                    className="grid-background"
                    style={{
                        width: gridWidth * GRID_SIZE,
                        height: gridHeight * GRID_SIZE
                    }}
                />

                {/* 連線 SVG 圖層 */}
                <svg
                    className="connections-layer"
                    style={{
                        width: gridWidth * GRID_SIZE,
                        height: gridHeight * GRID_SIZE,
                        pointerEvents: 'none',
                    }}
                >
                    {/* 已確認連線 */}
                    {connections.map(conn => {
                        const renderPath: Point[] = [];
                        const EXTEND = 0.45;

                        const extendPoint = (p: Point, dir: number, amt: number): Point => {
                            switch (dir % 4) {
                                case 0: return { x: p.x, y: p.y - amt };
                                case 1: return { x: p.x + amt, y: p.y };
                                case 2: return { x: p.x, y: p.y + amt };
                                case 3: return { x: p.x - amt, y: p.y };
                                default: return { ...p };
                            }
                        };

                        // 尾端向外延伸 (指向來源機器 = tailFacing 反方向)
                        renderPath.push(extendPoint(conn.path[0], (conn.tailFacing + 2) % 4, EXTEND));
                        renderPath.push(...conn.path);
                        // 頭端向外延伸 (headFacing 方向)
                        const last = conn.path[conn.path.length - 1];
                        renderPath.push(extendPoint(last, conn.headFacing, EXTEND));

                        const pts = renderPath.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ');
                        const cls = (base: string) => classNames(base, { selected: selectedConnectionIds.includes(conn.id) });
                        const linePrefix = conn.portType === 'Liquid' ? 'pipe' : 'conveyor';

                        return (
                            <g key={conn.id}>
                                <polyline points={pts} className={cls(`${linePrefix}-line-outline`)} />
                                <polyline points={pts} className={cls(`${linePrefix}-line-fill`)} />
                            </g>
                        );
                    })}

                    {/* 連線預覽 */}
                    {isWiring && wiringPreviewPath.length > 0 && (() => {
                        const EXTEND = 0.45;
                        const extendPoint = (p: Point, dir: number, amt: number): Point => {
                            switch (dir % 4) {
                                case 0: return { x: p.x, y: p.y - amt };
                                case 1: return { x: p.x + amt, y: p.y };
                                case 2: return { x: p.x, y: p.y + amt };
                                case 3: return { x: p.x - amt, y: p.y };
                                default: return { ...p };
                            }
                        };

                        const first = wiringPreviewPath[0];
                        const last = wiringPreviewPath[wiringPreviewPath.length - 1];

                        // 頭端方向
                        let headDir: number = wiringSource?.tailFacing ?? 1;
                        if (wiringPreviewPath.length >= 2) {
                            const prev = wiringPreviewPath[wiringPreviewPath.length - 2];
                            if (last.x > prev.x) headDir = 1;
                            else if (last.x < prev.x) headDir = 3;
                            else if (last.y > prev.y) headDir = 2;
                            else headDir = 0;
                        }

                        // 尾端方向 (反推)
                        let tailDir = headDir;
                        if (wiringPreviewPath.length >= 2) {
                            const second = wiringPreviewPath[1];
                            if (second.x > first.x) tailDir = 1;
                            else if (second.x < first.x) tailDir = 3;
                            else if (second.y > first.y) tailDir = 2;
                            else tailDir = 0;
                        } else if (wiringSource) {
                            tailDir = wiringSource.tailFacing;
                        }

                        const renderPath: Point[] = [];
                        renderPath.push(extendPoint(first, (tailDir + 2) % 4, EXTEND));
                        renderPath.push(...wiringPreviewPath);
                        renderPath.push(extendPoint(last, headDir, EXTEND));

                        const pp = renderPath.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ');
                        const pcls = (base: string) => classNames(base, { 'invalid': !isWiringValid });
                        const prevPrefix = wiringSource?.portType === 'Liquid' ? 'pipe' : 'conveyor';
                        return (
                            <>
                                <polyline points={pp} className={pcls(`${prevPrefix}-preview-outline`)} />
                                <polyline points={pp} className={pcls(`${prevPrefix}-preview-fill`)} />
                            </>
                        );
                    })()}
                </svg>

                {/* 機器圖層 */}
                {machines.map(m => (
                    <Machine
                        key={m.id}
                        data={m}
                        isSelected={selectedMachineIds.includes(m.id)}
                    />
                ))}

                {/* 選取框 */}
                {selectionStart && selectionEnd && mode === GameMode.DEVICE_SELECT && (() => {
                    const x1 = Math.min(selectionStart.x, selectionEnd.x);
                    const y1 = Math.min(selectionStart.y, selectionEnd.y);
                    const x2 = Math.max(selectionStart.x, selectionEnd.x);
                    const y2 = Math.max(selectionStart.y, selectionEnd.y);
                    const width = (x2 - x1) + 1;
                    const height = (y2 - y1) + 1;

                    return (
                        <div
                            className="selection-box"
                            style={{
                                left: x1 * GRID_SIZE,
                                top: y1 * GRID_SIZE,
                                width: width * GRID_SIZE,
                                height: height * GRID_SIZE
                            }}
                        />
                    );
                })()}

                {/* 批量移動預覽 - 連線 */}
                {(mode === GameMode.MOVE_SELECTION || mode === GameMode.BLUEPRINT_PLACE) && moveAnchor && hoverPos && (() => {
                    const offsetX = hoverPos.x - moveAnchor.x;
                    const offsetY = hoverPos.y - moveAnchor.y;

                    return (
                        <svg
                            className="connections-layer"
                            style={{
                                width: gridWidth * GRID_SIZE,
                                height: gridHeight * GRID_SIZE,
                                pointerEvents: 'none',
                                zIndex: 12
                            }}
                        >
                            {movingConnectionsSnapshot.map(conn => {
                                const newPath = conn.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
                                const EXTEND = 0.45;
                                const extendPoint = (p: Point, dir: number, amt: number): Point => {
                                    switch (dir % 4) {
                                        case 0: return { x: p.x, y: p.y - amt };
                                        case 1: return { x: p.x + amt, y: p.y };
                                        case 2: return { x: p.x, y: p.y + amt };
                                        case 3: return { x: p.x - amt, y: p.y };
                                        default: return { ...p };
                                    }
                                };
                                const renderPath: Point[] = [];
                                renderPath.push(extendPoint(newPath[0], (conn.tailFacing + 2) % 4, EXTEND));
                                renderPath.push(...newPath);
                                renderPath.push(extendPoint(newPath[newPath.length - 1], conn.headFacing, EXTEND));
                                const pointsStr = renderPath.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ');
                                const linePrefix = conn.portType === 'Liquid' ? 'pipe' : 'conveyor';
                                return (
                                    <React.Fragment key={`ghost-conn-${conn.id}`}>
                                        <polyline
                                            points={pointsStr}
                                            className={`${linePrefix}-line-outline`}
                                            style={{ opacity: 0.5 }}
                                        />
                                        <polyline
                                            points={pointsStr}
                                            className={`${linePrefix}-line-fill`}
                                            style={{ opacity: 0.5 }}
                                        />
                                    </React.Fragment>
                                );
                            })}
                        </svg>
                    )
                })()}

                {/* 批量移動預覽 - 機器 */}
                {(mode === GameMode.MOVE_SELECTION || mode === GameMode.BLUEPRINT_PLACE) && moveAnchor && hoverPos && movingMachinesSnapshot.map(m => {
                    const offsetX = hoverPos.x - moveAnchor.x;
                    const offsetY = hoverPos.y - moveAnchor.y;
                    const ghostX = m.x + offsetX;
                    const ghostY = m.y + offsetY;

                    return (
                        <div key={`ghost-${m.id}`} style={{ opacity: 0.6, pointerEvents: 'none', zIndex: 20 }}>
                            <Machine
                                data={{ ...m, x: ghostX, y: ghostY }}
                                isSelected={true} // 高亮顯示
                            />
                        </div>
                    );
                })}

                {/* 機器預覽 (單個) */}
                {ghostConfig && hoverPos && (
                    <>
                        {ghostConfig.supplyDistance > 0 && (
                            <div
                                style={{
                                    left: (hoverPos.x - ghostConfig.supplyDistance) * GRID_SIZE,
                                    top: (hoverPos.y - ghostConfig.supplyDistance) * GRID_SIZE,
                                    width: (ghostWidth + 2 * ghostConfig.supplyDistance) * GRID_SIZE,
                                    height: (ghostHeight + 2 * ghostConfig.supplyDistance) * GRID_SIZE,
                                    position: 'absolute',
                                    border: '2px dashed #ffcc00',
                                    backgroundColor: 'rgba(255, 204, 0, 0.2)',
                                    pointerEvents: 'none',
                                    zIndex: 5
                                }}
                            />
                        )}
                        <div
                            className={classNames('machine-ghost', { 'invalid-placement': isGhostInvalid })}
                            style={{
                                left: hoverPos.x * GRID_SIZE,
                                top: hoverPos.y * GRID_SIZE,
                                width: ghostWidth * GRID_SIZE,
                                height: ghostHeight * GRID_SIZE,
                            } as React.CSSProperties}
                        />
                        {/* 預覽箭頭 */}
                        {ghostPorts.map((p, i) => {
                            let arrowX = hoverPos.x + p.x;
                            let arrowY = hoverPos.y + p.y;
                            let rotation = 0;
                            const isInput = p.isInput;

                            // 根據方向向外延伸 1 格
                            switch (p.side) {
                                case 'left':
                                    arrowX -= 1;
                                    rotation = isInput ? 0 : 180; // 輸入：指向機器，輸出：背向機器
                                    break;
                                case 'right':
                                    arrowX += 1; // 因為 p.x 是內部座標
                                    rotation = isInput ? 180 : 0;
                                    break;
                                case 'top':
                                    arrowY -= 1;
                                    rotation = isInput ? 90 : 270;
                                    break;
                                case 'bottom':
                                    arrowY += 1;
                                    rotation = isInput ? 270 : 90;
                                    break;
                            }

                            return (
                                <div
                                    key={`ghost-arrow-${i}`}
                                    className={classNames('ghost-arrow', isInput ? 'input-arrow' : 'output-arrow')}
                                    style={{
                                        left: arrowX * GRID_SIZE,
                                        top: arrowY * GRID_SIZE,
                                        transform: `rotate(${rotation}deg)`
                                    } as React.CSSProperties}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 6 15 12 9 18"></polyline>
                                    </svg>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

        </div>
    );
};
