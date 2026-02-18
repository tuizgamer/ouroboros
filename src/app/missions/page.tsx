"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import styles from "./Missions.module.css";
import charactersData from "@/data/characters_live.json";
import type { Character } from "@/types/game";

const characters = charactersData as Character[];

interface MissionData {
    id: string;
    mission_id: string;
    current_progress: number;
    status: "IN_PROGRESS" | "COMPLETED" | "CLAIMED";
    mission: {
        id: string;
        title: string;
        description: string;
        requirement_type: string;
        requirement_value: number;
        reward_type: string;
        reward_id: string | null;
    } | null;
}

function getRewardDisplay(mission: MissionData["mission"]) {
    if (!mission) return { icon: "🎁", label: "Recompensa", value: "Desconhecida" };

    switch (mission.reward_type) {
        case "CHARACTER": {
            const char = characters.find(c => c.id === mission.reward_id);
            return {
                icon: "⚔️",
                label: "Personagem",
                value: char?.name.split(",")[0] ?? mission.reward_id ?? "??",
            };
        }
        case "XP":
            return { icon: "✨", label: "XP", value: `${mission.reward_id ?? 200} XP` };
        case "LINEAGE_SKILL":
            return { icon: "🔮", label: "Habilidade de Linhagem", value: mission.reward_id ?? "Skill" };
        default:
            return { icon: "🎁", label: mission.reward_type, value: mission.reward_id ?? "" };
    }
}

export default function MissionsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [missions, setMissions] = useState<MissionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState<string | null>(null);

    const loadMissions = useCallback(async () => {
        try {
            const res = await fetch("/api/v1/missions");
            const data = await res.json();
            if (data.success) {
                setMissions(data.data ?? []);
            }
        } catch {
            // Silent fail
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user) loadMissions();
        else setLoading(false);
    }, [user, loadMissions]);

    const handleClaim = async (missionId: string) => {
        setClaiming(missionId);
        try {
            const res = await fetch(`/api/v1/missions/${missionId}/claim`, {
                method: "POST",
            });
            const data = await res.json();
            if (data.success) {
                // Refresh missions
                await loadMissions();
            }
        } catch {
            // Silent fail
        } finally {
            setClaiming(null);
        }
    };

    // --- Login Gate ---
    if (!user) {
        return (
            <div className={styles.container}>
                <div className={styles.loginGate}>
                    <span style={{ fontSize: "3rem" }}>🎯</span>
                    <p>Faça login para ver suas missões.</p>
                    <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                        VOLTAR AO LOBBY
                    </button>
                </div>
            </div>
        );
    }

    // --- Loading ---
    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>Carregando missões...</div>
            </div>
        );
    }

    // --- Sorting: IN_PROGRESS first, then COMPLETED, then CLAIMED ---
    const sorted = [...missions].sort((a, b) => {
        const order = { IN_PROGRESS: 0, COMPLETED: 1, CLAIMED: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>MISSÕES</h1>
                <p className={styles.subtitle}>Complete desafios para desbloquear personagens e recompensas</p>
                <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                    ← VOLTAR AO LOBBY
                </button>
            </header>

            {sorted.length === 0 ? (
                <div className={styles.emptyState}>Nenhuma missão disponível no momento.</div>
            ) : (
                <div className={styles.grid}>
                    {sorted.map((pm) => {
                        const mission = pm.mission;
                        if (!mission) return null;

                        const progress = Math.min(pm.current_progress, mission.requirement_value);
                        const pct = Math.round((progress / mission.requirement_value) * 100);
                        const reward = getRewardDisplay(mission);

                        const isNotStarted = pm.status === "IN_PROGRESS" && pm.current_progress === 0;

                        const cardClass =
                            pm.status === "CLAIMED"
                                ? styles.cardClaimed
                                : pm.status === "COMPLETED"
                                    ? styles.cardCompleted
                                    : styles.card;

                        const badgeClass =
                            pm.status === "CLAIMED"
                                ? styles.badgeClaimed
                                : pm.status === "COMPLETED"
                                    ? styles.badgeCompleted
                                    : isNotStarted
                                        ? styles.badgeNotStarted
                                        : styles.badgeInProgress;

                        const badgeText =
                            pm.status === "CLAIMED"
                                ? "Resgatada"
                                : pm.status === "COMPLETED"
                                    ? "Completa!"
                                    : isNotStarted
                                        ? "Não iniciada"
                                        : "Em Progresso";

                        return (
                            <div key={pm.id} className={cardClass}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <div className={styles.missionTitle}>{mission.title}</div>
                                        <div className={styles.missionDesc}>{mission.description}</div>
                                    </div>
                                    <span className={badgeClass}>{badgeText}</span>
                                </div>

                                {/* Progress Bar */}
                                <div className={styles.progressWrap}>
                                    <div className={styles.progressBar}>
                                        <div
                                            className={styles.progressFill}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <div className={styles.progressText}>
                                        <span>{progress} / {mission.requirement_value}</span>
                                        <span>{pct}%</span>
                                    </div>
                                </div>

                                {/* Reward Preview */}
                                <div className={styles.rewardPreview}>
                                    <span className={styles.rewardIcon}>{reward.icon}</span>
                                    <div className={styles.rewardInfo}>
                                        <span className={styles.rewardLabel}>{reward.label}</span>
                                        <span className={styles.rewardValue}>{reward.value}</span>
                                    </div>
                                </div>

                                {/* Claim Button */}
                                {pm.status === "COMPLETED" && (
                                    <button
                                        className={styles.claimBtn}
                                        onClick={() => handleClaim(pm.mission_id)}
                                        disabled={claiming === pm.mission_id}
                                    >
                                        {claiming === pm.mission_id ? "RESGATANDO..." : "🎁 RESGATAR RECOMPENSA"}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
