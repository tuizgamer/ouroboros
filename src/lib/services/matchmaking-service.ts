// ============================================================
// Arena Ouroboros — Matchmaking Service
// Handles queue management and opponent matching by ELO
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import charactersData from '@/data/characters_live.json';
import type { Character, MatchState } from '@/types/game';
import { OuroborosEngine, createCharacterState } from '@/lib/engine';

const characters = charactersData as Character[];

// ELO windows expand over time (seconds since queued)
const ELO_WINDOWS = [
    { afterSeconds: 0, range: 50 },
    { afterSeconds: 10, range: 150 },
    { afterSeconds: 25, range: 400 },
    { afterSeconds: 40, range: Infinity }, // Fallback: any opponent or AI
];

// --- Team Validation (reusable) ---

export async function validateTeam(
    supabase: SupabaseClient,
    userId: string,
    characterIds: string[]
): Promise<{ valid: boolean; reason?: string }> {
    if (!Array.isArray(characterIds) || characterIds.length !== 3) {
        return { valid: false, reason: 'Team must have exactly 3 characters' };
    }

    if (new Set(characterIds).size !== 3) {
        return { valid: false, reason: 'Duplicate characters not allowed' };
    }

    const resolved = characterIds.map(id => characters.find(c => c.id === id));
    const invalid = characterIds.filter((_, i) => !resolved[i]);
    if (invalid.length > 0) {
        return { valid: false, reason: `Unknown characters: ${invalid.join(', ')}` };
    }

    const nonStarters = resolved.filter(c => c && !c.is_starter);
    if (nonStarters.length > 0) {
        const { data: unlocked } = await supabase
            .from('unlocked_characters')
            .select('character_id')
            .eq('profile_id', userId);

        const unlockedSet = new Set((unlocked ?? []).map(u => u.character_id));
        const locked = nonStarters.filter(c => c && !unlockedSet.has(c.id));

        if (locked.length > 0) {
            return { valid: false, reason: `Characters not unlocked: ${locked.map(c => c!.name).join(', ')}` };
        }
    }

    return { valid: true };
}

// --- Build initial match state (same as useArena's buildInitialState) ---

function buildInitialMatchState(
    teamAIds: string[],
    teamBIds: string[],
    playerAId: string,
    playerBId: string,
): MatchState {
    const teamAChars = teamAIds.map(id => characters.find(c => c.id === id)).filter(Boolean) as Character[];
    const teamBChars = teamBIds.map(id => characters.find(c => c.id === id)).filter(Boolean) as Character[];

    const state: MatchState = {
        playerA: {
            id: playerAId,
            team: teamAChars.map(c => createCharacterState(c.id, c.name, c.base_hp, c.skills)),
            pendingBurn: [],
            nextTurnExtraEnergy: 0,
        },
        playerB: {
            id: playerBId,
            team: teamBChars.map(c => createCharacterState(c.id, c.name, c.base_hp, c.skills)),
            pendingBurn: [],
            nextTurnExtraEnergy: 0,
        },
        turn: 1,
        phase: 'PLANNING',
        winner: null,
    };

    OuroborosEngine.grantEnergy(state, [...teamAChars, ...teamBChars]);
    return state;
}

// --- Queue Management ---

export async function enterQueue(
    supabase: SupabaseClient,
    userId: string,
    teamIds: string[],
    mode: 'quick' | 'ranked'
): Promise<{ queued: boolean; error?: string }> {
    // Block if player already has an active match
    const { data: activeMatch } = await supabase
        .from('active_matches')
        .select('id')
        .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
        .neq('status', 'finished')
        .limit(1)
        .maybeSingle();

    if (activeMatch) {
        return { queued: false, error: 'You already have an active match. Finish it before starting a new one.' };
    }

    // Get player ELO
    const { data: profile } = await supabase
        .from('profiles')
        .select('elo_rating')
        .eq('id', userId)
        .single();

    const elo = profile?.elo_rating ?? 1000;

    // Insert into queue (UNIQUE constraint prevents double-queue)
    const { error } = await supabase
        .from('matchmaking_queue')
        .upsert({
            profile_id: userId,
            team_ids: teamIds,
            mode,
            elo_rating: elo,
            queued_at: new Date().toISOString(),
        });

    if (error) {
        return { queued: false, error: error.message };
    }

    return { queued: true };
}

export async function leaveQueue(
    supabase: SupabaseClient,
    userId: string
): Promise<void> {
    await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('profile_id', userId);
}

// --- Matchmaking Logic ---

export async function findMatch(
    supabase: SupabaseClient,
    userId: string
): Promise<{
    status: 'searching' | 'matched' | 'not_queued';
    matchId?: string;
    opponent?: { username: string; elo: number };
}> {
    // 1. Get current player's queue entry
    const { data: myEntry } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('profile_id', userId)
        .single();

    if (!myEntry) {
        // Check if already in an active match
        const { data: existingMatch } = await supabase
            .from('active_matches')
            .select('id')
            .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
            .eq('status', 'in_progress')
            .single();

        if (existingMatch) {
            return { status: 'matched', matchId: existingMatch.id };
        }

        return { status: 'not_queued' };
    }

    // 2. Calculate ELO window based on time in queue
    const queuedAt = new Date(myEntry.queued_at).getTime();
    const waitSeconds = (Date.now() - queuedAt) / 1000;

    let eloRange = ELO_WINDOWS[0].range;
    for (const window of ELO_WINDOWS) {
        if (waitSeconds >= window.afterSeconds) {
            eloRange = window.range;
        }
    }

    // 3. Search for opponent (quick mode: no ELO filter)
    const isQuick = myEntry.mode === 'quick';

    let query = supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('mode', myEntry.mode)
        .neq('profile_id', userId)
        .order('queued_at', { ascending: true })
        .limit(1);

    // Ranked: apply ELO window filter
    if (!isQuick) {
        const minElo = myEntry.elo_rating - eloRange;
        const maxElo = myEntry.elo_rating + eloRange;
        query = query.gte('elo_rating', minElo).lte('elo_rating', maxElo);
    }

    const { data: candidates } = await query;

    if (!candidates || candidates.length === 0) {
        return { status: 'searching' };
    }

    const opponent = candidates[0];

    // 4. Create active match with initialized match_state
    const initialState = buildInitialMatchState(
        myEntry.team_ids,
        opponent.team_ids,
        userId,
        opponent.profile_id,
    );

    const { data: match, error: matchError } = await supabase
        .from('active_matches')
        .insert({
            player_a_id: userId,
            player_b_id: opponent.profile_id,
            team_a: myEntry.team_ids,
            team_b: opponent.team_ids,
            mode: myEntry.mode,
            status: 'in_progress',
            match_state: {
                ...initialState,
                turn_deadline: new Date(Date.now() + 45_000).toISOString(),
                consecutive_passes_a: 0,
                consecutive_passes_b: 0,
            },
        })
        .select('id')
        .single();

    if (matchError || !match) {
        return { status: 'searching' };
    }

    // 5. Remove both players from queue
    await supabase
        .from('matchmaking_queue')
        .delete()
        .in('profile_id', [userId, opponent.profile_id]);

    // 6. Get opponent profile
    const { data: opponentProfile } = await supabase
        .from('profiles')
        .select('username, elo_rating')
        .eq('id', opponent.profile_id)
        .single();

    return {
        status: 'matched',
        matchId: match.id,
        opponent: {
            username: opponentProfile?.username ?? 'Unknown',
            elo: opponentProfile?.elo_rating ?? 1000,
        },
    };
}
