// GET /api/v1/characters/[id]/draft — Get draft character (read_draft)

import { apiSuccess, apiError, requireRole } from '@/lib/api/response';
import { getDraftCharacter } from '@/lib/services/character-service';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
    const { id } = await params;
    const auth = requireRole(request, 'read_draft');
    if ('error' in auth) return auth.error;

    try {
        const character = await getDraftCharacter(id);
        if (!character) {
            return apiError('NOT_FOUND', `Draft "${id}" not found`, 404);
        }
        return apiSuccess(character);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}
