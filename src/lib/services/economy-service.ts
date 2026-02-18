// ============================================================
// Arena Ouroboros — Economy Service
// Post-match rewards, XP, and currency management
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    MatchResult,
    CalculatedRewards,
    MissionEvent,
    PlayerDashboard,
    PlayerProfile,
    Currency,
    LineageProgress,
    PlayerMission,
    PerCharStats,
} from '@/types/api';

// --- Constants ---

const XP_BASE_WIN = 100;
const XP_BASE_LOSS = 40;
const FRAGMENTS_BASE_WIN = 50;
const FRAGMENTS_BASE_LOSS = 15;
const XP_PER_TURN_BONUS = 5;
const XP_PER_100_DAMAGE = 10;

// Multipliers for different modes (extensible)
const XP_MULT_AI = 0;
const FRAG_MULT_AI = 0;

const XP_PER_LEVEL = 500; // XP required per level

const ELO_K_FACTOR = 32; // Standard K-factor for ELO calculation
const ELO_DEFAULT = 1000;

// --- ELO Calculation ---

function calculateEloDelta(playerElo: number, opponentElo: number, won: boolean): number {
    const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    const actual = won ? 1 : 0;
    return Math.round(ELO_K_FACTOR * (actual - expected));
}

export async function updateElo(
    supabase: SupabaseClient,
    profileId: string,
    won: boolean,
    opponentElo: number = ELO_DEFAULT
): Promise<{ newElo: number; delta: number }> {
    const { data: profile } = await supabase
        .from('profiles')
        .select('elo_rating, total_battles, wins')
        .eq('id', profileId)
        .single();

    const currentElo = profile?.elo_rating ?? ELO_DEFAULT;
    const delta = calculateEloDelta(currentElo, opponentElo, won);
    const newElo = Math.max(0, currentElo + delta);

    await supabase
        .from('profiles')
        .update({
            elo_rating: newElo,
            total_battles: (profile?.total_battles ?? 0) + 1,
            wins: (profile?.wins ?? 0) + (won ? 1 : 0),
            last_active: new Date().toISOString(),
        })
        .eq('id', profileId);

    return { newElo, delta };
}

// --- Reward Calculation (Pure Logic) ---

export function calculateMatchRewards(result: MatchResult): CalculatedRewards {
    const isAi = result.mode === 'ai';
    const xpMult = isAi ? XP_MULT_AI : 1;
    const fragMult = isAi ? FRAG_MULT_AI : 1;

    const baseXp = result.won ? XP_BASE_WIN : XP_BASE_LOSS;
    const turnBonus = Math.min(result.turns, 10) * XP_PER_TURN_BONUS;
    const damageBonus = Math.floor(result.totalDamageDealt / 100) * XP_PER_100_DAMAGE;
    const totalXp = Math.floor((baseXp + turnBonus + damageBonus) * xpMult);

    const fragments = Math.floor((result.won ? FRAGMENTS_BASE_WIN : FRAGMENTS_BASE_LOSS) * fragMult);

    // Generate mission events from match data
    // For now, AI matches do not contribute to missions
    const missionEvents: MissionEvent[] = isAi ? [] : [
        { type: 'MATCH_FINISHED', value: 1 },
    ];

    if (!isAi && result.won) {
        missionEvents.push({ type: 'MATCH_WON', value: 1 });
        missionEvents.push({
            type: 'MATCH_WON_TEAM_LINEAGE',
            value: 1,
        });
    }

    if (!isAi && result.totalDamageVlt > 0) {
        missionEvents.push({ type: 'DAMAGE_DEALT_VLT', value: result.totalDamageVlt });
    }

    if (!isAi && result.burnCount > 0) {
        missionEvents.push({ type: 'BURN_ENERGY_COUNT', value: result.burnCount });
    }

    return {
        xp: {
            lineage: result.teamLineage.toLowerCase(),
            amount: totalXp,
        },
        fragments,
        missionEvents,
    };
}

// --- Database Operations ---

