import { Icon } from '@iconify/react';
import { useGameStore } from '../store/gameStore';
import { GameMode } from '../types';
import './OperationHints.scss';

export const OperationHints = () => {
    const { mode, selectedMachineId, selectedMachineIds, selectedConnectionIds, lShapeMode } = useGameStore();

    const STRATEGY_LABELS: Record<string, string> = {
        'auto': '自动',
        'perpendicular': '垂直',
        'same-dir': '同向',
    };

    const hasSelection = (selectedMachineIds && selectedMachineIds.length > 0) || (selectedConnectionIds && selectedConnectionIds.length > 0);

    return (
        <div className="operation-hints">
            {/* 预设模式：建造模式，无选取 (且非框选模式) */}
            {mode === GameMode.BUILD && !selectedMachineId && !hasSelection && (
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

            {/* 有选取项目 (在框选或建造模式，但主要是指有选取时) */}
            {hasSelection && mode !== GameMode.MOVE_SELECTION && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">M</div>
                        <span>批量移动</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">F</div>
                        <span>批量删除</span>
                    </div>
                    {mode === GameMode.DEVICE_SELECT && (
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
            {mode === GameMode.CONVEYOR && (
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
            {mode === GameMode.PIPE && (
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
            {mode === GameMode.DEVICE_SELECT && (
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
            {mode === GameMode.MOVE_SELECTION && (
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

            {/* 蓝图放置模式 */}
            {mode === GameMode.BLUEPRINT_PLACE && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-right-click-fill" width="24" height="24" />
                        </div>
                        <span>取消放置</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>确定放置</span>
                    </div>
                </>
            )}

            {/* 如果有选取项目 (假设游戏 store 已暴露相关状态) */}

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
