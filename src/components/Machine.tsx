import React, { useRef, useCallback, useMemo, memo, useState } from 'react';
import { Icon } from '@iconify/react';
import classNames from 'classnames';
import type { PlacedMachine } from '@/types';
import { getMachineConfig } from '@/config/machines';
import { useGameStore } from '@/store/gameStore';
import './Machine.scss';
import { getRotatedDimensions, getRotatedPorts } from '@/utils/machineUtils';
import { Z_INDEX, machineZ } from '@/config/zIndex';
import { GRID_SIZE } from '@/config/constants';
import { getPortStyle } from '@/utils/portPosition';
import { machinePositionStyle } from '@/styles/cssCustomProps';

interface MachineProps {
    data: PlacedMachine;
    isSelected?: boolean;
    isPowered?: boolean;
    /** z-index 基底, 默认 STATIC_BASE */
    zBase?: number;
}

export const Machine: React.FC<MachineProps> = memo(({ data, isSelected, isPowered = true, zBase = Z_INDEX.STATIC_BASE }) => {
    const config = getMachineConfig(data.machineId);

    // 细粒度 store selector：只订阅本组件需要的字段
    const zoom = useGameStore(s => s.zoom);

    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── 预计算派生值（处理 config 为 null 的情况，hooks 必须在条件判断之前） ──
    const { width, height } = useMemo(
        () => config ? getRotatedDimensions(config.width, config.height, data.rotation) : { width: 0, height: 0 },
        [config, data.rotation]
    );
    const inputs = useMemo(
        () => config ? getRotatedPorts(config.inputs, config.width, config.height, data.rotation) : [],
        [config, data.rotation]
    );
    const outputs = useMemo(
        () => config ? getRotatedPorts(config.outputs, config.width, config.height, data.rotation) : [],
        [config, data.rotation]
    );

    // 同位置+同方向的输入输出重叠端口（合并为菱形）
    const inputKeySet = new Set(inputs.map(p => `${p.x},${p.y},${p.side}`));
    const mixedKeys = new Set(outputs.map(p => `${p.x},${p.y},${p.side}`).filter(k => inputKeySet.has(k)));

    // ── 事件处理器：用 getState() 读取最新状态，避免闭包依赖 ──
    const handleClick = useCallback((e: React.MouseEvent) => {
        const s = useGameStore.getState();
        // 连接模式下不阻止冒泡，让 Grid 统一处理
        if (s.modeState.kind !== 'WIRE') {
            e.stopPropagation();
        }
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const s = useGameStore.getState();
        // 连线模式下不启动长按拾取
        if (s.modeState.kind === 'WIRE') return;

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

    // 图标加载失败时切为文字后备
    const [imgError, setImgError] = useState(false);

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

    // ── 早期返回（在所有 hooks 之后） ──
    if (!config) return null;

    // ── 机器图标（≥2×2 的机器显示） ──
    const showIcon = config.width >= 2 && config.height >= 2;
    const iconSize = Math.min(width, height) * GRID_SIZE / 2;

    const style = {
        ...machinePositionStyle(data.x, data.y, width, height),
        zIndex: machineZ(zBase, config.mask.maxMask),
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
                        transformOrigin: 'top left'
                    }}
                >
                    <div>{config.name}</div>
                    <div>[点击] 查看详情/选择物品</div>
                    <div>[长按] 移动</div>
                </div>

                {showIcon && (
                    <div
                        className="machine-icon"
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: Z_INDEX.MACHINE_ICON,
                            width: iconSize,
                            height: iconSize,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                        }}
                    >
                        {!imgError ? (
                            <img
                                src={new URL(`../assets/machines/${config.id}.webp`, import.meta.url).href}
                                alt={config.name}
                                onError={() => setImgError(true)}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                }}
                            />
                        ) : (
                            <span
                                className="machine-icon-text"
                                style={{ fontSize: Math.max(10, iconSize * 0.25) }}
                            >{config.name}</span>
                        )}
                    </div>
                )}

                {!isPowered && (
                    <div
                        className="power-alert-icon"
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: Z_INDEX.POWER_ALERT_ICON,
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

                {/* 输入端口（纯视觉，交互由 Grid 统一处理） */}
                {inputs.map((p, i) => {
                    if (mixedKeys.has(`${p.x},${p.y},${p.side}`)) return null;
                    return (
                    <div
                        key={`in-${i}`}
                        className={classNames(getPortClasses(p), 'input')}
                        style={getPortStyle(p)}
                    >
                        <div className="port-inner">
                            <Icon icon="octicon:chevron-right-12" width="24" height="24" strokeWidth="3" />
                        </div>
                    </div>
                    );
                })}

                {/* 输出端口（纯视觉，交互由 Grid 统一处理） */}
                {outputs.map((p, i) => {
                    const isMixed = mixedKeys.has(`${p.x},${p.y},${p.side}`);
                    return (
                    <div
                        key={`out-${i}`}
                        className={classNames(getPortClasses(p), 'output', {
                            mixed: isMixed,
                        })}
                        style={getPortStyle(p)}
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
