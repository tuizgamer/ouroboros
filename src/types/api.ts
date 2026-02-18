// ============================================================
// Arena Ouroboros — API Types
// ============================================================

import type { Character } from './game';

// --- API Response Types ---

export interface ApiResponse<T> {
    success: true;
    data: T;
    meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    meta: {
        total: number;
        page: number;
        pageSize: number;
    };
}

// --- API Key / RBAC ---

export type ApiRole = 'admin' | 'editor' | 'partner';

export type Permission = 'read' | 'read_draft' | 'write' | 'publish' | 'delete';

export interface ApiKeyEntry {
    key: string;
    name: string;
    role: ApiRole;
    permissions: Permission[];
    createdAt: string;
}

// --- Character Versioning ---

export interface CharacterVersion {
    charId: string;
    version: number;
    data: Character;
    timestamp: string;
    changeSummary: string;
    author: string; // from ApiKeyEntry.name
}

// --- Publish Request ---

export interface PublishRequest {
    changeSummary?: string;
}

export interface RollbackRequest {
    version: number;
}

// --- Economy Types (Sprint 5) ---

export interface PlayerProfile {
    id: string;
    username: string;
    elo_rating: number;
    total_battles: number;
    wins: number;
    last_active: string;
    created_at: string;
}

export interface Currency {
    profile_id: string;
    currency_id: string;
    balance: number;
}

export interface LineageProgress {
    profile_id: string;
    lineage_id: string;
    xp: number;
    level: number;
}

export interface UnlockedCharacter {
    profile_id: string;
    character_id: string;
    unlocked_at: string;
}

export interface PlayerMission {
    id: string;
    profile_id: string;
    mission_id: string;
    current_progress: number;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'CLAIMED';
    // Joined mission data
    mission?: {
        title: string;
        description: string;
        requirement_type: string;
        requirement_value: number;
        reward_type: string;
        reward_id: string;
    };
}

export interface MatchHistoryEntry {
    id: string;
    profile_id: string;
    opponent_id: string | null;
    won: boolean;
    mode: 'ai' | 'quick' | 'ranked';
    team_lineage: string;
    total_damage_dealt: number;
    total_damage_vlt: number;
    burn_count: number;
    turns: number;
    played_at: string;
    // Enhanced (Migration 002)
    team_character_ids: string[];
    duration_seconds: number;
    xp_earned: number;
    fragments_earned: number;
    player_stats: PlayerMatchStats;
    replay_actions?: ReplayTurn[];  // only loaded on demand
    // match_metadata: JSONB — admin only, never sent to client
}

export interface PlayerMatchStats {
    mode: 'ai' | 'quick' | 'ranked';
    team_lineages: string[];
    damage_dealt: number;
    damage_received: number;
    healing_done: number;
    shield_given: number;
    kills: number;
    burn_count: number;
    mvp_character_id: string;
}

export interface ReplayTurn {
    turn: number;
    actionsA: { casterId: string; skillId: string; targetId: string }[];
    actionsB: { casterId: string; skillId: string; targetId: string }[];
    burnsA: string[];
    burnsB: string[];
}

export interface MatchRosterEntry {
    id: string;
    match_id: string;
    character_id: string;
    lineage: string;
    damage_dealt: number;
    healing_done: number;
    shield_given: number;
    kills: number;
    is_mvp: boolean;
}

export interface PerCharStats {
    characterId: string;
    lineage: string;
    damageDealt: number;
    healingDone: number;
    shieldGiven: number;
    kills: number;
}

// --- Reward Calculation ---

export interface MatchResult {
    matchId?: string; // PvP match ID for server validation (optional for AI matches)
    won: boolean;
    mode: 'ai' | 'quick' | 'ranked';
    teamLineage: string; // dominant lineage (kept for backward compat)
    totalDamageDealt: number;
    totalDamageVlt: number;
    burnCount: number;
    turns: number;
    teamCharacterIds: string[];
    // Enhanced metrics
    durationSeconds: number;
    totalHealingDone: number;
    totalShieldGiven: number;
    totalDamageReceived: number;
    kills: number;
    cancelsInflicted: number;
    statusEffectsApplied: number;
    perCharStats: PerCharStats[];
    replayActions: ReplayTurn[];
}

export interface CalculatedRewards {
    xp: {
        lineage: string;
        amount: number;
    };
    fragments: number;
    missionEvents: MissionEvent[];
}

export interface MissionEvent {
    type: string; // matches mission requirement_type
    value: number;
}

export interface PlayerDashboard {
    profile: PlayerProfile;
    currencies: Currency[];
    lineageProgress: LineageProgress[];
    unlockedCharacters: string[];
    activeMissions: PlayerMission[];
}

