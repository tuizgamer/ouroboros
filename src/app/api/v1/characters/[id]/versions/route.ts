// GET /api/v1/characters/[id]/versions — Version history
// POST /api/v1/characters/[id]/versions — Version history (unused, reserved)

import { apiSuccess, apiError, requireRole } from '@/lib/api/response';
import { getCharacterVersions } from '@/lib/services/character-service';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
    const { id } = await params;
    const auth = requireRole(request, 'read_draft');
    if ('error' in auth) return auth.error;

    try {
        const versions = await getCharacterVersions(id);
        return apiSuccess(versions);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}
