// ============================================================
// Arena Ouroboros — PvP Arena Content Component
// Server-authoritative combat via useArenaPvP hook
// ============================================================

'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Arena.module.css';
import { useArenaPvP, ALLY_TARGET_REACHES } from '@/hooks/useArenaPvP';
import { useAuth } from '@/hooks/useAuth';
import { useEconomy } from '@/hooks/useEconomy';
import MatchResultOverlay from '@/components/MatchResultOverlay';
import type { MatchResult, PerCharStats } from '@/types/api';
import charactersData from '@/data/characters_live.json';
import type { Character, CharacterState, EnergyColor, Skill, SkillReach } from '@/types/game';

const characters = charactersData as Character[];

const ENERGY_COLORS: Record<EnergyColor, string> = {
    Red: '#e74c3c',
    Yellow: '#f1c40f',
    Blue: '#3498db',
    Green: '#2ecc71',
    White: '#ecf0f1',
};

const LINEAGE_COLORS: Record<string, string> = {
    Iron: 'var(--lineage-iron)',
    Neon: 'var(--lineage-neon)',
    Void: 'var(--lineage-void)',
};

function canTargetAlly(skill: Skill | undefined): boolean {
    if (!skill) return false;
    if (!skill.reach) return false;
    return ALLY_TARGET_REACHES.includes(skill.reach);
}

function canTargetEnemy(skill: Skill | undefined): boolean {
    if (!skill) return true;
    if (!skill.reach) return true;
    const enemyReaches: SkillReach[] = [
        'Melee', 'Ranged', 'Single', 'Global', 'Global_Enemy',
        'Linear', 'Random_Enemy', 'Enemy', 'Two_Enemies', 'Unique',
    ];
    return enemyReaches.includes(skill.reach);
}

// --- Sub-Components (shared with AI arena) ---

function HpBar({ current, max }: { current: number; max: number }) {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    const barColor = pct > 50 ? 'var(--neon-cyan)' : pct > 25 ? '#f39c12' : '#e74c3c';
    return (
        <div className={styles.hpBarOuter}>
            <div className={styles.hpBarInner} style={{ width: `${pct}%`, backgroundColor: barColor }} />
            <span className={styles.hpBarLabel}>{current}/{max}</span>
        </div>
    );
}

function EnergyCostDots({ cost }: { cost: Partial<Record<EnergyColor, number>> }) {
    const dots: React.ReactElement[] = [];
    for (const [color, amount] of Object.entries(cost)) {
        for (let i = 0; i < (amount as number); i++) {
            dots.push(
                <span
                    key={`${color}-${i}`}
                    className={styles.energyDotSmall}
                    style={{ backgroundColor: ENERGY_COLORS[color as EnergyColor] }}
                />
            );
        }
    }
    return <span className={styles.energyCostDots}>{dots}</span>;
}

