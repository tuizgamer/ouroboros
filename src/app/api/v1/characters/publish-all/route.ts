// POST /api/v1/characters/publish-all — Publish all drafts to live (publish)

import { apiSuccess, apiError, requireRole } from '@/lib/api/response';
import { publishAllCharacters } from '@/lib/services/character-service';
import type { PublishRequest } from '@/types/api';

export async function POST(request: Request) {
    const auth = requireRole(request, 'publish');
    if ('error' in auth) return auth.error;

    try {
        const body = (await request.json().catch(() => ({}))) as PublishRequest;
        const changeSummary = body.changeSummary ?? 'Bulk publish';

        const result = await publishAllCharacters(auth.auth.name, changeSummary);

        if (result.error) {
            return apiError('PUBLISH_FAILED', result.error, 400);
        }

        return apiSuccess(result.versions);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}
