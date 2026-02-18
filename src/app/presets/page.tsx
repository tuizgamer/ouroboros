"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./Presets.module.css";
import { useAuth } from "@/hooks/useAuth";
import { useTeamPresets, type TeamPreset } from "@/hooks/useTeamPresets";
import charactersData from "@/data/characters_live.json";
import type { Character, Lineage } from "@/types/game";

const characters = charactersData as Character[];

const LINEAGE_COLORS: Record<Lineage, string> = {
    Iron: "var(--lineage-iron)",
    Neon: "var(--lineage-neon)",
    Void: "var(--lineage-void)",
};

function getCharName(charId: string): string {
    const c = characters.find((ch) => ch.id === charId);
    return c ? c.name.split(",")[0] : charId;
}

function getCharLineage(charId: string): Lineage {
    return characters.find((ch) => ch.id === charId)?.lineage ?? "Iron";
}

// --- Inline Rename Input ---
function InlineRename({ preset, onRename }: { preset: TeamPreset; onRename: (name: string) => void }) {
    const [name, setName] = useState(preset.name);
    const [editing, setEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    if (!editing) {
        return (
            <span
                className={styles.nameInput}
                style={{ cursor: "pointer", borderBottom: "1px dashed var(--glass-border)" }}
                onClick={() => setEditing(true)}
                title="Clique para renomear"
            >
                {name}
            </span>
        );
    }

    return (
        <input
            ref={inputRef}
            className={styles.nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
                setEditing(false);
                if (name.trim() && name !== preset.name) onRename(name.trim());
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    setEditing(false);
                    if (name.trim() && name !== preset.name) onRename(name.trim());
                }
                if (e.key === "Escape") {
                    setEditing(false);
                    setName(preset.name);
                }
            }}
            maxLength={30}
        />
    );
}

// --- Preset Card ---
function PresetCard({
    preset,
    onRename,
    onDelete,
    onFavorite,
}: {
    preset: TeamPreset;
    onRename: (name: string) => void;
    onDelete: () => void;
    onFavorite: () => void;
}) {
    return (
        <div className={preset.is_favorite ? styles.cardFavorite : styles.card}>
            <div className={styles.nameRow}>
                <InlineRename preset={preset} onRename={onRename} />
                <button
                    className={preset.is_favorite ? styles.favBtnActive : styles.favBtn}
                    onClick={onFavorite}
                    title={preset.is_favorite ? "Remover favorito" : "Marcar como favorito"}
                >
                    {preset.is_favorite ? "★ Favorito" : "☆ Favoritar"}
                </button>
            </div>

            <div className={styles.charList}>
                {preset.character_ids.map((cid) => (
                    <span
                        key={cid}
                        className={styles.charTag}
                        style={{ backgroundColor: LINEAGE_COLORS[getCharLineage(cid)] }}
                    >
                        {getCharName(cid)}
                    </span>
                ))}
            </div>

            <div className={styles.cardActions}>
                <button className={styles.deleteBtn} onClick={onDelete}>
                    🗑️ Excluir
                </button>
            </div>
        </div>
    );
}

// --- Main Page ---

export default function PresetsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const {
        presets,
        loading,
        maxPresets,
        updatePreset,
        deletePreset,
        setFavorite,
    } = useTeamPresets(!!user);

    if (!user) {
        return (
            <div className={styles.container}>
                <header className={styles.header}>
                    <h1 className={styles.title}>📋 PRESETS DE TIME</h1>
                    <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                        ← Lobby
                    </button>
                </header>
                <div className={styles.loginGate}>
                    <p>Faça login para salvar e gerenciar seus presets de time.</p>
                    <button className={styles.loginBtn} onClick={() => router.push("/login")}>
                        Fazer Login
                    </button>
                </div>
            </div>
        );
    }

    if (loading && presets.length === 0) {
        return (
            <div className={styles.container}>
                <header className={styles.header}>
                    <h1 className={styles.title}>📋 PRESETS DE TIME</h1>
                </header>
                <div className={styles.loading}>⏳ Carregando presets...</div>
            </div>
        );
    }

    const emptySlots = maxPresets - presets.length;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>📋 PRESETS DE TIME</h1>
                <span className={styles.slotCounter}>
                    {presets.length}/{maxPresets} usados
                </span>
                <button className={styles.backBtn} onClick={() => router.push("/lobby")}>
                    ← Lobby
                </button>
            </header>

            <div className={styles.grid}>
                {presets.map((preset) => (
                    <PresetCard
                        key={preset.id}
                        preset={preset}
                        onRename={(name) => updatePreset(preset.id, { name })}
                        onDelete={() => deletePreset(preset.id)}
                        onFavorite={() => setFavorite(preset.id)}
                    />
                ))}

                {Array.from({ length: emptySlots }).map((_, i) => (
                    <div key={`empty-${i}`} className={styles.emptyCard}>
                        Slot vazio — Salve um time no Lobby
                    </div>
                ))}
            </div>
        </div>
    );
}
