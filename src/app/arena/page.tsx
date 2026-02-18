"use client";

import { Suspense, useMemo, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./Arena.module.css";
import { useArena, ALLY_TARGET_REACHES } from "@/hooks/useArena";
import ArenaPvPContent from "./ArenaPvPContent";
import { useAuth } from "@/hooks/useAuth";
import { useEconomy } from "@/hooks/useEconomy";
import MatchResultOverlay from "@/components/MatchResultOverlay";
import type { ShowdownEvent } from "@/hooks/useArena";
import type { MatchResult, PerCharStats } from "@/types/api";
import charactersData from "@/data/characters_live.json";
import type { Character, CharacterState, EnergyColor, Skill, SkillReach } from "@/types/game";

const characters = charactersData as Character[];

// --- Color Maps ---

const ENERGY_COLORS: Record<EnergyColor, string> = {
    Red: "#e74c3c",
    Yellow: "#f1c40f",
    Blue: "#3498db",
    Green: "#2ecc71",
    White: "#ecf0f1",
};

const LINEAGE_COLORS: Record<string, string> = {
    Iron: "var(--lineage-iron)",
    Neon: "var(--lineage-neon)",
    Void: "var(--lineage-void)",
};



function canTargetAlly(skill: Skill | undefined): boolean {
    if (!skill) return false;
    if (!skill.reach) return false;
    return ALLY_TARGET_REACHES.includes(skill.reach);
}

function canTargetEnemy(skill: Skill | undefined): boolean {
    if (!skill) return true; // default
    if (!skill.reach) return true;
    const enemyReaches: SkillReach[] = [
        'Melee', 'Ranged', 'Single', 'Global', 'Global_Enemy',
        'Linear', 'Random_Enemy', 'Enemy', 'Two_Enemies', 'Unique',
    ];
    return enemyReaches.includes(skill.reach);
}

// --- Sub-Components ---

function HpBar({ current, max }: { current: number; max: number }) {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    return (
        <div className={styles.barWrapper}>
            <div className={styles.hpFill} style={{ width: `${pct}%` }} />
            <span className={styles.barLabel}>
                {current}/{max}
            </span>
        </div>
    );
}

function EnergyCostDots({ cost }: { cost: Partial<Record<EnergyColor, number>> }) {
    const dots: { color: string; key: string }[] = [];
    for (const [key, val] of Object.entries(cost)) {
        if (val && val > 0) {
            for (let i = 0; i < val; i++) {
                dots.push({ color: ENERGY_COLORS[key as EnergyColor], key: `${key}-${i}` });
            }
        }
    }
    return (
        <span className={styles.skillCostRow}>
            {dots.map((d) => (
                <span
                    key={d.key}
                    className={styles.energyDotSmall}
                    style={{ backgroundColor: d.color }}
                />
            ))}
        </span>
    );
}

function FloatingNumbers({
    event,
    charId,
}: {
    event: ShowdownEvent | null;
    charId: string;
}) {
    if (!event) return null;
    const relevantEffects = event.effects.filter((e) => e.targetId === charId);
    return (
        <>
            {relevantEffects.map((eff, i) => {
                if (eff.type === "damage" && eff.value) {
                    return <span key={i} className={styles.floatingDamage}>-{eff.value}</span>;
                }
                if (eff.type === "heal" && eff.value) {
                    return <span key={i} className={styles.floatingHeal}>+{eff.value}</span>;
                }
                if (eff.type === "shield" && eff.value) {
                    return <span key={i} className={styles.floatingShield}>+{eff.value}</span>;
                }
                return null;
            })}
        </>
    );
}

function LogPanel({ combatLog }: { combatLog: ShowdownEvent[] }) {
    let lastWave = "";
    return (
        <div className={styles.combatLog}>
            <div className={styles.logTitle}>COMBAT LOG</div>
            {combatLog.length === 0 && (
                <div className={styles.logEntry} style={{ fontStyle: "italic" }}>
                    Aguardando turno...
                </div>
            )}
            {combatLog.map((event, i) => {
                if (!event) return null;
                const showWaveLabel = event.wave !== lastWave;
                lastWave = event.wave;
                return (
                    <div key={i}>
                        {showWaveLabel && (
                            <div className={styles.logWaveLabel}>━━ {event.wave} ━━</div>
                        )}
                        <div
                            className={
                                event.cancelled
                                    ? styles.logEntryCancelled
                                    : i === combatLog.length - 1
                                        ? styles.logEntryActive
                                        : styles.logEntry
                            }
                        >
                            <strong>{event.casterName.split(",")[0]}</strong>
                            {event.cancelled ? (
                                <> — CANCELADO</>
                            ) : (
                                <>
                                    {" "}usou <em>{event.skillName}</em>
                                    {event.effects.length > 0 && (
                                        <>
                                            {" → "}
                                            {event.effects.map((e, j) => (
                                                <span key={j}>
                                                    {e.type === "damage" && `${e.value} DMG`}
                                                    {e.type === "heal" && `+${e.value} HP`}
                                                    {e.type === "shield" && `+${e.value} Shield`}
                                                    {e.type === "status_apply" && e.detail}
                                                    {e.type === "cancel" && "STUN"}
                                                    {j < event.effects.length - 1 ? ", " : ""}
                                                </span>
                                            ))}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// --- Main Arena Component ---

function ArenaContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null);
    const [teamValidation, setTeamValidation] = useState<'checking' | 'valid' | 'invalid'>('checking');
    const [validationError, setValidationError] = useState<string | null>(null);

    const starters = useMemo(() => characters.filter((c) => c.is_starter), []);

    // Match mode (quick or ranked)
    const isRanked = searchParams.get('mode') === 'ranked';

    // Read team from query params (Lobby passes ?team=id1,id2,id3)
    const teamA = useMemo(() => {
        const teamParam = searchParams.get('team');
        if (teamParam) {
            const rawIds = teamParam.split(',');
            // Deduplicate to prevent URL manipulation (Fix: duplication exploit)
            const ids = Array.from(new Set(rawIds));

            const resolved = ids
                .map(id => characters.find(c => c.id === id))
                .filter(Boolean) as Character[];

            if (resolved.length === 3) return resolved;
        }
        return starters.slice(0, 3);
    }, [searchParams, starters]);

    // Opponent: random starters not in player team
    const teamB = useMemo(() => {
        const playerIds = new Set(teamA.map(c => c.id));
        const available = starters.filter(c => !playerIds.has(c.id));
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 3);
    }, [teamA, starters]);

    const {
        matchState,
        arenaPhase,
        pendingActions,
        combatLog,
        currentEvent,
        isResolveReady,
        selectedCasterId,
        selectedSkillId,
        replayHistory,
        selectSkill,
        confirmTarget,
        cancelPlanningAction,
        clearSelection,
        resolveTurn,
        projectedPool,
        canAffordWithPending,
        toggleBurn,
    } = useArena(teamA, teamB);

    // --- Economy Integration ---
    const { user } = useAuth();
    const {
        dashboard,
        lastRewards,
        completedMissions,
        loading: economyLoading,
        submitMatchRewards,
        claimMission,
    } = useEconomy(!!user);
    const hasSubmittedRewards = useRef(false);
    const matchStartTime = useRef(Date.now());

    // --- Server-side team validation ---
    useEffect(() => {
        if (!user) {
            setTeamValidation('valid'); // Allow unauthenticated play (vs AI)
            return;
        }
        const teamIds = teamA.map(c => c.id);
        const mode = isRanked ? 'ranked' : 'quick';

        fetch('/api/v1/match/validate-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterIds: teamIds, mode }),
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setTeamValidation('valid');
                } else {
                    setTeamValidation('invalid');
                    setValidationError(data.error?.message ?? 'Team inválido');
                    setTimeout(() => router.push('/lobby'), 3000);
                }
            })
            .catch(() => {
                setTeamValidation('valid'); // Fail open for network errors
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Submit rewards when match ends
    useEffect(() => {
        if (arenaPhase !== 'RESULT' || !user || hasSubmittedRewards.current) return;
        hasSubmittedRewards.current = true;

        const durationSeconds = Math.round((Date.now() - matchStartTime.current) / 1000);
        const playerTeamIds = new Set(matchState.playerA.team.map(c => c.id));

        // Per-character stat accumulators
        const charStats: Record<string, {
            damageDealt: number; healingDone: number; shieldGiven: number; kills: number;
        }> = {};
        for (const c of teamA) {
            charStats[c.id] = { damageDealt: 0, healingDone: 0, shieldGiven: 0, kills: 0 };
        }

        // Aggregate metrics
        let totalDamageDealt = 0;
        let totalDamageReceived = 0;
        let totalHealingDone = 0;
        let totalShieldGiven = 0;
        let kills = 0;
        let cancelsInflicted = 0;
        let statusEffectsApplied = 0;

        for (const event of combatLog) {
            const isPlayerCaster = playerTeamIds.has(event.casterId);

            for (const eff of event.effects) {
                if (isPlayerCaster) {
                    if (eff.type === 'damage' && eff.value) {
                        totalDamageDealt += eff.value;
                        if (charStats[event.casterId]) charStats[event.casterId].damageDealt += eff.value;
                    }
                    if (eff.type === 'heal' && eff.value) {
                        totalHealingDone += eff.value;
                        if (charStats[event.casterId]) charStats[event.casterId].healingDone += eff.value;
                    }
                    if (eff.type === 'shield' && eff.value) {
                        totalShieldGiven += eff.value;
                        if (charStats[event.casterId]) charStats[event.casterId].shieldGiven += eff.value;
                    }
                    if (eff.type === 'status_apply') statusEffectsApplied++;
                    if (eff.type === 'cancel') cancelsInflicted++;
                } else {
                    // Enemy damage = player damage received
                    if (eff.type === 'damage' && eff.value && playerTeamIds.has(eff.targetId)) {
                        totalDamageReceived += eff.value;
                    }
                }
            }
        }

        // Count kills (enemy chars that died)
        for (const c of matchState.playerB.team) {
            if (!c.isAlive) kills++;
        }
        // Attribute kills to highest damage dealer (simplified)
        const sortedByDmg = Object.entries(charStats).sort((a, b) => b[1].damageDealt - a[1].damageDealt);
        if (sortedByDmg.length > 0 && kills > 0) {
            sortedByDmg[0][1].kills = kills;
        }

        // Determine dominant lineage
        const lineageCounts: Record<string, number> = {};
        for (const char of teamA) {
            const lineage = char.lineage.toLowerCase();
            lineageCounts[lineage] = (lineageCounts[lineage] ?? 0) + 1;
        }
        const teamLineage = Object.entries(lineageCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'iron';

        // Build per-char stats array
        const perCharStats: PerCharStats[] = teamA.map(c => ({
            characterId: c.id,
            lineage: c.lineage.toLowerCase(),
            damageDealt: charStats[c.id]?.damageDealt ?? 0,
            healingDone: charStats[c.id]?.healingDone ?? 0,
            shieldGiven: charStats[c.id]?.shieldGiven ?? 0,
            kills: charStats[c.id]?.kills ?? 0,
        }));

        const matchResult: MatchResult = {
            won: matchState.winner === 'player',
            mode: 'ai',
            teamLineage,
            totalDamageDealt,
            totalDamageVlt: 0,
            burnCount: matchState.playerA.pendingBurn.length,
            turns: matchState.turn,
            teamCharacterIds: teamA.map(c => c.id),
            durationSeconds,
            totalHealingDone,
            totalShieldGiven,
            totalDamageReceived,
            kills,
            cancelsInflicted,
            statusEffectsApplied,
            perCharStats,
            replayActions: replayHistory,
        };

        submitMatchRewards(matchResult);
    }, [arenaPhase, user, combatLog, matchState, teamA, submitMatchRewards, replayHistory]);

    // Find the currently selected skill object for targeting logic
    const selectedSkillObj = useMemo(() => {
        if (!selectedCasterId || !selectedSkillId) return null;
        const caster = matchState.playerA.team.find((c) => c.id === selectedCasterId);
        return caster?.skills.find((s) => s.id === selectedSkillId) ?? null;
    }, [selectedCasterId, selectedSkillId, matchState]);

    // Get lineage color
    function getLineageColor(charId: string): string {
        const src = characters.find((c) => c.id === charId);
        return src ? (LINEAGE_COLORS[src.lineage] ?? "var(--text-muted)") : "var(--text-muted)";
    }

    // Determine if a character is a valid target
    function isValidTarget(char: CharacterState, isAlly: boolean): boolean {
        if (!selectedCasterId || !selectedSkillId) return false;
        if (!char.isAlive) return false;
        if (isAlly) return canTargetAlly(selectedSkillObj ?? undefined);
        return canTargetEnemy(selectedSkillObj ?? undefined);
    }

    // Card class determination
    function getCharCardClass(char: CharacterState, isAlly: boolean): string {
        if (!char.isAlive) return styles.charCardDead;
        if (arenaPhase === "SHOWDOWN" && currentEvent?.casterId === char.id) {
            return styles.charCardShowdownFocus;
        }
        // Targeting mode
        if (selectedCasterId && selectedSkillId) {
            if (isValidTarget(char, isAlly)) return styles.charCardTarget;
            return styles.charCard;
        }
        return styles.charCard;
    }

    // Handle clicking a character (for targeting)
    function handleCharClick(char: CharacterState, isAlly: boolean) {
        if (arenaPhase !== "PLANNING") return;
        if (!char.isAlive) return;

        // If we have both caster+skill selected, try to confirm target
        if (selectedCasterId && selectedSkillId) {
            if (isValidTarget(char, isAlly)) {
                confirmTarget(char.id);
            }
            return;
        }

        // Otherwise, clicking an ally just selects them as caster
        if (isAlly) {
            if (selectedCasterId === char.id) {
                clearSelection();
            } else {
                selectSkill(char.id, "");
            }
        }
    }

    // Handle clicking a skill button next to a character
    function handleSkillClick(casterId: string, skill: Skill) {
        if (arenaPhase !== "PLANNING") return;
        selectSkill(casterId, skill.id);
        setHoveredSkill(skill);
    }

    // Render one character row (portrait + skills inline)
    function renderCharacterRow(char: CharacterState, isAlly: boolean) {
        const pending = pendingActions.find((a) => a.casterId === char.id);
        const isSelectedCaster = selectedCasterId === char.id;
        const hideSkills = !isAlly && isRanked;

        return (
            <div
                key={char.id}
                className={`${getCharCardClass(char, isAlly)} ${isSelectedCaster ? styles.charCardSelected : ""}`}
                onClick={() => handleCharClick(char, isAlly)}
            >
                {/* Lineage accent bar */}
                <div
                    className={styles.charCardHighlight}
                    style={{ backgroundColor: getLineageColor(char.id) }}
                />

                <FloatingNumbers event={currentEvent} charId={char.id} />

                {/* Row: Portrait area + Skills */}
                <div className={styles.charRow}>
                    {/* Portrait + HP */}
                    <div className={styles.charPortrait}>
                        <div className={styles.charAvatar}>
                            {char.name.charAt(0)}
                        </div>
                        <div className={styles.charMeta}>
                            <span className={styles.charName}>{char.name.split(",")[0]}</span>
                            <HpBar current={char.hp} max={char.maxHp} />
                            {(char.shield > 0 || char.armor > 0) && (
                                <div className={styles.shieldInfo}>
                                    {char.armor > 0 && <span>🛡 {char.armor}</span>}
                                    {char.shield > 0 && <span>🔵 {char.shield}</span>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Skill Icons (inline, next to portrait) */}
                    <div className={styles.skillIconRow}>
                        {char.skills.map((skill) => {
                            const isAffordable = canAffordWithPending(char.id, skill);
                            const isActive = isSelectedCaster && selectedSkillId === skill.id;
                            const isLocked = !isAffordable && arenaPhase === 'PLANNING';

                            return (
                                <button
                                    key={skill.id}
                                    className={`${styles.skillIcon} ${isActive ? styles.skillIconActive : ""} ${isLocked ? styles.skillIconLocked : ""}`}
                                    disabled={arenaPhase !== "PLANNING" || !isAlly || !char.isAlive}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isAlly) handleSkillClick(char.id, skill);
                                    }}
                                    onMouseEnter={() => { if (!hideSkills) setHoveredSkill(skill); }}
                                    onMouseLeave={() => {
                                        if (!isActive && !hideSkills) setHoveredSkill(null);
                                    }}
                                    title={hideSkills ? "" : skill.name}
                                >
                                    <span className={styles.skillIconLetter}>
                                        {hideSkills ? "?" : skill.name.charAt(0)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Status badges */}
                {char.statuses.length > 0 && (
                    <div className={styles.statusRow}>
                        {char.statuses.map((s, i) => (
                            <span key={i} className={styles.statusBadge}>
                                {s.type} ({s.duration})
                            </span>
                        ))}
                    </div>
                )}

                {/* Pending action */}
                {isAlly && pending && (
                    <div
                        className={styles.pendingBadge}
                        onClick={(e) => {
                            e.stopPropagation();
                            cancelPlanningAction(char.id);
                        }}
                    >
                        🎯 {pending.skillName} → {pending.targetName.split(",")[0]} ✕
                    </div>
                )}
            </div>
        );
    }

    // --- Validation gate ---
    if (teamValidation === 'checking') {
        return (
            <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-primary)' }}>
                    <h2>⏳ Validando time...</h2>
                </div>
            </div>
        );
    }

    if (teamValidation === 'invalid') {
        return (
            <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#E74C3C' }}>
                    <h2>🚫 Time Inválido</h2>
                    <p>{validationError}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Redirecionando para o Lobby...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* ===== LAYER 1: INFO BAR ===== */}
            <header className={styles.infoBar}>
                <div className={styles.playerInfo}>
                    <span className={styles.playerNameAlly}>PILOTO</span>
                </div>

                <div className={styles.infoCenter}>
                    <span className={styles.turnBadge}>TURNO {matchState.turn}</span>
                    <span
                        className={
                            arenaPhase === "SHOWDOWN" ? styles.phaseShowdown : styles.phaseBadge
                        }
                    >
                        {arenaPhase === "PLANNING" && "PLANEJAMENTO"}
                        {arenaPhase === "SHOWDOWN" && "⚡ SHOWDOWN"}
                        {arenaPhase === "RESULT" && "RESULTADO"}
                    </span>
                    <span className={styles.turnBadge} style={isRanked ? { background: 'linear-gradient(135deg, #C0392B, #922B21)' } : {}}>
                        {isRanked ? "🏆 RANKED" : "⚡ QUICK"}
                    </span>

                    {/* Energy display */}
                    <div className={styles.energyBar}>
                        {(["Red", "Yellow", "Blue", "Green", "White"] as EnergyColor[]).map((color) => {
                            const total = matchState.playerA.team.reduce(
                                (sum, c) => sum + (c.isAlive ? c.energy[color] : 0), 0
                            );
                            const projected = projectedPool[color];
                            const isBurning = matchState.playerA.pendingBurn.includes(color);

                            return (
                                <span key={color} className={styles.energyBarItem}>
                                    <span
                                        className={styles.energyDotSmall}
                                        style={{ backgroundColor: ENERGY_COLORS[color] }}
                                    />
                                    <span className={styles.energyBarCount}>×{total}</span>
                                    {projected !== total && (
                                        <span className={styles.energyBarCountProjected}>({projected})</span>
                                    )}
                                    {arenaPhase === 'PLANNING' && (
                                        <button
                                            className={`${styles.burnToggle} ${isBurning ? styles.burnToggleActive : ''}`}
                                            onClick={() => toggleBurn(color)}
                                            title="Reciclagem Oculta (Descarte 2 para ganhar 1 secreta no próximo turno)"
                                        >
                                            R
                                        </button>
                                    )}
                                </span>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.playerInfo}>
                    <span className={styles.playerNameEnemy}>OPONENTE</span>
                </div>
            </header>

            {/* ===== LAYER 2: BATTLEFIELD ===== */}
            <section className={styles.battlefield}>
                <div className={styles.teamColumn}>
                    {matchState.playerA.team.map((char) => renderCharacterRow(char, true))}
                </div>

                <div className={styles.vsSymbol}>VS</div>

                <div className={styles.teamColumn}>
                    {matchState.playerB.team.map((char) => renderCharacterRow(char, false))}
                </div>
            </section>

            {/* ===== LAYER 3: BOTTOM BAR (Skill description + Controls) ===== */}
            <footer className={styles.bottomBar}>
                {/* Resolve button */}
                <div className={styles.resolveArea}>
                    {arenaPhase === "PLANNING" && (
                        <button
                            className={styles.resolveBtn}
                            disabled={!isResolveReady}
                            onClick={resolveTurn}
                        >
                            {isResolveReady
                                ? "⚡ RESOLVE"
                                : `AÇÕES: ${pendingActions.length}/${matchState.playerA.team.filter((c) => c.isAlive).length}`}
                        </button>
                    )}
                </div>

                {/* Skill description panel */}
                <div className={styles.skillDescPanel}>
                    {hoveredSkill || (selectedSkillObj) ? (
                        (() => {
                            const skill = hoveredSkill ?? selectedSkillObj;
                            if (!skill) return null;
                            return (
                                <>
                                    <div className={styles.skillDescName}>{skill.name}</div>
                                    <div className={styles.skillDescText}>
                                        {skill.description || "Sem descrição disponível."}
                                    </div>
                                    <div className={styles.skillDescMeta}>
                                        <span>CLASSE: {skill.category} · {skill.nature}</span>
                                        {skill.reach && <span> | ALCANCE: {skill.reach}</span>}
                                        <span className={styles.skillDescEnergy}>
                                            ENERGIA: <EnergyCostDots cost={skill.cost} />
                                        </span>
                                    </div>
                                </>
                            );
                        })()
                    ) : (
                        <div className={styles.skillDescPlaceholder}>
                            Passe o mouse sobre uma habilidade para ver sua descrição
                        </div>
                    )}
                </div>

                {/* Combat log */}
                <LogPanel combatLog={combatLog} />
            </footer>

            {/* ===== RESULT OVERLAY (Enhanced with rewards) ===== */}
            {arenaPhase === "RESULT" && (
                <MatchResultOverlay
                    winner={matchState.winner}
                    rewards={lastRewards}
                    missions={dashboard?.activeMissions ?? []}
                    completedMissions={completedMissions}
                    loading={economyLoading}
                    onClaim={claimMission}
                />
            )}
        </div>
    );
}

function ArenaRouter() {
    const searchParams = useSearchParams();
    const matchId = searchParams.get('match');

    if (matchId) {
        return <ArenaPvPContent matchId={matchId} />;
    }

    return <ArenaContent />;
}

export default function ArenaPage() {
    return (
        <Suspense fallback={<div style={{ color: 'white', textAlign: 'center', paddingTop: '40vh' }}>Carregando Arena...</div>}>
            <ArenaRouter />
        </Suspense>
    );
}
