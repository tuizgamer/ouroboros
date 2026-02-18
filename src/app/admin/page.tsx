"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Admin.module.css";

interface Overview {
    total_matches: number;
    avg_duration: number;
    avg_turns: number;
    win_rate: number;
    total_xp: number;
    total_fragments: number;
}

interface CharAnalytics {
    character_id: string;
    pick_count: number;
    avg_damage: number;
    avg_healing: number;
    mvp_count: number;
}

export default function AdminPage() {
    const router = useRouter();
    const [overview, setOverview] = useState<Overview | null>(null);
    const [chars, setChars] = useState<CharAnalytics[]>([]);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);

    useEffect(() => {
        fetch("/api/v1/admin/stats")
            .then(res => {
                if (res.status === 403) { setForbidden(true); setLoading(false); return null; }
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(data => {
                if (!data) return;
                setOverview(data.overview);
                setChars(data.characters ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return <div className={styles.loading}>Carregando dashboard...</div>;
    if (forbidden) return <div className={styles.forbidden}>⛔ Acesso restrito — apenas admins</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>⚙️ Admin Dashboard</h1>
                <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                    Voltar
                </button>
            </div>

            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Total Partidas (7d)</span>
                    <span className={styles.kpiValue}>{overview?.total_matches ?? 0}</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Duração Média</span>
                    <span className={styles.kpiValue}>{formatTime(overview?.avg_duration ?? 0)}</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Turnos Médios</span>
                    <span className={styles.kpiValue}>{Math.round(overview?.avg_turns ?? 0)}</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Win Rate Geral</span>
                    <span className={styles.kpiValue}>{Math.round((overview?.win_rate ?? 0) * 100)}%</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>XP Distribuído</span>
                    <span className={styles.kpiValue}>{(overview?.total_xp ?? 0).toLocaleString()}</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Fragments Dist.</span>
                    <span className={styles.kpiValue}>{(overview?.total_fragments ?? 0).toLocaleString()}</span>
                </div>
            </div>

            {/* Character Analytics */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>📊 Character Analytics (7 dias)</h2>
                <table className={styles.charTable}>
                    <thead>
                        <tr>
                            <th>Personagem</th>
                            <th>Picks</th>
                            <th>Dano Médio</th>
                            <th>Cura Média</th>
                            <th>MVPs</th>
                        </tr>
                    </thead>
                    <tbody>
                        {chars.map(c => (
                            <tr key={c.character_id} className={styles.charRow}>
                                <td>{c.character_id}</td>
                                <td>{c.pick_count}</td>
                                <td>{Math.round(c.avg_damage)}</td>
                                <td>{Math.round(c.avg_healing)}</td>
                                <td>{c.mvp_count}</td>
                            </tr>
                        ))}
                        {chars.length === 0 && (
                            <tr className={styles.charRow}>
                                <td colSpan={5} style={{ textAlign: "center" }}>
                                    Sem dados suficientes
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}
