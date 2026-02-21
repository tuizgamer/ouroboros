// ============================================================
// Arena Ouroboros — Combat Engine V2 (Portable Logic Module)
// Pure TypeScript. Zero side effects. Runs client or server.
// ============================================================

import type {
  MatchState,
  MatchAction,
  CharacterState,
  Skill,
  TurnLogEntry,
  ActionResult,
  EffectEntry,
  EnergyColor,
  WaveCategory,
  ActiveStatus,
  PassiveEffect,
  Character,
  PlayerState,
} from '@/types/game';

// --- Helpers ---

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const WAVE_ORDER: WaveCategory[] = ['PASSIVE', 'INST', 'CTRL', 'ACT', 'AFL'];

const ENERGY_COLORS: EnergyColor[] = ['Red', 'Yellow', 'Blue', 'Green', 'White'];

function createEmptyEnergy(): Record<EnergyColor, number> {
  return { Red: 0, Yellow: 0, Blue: 0, Green: 0, White: 0 };
}

function clampHp(char: CharacterState): void {
  char.hp = Math.max(0, Math.min(char.maxHp, char.hp));
}

function getAllChars(state: MatchState): CharacterState[] {
  return [...state.playerA.team, ...state.playerB.team];
}

function getTeamOf(state: MatchState, charId: string): CharacterState[] {
  if (state.playerA.team.some((c) => c.id === charId)) return state.playerA.team;
  return state.playerB.team;
}

function getEnemyTeamOf(state: MatchState, charId: string): CharacterState[] {
  if (state.playerA.team.some((c) => c.id === charId)) return state.playerB.team;
  return state.playerA.team;
}

function getAdjacentAllies(state: MatchState, charId: string): CharacterState[] {
  const team = getTeamOf(state, charId);
  const idx = team.findIndex((c) => c.id === charId);
  const adj: CharacterState[] = [];
  if (idx > 0) adj.push(team[idx - 1]);
  if (idx < team.length - 1) adj.push(team[idx + 1]);
  return adj;
}

// --- Factory ---

export function createCharacterState(
  id: string,
  name: string,
  hp: number,
  skills: Skill[]
): CharacterState {
  return {
    id,
    name,
    hp,
    maxHp: hp,
    armor: 0,
    shield: 0,
    energy: createEmptyEnergy(),
    statuses: [],
    skills,
    isAlive: true,
  };
}

// --- Engine ---

export class OuroborosEngine {
  /**
   * Main entry point. Receives immutable state + both players' actions.
   * Returns a brand new state and a log of everything that happened.
   * Optionally accepts character data to resolve passives.
   */
  static resolveTurn(
    state: MatchState,
    actionsA: MatchAction[],
    actionsB: MatchAction[],
    characters?: Character[]
  ): { newState: MatchState; turnLog: TurnLogEntry[] } {
    const newState = deepClone(state);
    const turnLog: TurnLogEntry[] = [];

    // Phase 0: Burn (Reciclagem Oculta) — actually deduct the burned energies
    this.processPlanningPhaseBurn(newState, characters);

    // Phase 1: Lock — deduct energy costs immediately
    this.deductEnergy(newState, actionsA);
    this.deductEnergy(newState, actionsB);

    // Phase 2: Resolution — process all 5 waves
    let allActions = [...actionsA, ...actionsB];
    const cancelledCasters = new Set<string>();

    // Track skill usage per match for max_use / limit
    if (!newState._skillUsage) newState._skillUsage = {};

    for (const wave of WAVE_ORDER) {
      // --- PASSIVE wave: process character passives ---
      if (wave === 'PASSIVE') {
        if (characters) {
          this.processPassives(newState, characters, turnLog);
        }
        continue;
      }

      // Handle invert_priority: if active, reverse the wave action order
      const invertActive = getAllChars(newState).some((c) =>
        c.statuses.some((s) => s.type === 'InvertPriority')
      );

      const waveActions = allActions.filter((a) => {
        const skill = this.getSkill(newState, a.casterId, a.skillId);
        return skill?.category === wave;
      });

      // If priority is inverted, reverse execution order
      const orderedActions = invertActive ? [...waveActions].reverse() : waveActions;

      for (const action of orderedActions) {
        const caster = this.findCharacter(newState, action.casterId);
        if (!caster || !caster.isAlive) continue;

        // Skip stunned/cancelled/banished casters
        if (cancelledCasters.has(action.casterId)) {
          turnLog.push({
            wave,
            casterId: action.casterId,
            skillName: 'CANCELLED',
            result: { success: false, cancelled: true, effects: [] },
          });
          continue;
        }

        // Check banish
        if (caster.statuses.some((s) => s.type === 'Banished')) {
          turnLog.push({
            wave,
            casterId: action.casterId,
            skillName: 'BANISHED',
            result: { success: false, cancelled: true, effects: [] },
          });
          continue;
        }

        // Check silence: if silenced for a specific nature, block matching skills
        const skill = this.getSkill(newState, action.casterId, action.skillId);
        if (skill) {
          const silenced = caster.statuses.find((s) => s.type === 'Silenced');
          if (silenced && silenced.source === skill.nature) {
            turnLog.push({
              wave,
              casterId: action.casterId,
              skillName: `${skill.name} (SILENCED)`,
              result: { success: false, cancelled: true, effects: [] },
            });
            continue;
          }
        }

        // Check max_use / limit
        if (skill) {
          const usageKey = `${action.casterId}:${action.skillId}`;
          const currentUsage = newState._skillUsage[usageKey] ?? 0;

          const maxUse = skill.logic.max_use ?? Infinity;
          const limit = skill.logic.limit ?? Infinity;
          const usageLimit = Math.min(maxUse, limit);

          if (currentUsage >= usageLimit) {
            turnLog.push({
              wave,
              casterId: action.casterId,
              skillName: `${skill.name} (MAX USE)`,
              result: { success: false, cancelled: true, effects: [] },
            });
            continue;
          }
          newState._skillUsage[usageKey] = currentUsage + 1;
        }

        const result = this.executeAction(newState, action, cancelledCasters);

        turnLog.push({
          wave,
          casterId: action.casterId,
          skillName: skill?.name ?? 'Unknown',
          result,
        });
      }
    }

    // Phase 3: Cleanup
    this.tickStatuses(newState);
    this.tickSummons(newState, turnLog);
    this.checkDeaths(newState);
    this.processOnDeathPassives(newState, characters, turnLog);
    this.checkWinCondition(newState);

    newState.turn += 1;

    // Grant energy for the NEXT turn (if not finished)
    if (newState.phase !== 'FINISHED') {
      this.grantEnergy(newState, characters);
    }

    return { newState, turnLog };
  }

