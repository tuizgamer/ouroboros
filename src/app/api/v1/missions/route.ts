// ============================================================
// Arena Ouroboros — Missions API
// GET: List missions with player progress
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';
import type { PlayerMission } from '@/types/api';

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    // Get all missions with player progress
    const { data: missions, error } = await supabase
        .from('player_missions')
        .select('*, mission:missions(*)')
        .eq('profile_id', user.id)
        .order('status', { ascending: true })
        .returns<PlayerMission[]>();

    if (error) {
        return apiError('DB_ERROR', error.message, 500);
    }

    return apiSuccess(missions ?? []);
}
