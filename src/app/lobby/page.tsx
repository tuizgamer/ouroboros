"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./Lobby.module.css";
import charactersData from "@/data/characters_live.json";
import missionsData from "@/data/missions.json";
import { useAuth } from "@/hooks/useAuth";
import { useTeamPresets } from "@/hooks/useTeamPresets";
import type { Character, Skill, EnergyColor, Lineage, Mission } from "@/types/game";
import LoadingSpinner from "@/components/LoadingSpinner";

const characters = (charactersData as Character[]).filter(c => c.id !== 'char_test_api_01');
const missions = missionsData as Mission[];

type LineageFilter = "All" | Lineage;

const ENERGY_COLORS: Record<EnergyColor, string> = {
    Red: "#e74c3c",
    Yellow: "#f1c40f",
    Blue: "#3498db",
    Green: "#2ecc71",
    White: "#ecf0f1",
};

const LINEAGE_COLORS: Record<Lineage, string> = {
    Iron: "var(--lineage-iron)",
    Neon: "var(--lineage-neon)",
    Void: "var(--lineage-void)",
};

function getCharIconClass(
    char: Character,
    selectedId: string | null,
    teamIds: string[],
    unlockedIds: Set<string>
): string {
    if (!char.is_starter && !unlockedIds.has(char.id)) return styles.charIconLocked;
    if (teamIds.includes(char.id)) return styles.charIconInTeam;
    if (char.id === selectedId) return styles.charIconSelected;
    return styles.charIcon;
}

function EnergyCost({ cost }: { cost: Partial<Record<EnergyColor, number>> }) {
    const dots: { color: string; count: number }[] = [];
    for (const [key, value] of Object.entries(cost)) {
        if (value && value > 0) {
            dots.push({ color: ENERGY_COLORS[key as EnergyColor], count: value });
        }
    }

    return (
        <span className={styles.skillCost}>
            {dots.map((d, i) =>
                Array.from({ length: d.count }).map((_, j) => (
                    <span
                        key={`${i}-${j}`}
                        className={styles.energyDot}
                        style={{ backgroundColor: d.color }}
                    />
                ))
            )}
        </span>
    );
}

function SkillCard({ skill }: { skill: Skill }) {
    return (
        <div className={styles.skillCard}>
            <div className={styles.skillName}>{skill.name}</div>
            <div className={styles.skillMeta}>
                <EnergyCost cost={skill.cost} />
                <span>
                    {skill.category} · {skill.nature}
                </span>
            </div>
            {skill.description && (
                <div className={styles.skillDescription}>{skill.description}</div>
            )}
        </div>
    );
}

function MissionInfo({ missionId }: { missionId?: string }) {
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return <div className={styles.missionText}>Informações da missão indisponíveis.</div>;
    return (
        <div className={styles.missionDetail}>
            <div className={styles.missionName}>{mission.title}</div>
            <div className={styles.missionText}>{mission.description}</div>
        </div>
    );
}

