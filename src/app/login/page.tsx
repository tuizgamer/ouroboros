// ============================================================
// Login Page — Arena Ouroboros
// Supabase Auth: Sign up / Sign in
// ============================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/LoadingSpinner';
import styles from './Login.module.css';

type AuthMode = 'login' | 'signup';

export default function LoginPage() {
    const router = useRouter();
    const { signIn, signUp, loading, error, clearError } = useAuth();

    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [redirecting, setRedirecting] = useState(false);

    const switchMode = (newMode: AuthMode) => {
        setMode(newMode);
        clearError();
        setSuccessMsg('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        setSuccessMsg('');

        if (mode === 'signup') {
            const ok = await signUp(email, password, username);
            if (ok) {
                setSuccessMsg('Conta criada! Verifique seu email para confirmar.');
            }
        } else {
            const ok = await signIn(email, password);
            if (ok) {
                setRedirecting(true);
                // Initialize economy data on first login
                await fetch('/api/v1/economy/profile', { method: 'POST' });
                router.push('/lobby');
            }
        }
    };

    if (redirecting) {
        return <LoadingSpinner text="Autenticado! Entrando na Arena..." />;
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                {/* Logo */}
                <div className={styles.logo}>
                    <div className={styles.logoTitle}>Ouroboros</div>
                    <div className={styles.logoSubtitle}>Tactical Arena Combat</div>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button
                        className={mode === 'login' ? styles.tabActive : styles.tab}
                        onClick={() => switchMode('login')}
                    >
                        Entrar
                    </button>
                    <button
                        className={mode === 'signup' ? styles.tabActive : styles.tab}
                        onClick={() => switchMode('signup')}
                    >
                        Criar Conta
                    </button>
                </div>

                {/* Form */}
                <form className={styles.form} onSubmit={handleSubmit}>
                    {mode === 'signup' && (
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="username">
                                Nome de Piloto
                            </label>
                            <input
                                id="username"
                                className={styles.input}
                                type="text"
                                placeholder="Ex: Taurus_X"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                minLength={3}
                                maxLength={20}
                                autoComplete="username"
                            />
                        </div>
                    )}

                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="email">
                            Email
                        </label>
                        <input
                            id="email"
                            className={styles.input}
                            type="email"
                            placeholder="piloto@arena.gg"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="password">
                            Senha
                        </label>
                        <input
                            id="password"
                            className={styles.input}
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        />
                    </div>

                    {error && <div className={styles.error}>{error}</div>}
                    {successMsg && <div className={styles.success}>{successMsg}</div>}

                    <button
                        type="submit"
                        className={styles.submitBtn}
                        disabled={loading}
                    >
                        {loading
                            ? 'Processando...'
                            : mode === 'login'
                                ? 'Acessar Arena'
                                : 'Registrar Piloto'}
                    </button>
                </form>

                {/* Footer */}
                <div className={styles.footer}>
                    {mode === 'login' ? (
                        <>
                            Novo piloto?{' '}
                            <button
                                className={styles.footerLink}
                                onClick={() => switchMode('signup')}
                            >
                                Criar conta
                            </button>
                        </>
                    ) : (
                        <>
                            Já tem conta?{' '}
                            <button
                                className={styles.footerLink}
                                onClick={() => switchMode('login')}
                            >
                                Entrar
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