  // ——————————————————————————————————————————
  // Passives
  // ——————————————————————————————————————————

  private static processPassives(
    state: MatchState,
    characters: Character[],
    turnLog: TurnLogEntry[]
  ): void {
    const allChars = getAllChars(state);

    for (const char of allChars) {
      if (!char.isAlive) continue;

      const charData = characters.find((c) => c.id === char.id);
      if (!charData?.passive?.effects) continue;

      for (const effect of charData.passive.effects) {
        const effects: EffectEntry[] = [];

        switch (effect.type) {
          // Taurus: permanent unpierceable armor
          case 'armor': {
            if (effect.value && state.turn === 1) {
              char.armor += effect.value;
              effects.push({ type: 'shield', targetId: char.id, value: effect.value, detail: 'passive armor' });
            }
            break;
          }

          // Volt: gain shield when using Yellow energy skills
          case 'on_skill_yellow': {
            if (effect.shield && effect.shield > 0) {
              // This is applied reactively — we track it as a status marker
              const hasMarker = char.statuses.some((s) => s.type === 'PassiveShieldOnYellow');
              if (!hasMarker) {
                char.statuses.push({ type: 'PassiveShieldOnYellow', value: effect.shield, duration: 999 });
              }
            }
            break;
          }

          // Vesper: gain energy on ally death
          case 'on_ally_death': {
            const hasMarker = char.statuses.some((s) => s.type === 'PassiveOnAllyDeath');
            if (!hasMarker) {
              char.statuses.push({ type: 'PassiveOnAllyDeath', duration: 999 });
            }
            break;
          }

          // Glitch: 20% evasion
          case 'evasion': {
            const hasMarker = char.statuses.some((s) => s.type === 'PassiveEvasion');
            if (!hasMarker) {
              char.statuses.push({
                type: 'PassiveEvasion',
                value: effect.chance ? Math.round(effect.chance * 100) : 20,
                duration: 999,
              });
            }
            break;
          }

          // Zero: bypass sentinel
          case 'ignore_sentinel': {
            const hasMarker = char.statuses.some((s) => s.type === 'PassiveIgnoreSentinel');
            if (!hasMarker) {
              char.statuses.push({ type: 'PassiveIgnoreSentinel', duration: 999 });
            }
            break;
          }

          // Nyx: reveal enemy energy
          case 'reveal_energy': {
            const hasMarker = char.statuses.some((s) => s.type === 'PassiveRevealEnergy');
            if (!hasMarker) {
              char.statuses.push({ type: 'PassiveRevealEnergy', duration: 999 });
            }
            break;
          }

          // Jax: proc DoT on VLT damage
          case 'proc_dot': {
            const hasMarker = char.statuses.some((s) => s.type === 'PassiveProcDot');
            if (!hasMarker) {
              char.statuses.push({
                type: 'PassiveProcDot',
                value: effect.value ?? 5,
                duration: 999,
                source: effect.trigger ?? 'VLT_damage',
              });
            }
            break;
          }

          // Rivet: recycling bonus (informational marker)
          case 'recycling_bonus': {
            const hasMarker = char.statuses.some((s) => s.type === 'PassiveRecyclingBonus');
            if (!hasMarker) {
              char.statuses.push({ type: 'PassiveRecyclingBonus', value: effect.value ?? 2, duration: 999 });
            }
            break;
          }

          default:
            break;
        }

        if (effects.length > 0) {
          turnLog.push({
            wave: 'PASSIVE',
            casterId: char.id,
            skillName: charData.passive.name,
            result: { success: true, effects },
          });
        }
      }
    }
  }

