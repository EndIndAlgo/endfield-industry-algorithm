import { Icon } from '@iconify/react';
import { useGameStore } from '@/store/gameStore';
import { selectIsBuildMode, selectIsWireMode, selectIsDeviceSelectMode, selectIsMoveSelectionMode,
    selectSelectedMachineId, selectHasSelection, selectConnecting } from '@/store/selectors';
import './OperationHints.scss';

export const OperationHints = () => {
    // 窄 selector：仅在相关 sub-state 变更时重渲染
    const isBuild = useGameStore(selectIsBuildMode);
    const isWire = useGameStore(selectIsWireMode);
    const isDeviceSelect = useGameStore(selectIsDeviceSelectMode);
    const isMoveSelection = useGameStore(selectIsMoveSelectionMode);
    const selectedMachineId = useGameStore(selectSelectedMachineId);
    const hasSelection = useGameStore(selectHasSelection);
    const connecting = useGameStore(selectConnecting);
    const wirePortType = useGameStore(s => s.modeState.kind === 'WIRE' ? s.modeState.portType : null);

    const lShapeMode = connecting?.lShapeMode ?? 'auto';

    const STRATEGY_LABELS: Record<string, string> = {
        'auto': '自动',
        'perpendicular': '垂直',
        'same-dir': '同向',
    };

    const isConveyor = isWire && wirePortType === 'Solid';
    const isPipe = isWire && wirePortType === 'Liquid';

    return (
        <div className="operation-hints">
            {/* 预设模式：建造模式，无选取 (且非框选模式) */}
            {isBuild && !selectedMachineId && !hasSelection && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">E</div>
                        <span>传送带模式</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">Q</div>
                        <span>管道模式</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">X</div>
                        <span>框选模式</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">F1</div>
                        <span>插入蓝图</span>
                    </div>
                </>
            )}

            {/* 有选取项目 */}
            {hasSelection && !isMoveSelection && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">M</div>
                        <span>批量移动</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">F</div>
                        <span>批量删除</span>
                    </div>
                    {isDeviceSelect && (
                        <div className="hint-item">
                            <div className="key-icon">Shift</div>
                            <span>+</span>
                            <div className="key-icon">
                                <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                            </div>
                            <span>取消选中框内</span>
                        </div>
                    )}
                    <div className="hint-item">
                        <div className="key-icon">Ctrl</div>
                        <span>+</span>
                        <div className="key-icon">C</div>
                        <span>复制</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">Ctrl</div>
                        <span>+</span>
                        <div className="key-icon">S</div>
                        <span>另存蓝图</span>
                    </div>
                </>
            )}

            {/* 放置机器中 */}
            {selectedMachineId && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">R</div>
                        <span>旋转设备</span>
                    </div>
                    <div className="hint-item">

                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>确定摆放</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">Ctrl</div>
                        <span>+</span>
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>连续摆放</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-right-click-fill" width="24" height="24" />
                        </div>
                        <span>取消摆放</span>
                    </div>
                </>
            )}

            {/* 传送带模式 */}
            {isConveyor && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>点击机器/端口外侧 → 启动</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>移动后点击 → 放置传送带</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">R</div>
                        <span>切换L形策略：{STRATEGY_LABELS[lShapeMode]}</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-right-click-fill" width="24" height="24" />
                        </div>
                        <span>取消/退出</span>
                    </div>
                </>
            )}

            {/* 管道模式 */}
            {isPipe && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>点击机器/端口外侧 → 启动</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>移动后点击 → 放置管道</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">R</div>
                        <span>切换L形策略：{STRATEGY_LABELS[lShapeMode]}</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-right-click-fill" width="24" height="24" />
                        </div>
                        <span>取消/退出</span>
                    </div>
                </>
            )}

            {/* 框选模式 */}
            {isDeviceSelect && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>拖曳选取</span>
                    </div>
                </>
            )}

            {/* 批量移动模式 */}
            {isMoveSelection && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-right-click-fill" width="24" height="24" />
                        </div>
                        <span>取消移动</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>确定放置</span>
                    </div>
                </>
            )}

            {/* 全域操作 */}
            <div className="hint-item">
                <div className="key-icon">
                    <Icon icon="ph:mouse-middle-click-fill" width="24" height="24" />
                </div>
                <span>移动画面</span>
            </div>
            <div className="hint-item">
                <div className="key-icon">
                    <Icon icon="ph:mouse-scroll" width="24" height="24" />
                </div>
                <span>缩放画面</span>
            </div>
            <div className="hint-item">
                <div className="key-icon">Ctrl</div>
                <span>+</span>
                <div className="key-icon">Z</div>
                <span>撤销</span>
            </div>
            <div className="hint-item">
                <div className="key-icon">Ctrl</div>
                <span>+</span>
                <div className="key-icon">Shift</div>
                <span>+</span>
                <div className="key-icon">Z</div>
                <span>复原</span>
            </div>
        </div>
    );
};
