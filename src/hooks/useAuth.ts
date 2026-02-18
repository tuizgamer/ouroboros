// ============================================================
// useAuth — Supabase Auth State Hook
// Manages user session, login, signup, and logout
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export interface AuthState {
    user: User | null;
    loading: boolean;
    error: string | null;
}

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        user: null,
        loading: true,
        error: null,
    });

    const supabase = getSupabaseBrowserClient();

    useEffect(() => {
        // Get initial session from local storage (no network call)
        // Middleware already validates the token server-side via getUser()
        supabase.auth.getSession().then(({ data: { session } }) => {
            setState({ user: session?.user ?? null, loading: false, error: null });
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setState({
                    user: session?.user ?? null,
                    loading: false,
                    error: null,
                });
            }
        );

        return () => subscription.unsubscribe();
    }, [supabase]);

    const signUp = useCallback(
        async (email: string, password: string, username: string) => {
            setState((prev) => ({ ...prev, loading: true, error: null }));

            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { username },
                },
            });

            if (error) {
                setState((prev) => ({ ...prev, loading: false, error: error.message }));
                return false;
            }

            return true;
        },
        [supabase]
    );

    const signIn = useCallback(
        async (email: string, password: string) => {
            setState((prev) => ({ ...prev, loading: true, error: null }));

            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setState((prev) => ({ ...prev, loading: false, error: error.message }));
                return false;
            }

            return true;
        },
        [supabase]
    );

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setState({ user: null, loading: false, error: null });
    }, [supabase]);

    const clearError = useCallback(() => {
        setState((prev) => ({ ...prev, error: null }));
    }, []);

    return {
        ...state,
        signUp,
        signIn,
        signOut,
        clearError,
        isAuthenticated: !!state.user,
    };
}
