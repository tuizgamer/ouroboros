// ============================================================
// Arena Ouroboros — Character Validation
// Schema validation for Character data before save.
// ============================================================

import type { Character } from '@/types/game';

interface ValidationResult {
    valid: boolean;
    errors: string[];
}

const VALID_LINEAGES = ['Iron', 'Neon', 'Void'];
const VALID_CATEGORIES = ['PASSIVE', 'INST', 'CTRL', 'ACT', 'AFL'];
const VALID_ENERGY_COLORS = ['Red', 'Yellow', 'Blue', 'Green', 'White'];

export function validateCharacter(data: unknown): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['Data must be an object'] };
    }

    const char = data as Record<string, unknown>;

    // --- Required fields ---
    if (!char.id || typeof char.id !== 'string') {
        errors.push('id: required string');
    }
    if (!char.name || typeof char.name !== 'string') {
        errors.push('name: required string');
    }
    if (!char.lineage || !VALID_LINEAGES.includes(char.lineage as string)) {
        errors.push(`lineage: must be one of ${VALID_LINEAGES.join(', ')}`);
    }
    if (typeof char.base_hp !== 'number' || char.base_hp < 1 || char.base_hp > 999) {
        errors.push('base_hp: must be number between 1-999');
    }

    // --- Skills ---
    if (!Array.isArray(char.skills)) {
        errors.push('skills: must be an array');
    } else {
        if (char.skills.length < 1 || char.skills.length > 8) {
            errors.push('skills: must have 1-8 skills');
        }

        for (let i = 0; i < char.skills.length; i++) {
            const skill = char.skills[i] as Record<string, unknown>;
            const prefix = `skills[${i}]`;

            if (!skill.id || typeof skill.id !== 'string') {
                errors.push(`${prefix}.id: required string`);
            }
            if (!skill.name || typeof skill.name !== 'string') {
                errors.push(`${prefix}.name: required string`);
            }
            if (!skill.category || !VALID_CATEGORIES.includes(skill.category as string)) {
                errors.push(`${prefix}.category: must be one of ${VALID_CATEGORIES.join(', ')}`);
            }

            // Validate cost
            if (!skill.cost || typeof skill.cost !== 'object') {
                errors.push(`${prefix}.cost: required object`);
            } else {
                const cost = skill.cost as Record<string, unknown>;
                for (const key of Object.keys(cost)) {
                    if (!VALID_ENERGY_COLORS.includes(key)) {
                        errors.push(`${prefix}.cost: invalid energy color "${key}"`);
                    }
                    if (typeof cost[key] !== 'number' || (cost[key] as number) < 0) {
                        errors.push(`${prefix}.cost.${key}: must be non-negative number`);
                    }
                }
            }

            // Validate logic exists
            if (!skill.logic || typeof skill.logic !== 'object') {
                errors.push(`${prefix}.logic: required object`);
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
