// ============================================================
// Arena Ouroboros — Game Type Definitions
// Single source of truth for all game-related types.
// ============================================================

// --- Core Enums ---

export type Lineage = 'Iron' | 'Neon' | 'Void';

export type EnergyColor = 'Red' | 'Yellow' | 'Blue' | 'Green' | 'White';

/**
 * Priority Wave categories. Actions resolve in this exact order each turn:
 * 0: PASSIVE → 1: INST → 2: CTRL → 3: ACT → 4: AFL
 */
export type WaveCategory = 'PASSIVE' | 'INST' | 'CTRL' | 'ACT' | 'AFL';

/** Damage nature determines interaction with defenses. */
export type DamageNature = 'KNT' | 'VLT' | 'CRS';

export type SkillReach =
    | 'Melee'
    | 'Ranged'
    | 'Single'
    | 'Self'
    | 'Self_Adjacent'
    | 'Ally'
    | 'Global'
    | 'Global_Ally'
    | 'Global_Enemy'
    | 'Linear'
    | 'Unique'
    | 'Random_Enemy'
    | 'Enemy'
    | 'Dead_Ally'
    | 'Two_Enemies';

// --- Skill Logic (Effect Primitives) ---

export interface BonusDamage {
    condition: string;
    value: number;
}

export interface StatusApplication {
    type: string;
    value?: number;
    duration?: number;
}

export interface DotEffect {
    value: number;
    duration: number;
}

export interface CounterEffect {
    filter?: DamageNature;
    absorb?: boolean;
    damage?: number;
    negate?: boolean;
}

export interface SummonEffect {
    type: string;
    damage: number;
    duration: number;
}

export interface DebuffEffect {
    type: string;
    value: number;
    duration: number;
}

export interface VulnerabilityEffect {
    value: number;
    duration: number;
}

export interface EnergyConvert {
    from: EnergyColor;
    to: EnergyColor;
}

export interface SkillBoost {
    nature: DamageNature;
    value: number;
}

/**
 * Union of all possible logic shapes a skill can have.
 * Each skill uses a subset of these fields depending on its nature.
 */
export interface SkillLogic {
    baseDamage?: number;
    bonusDamage?: BonusDamage;
    selfDamage?: number;
    heal?: number;
    lifesteal?: number;
    shield?: number;
    splash?: number;
    status?: StatusApplication[];
    dot?: DotEffect;
    counter?: CounterEffect;
    summon?: SummonEffect;
    debuff?: DebuffEffect;
    vulnerability?: VulnerabilityEffect;
    energy_convert?: EnergyConvert;
    skill_boost?: SkillBoost;
    hot?: DotEffect;
    removeStatus?: string[];
    stealthBonus?: number;
    silence_nature?: DamageNature;
    duration?: number;
    disable_energy?: EnergyColor;
    hp_swap_limit?: number;
    reflect_debuff?: boolean;
    max_use?: number;
    extra_action?: number;
    hp_cost_penalty?: number;
    strip_armor_shield?: boolean;
    gain_energy_on_break?: EnergyColor;
    revive?: number;
    limit?: number;
    stun?: number;
    self_stun?: number;
    damage_per_dot?: number;
    damage_link?: number;
    banish?: number;
    strip_energy?: boolean;
    invert_priority?: boolean;
}

// --- Character & Skill Data ---

export interface Skill {
    id: string;
    name: string;
    cost: Partial<Record<EnergyColor, number>>;
    category: WaveCategory;
    nature: string;
    reach?: SkillReach;
    description?: string;
    logic: SkillLogic;
}

export interface PassiveEffect {
    type: string;
    value?: number;
    unpierceable?: boolean;
    chance?: number;
    trigger?: string;
    duration?: number;
    shield?: number;
    gain_energy?: Partial<Record<EnergyColor, number>>;
    heal_allies?: number;
}

export interface Passive {
    name: string;
    description?: string;
    effects: PassiveEffect[];
}

export interface Character {
    id: string;
    name: string;
    lineage: Lineage;
    role: string;
    base_hp: number;
    is_starter: boolean;
    unlock_mission?: string;
    portrait_url: string;
    passive: Passive;
    skills: Skill[];
}

// --- Combat State ---

export interface ActiveStatus {
    type: string;
    value?: number;
    duration: number;
    source?: string;
}

export interface CharacterState {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    armor: number;
    shield: number;
    energy: Record<EnergyColor, number>;
    statuses: ActiveStatus[];
    skills: Skill[];
    isAlive: boolean;
}

export interface PlayerState {
    id: string;
    team: CharacterState[];
    /** Energies selected to be burned (Reciclagem Oculta) during planning phase */
    pendingBurn: EnergyColor[];
    /** Number of extra random energies to receive at the start of NEXT turn */
    nextTurnExtraEnergy: number;
}

export interface MatchState {
    playerA: PlayerState;
    playerB: PlayerState;
    turn: number;
    phase: 'PLANNING' | 'LOCKED' | 'RESOLUTION' | 'CLEANUP' | 'FINISHED';
    winner: string | null;
    /** Internal engine tracking for max_use / limit per skill per match */
    _skillUsage?: Record<string, number>;
}

// --- Actions & Logs ---

export interface MatchAction {
    casterId: string;
    skillId: string;
    targetId: string;
}

export interface ActionResult {
    success: boolean;
    cancelled?: boolean;
    effects: EffectEntry[];
}

export interface EffectEntry {
    type: 'damage' | 'heal' | 'shield' | 'status_apply' | 'status_remove' | 'energy_change' | 'cancel';
    targetId: string;
    value?: number;
    detail?: string;
}

export interface TurnLogEntry {
    wave: WaveCategory;
    casterId: string;
    skillName: string;
    result: ActionResult;
}

// --- Mission Data ---

export interface Mission {
    id: string;
    title: string;
    description: string;
    requirement_type: string;
    requirement_value: number;
    reward_type: 'CHARACTER' | 'LINEAGE_SKILL' | 'XP';
    reward_id: string;
}
