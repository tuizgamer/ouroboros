// ============================================================
// useArenaPvP — PvP Battle State Management Hook
// Server-authoritative combat via API + Supabase Realtime
// ============================================================

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { OuroborosEngine } from '@/lib/engine';
import type {
    MatchState,
    MatchAction,
    CharacterState,
    Skill,
    EnergyColor,
    TurnLogEntry,
    Character,
    SkillReach,
} from '@/types/game';
import type { ReplayTurn } from '@/types/api';

// Re-export for Arena page compatibility
export const ALLY_TARGET_REACHES: SkillReach[] = [
    'Self', 'Self_Adjacent', 'Ally', 'Global_Ally', 'Dead_Ally',
];

// --- Types ---

interface PendingAction {
    casterId: string;
    skillId: string;
    targetId: string;
    skillName: string;
    casterName: string;
    targetName: string;
}

interface ShowdownEvent {
    wave: string;
    casterId: string;
    casterName: string;
    skillName: string;
    effects: { type: string; targetId: string; value?: number; detail?: string }[];
    cancelled: boolean;
}

type ArenaPhase = 'LOADING' | 'PLANNING' | 'WAITING' | 'SHOWDOWN' | 'RESULT';

// --- Hook ---

export function useArenaPvP(matchId: string) {
    const supabase = useMemo(() => getSupabaseBrowserClient(), []);

    // Core state
    const [matchState, setMatchState] = useState<MatchState | null>(null);
    const [role, setRole] = useState<'player_a' | 'player_b' | null>(null);
    const [arenaPhase, setArenaPhase] = useState<ArenaPhase>('LOADING');
    const [opponent, setOpponent] = useState<{ username: string; elo: number } | null>(null);
    const [mode, setMode] = useState<string>('ranked');
    const [error, setError] = useState<string | null>(null);

    // Planning state
    const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
    const [selectedCasterId, setSelectedCasterId] = useState<string | null>(null);
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

    // Showdown state
    const [showdownEvents, setShowdownEvents] = useState<ShowdownEvent[]>([]);
    const [currentEventIndex, setCurrentEventIndex] = useState(-1);
    const [combatLog, setCombatLog] = useState<ShowdownEvent[]>([]);
    const showdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // AFK timer
    const [turnTimer, setTurnTimer] = useState<number | null>(null);
    const timeoutCalledRef = useRef(false);

    const replayHistory = useRef<ReplayTurn[]>([]);

    // --- Load match state ---

    useEffect(() => {
        async function loadMatch() {
            try {
                const res = await fetch(`/api/v1/match/${matchId}`);
                const data = await res.json();

                if (!data.success) {
                    setError(data.error?.message ?? 'Failed to load match');
                    return;
                }

                setRole(data.data.role);
                setOpponent(data.data.opponent);
                setMode(data.data.mode);
                setMatchState(data.data.matchState);

                if (data.data.status === 'finished') {
                    setArenaPhase('RESULT');
                } else {
                    setArenaPhase('PLANNING');
                }
            } catch {
                setError('Network error loading match');
            }
        }

        loadMatch();
    }, [matchId]);

    // --- Supabase Realtime subscription ---

    useEffect(() => {
        const channel = supabase.channel(`match:${matchId}`);

        channel
            .on('broadcast', { event: 'turn_resolved' }, (payload) => {
                const { newState, turnLog, isFinished } = payload.payload;

                // Convert turnLog to ShowdownEvent[]
                const allChars = [
                    ...newState.playerA.team,
                    ...newState.playerB.team,
                ];
                const events: ShowdownEvent[] = (turnLog as TurnLogEntry[]).map((entry) => {
                    const caster = allChars.find((c: CharacterState) => c.id === entry.casterId);
                    return {
                        wave: entry.wave,
                        casterId: entry.casterId,
                        casterName: caster?.name ?? 'Unknown',
                        skillName: entry.skillName,
                        effects: entry.result.effects,
                        cancelled: entry.result.cancelled ?? false,
                    };
                });

                // Play showdown animation
                setShowdownEvents(events);
                setArenaPhase('SHOWDOWN');
                setPendingActions([]);

                const playEvent = (idx: number) => {
                    if (idx >= events.length) {
                        setMatchState(newState);
                        setCurrentEventIndex(-1);

                        if (isFinished) {
                            setArenaPhase('RESULT');
                        } else {
                            setArenaPhase('PLANNING');
                        }
                        return;
                    }

                    const event = events[idx];
                    if (!event) {
                        playEvent(idx + 1);
                        return;
                    }

                    setCurrentEventIndex(idx);
                    setCombatLog((prev) => [...prev, event]);
                    showdownTimerRef.current = setTimeout(() => playEvent(idx + 1), 1200);
                };

                showdownTimerRef.current = setTimeout(() => playEvent(0), 600);
            })
            .subscribe();

        return () => {
            if (showdownTimerRef.current) clearTimeout(showdownTimerRef.current);
            supabase.removeChannel(channel);
        };
    }, [matchId, supabase]);

    // --- AFK Countdown Timer ---

    useEffect(() => {
        // Only run during PLANNING or WAITING
        if (arenaPhase !== 'PLANNING' && arenaPhase !== 'WAITING') {
            setTurnTimer(null);
            return;
        }

        // Read turn_deadline from raw match_state
        const deadline = (matchState as Record<string, unknown> | null)?.turn_deadline as string | undefined;
        if (!deadline) {
            setTurnTimer(null);
            return;
        }

        timeoutCalledRef.current = false;
        const deadlineMs = new Date(deadline).getTime();

        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
            setTurnTimer(remaining);

            if (remaining <= 0 && !timeoutCalledRef.current) {
                timeoutCalledRef.current = true;
                clearInterval(interval);

                // Call timeout endpoint to auto-pass AFK player(s)
                fetch(`/api/v1/match/${matchId}/timeout`, {
                    method: 'POST',
                }).catch(() => {
                    // Timeout call failed — opponent may call it instead
                });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [arenaPhase, matchState, matchId]);

    // --- Planning Actions (same UI interface as useArena) ---

    const myTeam = matchState
        ? (role === 'player_a' ? matchState.playerA : matchState.playerB)
        : null;
    const enemyTeam = matchState
        ? (role === 'player_a' ? matchState.playerB : matchState.playerA)
        : null;

    const selectSkill = useCallback(
        (casterId: string, skillId: string) => {
            if (arenaPhase !== 'PLANNING' || !myTeam) return;

            const caster = myTeam.team.find((c) => c.id === casterId);
            const skill = caster?.skills.find((s) => s.id === skillId);
            if (!caster || !skill) return;

            if (!canAffordWithPending(casterId, skill)) return;

            setSelectedCasterId(casterId);
            setSelectedSkillId(skillId);
        },
        [arenaPhase, myTeam, pendingActions]
    );

    const confirmTarget = useCallback(
        (targetId: string) => {
            if (!selectedCasterId || !selectedSkillId || !matchState) return;
            if (arenaPhase !== 'PLANNING') return;

            const allChars = [...matchState.playerA.team, ...matchState.playerB.team];
            const caster = allChars.find((c) => c.id === selectedCasterId);
            const target = allChars.find((c) => c.id === targetId);
            const skill = caster?.skills.find((s) => s.id === selectedSkillId);

            if (!caster || !skill) return;

            const filtered = pendingActions.filter(
                (a) => a.casterId !== selectedCasterId
            );

            const newAction: PendingAction = {
                casterId: selectedCasterId,
                skillId: selectedSkillId,
                targetId,
                skillName: skill.name,
                casterName: caster.name,
                targetName: target?.name ?? 'Unknown',
            };

            setPendingActions([...filtered, newAction]);
            setSelectedCasterId(null);
            setSelectedSkillId(null);
        },
        [arenaPhase, selectedCasterId, selectedSkillId, pendingActions, matchState]
    );

    const undoAction = useCallback(
        (casterId: string) => {
            if (arenaPhase !== 'PLANNING') return;
            setPendingActions((prev) => prev.filter((a) => a.casterId !== casterId));
        },
        [arenaPhase]
    );

    const clearSelection = useCallback(() => {
        setSelectedCasterId(null);
        setSelectedSkillId(null);
    }, []);

    const toggleBurn = useCallback((color: EnergyColor) => {
        if (arenaPhase !== 'PLANNING' || !matchState || !role) return;

        setMatchState(prev => {
            if (!prev) return prev;
            const newState = { ...prev };
            const player = role === 'player_a' ? newState.playerA : newState.playerB;
            const idx = player.pendingBurn.indexOf(color);

            if (idx > -1) {
                player.pendingBurn.splice(idx, 1);
            } else {
                const pool = OuroborosEngine.getTeamPool(player);
                if (pool[color] > 0) {
                    player.pendingBurn.push(color);
                }
            }
            return newState;
        });
    }, [arenaPhase, role, matchState]);

    // --- Submit actions to server ---

    const resolveTurn = useCallback(async () => {
        if (arenaPhase !== 'PLANNING' || !matchState || !role) return;

        const actions: MatchAction[] = pendingActions.map((a) => ({
            casterId: a.casterId,
            skillId: a.skillId,
            targetId: a.targetId,
        }));

        const player = role === 'player_a' ? matchState.playerA : matchState.playerB;
        const burns = [...player.pendingBurn];

        // Track replay
        replayHistory.current.push({
            turn: matchState.turn,
            actionsA: role === 'player_a' ? actions : [],
            actionsB: role === 'player_b' ? actions : [],
            burnsA: role === 'player_a' ? burns : [],
            burnsB: role === 'player_b' ? burns : [],
        });

        setArenaPhase('WAITING');

        try {
            const res = await fetch(`/api/v1/match/${matchId}/actions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actions, burns }),
            });

            const data = await res.json();

            if (!data.success) {
                setError(data.error?.message ?? 'Failed to submit actions');
                setArenaPhase('PLANNING');
                return;
            }

            // If status is 'resolved', the response itself contains the result
            // The Realtime broadcast will also fire — but handle inline for the submitter
            if (data.data.status === 'resolved') {
                const { newState, turnLog, isFinished } = data.data;

                const allChars = [...newState.playerA.team, ...newState.playerB.team];
                const events: ShowdownEvent[] = (turnLog as TurnLogEntry[]).map((entry) => {
                    const caster = allChars.find((c: CharacterState) => c.id === entry.casterId);
                    return {
                        wave: entry.wave,
                        casterId: entry.casterId,
                        casterName: caster?.name ?? 'Unknown',
                        skillName: entry.skillName,
                        effects: entry.result.effects,
                        cancelled: entry.result.cancelled ?? false,
                    };
                });

                setShowdownEvents(events);
                setArenaPhase('SHOWDOWN');
                setPendingActions([]);

                const playEvent = (idx: number) => {
                    if (idx >= events.length) {
                        setMatchState(newState);
                        setCurrentEventIndex(-1);
                        setArenaPhase(isFinished ? 'RESULT' : 'PLANNING');
                        return;
                    }
                    const event = events[idx];
                    if (!event) { playEvent(idx + 1); return; }
                    setCurrentEventIndex(idx);
                    setCombatLog((prev) => [...prev, event]);
                    showdownTimerRef.current = setTimeout(() => playEvent(idx + 1), 1200);
                };
                showdownTimerRef.current = setTimeout(() => playEvent(0), 600);
            }
            // If 'waiting', the Realtime channel will handle it
        } catch {
            setError('Network error submitting actions');
            setArenaPhase('PLANNING');
        }
    }, [arenaPhase, pendingActions, matchState, matchId, role]);

    // --- Derived State ---

    const projectedPool = (() => {
        if (!myTeam) return { Red: 0, Yellow: 0, Blue: 0, Green: 0, White: 0 };
        const basePool = OuroborosEngine.getTeamPool(myTeam);

        for (const action of pendingActions) {
            const caster = myTeam.team.find(c => c.id === action.casterId);
            const skill = caster?.skills.find(s => s.id === action.skillId);
            if (!skill) continue;

            const skillColors = Object.keys(skill.cost) as EnergyColor[];
            for (const color of skillColors) {
                const cost = skill.cost[color] ?? 0;
                basePool[color] -= cost;
            }
        }
        for (const color of (myTeam.pendingBurn ?? [])) {
            basePool[color]--;
        }
        return basePool;
    })();

    function canAffordWithPending(casterId: string, skill: Skill): boolean {
        if (!myTeam) return false;
        const basePool = OuroborosEngine.getTeamPool(myTeam);
        const otherActions = pendingActions.filter(a => a.casterId !== casterId);

        for (const action of otherActions) {
            const c = myTeam.team.find(char => char.id === action.casterId);
            const s = c?.skills.find(sk => sk.id === action.skillId);
            if (s) {
                const skillColors = Object.keys(s.cost) as EnergyColor[];
                for (const col of skillColors) {
                    const cost = s.cost[col] ?? 0;
                    basePool[col] -= cost;
                }
            }
        }
        for (const color of (myTeam.pendingBurn ?? [])) {
            basePool[color]--;
        }

        let whiteNeeded = 0;
        const colors: EnergyColor[] = ['Red', 'Yellow', 'Blue', 'Green'];
        for (const color of colors) {
            const cost = skill.cost[color] ?? 0;
            if (basePool[color] < cost) {
                whiteNeeded += (cost - basePool[color]);
            }
        }
        const skillWhiteCost = skill.cost.White ?? 0;
        return basePool.White >= (whiteNeeded + skillWhiteCost);
    }

    // Remap state so Arena UI sees playerA = me, playerB = opponent
    const normalizedState: MatchState | null = matchState
        ? role === 'player_a'
            ? matchState
            : {
                ...matchState,
                playerA: matchState.playerB,
                playerB: matchState.playerA,
            }
        : null;

    const isResolveReady = arenaPhase === 'PLANNING';
    const currentEvent = currentEventIndex >= 0 ? showdownEvents[currentEventIndex] : null;

    return {
        // State
        matchState: normalizedState,
        arenaPhase,
        pendingActions,
        combatLog,
        currentEvent,
        isResolveReady,
        selectedCasterId,
        selectedSkillId,
        replayHistory: replayHistory.current,
        opponent,
        mode,
        role,
        error,
        turnTimer,

        // Actions
        selectSkill,
        confirmTarget,
        cancelPlanningAction: undoAction,
        clearSelection,
        resolveTurn,
        projectedPool,
        canAffordWithPending,
        toggleBurn,
    };
}
