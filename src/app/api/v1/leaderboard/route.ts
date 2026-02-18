// ============================================================
// GET /api/v1/leaderboard — Public Leaderboard
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');

    const { data, error, count } = await supabase
        .from('profiles')
        .select('id, username, elo_rating, total_battles, wins, last_active', { count: 'exact' })
        .gt('total_battles', 0)
        .order('elo_rating', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const leaderboard = (data ?? []).map((p, i) => ({
        rank: offset + i + 1,
        ...p,
        win_rate: p.total_battles > 0 ? Math.round((p.wins / p.total_battles) * 100) : 0,
    }));

    return NextResponse.json({ leaderboard, total: count ?? 0, limit, offset });
}
