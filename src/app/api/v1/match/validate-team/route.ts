// ============================================================
// Arena Ouroboros — Team Validation API
// POST: Validates a team selection before match start
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';
import charactersData from '@/data/characters_live.json';
import type { Character } from '@/types/game';

const characters = charactersData as Character[];
const VALID_MODES = ['quick', 'ranked'] as const;

export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    let body: { characterIds: string[]; mode: string };
    try {
        body = await request.json();
    } catch {
        return apiError('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    const { characterIds, mode } = body;

    // --- Validate mode ---
    if (!mode || !VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
        return apiError('BAD_REQUEST', `Invalid mode. Must be one of: ${VALID_MODES.join(', ')}`, 400);
    }

    // --- Validate team structure ---
    if (!Array.isArray(characterIds) || characterIds.length !== 3) {
        return apiError('BAD_REQUEST', 'Team must have exactly 3 characters', 400);
    }

    const uniqueIds = new Set(characterIds);
    if (uniqueIds.size !== 3) {
        return apiError('BAD_REQUEST', 'Duplicate characters are not allowed', 400);
    }

    // --- Validate characters exist ---
    const resolvedChars = characterIds.map(id => characters.find(c => c.id === id));
    const invalidIds = characterIds.filter((_, i) => !resolvedChars[i]);
    if (invalidIds.length > 0) {
        return apiError('BAD_REQUEST', `Unknown character IDs: ${invalidIds.join(', ')}`, 400);
    }

    // --- Validate character access ---
    const nonStarters = resolvedChars.filter(c => c && !c.is_starter);

    if (nonStarters.length > 0) {
        // Check if player has unlocked these characters
        const { data: unlockedChars } = await supabase
            .from('unlocked_characters')
            .select('character_id')
            .eq('profile_id', user.id);

        const unlockedSet = new Set((unlockedChars ?? []).map(u => u.character_id));
        const lockedChars = nonStarters.filter(c => c && !unlockedSet.has(c.id));

        if (lockedChars.length > 0) {
            return apiError(
                'FORBIDDEN',
                `Characters not unlocked: ${lockedChars.map(c => c!.name).join(', ')}`,
                403
            );
        }
    }

    return apiSuccess({
        valid: true,
        mode,
        team: resolvedChars.map(c => ({
            id: c!.id,
            name: c!.name,
            lineage: c!.lineage,
        })),
    });
}