function LogPanel({ combatLog }: { combatLog: { casterId: string; casterName: string; skillName: string; cancelled: boolean; effects: { type: string; targetId: string; value?: number; detail?: string }[] }[] }) {
    const logRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [combatLog.length]);

    if (combatLog.length === 0) return null;
    return (
        <div className={styles.logPanel} ref={logRef}>
            <h4 className={styles.logTitle}>📜 Combat Log</h4>
            {combatLog.map((ev, i) => (
                <div key={i} className={styles.logEntry}>
                    <span className={styles.logCaster}>{ev.casterName}</span>
                    {ev.cancelled ? (
                        <span className={styles.logCancelled}> — CANCELADO</span>
                    ) : (
                        <>
                            <span className={styles.logSkill}> → {ev.skillName}</span>
                            {ev.effects.map((eff, j) => (
                                <span key={j} className={styles.logEffect}>
                                    {eff.type === 'damage' && ` [${eff.value} dmg]`}
                                    {eff.type === 'heal' && ` [+${eff.value} heal]`}
                                    {eff.type === 'shield' && ` [+${eff.value} shield]`}
                                    {eff.type === 'status_apply' && ` [${eff.detail}]`}
                                    {eff.type === 'cancel' && ` [CANCEL]`}
                                </span>
                            ))}
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}

// --- Main PvP Component ---

export default function ArenaPvPContent({ matchId }: { matchId: string }) {
    const router = useRouter();
    const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null);

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
        opponent,
        mode,
        error,
        selectSkill,
        confirmTarget,
        cancelPlanningAction,
        clearSelection,
        resolveTurn,
        projectedPool,
        canAffordWithPending,
        toggleBurn,
    } = useArenaPvP(matchId);

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

    // Submit rewards when match ends
    useEffect(() => {
        if (arenaPhase !== 'RESULT' || !user || !matchState || hasSubmittedRewards.current) return;
        hasSubmittedRewards.current = true;

        const durationSeconds = Math.round((Date.now() - matchStartTime.current) / 1000);
        const playerTeamIds = new Set(matchState.playerA.team.map(c => c.id));

        const charStats: Record<string, {
            damageDealt: number; healingDone: number; shieldGiven: number; kills: number;
        }> = {};
        for (const c of matchState.playerA.team) {
            charStats[c.id] = { damageDealt: 0, healingDone: 0, shieldGiven: 0, kills: 0 };
        }

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
                    if (eff.type === 'cancel') cancelsInflicted++;
                    if (eff.type === 'status_apply') statusEffectsApplied++;
                } else {
                    if (eff.type === 'damage' && eff.value) totalDamageReceived += eff.value;
                }
            }
        }

        const lineageCounts: Record<string, number> = {};
        for (const c of matchState.playerA.team) {
            const src = characters.find(ch => ch.id === c.id);
            if (src) lineageCounts[src.lineage.toLowerCase()] = (lineageCounts[src.lineage.toLowerCase()] ?? 0) + 1;
        }
        const teamLineage = Object.entries(lineageCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'iron';

        const perCharStats: PerCharStats[] = matchState.playerA.team.map(c => ({
            characterId: c.id,
            lineage: characters.find(ch => ch.id === c.id)?.lineage.toLowerCase() ?? 'iron',
            damageDealt: charStats[c.id]?.damageDealt ?? 0,
            healingDone: charStats[c.id]?.healingDone ?? 0,
            shieldGiven: charStats[c.id]?.shieldGiven ?? 0,
            kills: charStats[c.id]?.kills ?? 0,
        }));

        const matchResult: MatchResult = {
            won: matchState.winner === matchState.playerA.id,
            mode: (mode as 'ranked' | 'quick') || 'quick',
            teamLineage,
            totalDamageDealt,
            totalDamageVlt: 0,
            burnCount: matchState.playerA.pendingBurn.length,
            turns: matchState.turn,
            teamCharacterIds: matchState.playerA.team.map(c => c.id),
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
    }, [arenaPhase, user, combatLog, matchState, submitMatchRewards, replayHistory]);

    // Selected skill object for targeting
    const selectedSkillObj = useMemo(() => {
        if (!selectedCasterId || !selectedSkillId || !matchState) return null;
        const caster = matchState.playerA.team.find((c) => c.id === selectedCasterId);
        return caster?.skills.find((s) => s.id === selectedSkillId) ?? null;
    }, [selectedCasterId, selectedSkillId, matchState]);

    // --- Helpers ---

    function getLineageColor(charId: string): string {
        const src = characters.find((c) => c.id === charId);
        return src ? (LINEAGE_COLORS[src.lineage] ?? 'var(--text-muted)') : 'var(--text-muted)';
    }

    function isValidTarget(char: CharacterState, isAlly: boolean): boolean {
        if (!selectedCasterId || !selectedSkillId) return false;
        if (!char.isAlive) return false;
        if (isAlly) return canTargetAlly(selectedSkillObj ?? undefined);
        return canTargetEnemy(selectedSkillObj ?? undefined);
    }

    function getCharCardClass(char: CharacterState, isAlly: boolean): string {
        if (!char.isAlive) return styles.charCardDead;
        if (arenaPhase === 'SHOWDOWN' && currentEvent?.casterId === char.id) {
            return styles.charCardShowdownFocus;
        }
        if (isValidTarget(char, isAlly)) return styles.charCardTargetable;
        return styles.charCard;
    }

    function handleCharClick(char: CharacterState, isAlly: boolean) {
        if (arenaPhase !== 'PLANNING') return;
        if (!selectedCasterId || !selectedSkillId) {
            if (isAlly) {
                setHoveredSkill(null);
                clearSelection();
            }
            return;
        }
        if (!char.isAlive) return;
        const isValid = isValidTarget(char, isAlly);
        if (isValid) confirmTarget(char.id);
    }

    function handleSkillClick(casterId: string, skill: Skill) {
        if (arenaPhase !== 'PLANNING') return;
        selectSkill(casterId, skill.id);
        setHoveredSkill(skill);
    }

    function renderCharacterRow(char: CharacterState, isAlly: boolean) {
        const cardClass = getCharCardClass(char, isAlly);
        const hasPendingAction = pendingActions.find(a => a.casterId === char.id);
        const isShowdownTarget = currentEvent?.effects?.some(e => e.targetId === char.id);
        const lineageColor = getLineageColor(char.id);

        return (
            <div
                key={char.id}
                className={`${cardClass} ${isShowdownTarget ? styles.charCardTargetHit : ''}`}
                onClick={() => handleCharClick(char, isAlly)}
                style={{ borderColor: lineageColor }}
            >
                <div className={styles.charPortrait}>
                    <div className={styles.charName} style={{ color: lineageColor }}>
                        {char.name}
                    </div>
                    <HpBar current={char.hp} max={char.maxHp} />
                    {char.armor > 0 && <span className={styles.armorBadge}>🛡{char.armor}</span>}
                    {char.shield > 0 && <span className={styles.shieldBadge}>🔷{char.shield}</span>}
                    {char.statuses.length > 0 && (
                        <div className={styles.statusRow}>
                            {char.statuses.map((s, i) => (
                                <span key={i} className={styles.statusBadge} title={`${s.type} (${s.duration}t)`}>
                                    {s.type.slice(0, 3)}
                                </span>
                            ))}
                        </div>
                    )}
                    {hasPendingAction && (
                        <div className={styles.pendingBadge}>
                            <span>{hasPendingAction.skillName} → {hasPendingAction.targetName}</span>
                            <button
                                className={styles.undoBtn}
                                onClick={(e) => { e.stopPropagation(); cancelPlanningAction(char.id); }}
                            >
                                ✖
                            </button>
                        </div>
                    )}
                </div>

                {isAlly && char.isAlive && arenaPhase === 'PLANNING' && (
                    <div className={styles.skillBar}>
                        {char.skills.map((skill) => {
                            const canUse = canAffordWithPending(char.id, skill);
                            const isSelected = selectedCasterId === char.id && selectedSkillId === skill.id;
                            return (
                                <button
                                    key={skill.id}
                                    className={`${styles.skillBtn} ${isSelected ? styles.skillBtnSelected : ''} ${!canUse ? styles.skillBtnDisabled : ''}`}
                                    onClick={(e) => { e.stopPropagation(); handleSkillClick(char.id, skill); }}
                                    onMouseEnter={() => setHoveredSkill(skill)}
                                    onMouseLeave={() => { if (!isSelected) setHoveredSkill(null); }}
                                    disabled={!canUse}
                                >
                                    <span className={styles.skillBtnName}>{skill.name}</span>
                                    <EnergyCostDots cost={skill.cost} />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // --- Loading / Error states ---

    if (error) {
        return (
            <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#E74C3C' }}>
                    <h2>🚫 Erro</h2>
                    <p>{error}</p>
                    <button onClick={() => router.push('/lobby')} className={styles.resolveBtn}>Voltar ao Lobby</button>
                </div>
            </div>
        );
    }

    if (arenaPhase === 'LOADING' || !matchState) {
        return (
            <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-primary)' }}>
                    <h2>⏳ Carregando partida...</h2>
                </div>
            </div>
        );
    }

    const isRanked = mode === 'ranked';

    return (
        <div className={styles.container}>
            {/* ===== LAYER 1: INFO BAR ===== */}
            <header className={styles.infoBar}>
                <div className={styles.playerInfo}>
                    <span className={styles.playerNameAlly}>VOCÊ</span>
                </div>

                <div className={styles.infoCenter}>
                    <span className={styles.turnBadge}>TURNO {matchState.turn}</span>
                    <span
                        className={
                            arenaPhase === 'SHOWDOWN' ? styles.phaseShowdown : styles.phaseBadge
                        }
                    >
                        {arenaPhase === 'PLANNING' && 'PLANEJAMENTO'}
                        {arenaPhase === 'WAITING' && '⏳ AGUARDANDO...'}
                        {arenaPhase === 'SHOWDOWN' && '⚡ SHOWDOWN'}
                        {arenaPhase === 'RESULT' && 'RESULTADO'}
                    </span>
                    <span className={styles.turnBadge} style={isRanked ? { background: 'linear-gradient(135deg, #C0392B, #922B21)' } : {}}>
                        {isRanked ? '🏆 RANKED' : '⚡ QUICK'}
                    </span>

                    {/* Energy display */}
                    <div className={styles.energyBar}>
                        {(['Red', 'Yellow', 'Blue', 'Green', 'White'] as EnergyColor[]).map((color) => {
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
                                            title="Reciclagem Oculta"
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
                    <span className={styles.playerNameEnemy}>
                        {opponent?.username ?? 'OPONENTE'}
                        {opponent?.elo && <small style={{ opacity: 0.7, marginLeft: 6 }}>{opponent.elo} ELO</small>}
                    </span>
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

            {/* ===== WAITING OVERLAY ===== */}
            {arenaPhase === 'WAITING' && (
                <div className={styles.waitingOverlay} style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 100,
                }}>
                    <div style={{
                        textAlign: 'center',
                        color: 'var(--neon-cyan)',
                        fontSize: '1.5rem',
                        animation: 'pulse 2s infinite',
                    }}>
                        ⏳ Aguardando oponente...
                    </div>
                </div>
            )}

            {/* ===== LAYER 3: BOTTOM BAR ===== */}
            <footer className={styles.bottomBar}>
                <div className={styles.resolveArea}>
                    {arenaPhase === 'PLANNING' && (
                        <button
                            className={styles.resolveBtn}
                            disabled={!isResolveReady}
                            onClick={resolveTurn}
                        >
                            ⚡ ENVIAR AÇÕES
                        </button>
                    )}
                </div>

                <div className={styles.skillDescPanel}>
                    {hoveredSkill || (selectedSkillObj) ? (
                        (() => {
                            const skill = hoveredSkill ?? selectedSkillObj;
                            if (!skill) return null;
                            return (
                                <>
                                    <div className={styles.skillDescName}>{skill.name}</div>
                                    <div className={styles.skillDescText}>
                                        {skill.description || 'Sem descrição disponível.'}
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

                <LogPanel combatLog={combatLog} />
            </footer>

            {/* ===== RESULT OVERLAY ===== */}
            {arenaPhase === 'RESULT' && (
                <MatchResultOverlay
                    winner={matchState.winner === matchState.playerA.id ? 'player' : 'opponent'}
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
