// ============================================================
// Team Presets API — Single Preset Operations
// PUT: update name/characters
// DELETE: remove preset
// PATCH: set as favorite
// ============================================================

import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiSuccess, apiError } from '@/lib/api/response';

type Context = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, context: Context) {
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return apiError('UNAUTHORIZED', 'Authentication required', 401);

    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) updates.name = body.name.trim() || 'Time Sem Nome';
    if (Array.isArray(body.characterIds) && body.characterIds.length === 3) {
        // Uniqueness check
        if (new Set(body.characterIds).size === 3) {
            updates.character_ids = body.characterIds;
        } else {
            return apiError('INVALID_TEAM', 'Duplicate characters not allowed', 400);
        }
    }

    const { data, error } = await supabase
        .from('team_presets')
        .update(updates)
        .eq('id', id)
        .eq('profile_id', user.id)
        .select()
        .single();

    if (error || !data) {
        return apiError('NOT_FOUND', 'Preset not found', 404);
    }

    return apiSuccess(data);
}

export async function DELETE(_req: NextRequest, context: Context) {
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return apiError('UNAUTHORIZED', 'Authentication required', 401);

    const { error } = await supabase
        .from('team_presets')
        .delete()
        .eq('id', id)
        .eq('profile_id', user.id);

    if (error) {
        return apiError('DB_ERROR', error.message, 500);
    }

    return apiSuccess({ deleted: true });
}

export async function PATCH(_req: NextRequest, context: Context) {
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return apiError('UNAUTHORIZED', 'Authentication required', 401);

    // Unfavorite all first
    await supabase
        .from('team_presets')
        .update({ is_favorite: false })
        .eq('profile_id', user.id);

    // Set this one as favorite
    const { data, error } = await supabase
        .from('team_presets')
        .update({ is_favorite: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('profile_id', user.id)
        .select()
        .single();

    if (error || !data) {
        return apiError('NOT_FOUND', 'Preset not found', 404);
    }

    return apiSuccess(data);
}
