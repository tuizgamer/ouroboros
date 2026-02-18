// ============================================================
// useTeamPresets — Team Preset Management Hook
// CRUD for saved team compositions + auto-load favorite
// ============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';

export interface TeamPreset {
    id: string;
    profile_id: string;
    name: string;
    character_ids: string[];
    is_favorite: boolean;
    slot_index: number;
    created_at: string;
    updated_at: string;
}

const MAX_PRESETS = 5;

export function useTeamPresets(isAuthenticated: boolean) {
    const [presets, setPresets] = useState<TeamPreset[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const favorite = presets.find(p => p.is_favorite) ?? null;

    const loadPresets = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/presets');
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message ?? 'Failed to load presets');
            setPresets(json.data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) loadPresets();
    }, [isAuthenticated, loadPresets]);

    const savePreset = useCallback(async (name: string, characterIds: string[]) => {
        // Find next available slot
        const usedSlots = new Set(presets.map(p => p.slot_index));
        let slotIndex = -1;
        for (let i = 0; i < MAX_PRESETS; i++) {
            if (!usedSlots.has(i)) { slotIndex = i; break; }
        }
        if (slotIndex === -1) {
            setError(`Máximo de ${MAX_PRESETS} presets atingido`);
            return null;
        }

        try {
            const res = await fetch('/api/v1/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, characterIds, slotIndex }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message ?? 'Failed to save');
            await loadPresets();
            return json.data as TeamPreset;
        } catch (err) {
            setError((err as Error).message);
            return null;
        }
    }, [presets, loadPresets]);

    const updatePreset = useCallback(async (id: string, updates: { name?: string; characterIds?: string[] }) => {
        try {
            const res = await fetch(`/api/v1/presets/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message ?? 'Failed to update');
            await loadPresets();
            return json.data;
        } catch (err) {
            setError((err as Error).message);
            return null;
        }
    }, [loadPresets]);

    const deletePreset = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/v1/presets/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message ?? 'Failed to delete');
            await loadPresets();
            return true;
        } catch (err) {
            setError((err as Error).message);
            return false;
        }
    }, [loadPresets]);

    const setFavorite = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/v1/presets/${id}`, { method: 'PATCH' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message ?? 'Failed to set favorite');
            await loadPresets();
            return true;
        } catch (err) {
            setError((err as Error).message);
            return false;
        }
    }, [loadPresets]);

    return {
        presets,
        favorite,
        loading,
        error,
        canAddMore: presets.length < MAX_PRESETS,
        maxPresets: MAX_PRESETS,
        loadPresets,
        savePreset,
        updatePreset,
        deletePreset,
        setFavorite,
    };
}
