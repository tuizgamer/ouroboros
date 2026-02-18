// ============================================================
// Arena Ouroboros — Matchmaking Queue API
// POST: Enter queue | DELETE: Leave queue
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';
import { validateTeam, enterQueue, leaveQueue } from '@/lib/services/matchmaking-service';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limiter';

const VALID_MODES = ['quick', 'ranked'] as const;

// POST — Enter matchmaking queue
export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    // Rate limit: 5 req/min
    const rl = checkRateLimit(`queue:${user.id}`, 5);
    if (!rl.allowed) return rateLimitResponse(rl);

    let body: { characterIds: string[]; mode: string };
    try {
        body = await request.json();
    } catch {
        return apiError('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    const { characterIds, mode } = body;

    // Validate mode
    if (!mode || !VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
        return apiError('BAD_REQUEST', `Invalid mode. Must be: ${VALID_MODES.join(', ')}`, 400);
    }

    // Validate team server-side
    const validation = await validateTeam(supabase, user.id, characterIds);
    if (!validation.valid) {
        return apiError('BAD_REQUEST', validation.reason!, 400);
    }

    // Enter queue
    const result = await enterQueue(
        supabase,
        user.id,
        characterIds,
        mode as 'quick' | 'ranked'
    );

    if (!result.queued) {
        return apiError('INTERNAL_ERROR', result.error ?? 'Failed to enter queue', 500);
    }

    return apiSuccess({ status: 'queued', mode }, 201);
}

// DELETE — Leave matchmaking queue
export async function DELETE() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    await leaveQueue(supabase, user.id);

    return apiSuccess({ status: 'left_queue' });
}
