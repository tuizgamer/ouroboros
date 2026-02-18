// GET /api/v1/health — Public health check

import { apiSuccess } from '@/lib/api/response';

export async function GET() {
    return apiSuccess({
        status: 'ok',
        service: 'arena-ouroboros',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
    });
}