  // Process on_death passives (e.g. Malakor's Mártir)
  private static processOnDeathPassives(
    state: MatchState,
    characters: Character[] | undefined,
    turnLog: TurnLogEntry[]
  ): void {
    if (!characters) return;

    const allChars = getAllChars(state);
    for (const char of allChars) {
      if (char.isAlive || char.hp > 0) continue;

      const charData = characters.find((c) => c.id === char.id);
      if (!charData?.passive?.effects) continue;

      for (const effect of charData.passive.effects) {
        if (effect.type === 'on_death' && effect.heal_allies) {
          const team = getTeamOf(state, char.id);
          const effects: EffectEntry[] = [];
          for (const ally of team) {
            if (ally.id === char.id || !ally.isAlive) continue;
            ally.hp = Math.min(ally.maxHp, ally.hp + effect.heal_allies);
            effects.push({ type: 'heal', targetId: ally.id, value: effect.heal_allies, detail: 'martyr' });
          }
          if (effects.length > 0) {
            turnLog.push({
              wave: 'PASSIVE',
              casterId: char.id,
              skillName: charData.passive.name,
              result: { success: true, effects },
            });
          }
        }

        // Vesper passive: on ally death, gain energy
        if (effect.type === 'on_ally_death' && effect.gain_energy) {
          const team = getTeamOf(state, char.id);
          for (const ally of team) {
            if (ally.id === char.id) continue;
            if (!ally.isAlive && ally.hp <= 0) {
              // Check if already triggered for this ally
              const triggerKey = `on_ally_death_${ally.id}`;
              if (char.statuses.some((s) => s.type === triggerKey)) continue;
              char.statuses.push({ type: triggerKey, duration: 999 });

              for (const color of ENERGY_COLORS) {
                const gain = effect.gain_energy[color];
                if (gain) char.energy[color] += gain;
              }
              const effects: EffectEntry[] = [
                { type: 'energy_change', targetId: char.id, detail: 'ally death' },
              ];
              turnLog.push({
                wave: 'PASSIVE',
                casterId: char.id,
                skillName: charData.passive.name,
                result: { success: true, effects },
              });
            }
          }
        }
      }
    }
  }

  // ——————————————————————————————————————————
  // Energy
  // ——————————————————————————————————————————

  /**
   * Grant turn-start energy to the team pool.
   * Rules: 3 random energies (weighted by team composition) + 1 Scale-up White.
   */
  public static grantEnergy(state: MatchState, characters?: Character[]): void {
    const teams: Array<keyof Pick<MatchState, 'playerA' | 'playerB'>> = ['playerA', 'playerB'];

    // Rules update:
    // T1: 0 White, 3 random colored.
    // Even turns (2, 4, 6, 8, 10): +1 White.
    // Odd turns (3, 5, 7, 9): 0 White.
    // Max White: 5.
    const isEvenTurn = state.turn % 2 === 0;
    const whiteIncrement = isEvenTurn ? 1 : 0;

    for (const teamKey of teams) {
      const teamState = state[teamKey];
      const aliveChars = teamState.team.filter((c) => c.isAlive);
      if (aliveChars.length === 0) continue;

      // 1. Grant White to the team pool (held by the leader/first alive)
      const leader = aliveChars[0];
      const currentWhite = leader.energy.White || 0;
      leader.energy.White = Math.min(5, currentWhite + whiteIncrement);

      // 2. Grant 3 random colored energies + any extras from previous turn's Burn
      const extraAmount = teamState.nextTurnExtraEnergy || 0;
      const totalColordToGrant = 3 + extraAmount;

      // Reset extra tracker
      teamState.nextTurnExtraEnergy = 0;

      // Weighting: count lineages in the team
      const weights: Record<EnergyColor, number> = { Red: 1, Yellow: 1, Blue: 1, Green: 1, White: 0 };
      for (const char of aliveChars) {
        const charData = characters?.find(c => c.id === char.id);
        if (charData?.lineage === 'Iron') weights.Red += 2;
        if (charData?.lineage === 'Neon') weights.Yellow += 2;
        if (charData?.lineage === 'Void') weights.Blue += 2;
        if (charData?.role?.includes('Suporte')) weights.Green += 1;
      }

      for (let i = 0; i < totalColordToGrant; i++) {
        const picked = this.weightedPick(weights);
        leader.energy[picked] = (leader.energy[picked] || 0) + 1;
      }
    }
  }

  private static weightedPick(weights: Record<EnergyColor, number>): EnergyColor {
    const colors = Object.keys(weights) as EnergyColor[];
    const totalWeight = colors.reduce((sum, c) => sum + weights[c], 0);
    let random = Math.random() * totalWeight;
    for (const color of colors) {
      if (random < weights[color]) return color;
      random -= weights[color];
    }
    return 'White';
  }

  /**
   * Resolve the energy sacrifice from the planning phase.
   */
  private static processPlanningPhaseBurn(state: MatchState, characters?: Character[]): void {
    const teams = [state.playerA, state.playerB];
    for (const teamState of teams) {
      if (!teamState.pendingBurn || teamState.pendingBurn.length === 0) continue;

      // Rule: Every 2 burned energies → 1 secret random energy next turn
      // Rivet Passive: Every 2 burned energies → 2 secret random energy next turn
      const hasRivet = teamState.team.some(c => {
        const charData = characters?.find(cd => cd.id === c.id);
        return charData?.id === 'char_extrator_02' || charData?.passive?.name?.includes('Reciclagem');
      });

      const burnPairs = Math.floor(teamState.pendingBurn.length / 2);
      if (burnPairs > 0) {
        // Deduct from pool
        for (const colorToBurn of teamState.pendingBurn) {
          this.deductOneEnergyFromTeam(teamState, colorToBurn);
        }

        const rewardPerPair = hasRivet ? 2 : 1;
        teamState.nextTurnExtraEnergy = (teamState.nextTurnExtraEnergy || 0) + (burnPairs * rewardPerPair);
      }

      // Reset pending burn list
      teamState.pendingBurn = [];
    }
  }