export default function LobbyPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [selectedId, setSelectedId] = useState<string>(characters[0].id);
    const [teamIds, setTeamIds] = useState<string[]>([]);
    const [filter, setFilter] = useState<LineageFilter>("All");
    const [showPlayModal, setShowPlayModal] = useState(false);

    // --- Auth guard (client-side safety net) ---
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [authLoading, user, router]);

    // --- Dynamic unlock / active match state ---
    const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
    const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
    const [activeMatchMode, setActiveMatchMode] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        // Fetch profile + matchmaking status in parallel for faster load
        Promise.all([
            fetch('/api/v1/economy/profile').then(r => r.json()).catch(() => null),
            fetch('/api/v1/matchmaking/status').then(r => r.json()).catch(() => null),
        ]).then(([profileData, matchData]) => {
            if (profileData?.success && profileData.data?.unlockedCharacters) {
                setUnlockedIds(new Set(profileData.data.unlockedCharacters));
            }
            if (matchData?.success && matchData.data?.status === 'matched' && matchData.data.matchId) {
                setActiveMatchId(matchData.data.matchId);
                setActiveMatchMode(matchData.data.mode ?? 'quick');
            }
        });
    }, [user]);

    const isCharUnlocked = (char: Character) => char.is_starter || unlockedIds.has(char.id);

    // --- Presets ---
    const {
        presets, favorite, canAddMore, loading: presetsLoading,
        savePreset, setFavorite, loadPresets,
    } = useTeamPresets(!!user);
    const hasAutoLoaded = useRef(false);

    // Auto-load favorite preset on mount
    useEffect(() => {
        if (favorite && !hasAutoLoaded.current && teamIds.length === 0) {
            hasAutoLoaded.current = true;
            setTeamIds(favorite.character_ids);
        }
    }, [favorite, teamIds.length]);

    const selectedChar = useMemo(
        () => characters.find((c) => c.id === selectedId) ?? characters[0],
        [selectedId]
    );

    const filteredChars = useMemo(
        () =>
            filter === "All"
                ? characters
                : characters.filter((c) => c.lineage === filter),
        [filter]
    );

    const toggleTeam = (char: Character) => {
        if (!isCharUnlocked(char)) return; // Guard locked characters
        if (teamIds.includes(char.id)) {
            setTeamIds(teamIds.filter((id) => id !== char.id));
        } else if (teamIds.length < 3) {
            setTeamIds([...teamIds, char.id]);
        }
    };

    const removeFromTeam = (id: string) => {
        setTeamIds(teamIds.filter((tid) => tid !== id));
    };

    const teamChars = teamIds
        .map((id) => characters.find((c) => c.id === id))
        .filter(Boolean) as Character[];

    // Show loading state while auth resolves (prevents content flash)
    if (authLoading || !user) {
        return <LoadingSpinner text="ARENA OUROBOROS" />;
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <h1 className={styles.title}>ARENA OUROBOROS</h1>
                <nav style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button className={styles.filterBtn} onClick={() => router.push("/ranking")}>🏆 Ranking</button>
                    <button className={styles.filterBtn} onClick={() => router.push("/history")}>📜 Histórico</button>
                    <button className={styles.filterBtn} onClick={() => router.push("/presets")}>📋 Presets</button>
                    <button className={styles.filterBtn} onClick={() => router.push("/missions")}>🎯 Missões</button>
                    <button className={styles.filterBtn} onClick={() => router.push("/profile")}>👤 Perfil</button>
                    <div className={styles.playerTag}>
                        PILOTO:{" "}
                        <span className={styles.playerRank}>RECRUTA</span>
                    </div>
                </nav>
            </header>

            {/* Main Layout */}
            <main className={styles.main}>
                <section className={styles.topSection}>
                    {/* Left: Character Grid */}
                    <div className={styles.gridWrapper}>
                        {/* Lineage Filters */}
                        <div className={styles.filterBar}>
                            {(["All", "Iron", "Neon", "Void"] as LineageFilter[]).map(
                                (f) => (
                                    <button
                                        key={f}
                                        className={
                                            filter === f ? styles.filterBtnActive : styles.filterBtn
                                        }
                                        data-lineage={f}
                                        onClick={() => setFilter(f)}
                                    >
                                        {f}
                                    </button>
                                )
                            )}
                        </div>

                        <div className={styles.characterGrid}>
                            {filteredChars.map((char) => (
                                <div
                                    key={char.id}
                                    className={getCharIconClass(char, selectedId, teamIds, unlockedIds)}
                                    onClick={() => setSelectedId(char.id)}
                                    onDoubleClick={() => toggleTeam(char)}
                                >
                                    <div
                                        className={styles.charColorFill}
                                        style={{
                                            backgroundColor: LINEAGE_COLORS[char.lineage],
                                        }}
                                    />
                                    <span className={styles.charLabel}>
                                        {char.name.split(",")[0]}
                                    </span>
                                    {!isCharUnlocked(char) && (
                                        <span className={styles.lockIcon}>🔒</span>
                                    )}
                                    {!char.is_starter && unlockedIds.has(char.id) && (
                                        <span className={styles.lockIcon} style={{ color: '#2ecc71' }}>🔓</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Intel Panel */}
                    <aside className={styles.intelPanel}>
                        <h2 className={styles.intelName}>{selectedChar.name}</h2>
                        <div className={styles.intelRole}>{selectedChar.role}</div>
                        <span
                            className={styles.intelLineage}
                            style={{
                                backgroundColor: LINEAGE_COLORS[selectedChar.lineage],
                                color: "var(--bg-primary)",
                            }}
                        >
                            {selectedChar.lineage}
                        </span>

                        {/* Unlock Mission */}
                        {!selectedChar.is_starter && !unlockedIds.has(selectedChar.id) && (
                            <div className={styles.missionBlock}>
                                <div className={styles.missionTitle}>MISSÃO DE DESBLOQUEIO</div>
                                <MissionInfo missionId={selectedChar.unlock_mission} />
                            </div>
                        )}
                        {!selectedChar.is_starter && unlockedIds.has(selectedChar.id) && (
                            <div className={styles.missionBlock} style={{ borderColor: '#2ecc71' }}>
                                <div className={styles.missionTitle} style={{ color: '#2ecc71' }}>🔓 DESBLOQUEADO</div>
                            </div>
                        )}

                        {/* Passive */}
                        <div className={styles.passiveBlock}>
                            <div className={styles.passiveName}>
                                ⚡ {selectedChar.passive.name}
                            </div>
                            {selectedChar.passive.description && (
                                <div className={styles.passiveDescription}>
                                    {selectedChar.passive.description}
                                </div>
                            )}
                        </div>

                        {/* Skills */}
                        <div className={styles.sectionTitle}>Habilidades</div>
                        {selectedChar.skills.map((skill) => (
                            <SkillCard key={skill.id} skill={skill} />
                        ))}
                    </aside>
                </section>

                {/* Team Bar */}
                <section className={styles.teamBar}>
                    <div className={styles.teamSlots}>
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className={
                                    teamChars[i] ? styles.teamSlotFilled : styles.teamSlot
                                }
                                onClick={() => teamChars[i] && removeFromTeam(teamChars[i].id)}
                            >
                                {teamChars[i] ? (
                                    <>
                                        <div
                                            className={styles.charColorFill}
                                            style={{
                                                backgroundColor: LINEAGE_COLORS[teamChars[i].lineage],
                                                opacity: 0.15,
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                width: "100%",
                                                height: "100%",
                                            }}
                                        />
                                        <span className={styles.teamCharName}>
                                            {teamChars[i].name.split(",")[0]}
                                        </span>
                                    </>
                                ) : (
                                    <span className={styles.teamSlotNumber}>{i + 1}</span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Preset Dropdown */}
                    {user && presets.length > 0 && (
                        <select
                            className={styles.presetDropdown}
                            value={presets.find(p => p.character_ids.join(',') === teamIds.join(','))?.id ?? ''}
                            onChange={(e) => {
                                if (e.target.value === '') {
                                    setTeamIds([]);
                                } else {
                                    const p = presets.find(pr => pr.id === e.target.value);
                                    if (p) setTeamIds(p.character_ids);
                                }
                            }}
                        >
                            <option value=''>— Sem preset —</option>
                            {presets.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.is_favorite ? '★ ' : ''}{p.name}
                                </option>
                            ))}
                        </select>
                    )}

                    {/* Save / Manage Actions */}
                    {user && teamIds.length === 3 && canAddMore && (
                        <button
                            className={styles.presetSaveBtn}
                            onClick={async () => {
                                const name = `Time ${presets.length + 1}`;
                                await savePreset(name, teamIds);
                            }}
                            disabled={presetsLoading}
                        >
                            💾 Salvar Preset
                        </button>
                    )}

                    {/* Active Match Rejoin */}
                    {activeMatchId && (
                        <button
                            className={styles.quickMatchBtn}
                            onClick={() => window.open(`/arena?match=${activeMatchId}&mode=${activeMatchMode}`, '_blank')}
                            style={{ background: 'linear-gradient(135deg, #E67E22, #D35400)', width: '100%', marginBottom: '8px' }}
                        >
                            ⚠️ PARTIDA EM ANDAMENTO — CLIQUE PARA RETORNAR
                        </button>
                    )}

                    <button
                        className={styles.quickMatchBtn}
                        disabled={teamIds.length < 3 || !!activeMatchId}
                        onClick={() => setShowPlayModal(true)}
                        style={{ background: 'linear-gradient(135deg, #27AE60, #1E8449)', width: '100%', fontSize: '1.1rem', letterSpacing: '2px' }}
                    >
                        ⚔️ JOGAR
                    </button>

                    {/* Play Mode Modal */}
                    {showPlayModal && (
                        <div
                            style={{
                                position: 'fixed', inset: 0, zIndex: 1000,
                                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            onClick={() => setShowPlayModal(false)}
                        >
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    background: 'var(--bg-secondary, #0f0f1a)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: '16px',
                                    padding: '2rem',
                                    width: 'min(480px, 90vw)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem',
                                }}
                            >
                                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, letterSpacing: '2px', color: 'var(--text-primary)' }}>ESCOLHA O MODO</h2>

                                {/* Quick vs AI */}
                                <button
                                    className={styles.quickMatchBtn}
                                    onClick={() => { setShowPlayModal(false); window.open(`/arena?team=${teamIds.join(',')}&mode=quick`, '_blank'); }}
                                    style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: 'auto', padding: '14px 20px', textAlign: 'left' }}
                                >
                                    <span style={{ fontSize: '1rem', fontWeight: 700 }}>⚡ QUICK vs AI</span>
                                    <span style={{ fontSize: '0.78rem', opacity: 0.75, fontWeight: 400, letterSpacing: 0 }}>Partida rápida contra a IA. Sem fila, começa imediatamente. Ótimo para praticar.</span>
                                </button>

                                {/* Quick PvP */}
                                <button
                                    className={styles.quickMatchBtn}
                                    onClick={() => { setShowPlayModal(false); window.open(`/matchmaking?team=${teamIds.join(',')}&mode=quick`, '_blank'); }}
                                    style={{ background: 'linear-gradient(135deg, #2980B9, #1ABC9C)', display: 'flex', flexDirection: 'column', gap: '4px', height: 'auto', padding: '14px 20px', textAlign: 'left' }}
                                >
                                    <span style={{ fontSize: '1rem', fontWeight: 700 }}>⚔️ QUICK PvP</span>
                                    <span style={{ fontSize: '0.78rem', opacity: 0.75, fontWeight: 400, letterSpacing: 0 }}>Enfrente outro jogador real. Sem impacto no ELO. Ideal para testar estratégias.</span>
                                </button>

                                {/* Ranked */}
                                <button
                                    className={styles.quickMatchBtn}
                                    onClick={() => { setShowPlayModal(false); window.open(`/matchmaking?team=${teamIds.join(',')}&mode=ranked`, '_blank'); }}
                                    style={{ background: 'linear-gradient(135deg, #C0392B, #922B21)', display: 'flex', flexDirection: 'column', gap: '4px', height: 'auto', padding: '14px 20px', textAlign: 'left' }}
                                >
                                    <span style={{ fontSize: '1rem', fontWeight: 700 }}>🏆 RANKED</span>
                                    <span style={{ fontSize: '0.78rem', opacity: 0.75, fontWeight: 400, letterSpacing: 0 }}>Partida competitiva com ELO em jogo. Enfrente jogadores de nível similar.</span>
                                </button>

                                <button
                                    onClick={() => setShowPlayModal(false)}
                                    style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
