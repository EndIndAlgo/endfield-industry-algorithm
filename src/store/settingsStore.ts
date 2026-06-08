import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'zh-TW' | 'zh-CN';

interface SettingsState {
    language: Language;
    setLanguage: (lang: Language) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            language: 'zh-TW',
            setLanguage: (lang) => set({ language: lang }),
        }),
        {
            name: 'settings-storage',
        }
    )
);
