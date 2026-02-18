// ============================================================
// Arena Ouroboros — Supabase Client Helpers
// Server & Client auth-aware Supabase clients
// ============================================================

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client (for React components and hooks)
export function createSupabaseBrowserClient() {
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Re-export a singleton for simple usage
let _browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
    if (!_browserClient) {
        _browserClient = createSupabaseBrowserClient();
    }
    return _browserClient;
}
