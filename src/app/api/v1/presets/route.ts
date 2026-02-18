// ============================================================
// Team Presets API — List & Create
// GET: all presets for authenticated user
// POST: create a new preset
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';

const MAX_PRESETS = 5;
const MAX_CHARS = 3;

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const { data, error } = await supabase
        .from('team_presets')
        .select('*')
        .eq('profile_id', user.id)
        .order('slot_index', { ascending: true });

    if (error) {
        return apiError('DB_ERROR', error.message, 500);
    }

    return apiSuccess(data ?? []);
}

export async function POST(req: NextRequest) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await req.json();
    const { name, characterIds, slotIndex } = body;

    // Validate
    if (!Array.isArray(characterIds) || characterIds.length !== MAX_CHARS) {
        return apiError('INVALID_TEAM', `Team must have exactly ${MAX_CHARS} characters`, 400);
    }

    if (new Set(characterIds).size !== MAX_CHARS) {
        return apiError('INVALID_TEAM', 'Duplicate characters are not allowed', 400);
    }

    if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex >= MAX_PRESETS) {
        return apiError('INVALID_SLOT', `Slot index must be 0-${MAX_PRESETS - 1}`, 400);
    }

    // Check slot count
    const { count } = await supabase
        .from('team_presets')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', user.id);

    if ((count ?? 0) >= MAX_PRESETS) {
        return apiError('MAX_PRESETS', `Maximum ${MAX_PRESETS} presets allowed`, 400);
    }

    // Upsert (if slot exists, overwrite)
    const { data, error } = await supabase
        .from('team_presets')
        .upsert({
            profile_id: user.id,
            name: name?.trim() || 'Time Sem Nome',
            character_ids: characterIds,
            slot_index: slotIndex,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'profile_id,slot_index' })
        .select()
        .single();

    if (error) {
        return apiError('DB_ERROR', error.message, 500);
    }

    return apiSuccess(data, 201);
}
