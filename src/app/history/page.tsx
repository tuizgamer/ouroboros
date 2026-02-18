"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./History.module.css";
import LoadingSpinner from "@/components/LoadingSpinner";

interface MatchEntry {
    id: string;
    won: boolean;
    mode: 'ai' | 'quick' | 'ranked';
    team_character_ids: string[];
    duration_seconds: number;
    turns: number;
    xp_earned: number;
    fragments_earned: number;
    player_stats: {
        mode: 'ai' | 'quick' | 'ranked';
        damage_dealt: number;
        damage_received: number;
        healing_done: number;
        shield_given: number;
        kills: number;
        team_lineages: string[];
        mvp_character_id: string;
    };
    played_at: string;
}

export default function HistoryPage() {
    const router = useRouter();
    const [matches, setMatches] = useState<MatchEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/v1/matches?limit=30")
            .then(res => res.json())
            .then(data => {
                setMatches(data.matches ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const timeAgo = (date: string) => {
        const diff = Date.now() - new Date(date).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m atrás`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h atrás`;
        return `${Math.floor(hours / 24)}d atrás`;
    };

    if (loading) return <LoadingSpinner text="Carregando histórico..." />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>📜 Histórico de Partidas</h1>
                <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                    Voltar ao Lobby
                </button>
            </div>

            {matches.length === 0 ? (
                <div className={styles.empty}>Nenhuma partida encontrada. Jogue para começar!</div>
            ) : (
                <div className={styles.matchList}>
                    {matches.map(m => (
                        <div key={m.id}>
                            <div
                                className={styles.matchCard}
                                onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                            >
                                <div className={styles.modeSection}>
                                    <span className={m.won ? styles.resultWin : styles.resultLoss}>
                                        {m.won ? "VITÓRIA" : "DERROTA"}
                                    </span>
                                    <span className={`${styles.modeBadge} ${styles[`mode_${m.mode}`]}`}>
                                        {m.mode === 'ai' ? 'Vs AI' : m.mode === 'ranked' ? '🏆 RANKED' : '⚡ QUICK'}
                                    </span>
                                </div>
                                <div className={styles.teamChars}>
                                    {(m.team_character_ids ?? []).map(id => (
                                        <span key={id} className={styles.charTag}>{id}</span>
                                    ))}
                                </div>
                                <div className={styles.stat}>
                                    <div className={`${styles.statValue} ${styles.xpStat}`}>+{m.xp_earned} XP</div>
                                    <div className={styles.statLabel}>{m.turns} turnos</div>
                                </div>
                                <div className={styles.stat}>
                                    <div className={`${styles.statValue} ${styles.dmgStat}`}>{m.player_stats?.damage_dealt ?? 0}</div>
                                    <div className={styles.statLabel}>dano</div>
                                </div>
                                <div className={styles.stat}>
                                    <div className={styles.statValue}>{formatTime(m.duration_seconds)}</div>
                                    <div className={styles.statLabel}>{timeAgo(m.played_at)}</div>
                                </div>
                            </div>

                            {expanded === m.id && m.player_stats && (
                                <div className={styles.expandedDetail}>
                                    <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>Dano Causado</span>
                                        <span className={styles.detailValue}>{m.player_stats.damage_dealt}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>Dano Recebido</span>
                                        <span className={styles.detailValue}>{m.player_stats.damage_received}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>Cura</span>
                                        <span className={styles.detailValue}>{m.player_stats.healing_done}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>Escudo</span>
                                        <span className={styles.detailValue}>{m.player_stats.shield_given}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>Kills</span>
                                        <span className={styles.detailValue}>{m.player_stats.kills}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>MVP</span>
                                        <span className={styles.detailValue}>{m.player_stats.mvp_character_id}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>Fragmentos</span>
                                        <span className={styles.detailValue}>+{m.fragments_earned}</span>
                                    </div>
                                    <div className={styles.detailItem}>
                                        <span className={styles.detailLabel}>Linhagens</span>
                                        <span className={styles.detailValue}>{(m.player_stats.team_lineages ?? []).join(", ")}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
