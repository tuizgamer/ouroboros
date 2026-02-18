"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import styles from "./Ranking.module.css";
import LoadingSpinner from "@/components/LoadingSpinner";

interface LeaderboardEntry {
    rank: number;
    id: string;
    username: string;
    elo_rating: number;
    total_battles: number;
    wins: number;
    win_rate: number;
}

export default function RankingPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/v1/leaderboard?limit=50")
            .then(res => res.json())
            .then(data => {
                setEntries(data.leaderboard ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const getRankClass = (rank: number) => {
        if (rank === 1) return styles.rankGold;
        if (rank === 2) return styles.rankSilver;
        if (rank === 3) return styles.rankBronze;
        return "";
    };

    if (loading) return <LoadingSpinner text="Carregando ranking..." />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>🏆 Leaderboard</h1>
                <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                    Voltar ao Lobby
                </button>
            </div>

            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Jogador</th>
                        <th>ELO</th>
                        <th>Partidas</th>
                        <th>Win Rate</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map(entry => (
                        <tr
                            key={entry.id}
                            className={entry.id === user?.id ? styles.rowSelf : styles.row}
                        >
                            <td className={`${styles.rank} ${getRankClass(entry.rank)}`}>
                                {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
                            </td>
                            <td className={styles.username}>{entry.username}</td>
                            <td className={styles.elo}>{entry.elo_rating}</td>
                            <td>{entry.total_battles}</td>
                            <td className={styles.winRate}>{entry.win_rate}%</td>
                        </tr>
                    ))}
                    {entries.length === 0 && (
                        <tr className={styles.row}>
                            <td colSpan={5} style={{ textAlign: "center" }}>
                                Nenhuma partida registrada ainda
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
