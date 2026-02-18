// ============================================================
// GET /api/v1/matches — Paginated Match History
// Returns player-visible data only (no match_metadata)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);
    const offset = parseInt(searchParams.get('offset') ?? '0');

    // Fetch match history (player-visible columns only — no match_metadata)
    const { data: matches, error, count } = await supabase
        .from('match_history')
        .select(
            `id, won, mode, team_lineage, total_damage_dealt, total_damage_vlt,
             burn_count, turns, played_at, team_character_ids,
             duration_seconds, xp_earned, fragments_earned, player_stats`,
            { count: 'exact' }
        )
        .eq('profile_id', user.id)
        .order('played_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Optionally include roster data
    const includeRoster = searchParams.get('roster') === 'true';
    let roster: Record<string, unknown[]> = {};

    if (includeRoster && matches && matches.length > 0) {
        const matchIds = matches.map(m => m.id);
        const { data: rosterData } = await supabase
            .from('match_roster')
            .select('match_id, character_id, lineage, damage_dealt, healing_done, shield_given, kills, is_mvp')
            .in('match_id', matchIds);

        if (rosterData) {
            for (const entry of rosterData) {
                if (!roster[entry.match_id]) roster[entry.match_id] = [];
                roster[entry.match_id].push(entry);
            }
        }
    }

    return NextResponse.json({
        matches: matches?.map(m => ({
            ...m,
            roster: includeRoster ? (roster[m.id] ?? []) : undefined,
        })) ?? [],
        total: count ?? 0,
        limit,
        offset,
    });
}
