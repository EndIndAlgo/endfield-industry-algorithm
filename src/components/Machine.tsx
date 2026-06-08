import React from 'react';
import { Icon } from '@iconify/react';
import classNames from 'classnames';
import { GameMode } from '../types';
import type { PlacedMachine } from '../types';
import { getMachineConfig } from '../config/machines';
import { useGameStore } from '../store/gameStore';
import './Machine.scss';
import { getRotatedDimensions, getRotatedPorts, isMachinePowered } from '../utils/machineUtils';

interface MachineProps {
    data: PlacedMachine;
    isSelected?: boolean;
}

export const Machine: React.FC<MachineProps> = ({ data, isSelected }) => {
    const config = getMachineConfig(data.machineId);
    const { mode, startWiring, wiringSource, commitWiring, isWiring, zoom, pickupMachine, machines } = useGameStore();
    const pressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    if (!config) return null;

    const { width, height } = getRotatedDimensions(config.width, config.height, data.rotation);
    const inputs = getRotatedPorts(config.inputs, config.width, config.height, data.rotation);
    const outputs = getRotatedPorts(config.outputs, config.width, config.height, data.rotation);

    // 同位置+同方向的輸入輸出重疊端口（合併為菱形，避免渲染重複）
    const inputKeySet = new Set(inputs.map(p => `${p.x},${p.y},${p.side}`));
    const mixedKeys = new Set(outputs.map(p => `${p.x},${p.y},${p.side}`).filter(k => inputKeySet.has(k)));

    const style = {
        '--x': data.x,
        '--y': data.y,
        '--w': width,
        '--h': height,
    } as React.CSSProperties;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // 僅允許在建造模式下拾取...
        if (e.button !== 0) return; // 僅左鍵點擊

        pressTimer.current = setTimeout(() => {
            useGameStore.getState().takeSnapshot();
            pickupMachine(data.id);
        }, 500);
    };

    const handleMouseUp = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    const handleMouseLeave = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    // ... getPortStyle ...

    const handleInputClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (mode === GameMode.WIRE && isWiring) {
            useGameStore.getState().takeSnapshot();
            commitWiring();
        }
    };

    const getPortStyle = (p: { x: number, y: number, side: 'top' | 'right' | 'bottom' | 'left' }) => {
        const style: React.CSSProperties = {};

        const CELL_SIZE = 40;
        const GAP = 3; // 需與 CSS padding 保持一致
        // 用於緊湊型端口計算位置...

        // Compact Dimensions:
        // Port along-edge size (width for Top/Bottom, height for Left/Right) = 16px
        // Port depth (height for Top/Bottom, width for Left/Right) = 10px

        // 相對於機器主體 (內部 padding) 的中心位置
        const centerOffset = (CELL_SIZE / 2) - GAP;

        // 恢復使用者要求的手動偏移量 -4px
        const axisOffset = -4;

        // We want the center of the port to align with centerOffset.
        // position = centerOffset;
        // But we are setting 'top'/'left', usually indicating start position?
        // Original css has transform: translate(-50%, 0) or (0, -50%), so we are setting the CENTER coordinate.

        switch (p.side) {
            case 'left':
                style.left = `-1px`; // 重疊邊框
                style.top = `${p.y * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(0, -50%)';
                break;
            case 'right':
                style.right = `-0.5px`;
                style.top = `${p.y * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(0, -50%)';
                break;
            case 'top':
                style.top = `-1px`;
                style.left = `${p.x * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(-50%, 0)';
                break;
            case 'bottom':
                style.bottom = `-0.5px`;
                style.left = `${p.x * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(-50%, 0)';
                break;
        }

        return style;
    };

    // 碰撞檢測輔助函數
    const getPortClasses = (currentPort: { x: number, y: number, side: string }) => {
        const classes: string[] = ['port', currentPort.side];

        // 尋找同一個格子內的其他端口（所有機器均檢測）
        const allPorts = [...inputs, ...outputs];
        const peers = allPorts.filter(p => p.x === currentPort.x && p.y === currentPort.y && p.side !== currentPort.side);

        if (peers.length === 0) {
            return classNames(classes); // 無碰撞，使用標準尺寸
        }

        let shrinkDepth = false; // 對面存在端口
        let shrinkLength = false; // 相鄰存在端口

        const opposites: Record<string, string> = { 'left': 'right', 'right': 'left', 'top': 'bottom', 'bottom': 'top' };

        peers.forEach(peer => {
            if (peer.side === opposites[currentPort.side]) {
                shrinkDepth = true;
            } else {
                // 如果不是對面 (且邊不同)，則必定是相鄰
                shrinkLength = true;
            }
        });

        if (shrinkDepth) classes.push('shrink-depth');
        if (shrinkLength) classes.push('shrink-length');

        return classNames(classes);
    };

    const handleOutputClick = (e: React.MouseEvent, portRel: { x: number; y: number; side: string; type: import('../types').PortType }) => {
        e.stopPropagation();
        if (mode === GameMode.WIRE) {
            const absX = data.x + portRel.x;
            const absY = data.y + portRel.y;
            const sideToDir: Record<string, number> = { top: 0, right: 1, bottom: 2, left: 3 };
            const sideToVec: Record<string, {x:number;y:number}> = { top: {x:0,y:-1}, right: {x:1,y:0}, bottom: {x:0,y:1}, left: {x:-1,y:0} };
            const side = portRel.side as 'top' | 'right' | 'bottom' | 'left';
            const tailFacing = sideToDir[side] as import('../types').Direction;
            const vec = sideToVec[side];
            const tailPos = { x: absX + vec.x, y: absY + vec.y };
            startWiring(tailPos, tailFacing, portRel.type);
        }
    };

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
                        transformOrigin: 'top left' // 因為我們將其定位在機器的右下角，標籤的錨點為「左上」
                    }}
                >
                    <div>{config.name}</div>
                    <div>[點按] 查看詳情/選擇物品</div>
                    <div>[長按] 移動</div>
                </div>

                {(!isMachinePowered(data, machines, getMachineConfig)) && (
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

                {/* 輸入 (跳過與輸出口位置+方向重疊的，交由輸出口以菱形合併渲染) */}
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
                        title={mode === GameMode.WIRE && isWiring && p.type === wiringSource?.portType ? "Click to connect" : ""}
                    >
                        <div className="port-inner">
                            <Icon icon="octicon:chevron-right-12" width="24" height="24" strokeWidth="3" />
                        </div>
                    </div>
                    );
                })}

                {/* 輸出 (含合併端口 — 同一位置+方向同時有輸入輸出 → 菱形) */}
                {outputs.map((p, i) => {
                    const isMixed = mixedKeys.has(`${p.x},${p.y},${p.side}`);
                    // 按位置匹配 (而非機器引用)，判斷是否為當前佈線起點
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
                        title={isMixed ? "Bidirectional port" : mode === GameMode.WIRE ? "Click to start wiring" : ""}
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
};
