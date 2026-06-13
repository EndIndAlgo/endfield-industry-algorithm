import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { MACHINES } from '../config/machines';
import { GameMode } from '../types';
import classNames from 'classnames';
import { MousePointer2, ArrowRight, Waves, BoxSelect } from 'lucide-react';
import { Tabs } from '@chakra-ui/react';
import './Toolbar.scss';

const TABS = [
    { id: 'core', label: '核心' },
    { id: 'logistics', label: '物流' },
    { id: 'storage', label: '倉儲存取' },
    { id: 'production', label: '基礎生產' },
    { id: 'processing', label: '合成製造' },
    { id: 'power', label: '電力' },
];

const MACHINE_GROUPS: Record<string, string[]> = {
    core: ['pco' /* 协议核心 */],
    logistics: [
        'lbr' /* 物流桥 */, 'spl' /* 分流器 */, 'mrg' /* 汇流器 */, 'iip' /* 物品准入口 */,
        'pbr' /* 管道桥 */, 'psp' /* 管道分流器 */, 'pmg' /* 管道汇流器 */, 'pip' /* 管道准入口 */,
        'cpe' /* 暗管入口 */, 'cpx' /* 暗管出口 */, 'mce' /* 多口暗管入口 */, 'mcx' /* 多口暗管出口 */,
    ],
    storage: [
        'pst' /* 协议储存箱 */, 'wsp' /* 仓库存货口 */, 'wpp' /* 仓库取货口 */,
        'ltk' /* 储液罐 */, 'wss' /* 仓库存取线基段 */, 'wsl' /* 仓库存取线源桩 */,
    ],
    production: [
        'ref' /* 精炼炉 */, 'rfl' /* 精炼炉（液体） */, 'cru' /* 粉碎机 */,
        'asm' /* 配件机 */, 'mol' /* 塑形机 */, 'shv' /* 采种机 */,
        'pln' /* 种植机 */, 'pll' /* 种植机（液体） */, 'wwt' /* 废水处理机 */,
    ],
    processing: [
        'cas' /* 装备原件机 */, 'fil' /* 灌装机 */, 'fll' /* 灌装机（液体） */,
        'sel' /* 封装机 */, 'grn' /* 研磨机 */, 'rea' /* 反应池 */,
        'era' /* 扩容反应池 */, 'tyh' /* 天有洪炉 */, 'pur' /* 提纯机 */, 'dis' /* 拆解机 */,
    ],
    power: [
        'sup' /* 供电桩 */, 'xrs' /* 息壤供电桩 */, 'rpt' /* 中继器 */,
        'xrr' /* 息壤中继器 */, 'thp' /* 热能池 */,
    ],
};

export const Toolbar = () => {
    const { selectedMachineId, selectMachine, mode, setMode } = useGameStore();
    const [activeTab, setActiveTab] = useState('production');

    const filteredMachines = MACHINES.filter(m => MACHINE_GROUPS[activeTab]?.includes(m.id));

    return (
        <div className="toolbar-container">
            <Tabs.Root
                value={activeTab}
                onValueChange={(e) => setActiveTab(e.value)}
                variant="plain"
                size="sm"
            >
                <Tabs.List
                    bg="var(--black)"
                    p="1"
                    borderRadius="md"
                    pointerEvents="auto"
                    style={{ boxShadow: '0 0 4px var(--black)' }}
                >
                    {TABS.map(tab => (
                        <Tabs.Trigger
                            key={tab.id}
                            value={tab.id}
                            px="3"
                            py="0"
                            borderRadius="sm"
                            cursor="pointer"
                            fontWeight="bold"
                            color="var(--gray-light)"
                            _selected={{ color: "var(--black-light)" }}
                        >
                            {tab.label}
                        </Tabs.Trigger>
                    ))}
                    <Tabs.Indicator rounded="12" />
                </Tabs.List>
            </Tabs.Root>

            <div className="toolbar">
                <div className="section">
                    <button
                        className={classNames('tool-btn', { active: mode === GameMode.BUILD && !selectedMachineId })}
                        onClick={() => selectMachine(null)}
                        title="Select / Move"
                    >
                        <MousePointer2 size={24} />
                    </button>
                    <button
                        className={classNames('tool-btn', { active: mode === GameMode.CONVEYOR })}
                        onClick={() => setMode(mode === GameMode.CONVEYOR ? GameMode.BUILD : GameMode.CONVEYOR)}
                        title="传送带模式 (E)"
                    >
                        <ArrowRight size={24} />
                    </button>
                    <button
                        className={classNames('tool-btn', { active: mode === GameMode.PIPE })}
                        onClick={() => setMode(mode === GameMode.PIPE ? GameMode.BUILD : GameMode.PIPE)}
                        title="管道模式 (Q)"
                    >
                        <Waves size={24} />
                    </button>
                    <button
                        className={classNames('tool-btn', { active: mode === GameMode.DEVICE_SELECT })}
                        onClick={() => setMode(mode === GameMode.DEVICE_SELECT ? GameMode.BUILD : GameMode.DEVICE_SELECT)}
                        title="Box Selection Mode (X)"
                    >
                        <BoxSelect size={24} />
                    </button>
                </div>

                <div className="divider"></div>

                <div className="section machines">
                    {filteredMachines.map(m => (
                        <div key={m.id} className="btn-wrap" onClick={() => selectMachine(m.id)}>
                            <button
                                className={classNames('machine-btn', { active: selectedMachineId === m.id })}
                                title={m.name}
                                style={{ '--machine-color': m.color } as React.CSSProperties}
                            >
                                <img
                                    className="icon"
                                    src={new URL(`../assets/machines/${m.id}.webp`, import.meta.url).href}
                                    alt={m.name}
                                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                                <span>{m.name}</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
