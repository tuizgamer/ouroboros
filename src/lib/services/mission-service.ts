// ============================================================
// Arena Ouroboros — Mission Service
// Progress tracking, completion, and reward claiming
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MissionEvent, PlayerMission } from '@/types/api';
import type { Mission } from '@/types/game';

// --- Progress Update ---

export async function updateMissionProgress(
    supabase: SupabaseClient,
    profileId: string,
    events: MissionEvent[]
): Promise<{ completed: string[] }> {
    const completed: string[] = [];

    // Get all player missions in progress
    const { data: playerMissions } = await supabase
        .from('player_missions')
        .select('*, mission:missions(*)')
        .eq('profile_id', profileId)
        .eq('status', 'IN_PROGRESS')
        .returns<PlayerMission[]>();

    if (!playerMissions || playerMissions.length === 0) return { completed };

    for (const pm of playerMissions) {
        if (!pm.mission) continue;

        // Find matching events for this mission's requirement type
        const matchingEvents = events.filter(
            (e) => e.type === pm.mission!.requirement_type
        );

        if (matchingEvents.length === 0) continue;

        // Sum the values from matching events
        const totalIncrement = matchingEvents.reduce((sum, e) => sum + e.value, 0);
        const newProgress = pm.current_progress + totalIncrement;

        // Check if mission is now complete
        const isComplete = newProgress >= pm.mission.requirement_value;

        await supabase
            .from('player_missions')
            .update({
                current_progress: Math.min(newProgress, pm.mission.requirement_value),
                status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
            })
            .eq('id', pm.id);

        if (isComplete) {
            completed.push(pm.mission_id);
        }
    }

    return { completed };
}

// --- Claim Reward ---

export async function claimMissionReward(
    supabase: SupabaseClient,
    profileId: string,
    missionId: string
): Promise<{ success: boolean; error?: string; rewardType?: string; rewardId?: string }> {
    // 1. Get the player mission
    const { data: pm } = await supabase
        .from('player_missions')
        .select('*, mission:missions(*)')
        .eq('profile_id', profileId)
        .eq('mission_id', missionId)
        .single<PlayerMission>();

    if (!pm) {
        return { success: false, error: 'Mission not found for this player' };
    }

    if (pm.status !== 'COMPLETED') {
        return { success: false, error: `Mission status is "${pm.status}", expected "COMPLETED"` };
    }

    if (!pm.mission) {
        return { success: false, error: 'Mission data missing' };
    }

    // 2. Grant reward based on type
    switch (pm.mission.reward_type) {
        case 'CHARACTER': {
            await supabase.from('unlocked_characters').upsert({
                profile_id: profileId,
                character_id: pm.mission.reward_id,
            });
            break;
        }

        case 'XP': {
            // Grant XP to a generic lineage pool
            const xpAmount = parseInt(pm.mission.reward_id) || 200;
            const { data: existing } = await supabase
                .from('lineage_progress')
                .select('xp')
                .eq('profile_id', profileId)
                .eq('lineage_id', 'universal')
                .single();

            await supabase.from('lineage_progress').upsert({
                profile_id: profileId,
                lineage_id: 'universal',
                xp: (existing?.xp ?? 0) + xpAmount,
                level: Math.floor(((existing?.xp ?? 0) + xpAmount) / 500) + 1,
            });
            break;
        }

        case 'LINEAGE_SKILL': {
            // Unlock a lineage skill (future: unlocked_lineage_skills table)
            // For now, store as a special unlock
            await supabase.from('unlocked_characters').upsert({
                profile_id: profileId,
                character_id: pm.mission.reward_id, // skill_id stored here for now
            });
            break;
        }

        default:
            return { success: false, error: `Unknown reward type: ${pm.mission.reward_type}` };
    }

    // 3. Mark mission as claimed
    await supabase
        .from('player_missions')
        .update({ status: 'CLAIMED' })
        .eq('id', pm.id);

    return {
        success: true,
        rewardType: pm.mission.reward_type,
        rewardId: pm.mission.reward_id,
    };
}

// --- Initialize Player Missions ---

export async function initializePlayerMissions(
    supabase: SupabaseClient,
    profileId: string
): Promise<void> {
    // Get all missions
    const { data: allMissions } = await supabase
        .from('missions')
        .select('id')
        .returns<{ id: string }[]>();

    if (!allMissions || allMissions.length === 0) return;

    // Get existing player missions
    const { data: existing } = await supabase
        .from('player_missions')
        .select('mission_id')
        .eq('profile_id', profileId);

    const existingIds = new Set((existing ?? []).map((e) => e.mission_id));

    // Create missing player missions
    const toInsert = allMissions
        .filter((m) => !existingIds.has(m.id))
        .map((m) => ({
            profile_id: profileId,
            mission_id: m.id,
            current_progress: 0,
            status: 'IN_PROGRESS',
        }));

    if (toInsert.length > 0) {
        await supabase.from('player_missions').insert(toInsert);
    }
}
