'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './Matchmaking.module.css';

const ELO_LABELS = [
    { afterSeconds: 0, label: '±50 ELO' },
    { afterSeconds: 10, label: '±150 ELO' },
    { afterSeconds: 25, label: '±400 ELO' },
    { afterSeconds: 40, label: 'Qualquer oponente' },
];

function MatchmakingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const mode = searchParams.get('mode') ?? 'quick';
    const team = searchParams.get('team') ?? '';
    const isRanked = mode === 'ranked';

    const [status, setStatus] = useState<'queuing' | 'searching' | 'matched' | 'error'>('queuing');
    const [elapsed, setElapsed] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [opponent, setOpponent] = useState<{ username: string; elo: number } | null>(null);
    const [matchId, setMatchId] = useState<string | null>(null);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasQueued = useRef(false);

    // Current ELO range label
    const eloLabel = ELO_LABELS.reduce(
        (acc, w) => (elapsed >= w.afterSeconds ? w.label : acc),
        ELO_LABELS[0].label
    );

    // Format elapsed as MM:SS
    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const cleanup = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    // 1. Enter queue on mount
    useEffect(() => {
        if (hasQueued.current || !team) return;
        hasQueued.current = true;

        const rawIds = team.split(',');
        // Deduplicate to prevent UI glitches if user manipulates URL
        const teamIds = Array.from(new Set(rawIds));

        fetch('/api/v1/matchmaking/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterIds: teamIds, mode }),
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setStatus('searching');
                } else {
                    setStatus('error');
                    setErrorMsg(data.error?.message ?? 'Falha ao entrar na fila');
                }
            })
            .catch(() => {
                setStatus('error');
                setErrorMsg('Erro de conexão');
            });

        return cleanup;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 2. Timer
    useEffect(() => {
        if (status !== 'searching') return;

        timerRef.current = setInterval(() => {
            setElapsed(prev => prev + 1);
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [status]);

    // 3. Poll for match every 3 seconds
    useEffect(() => {
        if (status !== 'searching') return;

        const poll = () => {
            fetch('/api/v1/matchmaking/status')
                .then(res => res.json())
                .then(data => {
                    if (!data.success) return;
                    if (data.data.status === 'matched') {
                        cleanup();
                        setMatchId(data.data.matchId);
                        setOpponent(data.data.opponent ?? null);
                        setStatus('matched');

                        // Open arena in new tab, return this tab to lobby
                        setTimeout(() => {
                            window.open(`/arena?match=${data.data.matchId}&mode=${mode}`, '_blank');
                            router.push('/lobby');
                        }, 3000);
                    }
                })
                .catch(() => { /* continue polling */ });
        };

        poll(); // Immediate first check
        pollRef.current = setInterval(poll, 3000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    const handleCancel = () => {
        cleanup();
        fetch('/api/v1/matchmaking/queue', { method: 'DELETE' }).catch(() => { });
        router.push('/lobby');
    };

    // --- Error State ---
    if (status === 'error') {
        return (
            <div className={styles.container}>
                <div className={styles.errorCard}>
                    <span style={{ fontSize: '2.5rem' }}>🚫</span>
                    <h2 className={styles.errorTitle}>Erro no Matchmaking</h2>
                    <p className={styles.errorText}>{errorMsg}</p>
                    <button className={styles.cancelBtn} onClick={() => router.push('/lobby')}>
                        VOLTAR AO LOBBY
                    </button>
                </div>
            </div>
        );
    }

    // --- Matched State ---
    if (status === 'matched') {
        return (
            <div className={styles.container}>
                <div className={styles.matchedCard}>
                    <span className={`${styles.modeBadge} ${isRanked ? styles.modeBadgeRanked : styles.modeBadgeQuick}`}>
                        {isRanked ? '🏆 RANKED' : '⚡ QUICK'}
                    </span>
                    <span style={{ fontSize: '3rem' }}>⚔️</span>
                    <h2 className={styles.matchedTitle}>OPONENTE ENCONTRADO!</h2>
                    {opponent && (
                        <div className={styles.opponentInfo}>
                            <span className={styles.opponentName}>{opponent.username}</span>
                            <span className={styles.opponentElo}>ELO {opponent.elo}</span>
                        </div>
                    )}
                    <p className={styles.transitionText}>Entrando na arena...</p>
                </div>
            </div>
        );
    }

    // --- Searching State ---
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <span className={`${styles.modeBadge} ${isRanked ? styles.modeBadgeRanked : styles.modeBadgeQuick}`}>
                    {isRanked ? '🏆 RANKED' : '⚡ QUICK'}
                </span>

                <div className={styles.pulseWrapper}>
                    <div className={styles.pulseRing} />
                    <div className={styles.pulseRing} />
                    <div className={styles.pulseRing} />
                    <span className={styles.pulseIcon}>🔍</span>
                </div>

                <h2 className={styles.title}>PROCURANDO OPONENTE</h2>

                <p className={styles.subtitle}>
                    Buscando jogadores na faixa <span className={styles.eloRange}>{eloLabel}</span>
                </p>

                <span className={styles.timer}>{formatTime(elapsed)}</span>

                <button className={styles.cancelBtn} onClick={handleCancel}>
                    ✕ CANCELAR
                </button>
            </div>
        </div>
    );
}

export default function MatchmakingPage() {
    return (
        <Suspense fallback={
            <div className={styles.container}>
                <div className={styles.card}>
                    <h2 className={styles.title}>Carregando...</h2>
                </div>
            </div>
        }>
            <MatchmakingContent />
        </Suspense>
    );
}
