// ============================================================
// Arena Ouroboros — API Response Helpers + Auth Middleware
// ============================================================

import { NextResponse } from 'next/server';
import type { ApiResponse, ApiErrorResponse, ApiKeyEntry, ApiRole, Permission } from '@/types/api';
import apiKeysData from '@/data/api_keys.json';

// --- Response Helpers ---

export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
    return NextResponse.json({ success: true, data }, { status });
}

export function apiError(
    code: string,
    message: string,
    status = 400,
    details?: unknown
): NextResponse<ApiErrorResponse> {
    return NextResponse.json(
        { success: false, error: { code, message, details } },
        { status }
    );
}

// --- Auth ---

const apiKeys: ApiKeyEntry[] = apiKeysData as ApiKeyEntry[];

export function authenticateRequest(request: Request): ApiKeyEntry | null {
    const key = request.headers.get('x-api-key');
    if (!key) return null;
    return apiKeys.find((k) => k.key === key) ?? null;
}

export function requireRole(
    request: Request,
    ...requiredPermissions: Permission[]
): { auth: ApiKeyEntry } | { error: NextResponse<ApiErrorResponse> } {
    const auth = authenticateRequest(request);

    if (!auth) {
        return {
            error: apiError('UNAUTHORIZED', 'Missing or invalid API key', 401),
        };
    }

    for (const perm of requiredPermissions) {
        if (!auth.permissions.includes(perm)) {
            return {
                error: apiError(
                    'FORBIDDEN',
                    `Role "${auth.role}" lacks permission: ${perm}`,
                    403
                ),
            };
        }
    }

    return { auth };
}
