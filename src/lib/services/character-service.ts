// ============================================================
// Arena Ouroboros — Character Service
// Business logic: CRUD, Draft/Live, Publish, Versioning
// ============================================================

import type { Character } from '@/types/game';
import type { CharacterVersion } from '@/types/api';
import { getDataProvider } from '@/lib/data/data-provider';
import { validateCharacter } from '@/lib/api/validate';

async function provider() {
    return getDataProvider('json');
}

// --- Read ---

export async function listLiveCharacters(): Promise<Character[]> {
    const dp = await provider();
    return dp.listLive();
}

export async function listDraftCharacters(): Promise<Character[]> {
    const dp = await provider();
    return dp.listDraft();
}

export async function getLiveCharacter(id: string): Promise<Character | null> {
    const dp = await provider();
    return dp.getLive(id);
}

export async function getDraftCharacter(id: string): Promise<Character | null> {
    const dp = await provider();
    return dp.getDraft(id);
}

// --- Write ---

export async function createCharacter(
    data: unknown
): Promise<{ character?: Character; errors?: string[] }> {
    const validation = validateCharacter(data);
    if (!validation.valid) {
        return { errors: validation.errors };
    }

    const char = data as Character;
    const dp = await provider();

    // Check for duplicate ID
    const existing = await dp.getDraft(char.id);
    if (existing) {
        return { errors: [`Character with id "${char.id}" already exists in drafts`] };
    }

    const saved = await dp.saveDraft(char);
    return { character: saved };
}

export async function updateCharacter(
    id: string,
    data: unknown
): Promise<{ character?: Character; errors?: string[] }> {
    const dp = await provider();

    const existing = await dp.getDraft(id);
    if (!existing) {
        return { errors: [`Character "${id}" not found in drafts`] };
    }

    // Merge: keep ID from URL, rest from body
    const merged = { ...(data as Character), id };
    const validation = validateCharacter(merged);
    if (!validation.valid) {
        return { errors: validation.errors };
    }

    const saved = await dp.saveDraft(merged);
    return { character: saved };
}

export async function deleteCharacter(
    id: string
): Promise<{ deleted: boolean; error?: string }> {
    const dp = await provider();
    const deleted = await dp.deleteDraft(id);
    if (!deleted) {
        return { deleted: false, error: `Character "${id}" not found in drafts` };
    }
    return { deleted: true };
}

// --- Publish ---

export async function publishCharacter(
    id: string,
    author: string,
    changeSummary: string
): Promise<{ version?: CharacterVersion; error?: string }> {
    try {
        const dp = await provider();
        const version = await dp.publish(id, author, changeSummary);
        return { version };
    } catch (err) {
        return { error: (err as Error).message };
    }
}

export async function publishAllCharacters(
    author: string,
    changeSummary: string
): Promise<{ versions?: CharacterVersion[]; error?: string }> {
    try {
        const dp = await provider();
        const versions = await dp.publishAll(author, changeSummary);
        return { versions };
    } catch (err) {
        return { error: (err as Error).message };
    }
}

// --- Versioning ---

export async function getCharacterVersions(
    charId: string
): Promise<CharacterVersion[]> {
    const dp = await provider();
    return dp.getVersions(charId);
}

export async function rollbackCharacter(
    charId: string,
    version: number
): Promise<{ character?: Character; error?: string }> {
    try {
        const dp = await provider();
        const character = await dp.rollback(charId, version);
        return { character };
    } catch (err) {
        return { error: (err as Error).message };
    }
}
