import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { Machine } from './Machine';
import { GameMode } from '../types';
import type { Point, PortConfig } from '../types';
import { MACHINES, getMachineConfig } from '../config/machines';
import classNames from 'classnames';
import './Grid.scss';
import { checkCollision, findPortOuterCellAt, findMachineAt, getPortOuterCells } from '../utils/gridUtils';
import { getRotatedDimensions, getRotatedPorts, buildPowerGrid } from '../utils/machineUtils';
import { GRID_SIZE } from '../config/constants';
const EXTEND = 0.45;

/** 限制平移范围，防止无限滚入空白区域 */
const clampPan = (pan: Point, gridW: number, gridH: number): Point => {
    const maxX = gridW * GRID_SIZE * 2;
    const maxY = gridH * GRID_SIZE * 2;
    const minX = -gridW * GRID_SIZE;
    const minY = -gridH * GRID_SIZE;
    return {
        x: Math.max(minX, Math.min(maxX, pan.x)),
        y: Math.max(minY, Math.min(maxY, pan.y)),
    };
};

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

    // 连线状态（中频）
    const isConnecting = useGameStore(s => s.isConnecting);
    const previewPath = useGameStore(s => s.previewPath);
    const isValidPath = useGameStore(s => s.isValidPath);
    const connectPortType = useGameStore(s => s.portType);

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
        s.setPan(clampPan({ x: newPanX, y: newPanY }, s.gridWidth, s.gridHeight));
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning) {
            const deltaX = e.clientX - lastMousePos.current.x;
            const deltaY = e.clientY - lastMousePos.current.y;
            const s = useGameStore.getState();
            s.setPan(clampPan({
                x: s.pan.x + deltaX,
                y: s.pan.y + deltaY
            }, s.gridWidth, s.gridHeight));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const pos = getGridPos(e);
        setHoverPos(pos);
        hoverPosRef.current = pos;

        const s = useGameStore.getState();
        if (s.isConnecting) {
            s.updatePreview(pos);
        }

        if (s.mode === GameMode.DEVICE_SELECT && s.selectionStart && e.buttons === 1) {
            s.setBoxSelection(s.selectionStart, pos);
        }
    }, [isPanning, getGridPos]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (isPanning) return;

        const pos = getGridPos(e);
        const s = useGameStore.getState();

        // ── 连接模式（传送带/管道） ──
        if (s.mode === GameMode.CONVEYOR || s.mode === GameMode.PIPE) {
            if (s.isConnecting) {
                // 正在连线中：有效路径 → 放置，无效 → 无响应
                if (s.isValidPath) {
                    s.takeSnapshot();
                    s.commitConnection();
                }
                return;
            }

            // 未在连线中：启动连线
            const portType = s.mode === GameMode.CONVEYOR ? 'Solid' : 'Liquid';

            // 检测1：点击位置在机器身体上？（优先，提供全部输出端口）
            const machine = findMachineAt(pos, s.machines);
            if (machine) {
                const ports = getPortOuterCells(machine, portType);
                if (ports.length > 0) {
                    s.startConnecting(ports, portType);
                    if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
                }
                return;
            }

            // 检测2：点击位置是端口外侧格？（精确匹配单一端口）
            const outerResult = findPortOuterCellAt(pos, s.machines, portType);
            if (outerResult) {
                s.startConnecting([{ pos: outerResult.pos, facing: outerResult.facing }], portType);
                if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
                return;
            }

            return;
        }

        // ── 原有模式逻辑 ──
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

    // ── 快捷键 E / Q / R / X / F / F1 / M / Ctrl+C / Escape ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const s = useGameStore.getState();
            const isPlacing = !!s.selectedMachineId;

            if (e.key.toLowerCase() === 'e') {
                if (isPlacing) return;
                if (s.mode === GameMode.CONVEYOR) {
                    s.cancelConnection();
                } else {
                    if (s.isConnecting) s.cancelConnection();
                    setMode(GameMode.CONVEYOR);
                }
            } else if (e.key.toLowerCase() === 'q') {
                if (isPlacing) return;
                if (s.mode === GameMode.PIPE) {
                    s.cancelConnection();
                } else {
                    if (s.isConnecting) s.cancelConnection();
                    setMode(GameMode.PIPE);
                }
            } else if (e.key.toLowerCase() === 'r') {
                if (s.isConnecting) {
                    s.toggleLShape();
                    if (hoverPosRef.current) s.updatePreview(hoverPosRef.current);
                } else {
                    rotatePreview();
                }
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

    // ── 连线预览方向推导 ──
    const tailFacingForPreview = useGameStore(s => s.activeTailFacing);
    const headFacingForPreview = useGameStore(s => s.previewHeadFacing);

    const showMovePreview = (mode === GameMode.MOVE_SELECTION || mode === GameMode.BLUEPRINT_PLACE) && moveAnchor && hoverPos;

    return (
        <div
            className={classNames('grid-container', { 'wiring-mode': mode === GameMode.CONVEYOR || mode === GameMode.PIPE, 'panning': isPanning })}
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
                    {isConnecting && previewPath.length > 0 && (() => {
                        const pt = pathToPoints(previewPath, tailFacingForPreview, headFacingForPreview);
                        const pcls = (base: string) => classNames(base, { 'invalid': !isValidPath });
                        const prevPrefix = connectPortType === 'Liquid' ? 'pipe' : 'conveyor';
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
