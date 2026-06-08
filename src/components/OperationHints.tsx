import { Icon } from '@iconify/react';
import { useGameStore } from '../store/gameStore';
import { GameMode } from '../types';
import './OperationHints.scss';

export const OperationHints = () => {
    const { mode, selectedMachineId, selectedMachineIds, selectedConnectionIds } = useGameStore();

    const hasSelection = (selectedMachineIds && selectedMachineIds.length > 0) || (selectedConnectionIds && selectedConnectionIds.length > 0);

    return (
        <div className="operation-hints">
            {/* 預設模式：建造模式，無選取 (且非框選模式) */}
            {mode === GameMode.BUILD && !selectedMachineId && !hasSelection && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">E</div>
                        <span>傳送帶模式</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">X</div>
                        <span>框選模式</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">F1</div>
                        <span>插入藍圖</span>
                    </div>
                </>
            )}

            {/* 有選取項目 (在框選或建造模式，但主要是指有選取時) */}
            {hasSelection && mode !== GameMode.MOVE_SELECTION && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">M</div>
                        <span>批量移動</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">F</div>
                        <span>批量刪除</span>
                    </div>
                    {mode === GameMode.DEVICE_SELECT && (
                        <div className="hint-item">
                            <div className="key-icon">Shift</div>
                            <span>+</span>
                            <div className="key-icon">
                                <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                            </div>
                            <span>取消選中框內</span>
                        </div>
                    )}
                    <div className="hint-item">
                        <div className="key-icon">Ctrl</div>
                        <span>+</span>
                        <div className="key-icon">C</div>
                        <span>複製</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">Ctrl</div>
                        <span>+</span>
                        <div className="key-icon">S</div>
                        <span>另存藍圖</span>
                    </div>
                </>
            )}

            {/* 放置機器中 */}
            {selectedMachineId && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">R</div>
                        <span>旋轉設備</span>
                    </div>
                    <div className="hint-item">

                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>確定擺放</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">Ctrl</div>
                        <span>+</span>
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>連續擺放</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-right-click-fill" width="24" height="24" />
                        </div>
                        <span>取消擺放</span>
                    </div>
                </>
            )}

            {/* 連線模式 */}
            {mode === GameMode.WIRE && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>確定起點</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-right-click-fill" width="24" height="24" />
                        </div>
                        <span>取消連線</span>
                    </div>
                </>
            )}

            {/* 框選模式 */}
            {mode === GameMode.DEVICE_SELECT && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>拖曳選取</span>
                    </div>
                </>
            )}

            {/* 批量移動模式 */}
            {mode === GameMode.MOVE_SELECTION && (
                <>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-right-click-fill" width="24" height="24" />
                        </div>
                        <span>取消移動</span>
                    </div>
                    <div className="hint-item">
                        <div className="key-icon">
                            <Icon icon="ph:mouse-left-click-fill" width="24" height="24" />
                        </div>
                        <span>確定放置</span>
                    </div>
                </>
            )}

            {/* 藍圖放置模式 */}
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
                        <span>確定放置</span>
                    </div>
                </>
            )}

            {/* 如果有選取項目 (假設遊戲 store 已曝露相關狀態) */}

            {/* 全域操作 */}
            <div className="hint-item">
                <div className="key-icon">
                    <Icon icon="ph:mouse-middle-click-fill" width="24" height="24" />
                </div>
                <span>移動畫面</span>
            </div>
            <div className="hint-item">
                <div className="key-icon">
                    <Icon icon="ph:mouse-scroll" width="24" height="24" />
                </div>
                <span>縮放畫面</span>
            </div>
            <div className="hint-item">
                <div className="key-icon">Ctrl</div>
                <span>+</span>
                <div className="key-icon">Z</div>
                <span>撤銷</span>
            </div>
            <div className="hint-item">
                <div className="key-icon">Ctrl</div>
                <span>+</span>
                <div className="key-icon">Shift</div>
                <span>+</span>
                <div className="key-icon">Z</div>
                <span>復原</span>
            </div>
        </div>
    );
};
