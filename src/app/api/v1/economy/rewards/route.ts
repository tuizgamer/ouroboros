// ============================================================
// Arena Ouroboros — Post-Match Rewards API
// POST: Calculate & apply rewards after a match
// Server-side validation for PvP match ownership & anti-replay
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
    calculateMatchRewards,
    applyRewards,
    recordMatch,
    updateElo,
} from '@/lib/services/economy-service';
import { updateMissionProgress } from '@/lib/services/mission-service';
import { apiSuccess, apiError } from '@/lib/api/response';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limiter';
import type { MatchResult } from '@/types/api';

export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    // Rate limit: 3 req/min (sensitive endpoint)
    const rl = checkRateLimit(`rewards:${user.id}`, 3);
    if (!rl.allowed) return rateLimitResponse(rl);

    let body: { matchResult: MatchResult };
    try {
        body = await request.json();
    } catch {
        return apiError('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    if (!body.matchResult) {
        return apiError('BAD_REQUEST', 'matchResult is required', 400);
    }

    const { matchResult } = body;

    // --- PvP match validation (when matchId provided) ---
    if (matchResult.matchId) {
        const { data: match, error: fetchErr } = await supabase
            .from('active_matches')
            .select('id, player_a_id, player_b_id, status, match_state')
            .eq('id', matchResult.matchId)
            .single();

        if (fetchErr || !match) {
            return apiError('NOT_FOUND', 'Match not found', 404);
        }

        // Verify user is a participant
        if (match.player_a_id !== user.id && match.player_b_id !== user.id) {
            return apiError('FORBIDDEN', 'You are not a participant in this match', 403);
        }

        // Verify match is finished
        if (match.status !== 'finished') {
            return apiError('BAD_REQUEST', 'Match is not finished', 400);
        }

        // Check for double-reward (prevent replay attacks)
        const state = match.match_state as Record<string, unknown>;
        const rewardedBy = (state?.rewarded_by as string[]) ?? [];
        if (rewardedBy.includes(user.id)) {
            return apiError('CONFLICT', 'Rewards already claimed for this match', 409);
        }

        // Mark as rewarded for this user
        await supabase
            .from('active_matches')
            .update({
                match_state: {
                    ...state,
                    rewarded_by: [...rewardedBy, user.id],
                },
            })
            .eq('id', matchResult.matchId);

        // Server-authoritative win check for PvP
        const serverWinner = state?.winner as string | null;
        if (serverWinner) {
            const isPlayerA = match.player_a_id === user.id;
            const serverWon = (serverWinner === 'playerA' && isPlayerA) ||
                (serverWinner === 'playerB' && !isPlayerA);
            if (matchResult.won !== serverWon) {
                matchResult.won = serverWon; // Override client claim
            }
        }
    }

    // 1. Calculate rewards (pure logic)
    const rewards = calculateMatchRewards(matchResult);

    // 2. Apply to database
    await applyRewards(supabase, user.id, rewards);

    // 3. Record match history
    await recordMatch(supabase, user.id, matchResult, rewards);

    // 4. Update ELO rating (only for PvP/Ranked)
    let elo = { newElo: 0, delta: 0 };
    if (matchResult.mode !== 'ai') {
        elo = await updateElo(supabase, user.id, matchResult.won);
    }

    // 5. Update mission progress
    const { completed } = await updateMissionProgress(
        supabase,
        user.id,
        rewards.missionEvents
    );

    return apiSuccess({
        rewards,
        elo,
        completedMissions: completed,
    });
}
