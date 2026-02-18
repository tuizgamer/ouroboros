// ============================================================
// Arena Ouroboros — Match Timeout API
// POST: Check if turn deadline expired → auto-pass for AFK player
// Called by client-side timer or periodic check
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';
import { OuroborosEngine } from '@/lib/engine';
import charactersData from '@/data/characters_live.json';
import type { Character, MatchAction, MatchState } from '@/types/game';

const characters = charactersData as Character[];
const TURN_TIMEOUT_MS = 45_000; // 45 seconds
const MAX_CONSECUTIVE_PASSES = 3;

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

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: matchId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
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

    // Must be a participant
    const isParticipant = match.player_a_id === user.id || match.player_b_id === user.id;
    if (!isParticipant) {
        return apiError('FORBIDDEN', 'You are not a participant', 403);
    }

    const matchState = match.match_state as PvPMatchState;

    // Check if deadline exists and has expired
    if (!matchState.turn_deadline) {
        return apiError('BAD_REQUEST', 'No turn deadline set', 400);
    }

    const deadline = new Date(matchState.turn_deadline).getTime();
    const now = Date.now();

    if (now < deadline) {
        return apiSuccess({
            status: 'not_expired',
            remaining_ms: deadline - now,
        });
    }

    // --- Turn has expired: auto-pass for AFK player(s) ---

    const aSubmitted = !!matchState.pending_actions_a;
    const bSubmitted = !!matchState.pending_actions_b;

    // If both submitted, turn should have resolved normally — shouldn't reach here
    if (aSubmitted && bSubmitted) {
        return apiSuccess({ status: 'already_resolved' });
    }

    // Generate empty pass actions for missing player(s)
    const passActionsA: MatchAction[] = aSubmitted
        ? matchState.pending_actions_a!
        : [];
    const passActionsB: MatchAction[] = bSubmitted
        ? matchState.pending_actions_b!
        : [];

    // Track consecutive passes
    let passesA = matchState.consecutive_passes_a ?? 0;
    let passesB = matchState.consecutive_passes_b ?? 0;

    if (!aSubmitted) passesA++;
    else passesA = 0; // Reset on submit

    if (!bSubmitted) passesB++;
    else passesB = 0;

    // Check for forfeit (3 consecutive passes)
    const aForfeited = passesA >= MAX_CONSECUTIVE_PASSES;
    const bForfeited = passesB >= MAX_CONSECUTIVE_PASSES;

    if (aForfeited || bForfeited) {
        // Determine winner
        const winner = aForfeited ? 'playerB' : 'playerA';
        const resolvedState: PvPMatchState = {
            ...matchState,
            phase: 'FINISHED',
            winner,
            pending_actions_a: undefined,
            pending_actions_b: undefined,
            pending_burns_a: undefined,
            pending_burns_b: undefined,
            action_submitted_at_a: undefined,
            action_submitted_at_b: undefined,
            turn_deadline: undefined,
            consecutive_passes_a: passesA,
            consecutive_passes_b: passesB,
        };

        await supabase
            .from('active_matches')
            .update({
                match_state: resolvedState,
                status: 'finished',
                finished_at: new Date().toISOString(),
            })
            .eq('id', matchId);

        // Broadcast forfeit
        const channel = supabase.channel(`match:${matchId}`);
        await channel.send({
            type: 'broadcast',
            event: 'turn_resolved',
            payload: {
                turn: matchState.turn,
                newState: resolvedState,
                turnLog: [],
                isFinished: true,
                winner,
                forfeit: true,
                forfeitedPlayer: aForfeited ? 'playerA' : 'playerB',
            },
        });

        return apiSuccess({
            status: 'forfeit',
            winner,
            forfeitedPlayer: aForfeited ? 'playerA' : 'playerB',
            reason: `${MAX_CONSECUTIVE_PASSES} consecutive AFK passes`,
        });
    }

    // --- Resolve turn with auto-pass (empty actions for AFK) ---

    const engineState: MatchState = {
        playerA: matchState.playerA,
        playerB: matchState.playerB,
        turn: matchState.turn,
        phase: matchState.phase,
        winner: matchState.winner,
        _skillUsage: matchState._skillUsage,
    };

    // Set burn arrays (AFK player gets empty burns)
    engineState.playerA.pendingBurn = (aSubmitted ? matchState.pending_burns_a ?? [] : []) as MatchState['playerA']['pendingBurn'];
    engineState.playerB.pendingBurn = (bSubmitted ? matchState.pending_burns_b ?? [] : []) as MatchState['playerB']['pendingBurn'];

    const { newState, turnLog } = OuroborosEngine.resolveTurn(
        engineState,
        passActionsA,
        passActionsB,
        characters,
    );

    // Set new deadline for next turn
    const newDeadline = new Date(Date.now() + TURN_TIMEOUT_MS).toISOString();

    const resolvedState: PvPMatchState = {
        ...newState,
        pending_actions_a: undefined,
        pending_actions_b: undefined,
        pending_burns_a: undefined,
        pending_burns_b: undefined,
        action_submitted_at_a: undefined,
        action_submitted_at_b: undefined,
        turn_deadline: newState.phase === 'FINISHED' ? undefined : newDeadline,
        consecutive_passes_a: passesA,
        consecutive_passes_b: passesB,
    };

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

    // Broadcast
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
            autoPass: true,
            afkPlayers: [
                ...(!aSubmitted ? ['playerA'] : []),
                ...(!bSubmitted ? ['playerB'] : []),
            ],
        },
    });

    return apiSuccess({
        status: 'auto_passed',
        turn: engineState.turn,
        newState: resolvedState,
        turnLog,
        isFinished,
        afkPlayers: [
            ...(!aSubmitted ? ['playerA'] : []),
            ...(!bSubmitted ? ['playerB'] : []),
        ],
    });
}
