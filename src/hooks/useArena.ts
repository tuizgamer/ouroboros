// ============================================================
// useArena — Battle State Management Hook
// Handles Planning Phase, Sequential Showdown, and Turn Cycle
// ============================================================

import { useState, useCallback, useRef } from 'react';
import { OuroborosEngine, createCharacterState } from '@/lib/engine';
import type {
    MatchState,
    MatchAction,
    TurnLogEntry,
    CharacterState,
    Character,
    Skill,
    WaveCategory,
    EnergyColor,
    SkillReach,
} from '@/types/game';
import type { ReplayTurn } from '@/types/api';

// --- Constants ---

export const ALLY_TARGET_REACHES: SkillReach[] = [
    'Self', 'Self_Adjacent', 'Ally', 'Global_Ally', 'Dead_Ally',
];

// --- Types ---

export interface PendingAction {
    casterId: string;
    skillId: string;
    targetId: string;
    skillName: string;
    casterName: string;
    targetName: string;
}

export interface ShowdownEvent {
    wave: WaveCategory;
    casterId: string;
    casterName: string;
    skillName: string;
    effects: { type: string; targetId: string; value?: number; detail?: string }[];
    cancelled: boolean;
}

export type ArenaPhase = 'PLANNING' | 'SHOWDOWN' | 'RESULT';

// --- Initial State Factory ---

function buildInitialState(
    teamA: Character[],
    teamB: Character[]
): MatchState {
    const state: MatchState = {
        playerA: {
            id: 'player',
            team: teamA.map((c) =>
                createCharacterState(c.id, c.name, c.base_hp, c.skills)
            ),
            pendingBurn: [],
            nextTurnExtraEnergy: 0,
        },
        playerB: {
            id: 'opponent',
            team: teamB.map((c) =>
                createCharacterState(c.id, c.name, c.base_hp, c.skills)
            ),
            pendingBurn: [],
            nextTurnExtraEnergy: 0,
        },
        turn: 1,
        phase: 'PLANNING',
        winner: null,
    };

    // Grant initial energy for Turn 1
    OuroborosEngine.grantEnergy(state, [...teamA, ...teamB]);

    return state;
}

// --- Dummy AI: picks random skills for the opponent ---

function generateAIActions(opponentTeam: CharacterState[]): MatchAction[] {
    const actions: MatchAction[] = [];
    // Start with a clone of the actual pool
    const pool = OuroborosEngine.getTeamPool({ team: opponentTeam });

    // Shuffle to avoid caster bias
    const shuffledTeam = [...opponentTeam].sort(() => Math.random() - 0.5);

    for (const char of shuffledTeam) {
        if (!char.isAlive || char.skills.length === 0) continue;

        // Find affordable skills
        const possibleSkills = char.skills.filter(s =>
            OuroborosEngine.canAfford(pool, s as unknown as string)
        );

        if (possibleSkills.length > 0) {
            const skill = possibleSkills[Math.floor(Math.random() * possibleSkills.length)];

            // Deduct from temporary pool so next character has less
            const colors: EnergyColor[] = ['Red', 'Yellow', 'Blue', 'Green'];
            for (const col of colors) {
                const cost = skill.cost[col] ?? 0;
                const available = pool[col] ?? 0;
                const toTake = Math.min(available, cost);
                pool[col] -= toTake;
                const shortfall = cost - toTake;
                if (shortfall > 0) pool.White -= shortfall;
            }
            pool.White -= (skill.cost.White ?? 0);

            actions.push({
                casterId: char.id,
                skillId: skill.id,
                targetId: '__ai_target__', // resolved in resolveTurn
            });
        }
    }
    return actions;
}

// --- Hook ---

