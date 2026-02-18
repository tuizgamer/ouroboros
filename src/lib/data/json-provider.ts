// ============================================================
// Arena Ouroboros — JSON DataProvider Implementation
// Filesystem-based draft/live/versioning using JSON files.
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import type { Character } from '@/types/game';
import type { CharacterVersion } from '@/types/api';
import type { DataProvider } from './data-provider';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const DRAFT_FILE = path.join(DATA_DIR, 'characters_draft.json');
const LIVE_FILE = path.join(DATA_DIR, 'characters_live.json');
const VERSIONS_DIR = path.join(DATA_DIR, 'versions');

async function ensureDir(dir: string): Promise<void> {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch {
        // already exists
    }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export class JsonDataProvider implements DataProvider {
    // --- Read ---

    async listLive(): Promise<Character[]> {
        return readJsonFile<Character[]>(LIVE_FILE);
    }

    async listDraft(): Promise<Character[]> {
        return readJsonFile<Character[]>(DRAFT_FILE);
    }

    async getLive(id: string): Promise<Character | null> {
        const all = await this.listLive();
        return all.find((c) => c.id === id) ?? null;
    }

    async getDraft(id: string): Promise<Character | null> {
        const all = await this.listDraft();
        return all.find((c) => c.id === id) ?? null;
    }

    // --- Write (Draft only) ---

    async saveDraft(character: Character): Promise<Character> {
        const all = await this.listDraft();
        const idx = all.findIndex((c) => c.id === character.id);

        if (idx >= 0) {
            all[idx] = character;
        } else {
            all.push(character);
        }

        await writeJsonFile(DRAFT_FILE, all);
        return character;
    }

    async deleteDraft(id: string): Promise<boolean> {
        const all = await this.listDraft();
        const filtered = all.filter((c) => c.id !== id);
        if (filtered.length === all.length) return false;
        await writeJsonFile(DRAFT_FILE, filtered);
        return true;
    }

    // --- Publish ---

    async publish(
        id: string,
        author: string,
        changeSummary: string
    ): Promise<CharacterVersion> {
        const draft = await this.getDraft(id);
        if (!draft) throw new Error(`Draft not found: ${id}`);

        // Get current version number
        const versions = await this.getVersions(id);
        const nextVersion = versions.length > 0
            ? Math.max(...versions.map((v) => v.version)) + 1
            : 1;

        // Create version snapshot
        const versionEntry: CharacterVersion = {
            charId: id,
            version: nextVersion,
            data: JSON.parse(JSON.stringify(draft)),
            timestamp: new Date().toISOString(),
            changeSummary,
            author,
        };

        await this.saveVersion(versionEntry);

        // Update live
        const liveChars = await this.listLive();
        const liveIdx = liveChars.findIndex((c) => c.id === id);
        if (liveIdx >= 0) {
            liveChars[liveIdx] = draft;
        } else {
            liveChars.push(draft);
        }
        await writeJsonFile(LIVE_FILE, liveChars);

        return versionEntry;
    }

    async publishAll(
        author: string,
        changeSummary: string
    ): Promise<CharacterVersion[]> {
        const drafts = await this.listDraft();
        const results: CharacterVersion[] = [];

        for (const draft of drafts) {
            const version = await this.publish(draft.id, author, changeSummary);
            results.push(version);
        }

        return results;
    }

    // --- Versioning ---

    async getVersions(charId: string): Promise<CharacterVersion[]> {
        await ensureDir(VERSIONS_DIR);

        const files = await fs.readdir(VERSIONS_DIR);
        const charFiles = files.filter(
            (f) => f.startsWith(`${charId}_v`) && f.endsWith('.json')
        );

        const versions: CharacterVersion[] = [];
        for (const file of charFiles) {
            const data = await readJsonFile<CharacterVersion>(
                path.join(VERSIONS_DIR, file)
            );
            versions.push(data);
        }

        return versions.sort((a, b) => b.version - a.version);
    }

    async rollback(charId: string, version: number): Promise<Character> {
        const versions = await this.getVersions(charId);
        const target = versions.find((v) => v.version === version);
        if (!target) throw new Error(`Version ${version} not found for ${charId}`);

        // Overwrite draft with the historical version
        await this.saveDraft(target.data);
        return target.data;
    }

    // --- Internal ---

    private async saveVersion(entry: CharacterVersion): Promise<void> {
        await ensureDir(VERSIONS_DIR);
        const fileName = `${entry.charId}_v${entry.version}.json`;
        await writeJsonFile(path.join(VERSIONS_DIR, fileName), entry);
    }
}
