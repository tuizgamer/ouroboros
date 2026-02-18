// ============================================================
// Arena Ouroboros — Economy Profile API
// GET: fetch player dashboard | POST: create profile
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getPlayerDashboard } from '@/lib/services/economy-service';
import { initializePlayerMissions } from '@/lib/services/mission-service';
import { apiSuccess, apiError } from '@/lib/api/response';

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    const dashboard = await getPlayerDashboard(supabase, user.id);

    if (!dashboard) {
        return apiError('NOT_FOUND', 'Player profile not found', 404);
    }

    return apiSuccess(dashboard);
}

export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    // Profile is auto-created by DB trigger, but we need to initialize missions
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile) {
        return apiError('NOT_FOUND', 'Profile not found — trigger may have failed', 404);
    }

    // Initialize default currencies
    await supabase.from('currencies').upsert([
        { profile_id: user.id, currency_id: 'core_fragments', balance: 0 },
    ]);

    // Initialize lineage progress
    for (const lineage of ['iron', 'neon', 'void']) {
        await supabase.from('lineage_progress').upsert({
            profile_id: user.id,
            lineage_id: lineage,
            xp: 0,
            level: 1,
        });
    }

    // Initialize player missions
    await initializePlayerMissions(supabase, user.id);

    const dashboard = await getPlayerDashboard(supabase, user.id);
    return apiSuccess(dashboard, 201);
}
