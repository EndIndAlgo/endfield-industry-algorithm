import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { Machine } from './Machine';
import { GameMode } from '../types';
import type { Point, PortConfig } from '../types';
import { MACHINES, getMachineConfig } from '../config/machines';
import classNames from 'classnames';
import './Grid.scss';
import { checkCollision } from '../utils/gridUtils';
import { getRotatedDimensions, getRotatedPorts, buildPowerGrid } from '../utils/machineUtils';

const GRID_SIZE = 40; // 需与 CSS 中的 --grid-size 保持一致
const EXTEND = 0.45;

/** 将路径端点沿方向延伸，使连线视觉上深入机器内部 */
const extendPoint = (p: Point, dir: number, amt: number): Point => {
    switch (dir % 4) {
        case 0: return { x: p.x, y: p.y - amt };
        case 1: return { x: p.x + amt, y: p.y };
        case 2: return { x: p.x, y: p.y + amt };
        case 3: return { x: p.x - amt, y: p.y };
        default: return { ...p };
    }
};

/** 将路径转为 SVG polyline points 字符串 */
const pathToPoints = (path: Point[], tailFacing: number, headFacing: number): string => {
    const renderPath: Point[] = [];
    renderPath.push(extendPoint(path[0], (tailFacing + 2) % 4, EXTEND));
    renderPath.push(...path);
    const last = path[path.length - 1];
    renderPath.push(extendPoint(last, headFacing, EXTEND));
    return renderPath.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ');
};

