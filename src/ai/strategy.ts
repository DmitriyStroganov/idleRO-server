/**
 * AI interface — the heart of the game.
 *
 * The player character is FULLY controlled by an AI strategy. The player's
 * job is to:
 *   - Build the character (stats, skills, equipment, cards)
 *   - Choose a behaviour pattern (preset / priority-list / node-graph)
 *
 * Three implementation levels (planned in stages):
 *   Level 1: PresetStrategy    — fixed tactical stances (Aggressive, ...)
 *   Level 2: PriorityStrategy  — ordered "if condition then action" rules
 *   Level 3: NodeStrategy      — visual node graph editor
 *
 * All three conform to the same `decide()` interface, so the sim doesn't
 * care which level produced the decision.
 */

import type { Action, Character, Monster, World } from '@engine/types';

/** What an AI strategy can see when making a decision. */
export interface AiContext {
  self: Character;
  world: World;
  /** Visible monsters (within aggro range). */
  monsters: Monster[];
  /** Current tick (ms). */
  tick: number;
  /** AI's own mutable state (e.g. last-used buff time). */
  state: AiMemory;
}

/** Persistent per-character AI state — strategy-specific. */
export interface AiMemory {
  /** Free-form bag for strategies to remember things between ticks. */
  [k: string]: number | string | boolean | undefined;
}

/**
 * The strategy contract. Implementations must be PURE: given the same
 * (context) they produce the same (Action), so the simulation stays
 * deterministic for replay / PvP.
 */
export interface AiStrategy {
  id: string;
  name: string;
  /** Decide what to do this tick. Called every tick (50 ms). */
  decide(ctx: AiContext): Action;
}

// ============================================================================
// Level 1 — Presets
// ============================================================================

import type { SkillId } from '@engine/types';

export type PresetId =
  | 'aggressive'
  | 'defensive'
  | 'aoe-farmer'
  | 'sniper-kite'
  | 'buff-rotate';

/**
 * A preset is a declarative description of behaviour. The engine's preset
 * executor interprets it; this file just lists them.
 */
export interface PresetStrategyConfig {
  id: PresetId;
  name: string;
  description: string;
  /** Skill the preset prefers for single-target damage (if learned). */
  primaryDamageSkill?: SkillId;
  /** Skill used when 3+ monsters are in range. */
  aoeSkill?: SkillId;
  /** Buffs the preset maintains (cast when expired). */
  buffsToMaintain?: SkillId[];
  /** Distance to keep from enemies (in cells). 0 = melee. */
  keepDistance: number;
  /** Use auto-attack when nothing else to do. */
  useAutoAttack: boolean;
  /** Heal when HP < this fraction (0..1). */
  healThreshold?: number;
  /** Retreat to town when HP < this fraction. */
  retreatThreshold?: number;
}

export const PRESETS: Record<PresetId, PresetStrategyConfig> = {
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Spam Double Strafe on cooldown. Auto-attack in between.',
    primaryDamageSkill: 'Skill_Archer_DoubleStrafe',
    aoeSkill: 'Skill_Archer_ArrowShower',
    buffsToMaintain: ['Skill_Archer_ImproveConcentration'],
    keepDistance: 0,
    useAutoAttack: true,
    healThreshold: 0.3,
    retreatThreshold: 0.1,
  },
  defensive: {
    id: 'defensive',
    name: 'Defensive',
    description: 'Auto-attack only. Flee when HP is low.',
    keepDistance: 0,
    useAutoAttack: true,
    healThreshold: 0.6,
    retreatThreshold: 0.3,
  },
  'aoe-farmer': {
    id: 'aoe-farmer',
    name: 'AoE Farmer',
    description: 'Group up enemies with movement, then Arrow Shower.',
    primaryDamageSkill: 'Skill_Archer_ArrowShower',
    aoeSkill: 'Skill_Archer_ArrowShower',
    buffsToMaintain: ['Skill_Archer_ImproveConcentration'],
    keepDistance: 2,
    useAutoAttack: true,
    healThreshold: 0.4,
    retreatThreshold: 0.15,
  },
  'sniper-kite': {
    id: 'sniper-kite',
    name: 'Sniper Kite',
    description: 'Keep distance, snipe with Focused Arrow Strike.',
    primaryDamageSkill: 'Skill_Sniper_FocusedArrowStrike',
    aoeSkill: 'Skill_Sniper_Sharpshooting',
    buffsToMaintain: ['Skill_Sniper_TrueSight', 'Skill_Sniper_WindWalker'],
    keepDistance: 5,
    useAutoAttack: true,
    healThreshold: 0.5,
    retreatThreshold: 0.2,
  },
  'buff-rotate': {
    id: 'buff-rotate',
    name: 'Buff Rotate',
    description: 'Maintain all buffs, auto-attack otherwise.',
    buffsToMaintain: ['Skill_Archer_ImproveConcentration', 'Skill_Sniper_TrueSight'],
    keepDistance: 3,
    useAutoAttack: true,
    healThreshold: 0.4,
    retreatThreshold: 0.2,
  },
};
