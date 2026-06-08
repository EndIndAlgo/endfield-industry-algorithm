import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { MACHINES } from '../config/machines';
import { GameMode } from '../types';
import classNames from 'classnames';
import { MousePointer2, Zap, BoxSelect } from 'lucide-react';
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
    core: ['pco' /* protocol-core */],
    logistics: ['lbr' /* logistics-bridge */, 'pbr' /* pipe-bridge */, 'spl' /* splitter */, 'mrg' /* merger */, 'iip' /* item-input-port */],
    storage: ['pst' /* protocol-storage */, 'wsp' /* warehouse-storage-port */, 'wpp' /* warehouse-pickup-port */, 'wss' /* warehouse-storage-pickup-line-segment */, 'wsl' /* warehouse-storage-pickup-line-source-pile */],
    production: ['ref' /* refinery */, 'cru' /* crusher */, 'asm' /* assembler */, 'mol' /* molder */, 'shv' /* seedHarvester */, 'pln' /* planter */],
    processing: ['cas' /* component-assembler */, 'fil' /* filler */, 'sel' /* sealer */, 'grn' /* grinder */, 'rea' /* reactor */, 'tyh' /* tian-you-hong-furnace */],
    power: ['sup' /* supply-pole */, 'thp' /* thermal-pool */],
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
                        className={classNames('tool-btn', { active: mode === GameMode.WIRE })}
                        onClick={() => setMode(mode === GameMode.WIRE ? GameMode.BUILD : GameMode.WIRE)}
                        title="Wiring Mode (E)"
                    >
                        <Zap size={24} />
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