  private static deductOneEnergyFromTeam(teamState: PlayerState, color: EnergyColor): boolean {
    for (const char of teamState.team) {
      if (char.isAlive && (char.energy[color] || 0) > 0) {
        char.energy[color]--;
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a team can afford a skill cost, considering White as wildcard.
   */
  public static canAfford(state: MatchState | Record<EnergyColor, number>, casterId?: string, skill?: Skill): boolean {
    let pool: Record<EnergyColor, number>;
    let targetSkill: Skill;

    if (casterId && skill) {
      // Full signature used (state is MatchState)
      const s = state as MatchState;
      const teamState = s.playerA.team.some(c => c.id === casterId) ? s.playerA : s.playerB;
      pool = { ...this.getTeamPool(teamState) }; // Work on a copy
      targetSkill = skill;
    } else {
      // Pool + Skill signature (state is Record<EnergyColor, number>, casterId is actually Skill)
      pool = state as Record<EnergyColor, number>;
      targetSkill = casterId as unknown as Skill;
    }

    let whiteNeeded = 0;
    const colors: EnergyColor[] = ['Red', 'Yellow', 'Blue', 'Green'];

    for (const color of colors) {
      const cost = targetSkill.cost[color] ?? 0;
      if (pool[color] < cost) {
        whiteNeeded += (cost - pool[color]);
      }
    }

    const skillWhiteCost = targetSkill.cost.White ?? 0;
    return pool.White >= (whiteNeeded + skillWhiteCost);
  }

  public static getTeamPool(teamState: { team: CharacterState[] }): Record<EnergyColor, number> {
    const pool = createEmptyEnergy();
    for (const char of teamState.team) {
      if (!char.isAlive) continue;
      for (const color of ENERGY_COLORS) {
        pool[color] += char.energy[color] || 0;
      }
    }
    return pool;
  }

  private static deductEnergy(state: MatchState, actions: MatchAction[]): void {
    // Group actions by team to deduct from shared pool correctly
    const teams = [state.playerA, state.playerB];

    for (const teamState of teams) {
      const teamActions = actions.filter(a => teamState.team.some(c => c.id === a.casterId));
      if (teamActions.length === 0) continue;

      for (const action of teamActions) {
        const skill = this.getSkill(state, action.casterId, action.skillId);
        if (!skill) continue;

        // Perform deduction from the shared pool
        // Since energy is on characters, we take from first available character that has it
        const deductFromTeam = (color: EnergyColor, amount: number) => {
          let remaining = amount;
          for (const char of teamState.team) {
            if (!char.isAlive) continue;
            const available = char.energy[color] || 0;
            const toTake = Math.min(available, remaining);
            char.energy[color] -= toTake;
            remaining -= toTake;
            if (remaining <= 0) break;
          }
          return remaining; // Should be 0 if canAfford was true
        };

        const colors: EnergyColor[] = ['Red', 'Yellow', 'Blue', 'Green'];
        for (const color of colors) {
          const cost = skill.cost[color] ?? 0;
          const shortfall = deductFromTeam(color, cost);
          if (shortfall > 0) {
            // Use White as wildcard
            deductFromTeam('White', shortfall);
          }
        }

        // Dedicated White cost in skill
        let whiteCost = skill.cost.White ?? 0;
        if (whiteCost > 0) {
          const shortfall = deductFromTeam('White', whiteCost);
          if (shortfall > 0) {
            // User requested: "if not possuir cor branca na pool, ele vai retirar aleatoriamente das outras cores"
            for (let i = 0; i < shortfall; i++) {
              const availableColors = colors.filter(c => this.getTeamPool(teamState)[c] > 0);
              if (availableColors.length > 0) {
                const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];
                deductFromTeam(randomColor, 1);
              }
            }
          }
        }

        // HP penalty
        const caster = teamState.team.find(c => c.id === action.casterId);
        if (caster && skill.logic.hp_cost_penalty && skill.logic.hp_cost_penalty > 0) {
          caster.hp -= skill.logic.hp_cost_penalty;
          clampHp(caster);
        }
      }
    }
  }

  // ——————————————————————————————————————————
  // Action Execution
  // ——————————————————————————————————————————

  private static executeAction(
    state: MatchState,
    action: MatchAction,
    cancelledCasters: Set<string>
  ): ActionResult {
    const skill = this.getSkill(state, action.casterId, action.skillId);
    const caster = this.findCharacter(state, action.casterId);
    const target = this.findCharacter(state, action.targetId);

    if (!skill || !caster) {
      return { success: false, effects: [] };
    }

    const effects: EffectEntry[] = [];
    const logic = skill.logic;

    // ——— Self Damage ———
    if (logic.selfDamage && logic.selfDamage > 0) {
      caster.hp -= logic.selfDamage;
      clampHp(caster);
      effects.push({ type: 'damage', targetId: caster.id, value: logic.selfDamage, detail: 'self' });
    }

    // ——— Damage Pipeline ———
    if (target && logic.baseDamage && logic.baseDamage > 0) {
      let totalDamage = logic.baseDamage;

      // Bonus damage: target_has_armor
      if (logic.bonusDamage) {
        if (logic.bonusDamage.condition === 'target_has_armor' && target.armor > 0) {
          totalDamage += logic.bonusDamage.value;
        }
        if (logic.bonusDamage.condition === 'target_is_bleeding') {
          if (target.statuses.some((s) => s.type === 'DoT' || s.type === 'Bleeding')) {
            totalDamage += logic.bonusDamage.value;
          }
        }
      }

      // Stealth bonus
      if (logic.stealthBonus) {
        if (caster.statuses.some((s) => s.type === 'Stealth')) totalDamage += logic.stealthBonus;
      }

      // Skill boost (Jax's "Fusível Curto")
      const boostStatus = caster.statuses.find((s) => s.type === 'SkillBoost');
      if (boostStatus && boostStatus.source === skill.nature && boostStatus.value) {
        totalDamage += boostStatus.value;
        caster.statuses = caster.statuses.filter((s) => s !== boostStatus);
      }

      // Vulnerability: target takes extra damage
      const vulnStatus = target.statuses.find((s) => s.type === 'Vulnerable');
      if (vulnStatus && vulnStatus.value) {
        totalDamage += vulnStatus.value;
      }

      // Damage reduction debuff on caster
      const dmgReduction = caster.statuses.find((s) => s.type === 'damage_reduction');
      if (dmgReduction && dmgReduction.value) {
        totalDamage = Math.max(0, totalDamage - dmgReduction.value);
      }

      // Evasion check (Glitch passive)
      const evasionStatus = target.statuses.find((s) => s.type === 'PassiveEvasion');
      if (evasionStatus && evasionStatus.value) {
        const roll = Math.random() * 100;
        if (roll < evasionStatus.value) {
          effects.push({ type: 'status_remove', targetId: target.id, detail: 'evaded' });
          // Skip damage entirely — still process other effects
          return { success: true, effects };
        }
      }

      // Counter check: does target have an active counter?
      const counterStatus = target.statuses.find((s) => s.type === 'Counter');
      if (counterStatus) {
        const counterFilter = counterStatus.source; // nature filter stored in source
        const matches = !counterFilter || counterFilter === skill.nature;

        if (matches) {
          // Counter triggers
          if (counterStatus.value && counterStatus.value > 0) {
            // Counter-attack damage back to caster
            caster.hp -= counterStatus.value;
            clampHp(caster);
            effects.push({ type: 'damage', targetId: caster.id, value: counterStatus.value, detail: 'counter' });
          }

          // Remove counter after trigger
          target.statuses = target.statuses.filter((s) => s !== counterStatus);

          // If absorb/negate, skip the damage
          effects.push({ type: 'status_remove', targetId: target.id, detail: 'counter triggered' });
          // but still process non-damage effects below
          return { success: true, effects };
        }
      }

      // Apply damage pipeline: Shield → Armor → HP
      const afterShield = Math.max(0, totalDamage - target.shield);
      target.shield = Math.max(0, target.shield - totalDamage);

      // Check gain_energy_on_break: if shield was broken
      if (target.shield === 0 && afterShield > 0) {
        const breakStatus = target.statuses.find((s) => s.type === 'GainEnergyOnBreak');
        if (breakStatus && breakStatus.source) {
          const color = breakStatus.source as EnergyColor;
          target.energy[color] = (target.energy[color] ?? 0) + 1;
          effects.push({ type: 'energy_change', targetId: target.id, detail: `shield break → +1 ${color}` });
          target.statuses = target.statuses.filter((s) => s !== breakStatus);
        }
      }

      const afterArmor = Math.max(0, afterShield - target.armor);
      // Only reduce non-unpierceable armor
      const unpierceableArmor = target.statuses.find((s) => s.type === 'Armor' && s.source === 'unpierceable');
      if (!unpierceableArmor) {
        target.armor = Math.max(0, target.armor - afterShield);
      }

      target.hp -= afterArmor;
      clampHp(target);

      effects.push({ type: 'damage', targetId: target.id, value: totalDamage });

      // Lifesteal
      if (logic.lifesteal && logic.lifesteal > 0) {
        const healAmount = Math.round(afterArmor * logic.lifesteal);
        caster.hp = Math.min(caster.maxHp, caster.hp + healAmount);
        effects.push({ type: 'heal', targetId: caster.id, value: healAmount, detail: 'lifesteal' });
      }

      // Splash damage (Jax "Lança-Granadas")
      if (logic.splash && logic.splash > 0) {
        const adj = getAdjacentAllies(state, target.id);
        for (const ally of adj) {
          if (!ally.isAlive) continue;
          ally.hp -= logic.splash;
          clampHp(ally);
          effects.push({ type: 'damage', targetId: ally.id, value: logic.splash, detail: 'splash' });
        }
      }

      // Damage link: propagate fraction of damage to linked targets
      if (target.statuses.some((s) => s.type === 'DamageLink')) {
        const linkStatus = target.statuses.find((s) => s.type === 'DamageLink');
        if (linkStatus && linkStatus.value && linkStatus.source) {
          const linkedTarget = this.findCharacter(state, linkStatus.source);
          if (linkedTarget && linkedTarget.isAlive) {
            const linkDmg = Math.round(totalDamage * linkStatus.value);
            linkedTarget.hp -= linkDmg;
            clampHp(linkedTarget);
            effects.push({ type: 'damage', targetId: linkedTarget.id, value: linkDmg, detail: 'damage link' });
          }
        }
      }

      // Jax passive: proc DoT on VLT damage
      const procDot = caster.statuses.find((s) => s.type === 'PassiveProcDot');
      if (procDot && procDot.source === 'VLT_damage' && skill.nature === 'VLT') {
        target.statuses.push({
          type: 'DoT',
          value: procDot.value ?? 5,
          duration: 1,
          source: caster.id,
        });
        effects.push({ type: 'status_apply', targetId: target.id, detail: 'passive DoT (Corrosive)' });
      }

      // Volt passive: gain shield when using Yellow energy skills
      const passiveYellow = caster.statuses.find((s) => s.type === 'PassiveShieldOnYellow');
      if (passiveYellow && passiveYellow.value && skill.cost.Yellow && skill.cost.Yellow > 0) {
        caster.shield += passiveYellow.value;
        effects.push({ type: 'shield', targetId: caster.id, value: passiveYellow.value, detail: 'passive' });
      }
    }

    // ——— Healing ———
    if (target && logic.heal && logic.heal > 0) {
      target.hp = Math.min(target.maxHp, target.hp + logic.heal);
      effects.push({ type: 'heal', targetId: target.id, value: logic.heal });
    }

    // ——— Shield ———
    if (logic.shield && logic.shield > 0) {
      const shieldTarget = target ?? caster;
      shieldTarget.shield += logic.shield;
      effects.push({ type: 'shield', targetId: shieldTarget.id, value: logic.shield });

      // Track gain_energy_on_break
      if (logic.gain_energy_on_break) {
        shieldTarget.statuses.push({
          type: 'GainEnergyOnBreak',
          duration: logic.duration ?? 2,
          source: logic.gain_energy_on_break,
        });
      }
    }

    // ——— Status Application ———
    if (logic.status && Array.isArray(logic.status)) {
      const statusTarget = target ?? caster;
      for (const s of logic.status) {
        const newStatus: ActiveStatus = {
          type: s.type,
          value: s.value,
          duration: s.duration ?? 1,
          source: caster.id,
        };
        statusTarget.statuses.push(newStatus);
        effects.push({ type: 'status_apply', targetId: statusTarget.id, detail: s.type });

        if (s.type === 'Armor' && s.value) {
          statusTarget.armor += s.value;
        }
      }
    }

    // ——— DoT Application ———
    if (target && logic.dot) {
      target.statuses.push({
        type: 'DoT',
        value: logic.dot.value,
        duration: logic.dot.duration,
        source: caster.id,
      });
      effects.push({ type: 'status_apply', targetId: target.id, detail: `DoT(${logic.dot.value}/turn)` });
    }

    // ——— HoT Application (Heal over Time) ———
    if (logic.hot) {
      // HoT applies to all allies if reach is Global_Ally, otherwise to target
      const hotTargets = skill.reach === 'Global_Ally'
        ? getTeamOf(state, caster.id).filter((c) => c.isAlive)
        : target ? [target] : [caster];

      for (const t of hotTargets) {
        t.statuses.push({
          type: 'HoT',
          value: logic.hot.value,
          duration: logic.hot.duration,
          source: caster.id,
        });
        effects.push({ type: 'status_apply', targetId: t.id, detail: `HoT(${logic.hot.value}/turn)` });
      }
    }

    // ——— Debuff ———
    if (target && logic.debuff) {
      target.statuses.push({
        type: logic.debuff.type,
        value: logic.debuff.value,
        duration: logic.debuff.duration,
        source: caster.id,
      });
      effects.push({ type: 'status_apply', targetId: target.id, detail: logic.debuff.type });
    }

    // ——— Remove Status ———
    if (logic.removeStatus && logic.removeStatus.length > 0) {
      const removeTarget = target ?? caster;
      for (const statusType of logic.removeStatus) {
        const removed = removeTarget.statuses.filter(
          (s) => s.type === statusType || s.type === 'DoT'
        );
        removeTarget.statuses = removeTarget.statuses.filter(
          (s) => s.type !== statusType && (statusType !== 'Affliction' || s.type !== 'DoT')
        );
        for (const r of removed) {
          effects.push({ type: 'status_remove', targetId: removeTarget.id, detail: r.type });
        }
      }
    }

    // ——— Stun (CTRL wave — cancels target's ACT/AFL) ———
    if (target && logic.stun && logic.stun > 0) {
      cancelledCasters.add(target.id);
      target.statuses.push({ type: 'Stunned', duration: logic.stun, source: caster.id });
      effects.push({ type: 'cancel', targetId: target.id, detail: 'stunned' });

      if (logic.self_stun && logic.self_stun > 0) {
        cancelledCasters.add(caster.id);
        caster.statuses.push({ type: 'Stunned', duration: logic.self_stun, source: caster.id });
        effects.push({ type: 'cancel', targetId: caster.id, detail: 'self-stunned' });
      }
    }

    // ——— Vulnerability ———
    if (target && logic.vulnerability) {
      target.statuses.push({
        type: 'Vulnerable',
        value: logic.vulnerability.value,
        duration: logic.vulnerability.duration,
        source: caster.id,
      });
      effects.push({ type: 'status_apply', targetId: target.id, detail: 'Vulnerable' });
    }

    // ——— Strip Armor/Shield ———
    if (target && logic.strip_armor_shield) {
      target.armor = 0;
      target.shield = 0;
      effects.push({ type: 'status_remove', targetId: target.id, detail: 'armor+shield stripped' });
    }

    // ——— Counter Setup ———
    if (logic.counter) {
      const counterTarget = caster; // counter is always on self
      counterTarget.statuses.push({
        type: 'Counter',
        value: logic.counter.damage ?? 0,
        duration: logic.duration ?? 1,
        source: logic.counter.filter ?? '',
      });
      effects.push({ type: 'status_apply', targetId: counterTarget.id, detail: 'Counter ready' });
    }

    // ——— Summon ———
    if (logic.summon) {
      caster.statuses.push({
        type: 'Summon',
        value: logic.summon.damage,
        duration: logic.summon.duration,
        source: logic.summon.type,
      });
      effects.push({ type: 'status_apply', targetId: caster.id, detail: `Summon: ${logic.summon.type}` });
    }

    // ——— Energy Convert ———
    if (logic.energy_convert) {
      const fromAmount = caster.energy[logic.energy_convert.from];
      caster.energy[logic.energy_convert.to] += fromAmount;
      caster.energy[logic.energy_convert.from] = 0;
      effects.push({
        type: 'energy_change',
        targetId: caster.id,
        detail: `${fromAmount} ${logic.energy_convert.from} → ${logic.energy_convert.to}`,
      });
    }

    // ——— Skill Boost ———
    if (logic.skill_boost) {
      caster.statuses.push({
        type: 'SkillBoost',
        value: logic.skill_boost.value,
        duration: 2,
        source: logic.skill_boost.nature,
      });
      effects.push({
        type: 'status_apply',
        targetId: caster.id,
        detail: `+${logic.skill_boost.value} ${logic.skill_boost.nature} damage`,
      });
    }

    // ——— Silence (silence_nature) ———
    if (target && logic.silence_nature) {
      target.statuses.push({
        type: 'Silenced',
        duration: logic.duration ?? 1,
        source: logic.silence_nature,
      });
      cancelledCasters.add(target.id);
      effects.push({ type: 'cancel', targetId: target.id, detail: `silenced (${logic.silence_nature})` });
    }

    // ——— Disable Energy ———
    if (target && logic.disable_energy) {
      target.statuses.push({
        type: 'EnergyDisabled',
        duration: logic.duration ?? 1,
        source: logic.disable_energy,
      });
      effects.push({ type: 'status_apply', targetId: target.id, detail: `${logic.disable_energy} energy disabled` });
    }

    // ——— HP Swap (hp_swap_limit) ———
    if (target && logic.hp_swap_limit !== undefined) {
      const casterHp = caster.hp;
      const targetHp = target.hp;
      const diff = Math.abs(casterHp - targetHp);
      const clampedDiff = Math.min(diff, logic.hp_swap_limit);

      if (casterHp < targetHp) {
        caster.hp += clampedDiff;
        target.hp -= clampedDiff;
      } else {
        caster.hp -= clampedDiff;
        target.hp += clampedDiff;
      }
      clampHp(caster);
      clampHp(target);

      effects.push({ type: 'heal', targetId: caster.id, value: clampedDiff, detail: 'HP swap' });
      effects.push({ type: 'damage', targetId: target.id, value: clampedDiff, detail: 'HP swap' });
    }

    // ——— Reflect Debuff ———
    if (logic.reflect_debuff) {
      caster.statuses.push({
        type: 'ReflectDebuff',
        duration: logic.duration ?? 1,
        source: caster.id,
      });
      effects.push({ type: 'status_apply', targetId: caster.id, detail: 'Reflect Debuff active' });
    }

    // ——— Extra Action ———
    if (logic.extra_action && logic.extra_action > 0) {
      caster.statuses.push({
        type: 'ExtraAction',
        value: logic.extra_action,
        duration: 1,
        source: caster.id,
      });
      effects.push({ type: 'status_apply', targetId: caster.id, detail: 'Extra Action' });
    }

    // ——— Revive ———
    if (logic.revive && logic.revive > 0) {
      const deadTarget = this.findCharacter(state, action.targetId);
      if (deadTarget && !deadTarget.isAlive) {
        deadTarget.isAlive = true;
        deadTarget.hp = logic.revive;
        clampHp(deadTarget);
        deadTarget.statuses = [];
        effects.push({ type: 'heal', targetId: deadTarget.id, value: logic.revive, detail: 'revived' });
      }
    }

    // ——— Damage per DoT (Malakor "Expurgar os Fracos") ———
    if (logic.damage_per_dot && logic.damage_per_dot > 0) {
      const enemies = getEnemyTeamOf(state, caster.id);
      for (const enemy of enemies) {
        if (!enemy.isAlive) continue;
        const dotCount = enemy.statuses.filter((s) => s.type === 'DoT').length;
        if (dotCount > 0) {
          const dmg = logic.damage_per_dot * dotCount;
          enemy.hp -= dmg;
          clampHp(enemy);
          effects.push({ type: 'damage', targetId: enemy.id, value: dmg, detail: `${dotCount}x DoT bonus` });
        }
      }
    }

    // ——— Damage Link (Nyx "Fio do Destino") ———
    if (logic.damage_link && logic.damage_link > 0 && target) {
      // Link target to another enemy
      const enemies = getEnemyTeamOf(state, caster.id);
      const otherEnemy = enemies.find((e) => e.id !== target.id && e.isAlive);
      if (otherEnemy) {
        // Bidirectional link
        target.statuses.push({
          type: 'DamageLink',
          value: logic.damage_link,
          duration: logic.duration ?? 2,
          source: otherEnemy.id,
        });
        otherEnemy.statuses.push({
          type: 'DamageLink',
          value: logic.damage_link,
          duration: logic.duration ?? 2,
          source: target.id,
        });
        effects.push({ type: 'status_apply', targetId: target.id, detail: 'Linked' });
        effects.push({ type: 'status_apply', targetId: otherEnemy.id, detail: 'Linked' });
      }
    }

    // ——— Banish ———
    if (target && logic.banish && logic.banish > 0) {
      cancelledCasters.add(target.id);
      target.statuses.push({
        type: 'Banished',
        duration: logic.banish,
        source: caster.id,
      });
      effects.push({ type: 'cancel', targetId: target.id, detail: 'banished' });
    }

    // ——— Strip Energy ———
    if (target && logic.strip_energy) {
      for (const color of ENERGY_COLORS) {
        target.energy[color] = 0;
      }
      effects.push({ type: 'energy_change', targetId: target.id, detail: 'all energy stripped' });
    }

    // ——— Invert Priority ———
    if (logic.invert_priority) {
      // Apply to all characters — lasts 1 turn
      const allChars = getAllChars(state);
      for (const c of allChars) {
        c.statuses.push({
          type: 'InvertPriority',
          duration: 1,
          source: caster.id,
        });
      }
      effects.push({ type: 'status_apply', targetId: caster.id, detail: 'Priority Inverted' });
    }

    return { success: true, effects };
  }

  // ——————————————————————————————————————————
  // Lookups
  // ——————————————————————————————————————————

  private static getSkill(
    state: MatchState,
    casterId: string,
    skillId: string
  ): Skill | undefined {
    const allChars = getAllChars(state);
    const caster = allChars.find((c) => c.id === casterId);
    return caster?.skills.find((s) => s.id === skillId);
  }

  static findCharacter(
    state: MatchState,
    id: string
  ): CharacterState | undefined {
    return getAllChars(state).find((c) => c.id === id);
  }

  // ——————————————————————————————————————————
  // Cleanup Utilities
  // ——————————————————————————————————————————

  private static tickStatuses(state: MatchState): void {
    const allChars = getAllChars(state);

    for (const char of allChars) {
      if (!char.isAlive) continue;

      for (const status of char.statuses) {
        // DoT ticks
        if (status.type === 'DoT' && status.value) {
          char.hp -= status.value;
          clampHp(char);
        }
        // HoT ticks
        if (status.type === 'HoT' && status.value) {
          char.hp = Math.min(char.maxHp, char.hp + status.value);
        }
      }

      // Decrement durations, remove expired (but preserve permanent passives)
      char.statuses = char.statuses
        .map((s) => ({
          ...s,
          duration: s.duration > 900 ? s.duration : s.duration - 1,
        }))
        .filter((s) => s.duration > 0);
    }
  }

  // Summon tick: deals damage to enemies at end of turn
  private static tickSummons(state: MatchState, turnLog: TurnLogEntry[]): void {
    const allChars = getAllChars(state);

    for (const char of allChars) {
      if (!char.isAlive) continue;

      const summonStatuses = char.statuses.filter((s) => s.type === 'Summon');
      for (const summon of summonStatuses) {
        if (!summon.value) continue;
        // Deal damage to front enemy
        const enemies = getEnemyTeamOf(state, char.id);
        const frontEnemy = enemies.find((e) => e.isAlive);
        if (frontEnemy) {
          frontEnemy.hp -= summon.value;
          clampHp(frontEnemy);
          turnLog.push({
            wave: 'AFL',
            casterId: char.id,
            skillName: `Summon: ${summon.source}`,
            result: {
              success: true,
              effects: [{ type: 'damage', targetId: frontEnemy.id, value: summon.value, detail: 'summon' }],
            },
          });
        }
      }
    }
  }

  private static checkDeaths(state: MatchState): void {
    const allChars = getAllChars(state);
    for (const char of allChars) {
      if (char.hp <= 0 && char.isAlive) {
        char.hp = 0;
        char.isAlive = false;
        char.statuses = char.statuses.filter((s) => s.duration > 900); // Keep passive markers for death triggers
      }
    }
  }

  private static checkWinCondition(state: MatchState): void {
    const aAlive = state.playerA.team.some((c) => c.isAlive);
    const bAlive = state.playerB.team.some((c) => c.isAlive);

    if (!aAlive && !bAlive) {
      state.phase = 'FINISHED';
      state.winner = 'DRAW';
    } else if (!aAlive) {
      state.phase = 'FINISHED';
      state.winner = state.playerB.id;
    } else if (!bAlive) {
      state.phase = 'FINISHED';
      state.winner = state.playerA.id;
    }
  }
}