export function useArena(teamA: Character[], teamB: Character[]) {
    const allCharacters = useRef([...teamA, ...teamB]);
    const [matchState, setMatchState] = useState<MatchState>(() =>
        buildInitialState(teamA, teamB)
    );
    const [arenaPhase, setArenaPhase] = useState<ArenaPhase>('PLANNING');
    const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
    const [showdownEvents, setShowdownEvents] = useState<ShowdownEvent[]>([]);
    const [currentEventIndex, setCurrentEventIndex] = useState(-1);
    const [combatLog, setCombatLog] = useState<ShowdownEvent[]>([]);
    const [selectedCasterId, setSelectedCasterId] = useState<string | null>(null);
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

    const showdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const replayHistory = useRef<ReplayTurn[]>([]);

    // --- Planning Phase ---

    const selectSkill = useCallback(
        (casterId: string, skillId: string) => {
            if (arenaPhase !== 'PLANNING') return;

            // Affordability check
            const caster = matchState.playerA.team.find((c) => c.id === casterId);
            const skill = caster?.skills.find((s) => s.id === skillId);
            if (!caster || !skill) return;

            // Note: We use the PROJECTED pool (Total - Other Pending Actions)
            if (!canAffordWithPending(casterId, skill)) {
                // Return early or trigger feedback
                console.log("Cannot afford skill");
                return;
            }

            setSelectedCasterId(casterId);
            setSelectedSkillId(skillId);
        },
        [arenaPhase, matchState.playerA.team, pendingActions]
    );

    const toggleBurn = useCallback((color: EnergyColor) => {
        if (arenaPhase !== 'PLANNING') return;

        setMatchState(prev => {
            const newState = { ...prev };
            const player = newState.playerA;
            const idx = player.pendingBurn.indexOf(color);

            if (idx > -1) {
                // Un-burn
                player.pendingBurn.splice(idx, 1);
            } else {
                // Burn (check if available in team pool, also accounting for pending actions)
                const pool = OuroborosEngine.getTeamPool(player);
                // Simple check for now: just see if it's in the pool
                if (pool[color] > 0) {
                    player.pendingBurn.push(color);
                }
            }
            return newState;
        });
    }, [arenaPhase]);

    const confirmTarget = useCallback(
        (targetId: string) => {
            if (!selectedCasterId || !selectedSkillId) return;
            if (arenaPhase !== 'PLANNING') return;

            // Find names for display
            const allChars = [...matchState.playerA.team, ...matchState.playerB.team];
            const caster = allChars.find((c) => c.id === selectedCasterId);
            const target = allChars.find((c) => c.id === targetId);
            const skill = caster?.skills.find((s) => s.id === selectedSkillId);

            if (!caster || !skill) return;

            // Remove any existing action from this caster (undo logic)
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

    // --- Resolve Turn (Sequential Showdown) ---

    const resolveTurn = useCallback(() => {
        if (arenaPhase !== 'PLANNING') return;

        // Build player actions from pending
        const playerActions: MatchAction[] = pendingActions.map((a) => ({
            casterId: a.casterId,
            skillId: a.skillId,
            targetId: a.targetId,
        }));

        // Generate AI actions
        const aiRaw = generateAIActions(matchState.playerB.team);
        // Resolve AI targets
        const alivePlayerChars = matchState.playerA.team.filter((c) => c.isAlive);
        const aliveOpponentChars = matchState.playerB.team.filter((c) => c.isAlive);

        const aiActions: MatchAction[] = aiRaw.map((a) => {
            const caster = matchState.playerB.team.find(c => c.id === a.casterId);
            const skill = caster?.skills.find(s => s.id === a.skillId);

            // Determine target team based on skill reach
            const isAllySkill = ALLY_TARGET_REACHES.includes(skill?.reach ?? 'Single');
            const targetPool = isAllySkill ? aliveOpponentChars : alivePlayerChars;

            return {
                ...a,
                targetId: targetPool.length > 0
                    ? targetPool[Math.floor(Math.random() * targetPool.length)].id
                    : (isAllySkill ? matchState.playerB.team[0].id : matchState.playerA.team[0].id),
            };
        });

        // Run engine
        const { newState, turnLog } = OuroborosEngine.resolveTurn(
            matchState,
            playerActions,
            aiActions,
            allCharacters.current
        );

        // Track replay actions
        replayHistory.current.push({
            turn: matchState.turn,
            actionsA: playerActions,
            actionsB: aiActions,
            burnsA: [...matchState.playerA.pendingBurn],
            burnsB: [...matchState.playerB.pendingBurn],
        });

        // Convert TurnLogEntry[] → ShowdownEvent[] for sequential playback
        const allChars = [...matchState.playerA.team, ...matchState.playerB.team];
        const events: ShowdownEvent[] = turnLog.map((entry) => {
            const caster = allChars.find((c) => c.id === entry.casterId);
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

        // Play events sequentially with delays
        const playEvent = (idx: number) => {
            if (idx >= events.length) {
                // Showdown complete — apply final state
                setMatchState(newState);
                setCurrentEventIndex(-1);

                if (newState.phase === 'FINISHED') {
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
    }, [arenaPhase, pendingActions, matchState]);

    // --- Derived State ---

    const projectedPool = (() => {
        const basePool = OuroborosEngine.getTeamPool(matchState.playerA);
        // Subtract pending actions
        for (const action of pendingActions) {
            const caster = matchState.playerA.team.find(c => c.id === action.casterId);
            const skill = caster?.skills.find(s => s.id === action.skillId);
            if (!skill) continue;

            // Simplified subtraction for projection
            const skillColors = Object.keys(skill.cost) as EnergyColor[];
            for (const color of skillColors) {
                const cost = skill.cost[color] ?? 0;
                basePool[color] -= cost;
            }
        }
        // Subtract pending burn
        for (const color of matchState.playerA.pendingBurn) {
            basePool[color]--;
        }
        return basePool;
    })();

    function canAffordWithPending(casterId: string, skill: Skill): boolean {
        // Calculate pool WITHOUT this caster's current pending action (if any)
        const basePool = OuroborosEngine.getTeamPool(matchState.playerA);
        const otherActions = pendingActions.filter(a => a.casterId !== casterId);

        for (const action of otherActions) {
            const c = matchState.playerA.team.find(char => char.id === action.casterId);
            const s = c?.skills.find(sk => sk.id === action.skillId);
            if (s) {
                const skillColors = Object.keys(s.cost) as EnergyColor[];
                for (const col of skillColors) {
                    const cost = s.cost[col] ?? 0;
                    basePool[col] -= cost;
                }
            }
        }
        for (const color of matchState.playerA.pendingBurn) {
            basePool[color]--;
        }

        // Now check if remaining pool can afford the skill
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

    const isResolveReady = arenaPhase === 'PLANNING';

    const currentEvent =
        currentEventIndex >= 0 ? showdownEvents[currentEventIndex] : null;

    return {
        // State
        matchState,
        arenaPhase,
        pendingActions,
        combatLog,
        currentEvent,
        isResolveReady,
        selectedCasterId,
        selectedSkillId,
        replayHistory: replayHistory.current,

        // Actions
        selectSkill,
        confirmTarget,
        cancelPlanningAction: undoAction, // alias
        clearSelection,
        resolveTurn,
        projectedPool,
        canAffordWithPending,
        toggleBurn,
    };
}