export async function applyRewards(
    supabase: SupabaseClient,
    profileId: string,
    rewards: CalculatedRewards
): Promise<void> {
    // 1. Upsert lineage XP
    const { data: existingProgress } = await supabase
        .from('lineage_progress')
        .select('xp, level')
        .eq('profile_id', profileId)
        .eq('lineage_id', rewards.xp.lineage)
        .single();

    const currentXp = existingProgress?.xp ?? 0;
    const newXp = currentXp + rewards.xp.amount;
    const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1;

    await supabase.from('lineage_progress').upsert({
        profile_id: profileId,
        lineage_id: rewards.xp.lineage,
        xp: newXp,
        level: newLevel,
    });

    // 2. Upsert currency (core_fragments)
    const { data: existingCurrency } = await supabase
        .from('currencies')
        .select('balance')
        .eq('profile_id', profileId)
        .eq('currency_id', 'core_fragments')
        .single();

    const currentBalance = existingCurrency?.balance ?? 0;

    await supabase.from('currencies').upsert({
        profile_id: profileId,
        currency_id: 'core_fragments',
        balance: currentBalance + rewards.fragments,
    });

    // 3. Update profile stats
    await supabase.rpc('increment_battle_stats', {
        p_profile_id: profileId,
        p_won: rewards.xp.amount >= XP_BASE_WIN, // won if XP >= win threshold
    });
}

export async function recordMatch(
    supabase: SupabaseClient,
    profileId: string,
    result: MatchResult,
    rewards: CalculatedRewards
): Promise<void> {
    // Build player_stats JSONB
    const playerStats = {
        mode: result.mode,
        team_lineages: result.perCharStats.map(c => c.lineage),
        damage_dealt: result.totalDamageDealt,
        damage_received: result.totalDamageReceived,
        healing_done: result.totalHealingDone,
        shield_given: result.totalShieldGiven,
        kills: result.kills,
        burn_count: result.burnCount,
        mvp_character_id: getMvpCharId(result.perCharStats),
    };

    // Build match_metadata JSONB (admin only)
    const matchMetadata = {
        status_effects_applied: result.statusEffectsApplied,
        cancels_inflicted: result.cancelsInflicted,
        per_char_stats: result.perCharStats,
    };

    // 1. Insert match_history
    const { data: match } = await supabase
        .from('match_history')
        .insert({
            profile_id: profileId,
            won: result.won,
            mode: result.mode,
            team_lineage: result.teamLineage,
            total_damage_dealt: result.totalDamageDealt,
            total_damage_vlt: result.totalDamageVlt,
            burn_count: result.burnCount,
            turns: result.turns,
            team_character_ids: result.teamCharacterIds,
            duration_seconds: result.durationSeconds,
            xp_earned: rewards.xp.amount,
            fragments_earned: rewards.fragments,
            player_stats: playerStats,
            replay_actions: result.replayActions,
            match_metadata: matchMetadata,
        })
        .select('id')
        .single();

    // 2. Insert match_roster (per-character stats)
    if (match?.id && result.perCharStats.length > 0) {
        const mvpId = getMvpCharId(result.perCharStats);
        const rosterRows = result.perCharStats.map(cs => ({
            match_id: match.id,
            character_id: cs.characterId,
            lineage: cs.lineage,
            damage_dealt: cs.damageDealt,
            healing_done: cs.healingDone,
            shield_given: cs.shieldGiven,
            kills: cs.kills,
            is_mvp: cs.characterId === mvpId,
        }));
        await supabase.from('match_roster').insert(rosterRows);
    }
}

function getMvpCharId(stats: PerCharStats[]): string {
    if (stats.length === 0) return '';
    return stats.reduce((best, cur) =>
        cur.damageDealt > best.damageDealt ? cur : best
    ).characterId;
}

export async function getPlayerDashboard(
    supabase: SupabaseClient,
    profileId: string
): Promise<PlayerDashboard | null> {
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .single<PlayerProfile>();

    if (!profile) return null;

    const { data: currencies } = await supabase
        .from('currencies')
        .select('*')
        .eq('profile_id', profileId)
        .returns<Currency[]>();

    const { data: lineageProgress } = await supabase
        .from('lineage_progress')
        .select('*')
        .eq('profile_id', profileId)
        .returns<LineageProgress[]>();

    const { data: unlockedChars } = await supabase
        .from('unlocked_characters')
        .select('character_id')
        .eq('profile_id', profileId);

    const { data: missions } = await supabase
        .from('player_missions')
        .select('*, mission:missions(*)')
        .eq('profile_id', profileId)
        .returns<PlayerMission[]>();

    return {
        profile,
        currencies: currencies ?? [],
        lineageProgress: lineageProgress ?? [],
        unlockedCharacters: (unlockedChars ?? []).map((u) => u.character_id),
        activeMissions: missions ?? [],
    };
}