export const Grid = () => {
    // ── 细粒度 store selector：每个字段独立订阅，避免无关变更触发重渲染 ──
    // 画布（高频：滚轮缩放/平移）
    const zoom = useGameStore(s => s.zoom);
    const pan = useGameStore(s => s.pan);
    const gridWidth = useGameStore(s => s.gridWidth);
    const gridHeight = useGameStore(s => s.gridHeight);
    // 机器与连线（中频：编辑操作）
    const machines = useGameStore(s => s.machines);
    const connections = useGameStore(s => s.connections);

    // 模式（低频：用户切换）
    const mode = useGameStore(s => s.mode);
    const selectedMachineId = useGameStore(s => s.selectedMachineId);
    const previewRotation = useGameStore(s => s.previewRotation);
    const setMode = useGameStore(s => s.setMode);
    const rotatePreview = useGameStore(s => s.rotatePreview);

    // 布线状态（中频）
    const isWiring = useGameStore(s => s.isWiring);
    const wiringPreviewPath = useGameStore(s => s.wiringPreviewPath);
    const isWiringValid = useGameStore(s => s.isWiringValid);
    const wiringSource = useGameStore(s => s.wiringSource);

    // 框选（低频）
    const selectionStart = useGameStore(s => s.selectionStart);
    const selectionEnd = useGameStore(s => s.selectionEnd);
    const selectedMachineIds = useGameStore(s => s.selectedMachineIds);
    const selectedConnectionIds = useGameStore(s => s.selectedConnectionIds);

    // 批量移动（低频）
    const moveAnchor = useGameStore(s => s.moveAnchor);
    const movingMachinesSnapshot = useGameStore(s => s.movingMachinesSnapshot);
    const movingConnectionsSnapshot = useGameStore(s => s.movingConnectionsSnapshot);

    // ── 供电网格：一次计算，所有机器复用 ──
    const poweredMachineIds = useMemo(() => {
        const grid = buildPowerGrid(machines, gridWidth, gridHeight, getMachineConfig);
        const powered = new Set<string>();
        for (const m of machines) {
            const cfg = getMachineConfig(m.machineId);
            if (!cfg || !cfg.power || cfg.power <= 0) {
                powered.add(m.id); // 无需供电
                continue;
            }
            const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
            let hasPower = false;
            for (let y = m.y; y < m.y + height && !hasPower; y++) {
                for (let x = m.x; x < m.x + width && !hasPower; x++) {
                    if (x >= 0 && y >= 0 && x < gridWidth && y < gridHeight && grid[y * gridWidth + x]) {
                        hasPower = true;
                    }
                }
            }
            if (hasPower) powered.add(m.id);
        }
        return powered;
    }, [machines, gridWidth, gridHeight]);

    // ── 本地状态 ──
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef<Point>({ x: 0, y: 0 });
    const [hoverPos, setHoverPos] = useState<Point | null>(null);
    const hoverPosRef = useRef<Point | null>(null);

    // ── 事件处理器（useCallback + getState 减少依赖） ──
    const getGridPos = useCallback((e: React.MouseEvent): Point => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const s = useGameStore.getState();
        const x = Math.floor(((e.clientX - rect.left) - s.pan.x) / (GRID_SIZE * s.zoom));
        const y = Math.floor(((e.clientY - rect.top) - s.pan.y) / (GRID_SIZE * s.zoom));
        return { x, y };
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const pos = getGridPos(e);
        const s = useGameStore.getState();

        if (s.mode === GameMode.DEVICE_SELECT && e.button === 0) {
            s.setBoxSelection(pos, pos);
        }
    }, [getGridPos]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        setIsPanning(false);
        const s = useGameStore.getState();
        if (s.mode === GameMode.DEVICE_SELECT && s.selectionStart) {
            s.commitBoxSelection(e.shiftKey);
        }
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!containerRef.current) return;
        const s = useGameStore.getState();
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - s.pan.x) / s.zoom;
        const worldY = (mouseY - s.pan.y) / s.zoom;

        const delta = -Math.sign(e.deltaY) * 0.1;
        const newZoom = Math.min(Math.max(s.zoom + delta, 0.18), 3.0);

        const newPanX = mouseX - worldX * newZoom;
        const newPanY = mouseY - worldY * newZoom;

        s.setZoom(newZoom);
        s.setPan({ x: newPanX, y: newPanY });
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning) {
            const deltaX = e.clientX - lastMousePos.current.x;
            const deltaY = e.clientY - lastMousePos.current.y;
            const s = useGameStore.getState();
            s.setPan({
                x: s.pan.x + deltaX,
                y: s.pan.y + deltaY
            });
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const pos = getGridPos(e);
        setHoverPos(pos);
        hoverPosRef.current = pos;

        const s = useGameStore.getState();
        if (s.isWiring) {
            s.updateWiringPreview(pos);
        }

        if (s.mode === GameMode.DEVICE_SELECT && s.selectionStart && e.buttons === 1) {
            s.setBoxSelection(s.selectionStart, pos);
        }
    }, [isPanning, getGridPos]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (isPanning) return;

        const pos = getGridPos(e);
        const s = useGameStore.getState();

        if (s.mode === GameMode.BUILD && s.selectedMachineId) {
            s.takeSnapshot();
            s.addMachine(s.selectedMachineId, pos.x, pos.y, s.previewRotation);
            if (!e.ctrlKey) {
                s.selectMachine(null);
            }
        } else if (s.mode === GameMode.MOVE_SELECTION || s.mode === GameMode.BLUEPRINT_PLACE) {
            s.takeSnapshot();
            s.commitBatchMove(pos);
        }
    }, [isPanning, getGridPos]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        useGameStore.getState().cancelOperation();
    }, []);

    const handleMouseLeave = useCallback(() => {
        setHoverPos(null);
        setIsPanning(false);
    }, []);

    // ── 快捷键 E / R / X / F / F1 / M / Ctrl+C / Escape ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const s = useGameStore.getState();
            const isPlacing = !!s.selectedMachineId;

            if (e.key.toLowerCase() === 'e') {
                if (isPlacing) return;
                setMode(s.mode === GameMode.WIRE ? GameMode.BUILD : GameMode.WIRE);
            } else if (e.key.toLowerCase() === 'r') {
                rotatePreview();
            } else if (e.key.toLowerCase() === 'x') {
                if (isPlacing) return;
                setMode(s.mode === GameMode.DEVICE_SELECT ? GameMode.BUILD : GameMode.DEVICE_SELECT);
            } else if (e.key.toLowerCase() === 'f') {
                s.takeSnapshot();
                s.deleteSelected();
            } else if (e.key === 'F1') {
                e.preventDefault();
                s.setBlueprintListMode('insert');
                s.setUiView('list');
            } else if (e.key.toLowerCase() === 'm') {
                if (hoverPosRef.current) {
                    s.startBatchMove(hoverPosRef.current);
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (hoverPosRef.current) {
                    s.startCopySelection(hoverPosRef.current);
                }
            } else if (e.key === 'Escape') {
                s.cancelOperation();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setMode, rotatePreview]); // setMode/rotatePreview 是 Zustand action，引用稳定

    // ── 放置预览计算 ──
    const ghostConfig = (mode === GameMode.BUILD && selectedMachineId) ? MACHINES.find(m => m.id === selectedMachineId) : null;
    let isGhostInvalid = false;
    let ghostWidth = 0;
    let ghostHeight = 0;
    let ghostPorts: (PortConfig & { isInput?: boolean })[] = [];

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
            isInput: i < ghostConfig.inputs.length
        }));
    }

    // ── 布线预览方向推导 ──
    const headDirRef = useRef<number>(1);
    const tailDirRef = useRef<number>(1);
    if (isWiring && wiringPreviewPath.length >= 2) {
        const first = wiringPreviewPath[0];
        const second = wiringPreviewPath[1];
        if (second.x > first.x) tailDirRef.current = 1;
        else if (second.x < first.x) tailDirRef.current = 3;
        else if (second.y > first.y) tailDirRef.current = 2;
        else tailDirRef.current = 0;

        const last = wiringPreviewPath[wiringPreviewPath.length - 1];
        const prev = wiringPreviewPath[wiringPreviewPath.length - 2];
        if (last.x > prev.x) headDirRef.current = 1;
        else if (last.x < prev.x) headDirRef.current = 3;
        else if (last.y > prev.y) headDirRef.current = 2;
        else headDirRef.current = 0;
    }

    const showMovePreview = (mode === GameMode.MOVE_SELECTION || mode === GameMode.BLUEPRINT_PLACE) && moveAnchor && hoverPos;

    return (
        <div
            className={classNames('grid-container', { 'wiring-mode': mode === GameMode.WIRE, 'panning': isPanning })}
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
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

                {/* 连线 SVG 图层 */}
                <svg
                    className="connections-layer"
                    style={{
                        width: gridWidth * GRID_SIZE,
                        height: gridHeight * GRID_SIZE,
                        pointerEvents: 'none',
                    }}
                >
                    {/* 已确认连线 */}
                    {connections.map(conn => {
                        const pts = pathToPoints(conn.path, conn.tailFacing, conn.headFacing);
                        const cls = (base: string) => classNames(base, { selected: selectedConnectionIds.includes(conn.id) });
                        const linePrefix = conn.portType === 'Liquid' ? 'pipe' : 'conveyor';

                        return (
                            <g key={conn.id}>
                                <polyline points={pts} className={cls(`${linePrefix}-line-outline`)} />
                                <polyline points={pts} className={cls(`${linePrefix}-line-fill`)} />
                            </g>
                        );
                    })}

                    {/* 连线预览 */}
                    {isWiring && wiringPreviewPath.length > 0 && (() => {
                        const pt = pathToPoints(wiringPreviewPath, tailDirRef.current, headDirRef.current);
                        const pcls = (base: string) => classNames(base, { 'invalid': !isWiringValid });
                        const prevPrefix = wiringSource?.portType === 'Liquid' ? 'pipe' : 'conveyor';
                        return (
                            <>
                                <polyline points={pt} className={pcls(`${prevPrefix}-preview-outline`)} />
                                <polyline points={pt} className={pcls(`${prevPrefix}-preview-fill`)} />
                            </>
                        );
                    })()}
                </svg>

                {/* 机器图层 */}
                {machines.map(m => (
                    <Machine
                        key={m.id}
                        data={m}
                        isSelected={selectedMachineIds.includes(m.id)}
                        isPowered={poweredMachineIds.has(m.id)}
                    />
                ))}

                {/* 框选矩形 */}
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

                {/* 批量移动预览 - 连线 */}
                {showMovePreview && (() => {
                    const offsetX = hoverPos!.x - moveAnchor!.x;
                    const offsetY = hoverPos!.y - moveAnchor!.y;

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
                                const pointsStr = pathToPoints(newPath, conn.tailFacing, conn.headFacing);
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
                    );
                })()}

                {/* 批量移动预览 - 机器 */}
                {showMovePreview && movingMachinesSnapshot.map(m => {
                    const offsetX = hoverPos!.x - moveAnchor!.x;
                    const offsetY = hoverPos!.y - moveAnchor!.y;
                    const ghostX = m.x + offsetX;
                    const ghostY = m.y + offsetY;

                    return (
                        <div key={`ghost-${m.id}`} style={{ opacity: 0.6, pointerEvents: 'none', zIndex: 20 }}>
                            <Machine
                                data={{ ...m, x: ghostX, y: ghostY }}
                                isSelected={true}
                                isPowered={true}
                            />
                        </div>
                    );
                })}

                {/* 单机器放置预览 */}
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
                        {/* 预览端口箭头 */}
                        {ghostPorts.map((p, i) => {
                            let arrowX = hoverPos.x + p.x;
                            let arrowY = hoverPos.y + p.y;
                            let rotation = 0;
                            const isInput = p.isInput;

                            switch (p.side) {
                                case 'left':
                                    arrowX -= 1;
                                    rotation = isInput ? 0 : 180;
                                    break;
                                case 'right':
                                    arrowX += 1;
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
