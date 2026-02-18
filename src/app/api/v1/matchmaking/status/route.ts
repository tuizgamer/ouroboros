// ============================================================
// Arena Ouroboros — Matchmaking Status API
// GET: Check if a match has been found (polling endpoint)
// ============================================================

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';
import { findMatch } from '@/lib/services/matchmaking-service';

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    const result = await findMatch(supabase, user.id);

    return apiSuccess(result);
}
