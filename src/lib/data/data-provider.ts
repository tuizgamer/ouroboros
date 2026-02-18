// ============================================================
// Arena Ouroboros — DataProvider Interface
// Abstract storage layer: JSON now, Supabase later.
// ============================================================

import type { Character } from '@/types/game';
import type { CharacterVersion } from '@/types/api';

export interface DataProvider {
    // --- Read ---
    listLive(): Promise<Character[]>;
    listDraft(): Promise<Character[]>;
    getLive(id: string): Promise<Character | null>;
    getDraft(id: string): Promise<Character | null>;

    // --- Write (Draft only) ---
    saveDraft(character: Character): Promise<Character>;
    deleteDraft(id: string): Promise<boolean>;

    // --- Publish (Draft → Live) ---
    publish(id: string, author: string, changeSummary: string): Promise<CharacterVersion>;
    publishAll(author: string, changeSummary: string): Promise<CharacterVersion[]>;

    // --- Versioning ---
    getVersions(charId: string): Promise<CharacterVersion[]>;
    rollback(charId: string, version: number): Promise<Character>;
}

// --- Factory ---

export type ProviderType = 'json' | 'supabase';

let _provider: DataProvider | null = null;

export async function getDataProvider(type: ProviderType = 'json'): Promise<DataProvider> {
    if (_provider) return _provider;

    switch (type) {
        case 'json': {
            const { JsonDataProvider } = await import('./json-provider');
            _provider = new JsonDataProvider();
            break;
        }
        case 'supabase': {
            throw new Error('Supabase provider not implemented yet (Fase 6)');
        }
        default:
            throw new Error(`Unknown provider type: ${type}`);
    }

    return _provider;
}
