import React, { useRef, useCallback, memo } from 'react';
import { Icon } from '@iconify/react';
import classNames from 'classnames';
import { GameMode } from '../types';
import type { PlacedMachine, PortType } from '../types';
import { getMachineConfig } from '../config/machines';
import { useGameStore } from '../store/gameStore';
import './Machine.scss';
import { getRotatedDimensions, getRotatedPorts } from '../utils/machineUtils';

interface MachineProps {
    data: PlacedMachine;
    isSelected?: boolean;
    isPowered?: boolean;
}

export const Machine: React.FC<MachineProps> = memo(({ data, isSelected, isPowered = true }) => {
    const config = getMachineConfig(data.machineId);

    // 细粒度 store selector：只订阅本组件需要的字段
    const mode = useGameStore(s => s.mode);
    const isWiring = useGameStore(s => s.isWiring);
    const wiringSource = useGameStore(s => s.wiringSource);
    const zoom = useGameStore(s => s.zoom);

    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    if (!config) return null;

    const { width, height } = getRotatedDimensions(config.width, config.height, data.rotation);
    const inputs = getRotatedPorts(config.inputs, config.width, config.height, data.rotation);
    const outputs = getRotatedPorts(config.outputs, config.width, config.height, data.rotation);

    // 同位置+同方向的输入输出重叠端口（合并为菱形）
    const inputKeySet = new Set(inputs.map(p => `${p.x},${p.y},${p.side}`));
    const mixedKeys = new Set(outputs.map(p => `${p.x},${p.y},${p.side}`).filter(k => inputKeySet.has(k)));

    const style = {
        '--x': data.x,
        '--y': data.y,
        '--w': width,
        '--h': height,
    } as React.CSSProperties;

    // ── 事件处理器：用 getState() 读取最新状态，避免闭包依赖 ──
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;

        pressTimer.current = setTimeout(() => {
            const s = useGameStore.getState();
            s.takeSnapshot();
            s.pickupMachine(data.id);
        }, 500);
    }, [data.id]);

    const handleMouseUp = useCallback(() => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    }, []);

    const handleInputClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const s = useGameStore.getState();
        if (s.mode === GameMode.WIRE && s.isWiring) {
            s.takeSnapshot();
            s.commitWiring();
        }
    }, []);

    const getPortStyle = useCallback((p: { x: number, y: number, side: 'top' | 'right' | 'bottom' | 'left' }) => {
        const style: React.CSSProperties = {};

        const CELL_SIZE = 40;
        const GAP = 3;
        const centerOffset = (CELL_SIZE / 2) - GAP;
        const axisOffset = -4;

        switch (p.side) {
            case 'left':
                style.left = '-1px';
                style.top = `${p.y * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(0, -50%)';
                break;
            case 'right':
                style.right = '-0.5px';
                style.top = `${p.y * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(0, -50%)';
                break;
            case 'top':
                style.top = '-1px';
                style.left = `${p.x * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(-50%, 0)';
                break;
            case 'bottom':
                style.bottom = '-0.5px';
                style.left = `${p.x * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(-50%, 0)';
                break;
        }

        return style;
    }, []);

    const getPortClasses = useCallback((currentPort: { x: number, y: number, side: string }) => {
        const classes: string[] = ['port', currentPort.side];

        const allPorts = [...inputs, ...outputs];
        const peers = allPorts.filter(p => p.x === currentPort.x && p.y === currentPort.y && p.side !== currentPort.side);

        if (peers.length === 0) {
            return classNames(classes);
        }

        let shrinkDepth = false;
        let shrinkLength = false;

        const opposites: Record<string, string> = { 'left': 'right', 'right': 'left', 'top': 'bottom', 'bottom': 'top' };

        peers.forEach(peer => {
            if (peer.side === opposites[currentPort.side]) {
                shrinkDepth = true;
            } else {
                shrinkLength = true;
            }
        });

        if (shrinkDepth) classes.push('shrink-depth');
        if (shrinkLength) classes.push('shrink-length');

        return classNames(classes);
    }, [inputs, outputs]);

    const handleOutputClick = useCallback((e: React.MouseEvent, portRel: { x: number; y: number; side: string; type: PortType }) => {
        e.stopPropagation();
        const s = useGameStore.getState();
        if (s.mode === GameMode.WIRE) {
            const absX = data.x + portRel.x;
            const absY = data.y + portRel.y;
            const sideToDir: Record<string, number> = { top: 0, right: 1, bottom: 2, left: 3 };
            const sideToVec: Record<string, {x:number;y:number}> = { top: {x:0,y:-1}, right: {x:1,y:0}, bottom: {x:0,y:1}, left: {x:-1,y:0} };
            const side = portRel.side as 'top' | 'right' | 'bottom' | 'left';
            const tailFacing = sideToDir[side] as import('../types').Direction;
            const vec = sideToVec[side];
            const tailPos = { x: absX + vec.x, y: absY + vec.y };
            s.startWiring(tailPos, tailFacing, portRel.type);
        }
    }, [data.x, data.y]);

    return (
        <div
            className={classNames('machine-container', {
                selected: isSelected,
            })}
            style={style}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
        >
            <div className="machine-body">
                <div
                    className="machine-label"
                    style={{
                        transform: `scale(${1 / zoom})`,
                        transformOrigin: 'top left'
                    }}
                >
                    <div>{config.name}</div>
                    <div>[点击] 查看详情/选择物品</div>
                    <div>[长按] 移动</div>
                </div>

                {!isPowered && (
                    <div
                        className="power-alert-icon"
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title="No Power"
                    >
                        <Icon
                            icon="uil:battery-bolt"
                            color="var(--orange)"
                            width="36"
                            height="36"
                            style={{ filter: 'drop-shadow(0px 0px 1px var(--orange-dark))' }}
                        />
                    </div>
                )}

                {/* 输入端口（跳过与输出重叠的） */}
                {inputs.map((p, i) => {
                    if (mixedKeys.has(`${p.x},${p.y},${p.side}`)) return null;
                    return (
                    <div
                        key={`in-${i}`}
                        className={classNames(getPortClasses(p), 'input', {
                            clickable: mode === GameMode.WIRE && isWiring && p.type === wiringSource?.portType
                        })}
                        style={getPortStyle(p)}
                        onClick={handleInputClick}
                        title={mode === GameMode.WIRE && isWiring && p.type === wiringSource?.portType ? "点击连线" : ""}
                    >
                        <div className="port-inner">
                            <Icon icon="octicon:chevron-right-12" width="24" height="24" strokeWidth="3" />
                        </div>
                    </div>
                    );
                })}

                {/* 输出端口（含合并端口 → 菱形） */}
                {outputs.map((p, i) => {
                    const isMixed = mixedKeys.has(`${p.x},${p.y},${p.side}`);
                    const sideToVec: Record<string, {x:number;y:number}> = { top: {x:0,y:-1}, right: {x:1,y:0}, bottom: {x:0,y:1}, left: {x:-1,y:0} };
                    const vec = sideToVec[p.side];
                    const isActive = !isMixed && wiringSource
                        && wiringSource.tailPos.x === data.x + p.x + vec.x
                        && wiringSource.tailPos.y === data.y + p.y + vec.y
                        && wiringSource.portType === p.type;
                    return (
                    <div
                        key={`out-${i}`}
                        className={classNames(getPortClasses(p), 'output', {
                            mixed: isMixed,
                            clickable: mode === GameMode.WIRE && (!isMixed || (isWiring && p.type === wiringSource?.portType)),
                            active: isActive
                        })}
                        style={getPortStyle(p)}
                        onClick={(e) => {
                            if (isMixed && isWiring) {
                                handleInputClick(e);
                            } else {
                                handleOutputClick(e, p);
                            }
                        }}
                        title={isMixed ? "双向端口" : mode === GameMode.WIRE ? "点击开始连线" : ""}
                    >
                        <div className="port-inner">
                            <Icon icon={isMixed ? "lucide:diamond" : "octicon:chevron-right-12"} width={isMixed ? 16 : 24} height={isMixed ? 16 : 24} strokeWidth="3" />
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>
    );
});
