// ============================================================
// GET /api/v1/admin/stats — Admin Dashboard Data
// Requires admin role
// ============================================================

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL('http://localhost');
    const days = 7;

    // Fetch both RPCs in parallel
    const [overviewRes, charsRes] = await Promise.all([
        supabase.rpc('get_admin_match_overview', { p_days: days }),
        supabase.rpc('get_character_analytics', { p_days: days }),
    ]);

    return NextResponse.json({
        overview: overviewRes.data?.[0] ?? null,
        characters: charsRes.data ?? [],
        period_days: days,
    });
}
