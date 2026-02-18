// ============================================================
// Arena Ouroboros — Claim Mission Reward API
// POST: Claim a completed mission's reward
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { claimMissionReward } from '@/lib/services/mission-service';
import { apiSuccess, apiError } from '@/lib/api/response';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    const { id: missionId } = await params;

    const result = await claimMissionReward(supabase, user.id, missionId);

    if (!result.success) {
        return apiError('CLAIM_FAILED', result.error!, 400);
    }

    return apiSuccess({
        missionId,
        rewardType: result.rewardType,
        rewardId: result.rewardId,
    });
}
