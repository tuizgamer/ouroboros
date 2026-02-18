// GET /api/v1/characters/[id] — Get live character (public)
// PUT /api/v1/characters/[id] — Update draft character (write)
// DELETE /api/v1/characters/[id] — Delete draft character (delete)

import { apiSuccess, apiError, requireRole } from '@/lib/api/response';
import {
    getLiveCharacter,
    updateCharacter,
    deleteCharacter,
} from '@/lib/services/character-service';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
    const { id } = await params;

    try {
        const character = await getLiveCharacter(id);
        if (!character) {
            return apiError('NOT_FOUND', `Character "${id}" not found`, 404);
        }
        return apiSuccess(character);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}

export async function PUT(request: Request, { params }: Params) {
    const { id } = await params;
    const auth = requireRole(request, 'write');
    if ('error' in auth) return auth.error;

    try {
        const body = await request.json();
        const result = await updateCharacter(id, body);

        if (result.errors) {
            return apiError('VALIDATION', 'Invalid character data', 422, result.errors);
        }

        return apiSuccess(result.character);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}

export async function DELETE(request: Request, { params }: Params) {
    const { id } = await params;
    const auth = requireRole(request, 'delete');
    if ('error' in auth) return auth.error;

    try {
        const result = await deleteCharacter(id);
        if (!result.deleted) {
            return apiError('NOT_FOUND', result.error ?? 'Not found', 404);
        }
        return apiSuccess({ deleted: true, id });
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}
