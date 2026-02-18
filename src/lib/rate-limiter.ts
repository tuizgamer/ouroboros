// ============================================================
// Arena Ouroboros — Rate Limiter
// In-memory sliding window rate limiting for API routes
// ============================================================

const WINDOW_MS = 60_000; // 1 minute window

interface RateEntry {
    timestamps: number[];
}

// In-memory store (per-serverless instance — acceptable for MVP)
const store = new Map<string, RateEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS * 2;
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(t => t > cutoff);
        if (entry.timestamps.length === 0) store.delete(key);
    }
}, 5 * 60_000);

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetMs: number;
}

/**
 * Check if a request should be rate-limited.
 *
 * @param key - Unique identifier (e.g., userId + endpoint)
 * @param maxRequests - Max requests per window
 * @returns RateLimitResult
 */
export function checkRateLimit(key: string, maxRequests: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    let entry = store.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => t > windowStart);

    if (entry.timestamps.length >= maxRequests) {
        const oldest = entry.timestamps[0] ?? now;
        return {
            allowed: false,
            remaining: 0,
            resetMs: oldest + WINDOW_MS - now,
        };
    }

    entry.timestamps.push(now);
    return {
        allowed: true,
        remaining: maxRequests - entry.timestamps.length,
        resetMs: WINDOW_MS,
    };
}

/**
 * Create a rate-limited Response (429 Too Many Requests).
 */
export function rateLimitResponse(result: RateLimitResult): Response {
    return new Response(
        JSON.stringify({
            success: false,
            error: {
                code: 'RATE_LIMITED',
                message: 'Too many requests. Please slow down.',
                retryAfterMs: result.resetMs,
            },
        }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(Math.ceil(result.resetMs / 1000)),
                'X-RateLimit-Remaining': String(result.remaining),
            },
        }
    );
}
