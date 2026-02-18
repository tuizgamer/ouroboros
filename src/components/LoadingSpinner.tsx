// ============================================================
// LoadingSpinner — Reusable Animated Loading Indicator
// Neon-themed ring spinner for Arena Ouroboros
// ============================================================

'use client';

interface LoadingSpinnerProps {
    text?: string;
    size?: 'sm' | 'md' | 'lg';
    fullScreen?: boolean;
}

const SIZES = {
    sm: { ring: 32, border: 3, fontSize: '0.8rem' },
    md: { ring: 48, border: 4, fontSize: '0.95rem' },
    lg: { ring: 64, border: 5, fontSize: '1.1rem' },
};

export default function LoadingSpinner({
    text = 'Carregando...',
    size = 'md',
    fullScreen = true,
}: LoadingSpinnerProps) {
    const s = SIZES[size];

    const containerStyle: React.CSSProperties = fullScreen
        ? {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            gap: '1.25rem',
            background: 'var(--bg-primary)',
        }
        : {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1rem',
            gap: '1rem',
        };

    const ringStyle: React.CSSProperties = {
        width: s.ring,
        height: s.ring,
        border: `${s.border}px solid rgba(255, 255, 255, 0.06)`,
        borderTopColor: 'var(--neon-teal, #00f2ff)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        boxShadow: '0 0 12px rgba(0, 242, 255, 0.25)',
    };

    const textStyle: React.CSSProperties = {
        color: 'var(--text-secondary, #8888aa)',
        fontSize: s.fontSize,
        fontWeight: 600,
        letterSpacing: '2px',
        textTransform: 'uppercase',
    };

    return (
        <div style={containerStyle}>
            <div style={ringStyle} />
            {text && <div style={textStyle}>{text}</div>}
        </div>
    );
}
