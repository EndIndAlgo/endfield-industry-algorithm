import { createListCollection, Select } from '@chakra-ui/react';
import { ChevronDown } from 'lucide-react';
import './Header.scss';
import logoIcon from '../assets/logo.png';

import { IconButton } from './IconButton';

import { GRID_PRESETS } from '../config/constants';
import { useGameStore } from '../store/gameStore';

interface HeaderProps {
    onSave: () => void;
    onOpen: () => void;
}

import { ShareModal } from './ShareModal';
import { useState } from 'react';

export const Header = ({ onSave, onOpen }: HeaderProps) => {
    const { gridWidth, gridHeight, setGridSize, setUiView, setPan, setZoom } = useGameStore();
    const [isShareOpen, setIsShareOpen] = useState(false);

    const gridPresetsCollection = createListCollection({
        items: GRID_PRESETS.map(p => ({ label: p.label, value: `${p.width}x${p.height}` })),
    });

    const handleValueChange = (e: { value: string[] }) => {
        const val = e.value[0];
        if (!val) return;
        const [w, h] = val.split('x').map(Number);
        useGameStore.getState().takeSnapshot();
        setGridSize(w, h);
    };

    return (
        <>
            <div className="header">
                <div className="logo">
                    <img src={logoIcon} className="icon" alt="logo" />
                </div>

                <div className="center-actions">
                    <Select.Root
                        collection={gridPresetsCollection}
                        value={[`${gridWidth}x${gridHeight}`]}
                        onValueChange={handleValueChange}
                        width="240px"
                    >
                        <Select.Trigger>
                            <Select.ValueText placeholder="选择蓝图尺寸" />
                            <Select.Indicator>
                                <ChevronDown size={16} color="white" />
                            </Select.Indicator>
                        </Select.Trigger>
                        <Select.Positioner>
                            <Select.Content>
                                {gridPresetsCollection.items.map((item, i) => (
                                    <Select.Item item={item} key={i}>
                                        {item.label}
                                    </Select.Item>
                                ))}
                            </Select.Content>
                        </Select.Positioner>
                    </Select.Root>
                </div>
                <div className="actions">
                    <IconButton icon="material-symbols:fit-screen" tooltip="重置视图" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }} />
                    <IconButton icon="material-symbols:save" tooltip="保存" onClick={onSave} />
                    <IconButton icon="typcn:home" tooltip="蓝图列表" onClick={onOpen} />
                    <IconButton icon="material-symbols:share" tooltip="分享" onClick={() => setIsShareOpen(true)} />
                    <IconButton icon="material-symbols:settings" tooltip="设置" onClick={() => setUiView('settings')} />
                    <IconButton icon="material-symbols:info-i-rounded" tooltip="关于" onClick={() => setUiView('about')} />
                </div>
            </div>
            <ShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} />
        </>
    );
};
