// GET /api/v1/characters — List live characters (public)
// POST /api/v1/characters — Create draft character (write permission)

import { apiSuccess, apiError, requireRole } from '@/lib/api/response';
import {
    listLiveCharacters,
    createCharacter,
} from '@/lib/services/character-service';

export async function GET() {
    try {
        const characters = await listLiveCharacters();
        return apiSuccess(characters);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}

export async function POST(request: Request) {
    const auth = requireRole(request, 'write');
    if ('error' in auth) return auth.error;

    try {
        const body = await request.json();
        const result = await createCharacter(body);

        if (result.errors) {
            return apiError('VALIDATION', 'Invalid character data', 422, result.errors);
        }

        return apiSuccess(result.character, 201);
    } catch (err) {
        return apiError('INTERNAL', (err as Error).message, 500);
    }
}
