// ============================================================
// Arena Ouroboros — Match State API
// GET: Load match state for a PvP match
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';

export async function GET(
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
    const { data: match, error } = await supabase
        .from('active_matches')
        .select('*')
        .eq('id', matchId)
        .single();

    if (error || !match) {
        return apiError('NOT_FOUND', 'Match not found', 404);
    }

    // Verify user is a participant
    const isPlayerA = match.player_a_id === user.id;
    const isPlayerB = match.player_b_id === user.id;

    if (!isPlayerA && !isPlayerB) {
        return apiError('FORBIDDEN', 'You are not a participant in this match', 403);
    }

    // Determine player role
    const role = isPlayerA ? 'player_a' : 'player_b';

    // Get opponent profile
    const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
    const { data: opponentProfile } = await supabase
        .from('profiles')
        .select('username, elo_rating')
        .eq('id', opponentId)
        .single();

    return apiSuccess({
        matchId: match.id,
        role,
        mode: match.mode,
        status: match.status,
        currentTurn: match.current_turn,
        matchState: match.match_state,
        opponent: {
            username: opponentProfile?.username ?? 'Unknown',
            elo: opponentProfile?.elo_rating ?? 1000,
        },
        teamA: match.team_a,
        teamB: match.team_b,
    });
}
