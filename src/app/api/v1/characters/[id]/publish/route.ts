// POST /api/v1/characters/[id]/publish — Publish single draft to live

import { apiSuccess, apiError, requireRole } from '@/lib/api/response';
import { publishCharacter } from '@/lib/services/character-service';
import type { PublishRequest } from '@/types/api';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
    const { id } = await params;
    const auth = requireRole(request, 'publish');
    if ('error' in auth) return auth.error;

    try {
        const body = (await request.json().catch(() => ({}))) as PublishRequest;
        const changeSummary = body.changeSummary ?? 'Published';

        const result = await publishCharacter(id, auth.auth.name, changeSummary);

        if (result.error) {
            return apiError('PUBLISH_FAILED', result.error, 400);
        }

        return apiSuccess(result.version);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}
