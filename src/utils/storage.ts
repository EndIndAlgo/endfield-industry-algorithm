import type { PlacedMachine, Connection } from '../types';

export interface Blueprint {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    data: {
        machines: PlacedMachine[];
        connections: Connection[];
        actualWidth: number;
        actualHeight: number;
    };
}

const STORAGE_KEY = 'zmd_blueprints';
const LAST_BP_KEY = 'zmd_last_blueprint_id';

export const getBlueprints = (): Blueprint[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('Failed to load blueprints', e);
        return [];
    }
};

export const saveBlueprint = (id: string | null, name: string, data: Blueprint['data']): Blueprint => {
    const blueprints = getBlueprints();
    const now = Date.now();

    if (id) {
        // Update existing
        const index = blueprints.findIndex(b => b.id === id);
        if (index !== -1) {
            const updated: Blueprint = {
                ...blueprints[index],
                name,
                updatedAt: now,
                data
            };
            blueprints[index] = updated;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(blueprints));
            return updated;
        }
    }

    // Create new
    const newBlueprint: Blueprint = {
        id: crypto.randomUUID(),
        name,
        createdAt: now,
        updatedAt: now,
        data
    };

    blueprints.push(newBlueprint);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blueprints));
    return newBlueprint;
};

export const deleteBlueprint = (id: string) => {
    const blueprints = getBlueprints();
    const filtered = blueprints.filter(b => b.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const loadBlueprint = (id: string): Blueprint | undefined => {
    const blueprints = getBlueprints();
    return blueprints.find(b => b.id === id);
};

export const getLastBlueprintId = (): string | null => {
    return localStorage.getItem(LAST_BP_KEY);
};

export const setLastBlueprintId = (id: string | null) => {
    if (id) {
        localStorage.setItem(LAST_BP_KEY, id);
    } else {
        localStorage.removeItem(LAST_BP_KEY);
    }
};
