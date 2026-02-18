// GET /api/v1/characters/drafts — List all draft characters (read_draft)

import { apiSuccess, apiError, requireRole } from '@/lib/api/response';
import { listDraftCharacters } from '@/lib/services/character-service';

export async function GET(request: Request) {
    const auth = requireRole(request, 'read_draft');
    if ('error' in auth) return auth.error;

    try {
        const characters = await listDraftCharacters();
        return apiSuccess(characters);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}
