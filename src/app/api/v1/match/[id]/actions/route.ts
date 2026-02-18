// ============================================================
// Arena Ouroboros — Match Actions API
// POST: Submit turn actions → resolve when both players ready
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limiter';
import { OuroborosEngine } from '@/lib/engine';
import charactersData from '@/data/characters_live.json';
import type { Character, MatchAction, MatchState } from '@/types/game';

const characters = charactersData as Character[];

interface PvPMatchState extends MatchState {
    pending_actions_a?: MatchAction[];
    pending_actions_b?: MatchAction[];
    pending_burns_a?: string[];
    pending_burns_b?: string[];
    action_submitted_at_a?: string;
    action_submitted_at_b?: string;
    turn_deadline?: string;
    consecutive_passes_a?: number;
    consecutive_passes_b?: number;
}

const TURN_TIMEOUT_MS = 45_000; // 45 seconds

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: matchId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    // Rate limit: 10 req/min per user per match
    const rl = checkRateLimit(`actions:${user.id}:${matchId}`, 10);
    if (!rl.allowed) return rateLimitResponse(rl);

    // Parse body
    let body: { actions: MatchAction[]; burns?: string[] };
    try {
        body = await request.json();
    } catch {
        return apiError('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    const { actions, burns = [] } = body;

    if (!Array.isArray(actions)) {
        return apiError('BAD_REQUEST', 'actions must be an array', 400);
    }

    // Fetch match
    const { data: match, error: fetchError } = await supabase
        .from('active_matches')
        .select('*')
        .eq('id', matchId)
        .single();

    if (fetchError || !match) {
        return apiError('NOT_FOUND', 'Match not found', 404);
    }

    if (match.status !== 'in_progress') {
        return apiError('BAD_REQUEST', 'Match is not in progress', 400);
    }

    // Determine role
    const isPlayerA = match.player_a_id === user.id;
    const isPlayerB = match.player_b_id === user.id;

    if (!isPlayerA && !isPlayerB) {
        return apiError('FORBIDDEN', 'You are not a participant', 403);
    }

    const role = isPlayerA ? 'a' : 'b';
    const matchState = match.match_state as PvPMatchState;

    // Check if already submitted this turn
    if (role === 'a' && matchState.pending_actions_a) {
        return apiError('BAD_REQUEST', 'Actions already submitted this turn', 400);
    }
    if (role === 'b' && matchState.pending_actions_b) {
        return apiError('BAD_REQUEST', 'Actions already submitted this turn', 400);
    }

    // Validate actions: each caster must belong to player's team
    const playerTeamIds = new Set(
        role === 'a' ? match.team_a : match.team_b
    );
    for (const action of actions) {
        if (!playerTeamIds.has(action.casterId)) {
            return apiError('BAD_REQUEST', `Character ${action.casterId} is not on your team`, 400);
        }
    }

    // Store pending actions
    const updatedState: PvPMatchState = { ...matchState };
    if (role === 'a') {
        updatedState.pending_actions_a = actions;
        updatedState.pending_burns_a = burns;
        updatedState.action_submitted_at_a = new Date().toISOString();
    } else {
        updatedState.pending_actions_b = actions;
        updatedState.pending_burns_b = burns;
        updatedState.action_submitted_at_b = new Date().toISOString();
    }

    const bothSubmitted = updatedState.pending_actions_a && updatedState.pending_actions_b;

    if (!bothSubmitted) {
        // Save and wait for other player
        await supabase
            .from('active_matches')
            .update({ match_state: updatedState })
            .eq('id', matchId);

        return apiSuccess({ status: 'waiting', message: 'Waiting for opponent to submit actions' });
    }

    // --- Both submitted: RESOLVE TURN ---

    // Apply pending burns to the engine state
    const engineState: MatchState = {
        playerA: updatedState.playerA,
        playerB: updatedState.playerB,
        turn: updatedState.turn,
        phase: updatedState.phase,
        winner: updatedState.winner,
        _skillUsage: updatedState._skillUsage,
    };

    // Set burn arrays
    engineState.playerA.pendingBurn = (updatedState.pending_burns_a ?? []) as MatchState['playerA']['pendingBurn'];
    engineState.playerB.pendingBurn = (updatedState.pending_burns_b ?? []) as MatchState['playerB']['pendingBurn'];

    // Resolve turn via engine
    const { newState, turnLog } = OuroborosEngine.resolveTurn(
        engineState,
        updatedState.pending_actions_a!,
        updatedState.pending_actions_b!,
        characters,
    );

    // Prepare the new match_state (clean pending, set new deadline)
    const newDeadline = newState.phase === 'FINISHED'
        ? undefined
        : new Date(Date.now() + TURN_TIMEOUT_MS).toISOString();

    const resolvedState: PvPMatchState = {
        ...newState,
        pending_actions_a: undefined,
        pending_actions_b: undefined,
        pending_burns_a: undefined,
        pending_burns_b: undefined,
        action_submitted_at_a: undefined,
        action_submitted_at_b: undefined,
        turn_deadline: newDeadline,
        consecutive_passes_a: 0,
        consecutive_passes_b: 0,
    };

    // Check if match finished
    const isFinished = newState.phase === 'FINISHED';
    const updateData: Record<string, unknown> = {
        match_state: resolvedState,
        current_turn: newState.turn,
    };

    if (isFinished) {
        updateData.status = 'finished';
        updateData.finished_at = new Date().toISOString();
    }

    await supabase
        .from('active_matches')
        .update(updateData)
        .eq('id', matchId);

    // Broadcast result via Supabase Realtime (channel = match:{id})
    const channel = supabase.channel(`match:${matchId}`);
    await channel.send({
        type: 'broadcast',
        event: 'turn_resolved',
        payload: {
            turn: engineState.turn,
            newState: resolvedState,
            turnLog,
            isFinished,
            winner: newState.winner,
        },
    });

    return apiSuccess({
        status: 'resolved',
        turn: engineState.turn,
        newState: resolvedState,
        turnLog,
        isFinished,
        winner: newState.winner,
    });
}
