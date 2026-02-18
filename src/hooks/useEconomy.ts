// ============================================================
// useEconomy — Economy & Progression State Hook
// Fetches dashboard, submits rewards, manages missions
// ============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
    PlayerDashboard,
    CalculatedRewards,
    MatchResult,
} from '@/types/api';

export interface EconomyState {
    dashboard: PlayerDashboard | null;
    loading: boolean;
    error: string | null;
    lastRewards: CalculatedRewards | null;
    completedMissions: string[];
}

export function useEconomy(isAuthenticated: boolean) {
    const [state, setState] = useState<EconomyState>({
        dashboard: null,
        loading: false,
        error: null,
        lastRewards: null,
        completedMissions: [],
    });

    // Fetch dashboard on mount (if authenticated)
    const fetchDashboard = useCallback(async () => {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        try {
            const res = await fetch('/api/v1/economy/profile');
            const json = await res.json();

            if (!json.success) {
                if (res.status === 404) {
                    // Profile doesn't exist yet — initialize
                    const initRes = await fetch('/api/v1/economy/profile', {
                        method: 'POST',
                    });
                    const initJson = await initRes.json();
                    if (initJson.success) {
                        setState((prev) => ({
                            ...prev,
                            dashboard: initJson.data,
                            loading: false,
                        }));
                        return;
                    }
                }
                throw new Error(json.error?.message ?? 'Failed to fetch dashboard');
            }

            setState((prev) => ({
                ...prev,
                dashboard: json.data,
                loading: false,
            }));
        } catch (err) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: (err as Error).message,
            }));
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            fetchDashboard();
        }
    }, [isAuthenticated, fetchDashboard]);

    // Submit match rewards
    const submitMatchRewards = useCallback(
        async (matchResult: MatchResult) => {
            setState((prev) => ({ ...prev, loading: true }));

            try {
                const res = await fetch('/api/v1/economy/rewards', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchResult }),
                });
                const json = await res.json();

                if (!json.success) {
                    throw new Error(json.error?.message ?? 'Failed to submit rewards');
                }

                setState((prev) => ({
                    ...prev,
                    lastRewards: json.data.rewards,
                    completedMissions: json.data.completedMissions ?? [],
                    loading: false,
                }));

                // Refresh dashboard to get updated values
                await fetchDashboard();

                return json.data;
            } catch (err) {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: (err as Error).message,
                }));
                return null;
            }
        },
        [fetchDashboard]
    );

    // Claim a completed mission
    const claimMission = useCallback(
        async (missionId: string) => {
            try {
                const res = await fetch(`/api/v1/missions/${missionId}/claim`, {
                    method: 'POST',
                });
                const json = await res.json();

                if (!json.success) {
                    throw new Error(json.error?.message ?? 'Failed to claim mission');
                }

                // Refresh dashboard
                await fetchDashboard();

                return json.data;
            } catch (err) {
                setState((prev) => ({
                    ...prev,
                    error: (err as Error).message,
                }));
                return null;
            }
        },
        [fetchDashboard]
    );

    const clearRewards = useCallback(() => {
        setState((prev) => ({
            ...prev,
            lastRewards: null,
            completedMissions: [],
        }));
    }, []);

    return {
        ...state,
        fetchDashboard,
        submitMatchRewards,
        claimMission,
        clearRewards,
    };
}
