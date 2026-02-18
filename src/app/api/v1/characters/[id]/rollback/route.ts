// POST /api/v1/characters/[id]/rollback — Rollback to a previous version

import { apiSuccess, apiError, requireRole } from '@/lib/api/response';
import { rollbackCharacter } from '@/lib/services/character-service';
import type { RollbackRequest } from '@/types/api';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
    const { id } = await params;
    const auth = requireRole(request, 'publish');
    if ('error' in auth) return auth.error;

    try {
        const body = (await request.json()) as RollbackRequest;

        if (typeof body.version !== 'number') {
            return apiError('VALIDATION', 'version: required number', 422);
        }

        const result = await rollbackCharacter(id, body.version);

        if (result.error) {
            return apiError('ROLLBACK_FAILED', result.error, 400);
        }

        return apiSuccess(result.character);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}
