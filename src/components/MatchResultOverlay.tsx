// ============================================================
// MatchResultOverlay — Post-Match Rewards Component
// Shows XP, fragments, and mission progress after a battle
// ============================================================

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './MatchResultOverlay.module.css';
import type { CalculatedRewards, PlayerMission } from '@/types/api';

interface Props {
    winner: string | null;
    rewards: CalculatedRewards | null;
    missions: PlayerMission[];
    completedMissions: string[];
    loading: boolean;
    onClaim: (missionId: string) => void;
}

function lineageLabel(id: string): string {
    const labels: Record<string, string> = {
        iron: 'Iron',
        neon: 'Neon',
        void: 'Void',
    };
    return labels[id] ?? id;
}

export default function MatchResultOverlay({
    winner,
    rewards,
    missions,
    completedMissions,
    loading,
    onClaim,
}: Props) {
    const router = useRouter();
    const hasSubmitted = useRef(false);

    // Prevent double submissions
    useEffect(() => {
        hasSubmitted.current = false;
    }, []);

    const titleClass =
        winner === 'player'
            ? styles.titleWin
            : winner === 'opponent'
                ? styles.titleLoss
                : styles.titleDraw;

    const titleText =
        winner === 'player'
            ? 'VITÓRIA'
            : winner === 'opponent'
                ? 'DERROTA'
                : 'EMPATE';

    // Filter missions that had progress this match
    const affectedMissions = missions.filter(
        (m) =>
            completedMissions.includes(m.mission_id) ||
            m.status === 'COMPLETED' ||
            m.status === 'IN_PROGRESS'
    );

    return (
        <div className={styles.overlay}>
            <div className={styles.card}>
                {/* Title */}
                <h1 className={titleClass}>{titleText}</h1>

                {/* Rewards */}
                {loading && (
                    <div className={styles.loadingText}>
                        Calculando recompensas...
                    </div>
                )}

                {rewards && (
                    <div className={styles.rewardsSection}>
                        <div className={styles.rewardsTitle}>Recompensas</div>
                        <div className={styles.rewardsGrid}>
                            <div className={styles.rewardCard}>
                                <div className={styles.rewardIcon}>⚡</div>
                                <div className={styles.rewardLabel}>
                                    XP {lineageLabel(rewards.xp.lineage)}
                                </div>
                                <div className={styles.rewardValueXp}>
                                    +{rewards.xp.amount}
                                </div>
                            </div>
                            <div className={styles.rewardCard}>
                                <div className={styles.rewardIcon}>💎</div>
                                <div className={styles.rewardLabel}>Fragmentos</div>
                                <div className={styles.rewardValueFragments}>
                                    +{rewards.fragments}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mission Progress */}
                {affectedMissions.length > 0 && (
                    <div className={styles.missionsSection}>
                        <div className={styles.rewardsTitle}>Missões</div>
                        {affectedMissions.slice(0, 3).map((m) => {
                            const isJustCompleted = completedMissions.includes(m.mission_id);
                            const isClaimable = m.status === 'COMPLETED';

                            return (
                                <div
                                    key={m.id}
                                    className={
                                        isJustCompleted || isClaimable
                                            ? styles.missionCardComplete
                                            : styles.missionCard
                                    }
                                >
                                    <div className={styles.missionInfo}>
                                        <span className={styles.missionName}>
                                            {m.mission?.title ?? m.mission_id}
                                        </span>
                                        <span className={styles.missionProgress}>
                                            {m.current_progress}/{m.mission?.requirement_value ?? '?'}
                                        </span>
                                    </div>

                                    {isClaimable ? (
                                        <button
                                            className={styles.claimBtn}
                                            onClick={() => onClaim(m.mission_id)}
                                        >
                                            Resgatar
                                        </button>
                                    ) : isJustCompleted ? (
                                        <span className={styles.missionBadgeComplete}>
                                            Completa!
                                        </span>
                                    ) : (
                                        <span className={styles.missionBadgeProgress}>
                                            Em Progresso
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Actions */}
                <div className={styles.actions}>
                    <button
                        className={styles.backBtn}
                        onClick={() => router.push('/lobby')}
                    >
                        Voltar ao Lobby
                    </button>
                </div>
            </div>
        </div>
    );
}
