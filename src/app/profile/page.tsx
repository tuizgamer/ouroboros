"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import styles from "./Profile.module.css";
import LoadingSpinner from "@/components/LoadingSpinner";
import charactersData from "@/data/characters_live.json";
import type { Character, Lineage } from "@/types/game";

const characters = charactersData as Character[];

const LINEAGE_GRADIENTS: Record<string, string> = {
    iron: "linear-gradient(90deg, #C0392B, #E74C3C)",
    neon: "linear-gradient(90deg, #D4AC0D, #F1C40F)",
    void: "linear-gradient(90deg, #1ABC9C, #2980B9)",
    universal: "linear-gradient(90deg, #8E44AD, #9B59B6)",
};

const LINEAGE_COLORS: Record<Lineage, string> = {
    Iron: "var(--lineage-iron)",
    Neon: "var(--lineage-neon)",
    Void: "var(--lineage-void)",
};

const XP_PER_LEVEL = 500;

interface ProfileData {
    profile: {
        id: string;
        username: string;
        elo_rating: number;
        total_battles: number;
        wins: number;
    };
    currencies: { currency_id: string; balance: number }[];
    lineageProgress: { lineage_id: string; xp: number; level: number }[];
    unlockedCharacters: string[];
    activeMissions: unknown[];
}

function getEloRank(elo: number): string {
    if (elo >= 2000) return "LENDÁRIO";
    if (elo >= 1600) return "DIAMANTE";
    if (elo >= 1300) return "OURO";
    if (elo >= 1100) return "PRATA";
    return "BRONZE";
}

export default function ProfilePage() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const [data, setData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loggingOut, setLoggingOut] = useState(false);

    const handleLogout = useCallback(async () => {
        setLoggingOut(true);
        await signOut();
        router.push('/login');
    }, [signOut, router]);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        fetch("/api/v1/economy/profile")
            .then(r => r.json())
            .then(res => {
                if (res.success) setData(res.data);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [user]);

    if (!user) {
        return (
            <div className={styles.container}>
                <div className={styles.loginGate}>
                    <span style={{ fontSize: "3rem" }}>👤</span>
                    <p>Faça login para ver seu perfil.</p>
                    <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                        VOLTAR AO LOBBY
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return <LoadingSpinner text="Carregando perfil..." />;
    }

    if (!data) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>Perfil não encontrado. Jogue uma partida primeiro!</div>
                <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                    VOLTAR AO LOBBY
                </button>
            </div>
        );
    }

    const { profile, currencies, lineageProgress, unlockedCharacters } = data;
    const winRate = profile.total_battles > 0
        ? Math.round((profile.wins / profile.total_battles) * 100)
        : 0;
    const fragments = currencies.find(c => c.currency_id === "core_fragments")?.balance ?? 0;
    const unlockedSet = new Set(unlockedCharacters);

    // Lineage entries (always show all three + universal if present)
    const lineageEntries = ["iron", "neon", "void"].map(lid => {
        const entry = lineageProgress.find(l => l.lineage_id === lid);
        return {
            id: lid,
            name: lid.charAt(0).toUpperCase() + lid.slice(1),
            xp: entry?.xp ?? 0,
            level: entry?.level ?? 1,
        };
    });

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>PERFIL DO PILOTO</h1>
                <div className={styles.headerActions}>
                    <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                        ← VOLTAR AO LOBBY
                    </button>
                    <button
                        className={styles.logoutBtn}
                        onClick={handleLogout}
                        disabled={loggingOut}
                    >
                        {loggingOut ? 'Saindo...' : '🚪 Sair da Conta'}
                    </button>
                </div>
            </header>

            <div className={styles.content}>
                {/* Player Card */}
                <div className={styles.playerCard}>
                    <div className={styles.playerInfo}>
                        <span className={styles.username}>{profile.username}</span>
                        <span className={styles.eloTag}>
                            ⚡ {profile.elo_rating} ELO — {getEloRank(profile.elo_rating)}
                        </span>
                    </div>
                    <div className={styles.statsRow}>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{profile.total_battles}</span>
                            <span className={styles.statLabel}>Batalhas</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{profile.wins}</span>
                            <span className={styles.statLabel}>Vitórias</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{winRate}%</span>
                            <span className={styles.statLabel}>Win Rate</span>
                        </div>
                    </div>
                </div>

                {/* Currency */}
                <div className={styles.currencyCard}>
                    <span className={styles.currencyIcon}>💎</span>
                    <div className={styles.currencyInfo}>
                        <span className={styles.currencyLabel}>Core Fragments</span>
                        <span className={styles.currencyValue}>{fragments.toLocaleString()}</span>
                    </div>
                </div>

                {/* Lineage Progression */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Progressão por Linhagem</h2>
                    <div className={styles.lineageGrid}>
                        {lineageEntries.map(l => {
                            const xpInLevel = l.xp % XP_PER_LEVEL;
                            const pct = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
                            return (
                                <div key={l.id} className={styles.lineageCard}>
                                    <div className={styles.lineageHeader}>
                                        <span className={styles.lineageName}>{l.name}</span>
                                        <span className={styles.lineageLevel}>Nível {l.level}</span>
                                    </div>
                                    <div className={styles.xpBar}>
                                        <div
                                            className={styles.xpFill}
                                            style={{
                                                width: `${pct}%`,
                                                background: LINEAGE_GRADIENTS[l.id] ?? LINEAGE_GRADIENTS.universal,
                                            }}
                                        />
                                    </div>
                                    <div className={styles.xpText}>
                                        {xpInLevel} / {XP_PER_LEVEL} XP ({l.xp} total)
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Character Collection */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        Coleção de Personagens ({unlockedCharacters.length + characters.filter(c => c.is_starter).length} / {characters.length})
                    </h2>
                    <div className={styles.charGrid}>
                        {characters.map(char => {
                            const isUnlocked = char.is_starter || unlockedSet.has(char.id);
                            const cardClass = isUnlocked
                                ? (char.is_starter ? styles.charCard : styles.charCardUnlocked)
                                : styles.charCardLocked;

                            return (
                                <div key={char.id} className={cardClass}>
                                    <div
                                        className={styles.charColorDot}
                                        style={{ backgroundColor: LINEAGE_COLORS[char.lineage] }}
                                    />
                                    <span className={styles.charName}>{char.name.split(",")[0]}</span>
                                    {!isUnlocked && (
                                        <span className={styles.charLockOverlay}>🔒</span>
                                    )}
                                    {!char.is_starter && isUnlocked && (
                                        <span className={styles.charLockOverlay} style={{ color: '#2ecc71' }}>🔓</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
