/**
 * AI Level 2 — Priority-list strategy (OpenKore-style config).
 *
 * Each rule is a (condition → action) pair. The executor walks rules in
 * order; the FIRST matching rule wins. This is exactly how OpenKore's
 * attackSkillSlot / useSelfSkill blocks behave.
 *
 * The same `AiStrategy` interface as presets is implemented, so swapping
 * between Level 1 / Level 2 is transparent to the sim.
 *
 * Example rule set (typed equivalent of):
 *
 *   useSelfSkill Improve Concentration {
 *     whenStatusActive ImproveConcentration == 0
 *     sp > 20
 *   }
 *   attackSkillSlot Double Strafe {
 *     monsters Lunatic, Wolf
 *     sp > 12
 *     dist > 5
 *   }
 *   useSelfItem Red Potion { hp < 30% }
 *   attack                       # fallback
 */

import type {
  Action,
  Race,
  SkillId,
  ItemId,
  Character,
  Monster,
  World,
} from '@engine/types';
import type { AiContext, AiStrategy } from './strategy';
import { SKILLS } from '@data/skills';
import { MOBS } from '@data/mobs';

// ============================================================================
// Condition DSL
// ============================================================================

export type CompareOp = '<' | '<=' | '>' | '>=' | '==' | '!=';

export type ConditionExpr =
  | { kind: 'true' }
  | { kind: 'hpFraction'; op: CompareOp; value: number }
  | { kind: 'spFraction'; op: CompareOp; value: number }
  | { kind: 'hp'; op: CompareOp; value: number }
  | { kind: 'sp'; op: CompareOp; value: number }
  | { kind: 'statusActive'; id: string }
  | { kind: 'statusMissing'; id: string }
  | { kind: 'skillReady'; skillId: SkillId }
  | { kind: 'skillLearned'; skillId: SkillId; minLevel?: number }
  | { kind: 'targetDistance'; op: CompareOp; value: number }
  | { kind: 'aggroCount'; op: CompareOp; value: number }
  | { kind: 'targetRace'; races: Race[] }
  | { kind: 'targetMob'; mobIds: string[] }
  | { kind: 'targetHpFraction'; op: CompareOp; value: number }
  | { kind: 'and'; conds: ConditionExpr[] }
  | { kind: 'or'; conds: ConditionExpr[] }
  | { kind: 'not'; cond: ConditionExpr };

// ============================================================================
// Action spec (separate from runtime Action — these are *intentions*)
// ============================================================================

export type ActionSpec =
  | { kind: 'castSkill'; skillId: SkillId; target?: 'self' | 'current' }
  | { kind: 'attack' }
  | { kind: 'useItem'; itemId: ItemId }
  | { kind: 'retreat' }
  | { kind: 'moveForward' }
  | { kind: 'idle' };

// ============================================================================
// Rule
// ============================================================================

export interface Rule {
  id: string;
  enabled: boolean;
  /** Display label for the editor. */
  label: string;
  condition: ConditionExpr;
  action: ActionSpec;
}

export interface PriorityListConfig {
  id: string;
  name: string;
  description: string;
  rules: Rule[];
}

// ============================================================================
// Executor
// ============================================================================

export function priorityListStrategy(cfg: PriorityListConfig): AiStrategy {
  return {
    id: `priority:${cfg.id}`,
    name: cfg.name,
    decide(ctx: AiContext): Action {
      const { self, monsters, tick } = ctx;
      if (self.hp <= 0) return { type: 'death' };

      // Pick "current target" — nearest monster in aggro range, used by
      // distance / race / mob conditions.
      const target = nearestMonster(self, monsters, AGGRO_RANGE);

      for (const rule of cfg.rules) {
        if (!rule.enabled) continue;
        if (evaluateCondition(rule.condition, self, target, monsters, tick)) {
          const action = materialiseAction(rule.action, self, target);
          if (action) return action;
        }
      }
      // Fallback — walk forward (preserves idle exploration).
      return { type: 'moveTo', target: { x: self.position.x + 4, y: 0 } };
    },
  };
}

// ============================================================================
// Condition evaluation
// ============================================================================

function evaluateCondition(
  cond: ConditionExpr,
  self: Character,
  target: Monster | undefined,
  monsters: Monster[],
  tick: number,
): boolean {
  switch (cond.kind) {
    case 'true': return true;

    case 'hpFraction': return cmp(self.hp / self.maxHp, cond.op, cond.value);
    case 'spFraction': return self.maxSp > 0 && cmp(self.sp / self.maxSp, cond.op, cond.value);
    case 'hp':         return cmp(self.hp, cond.op, cond.value);
    case 'sp':         return cmp(self.sp, cond.op, cond.value);

    case 'statusActive': return self.statusEffects.some((s) => s.id === cond.id);
    case 'statusMissing': return !self.statusEffects.some((s) => s.id === cond.id);

    case 'skillReady':    return isSkillReady(self, cond.skillId, tick);
    case 'skillLearned':  return (self.skills[cond.skillId] ?? 0) >= (cond.minLevel ?? 1);

    case 'targetDistance':
      if (!target) return false;
      return cmp(Math.abs(target.position.x - self.position.x), cond.op, cond.value);

    case 'aggroCount': {
      const count = monsters.filter(
        (m) => m.hp > 0 && Math.abs(m.position.x - self.position.x) <= 10,
      ).length;
      return cmp(count, cond.op, cond.value);
    }

    case 'targetRace':
      if (!target) return false;
      return cond.races.includes(MOBS[target.mobId].race);

    case 'targetMob':
      if (!target) return false;
      return cond.mobIds.includes(target.mobId);

    case 'targetHpFraction':
      if (!target || target.maxHp === 0) return false;
      return cmp(target.hp / target.maxHp, cond.op, cond.value);

    case 'and': return cond.conds.every((c) => evaluateCondition(c, self, target, monsters, tick));
    case 'or':  return cond.conds.some((c) => evaluateCondition(c, self, target, monsters, tick));
    case 'not': return !evaluateCondition(cond.cond, self, target, monsters, tick);

    default: {
      const _exhaustive: never = cond;
      void _exhaustive;
      return false;
    }
  }
}

function cmp(a: number, op: CompareOp, b: number): boolean {
  switch (op) {
    case '<':  return a < b;
    case '<=': return a <= b;
    case '>':  return a > b;
    case '>=': return a >= b;
    case '==': return a === b;
    case '!=': return a !== b;
  }
}

function isSkillReady(self: Character, skillId: SkillId, tick: number): boolean {
  if ((self.skills[skillId] ?? 0) === 0) return false;
  if (self.casting) return false;
  if (tick < self.castFinishAt) return false;
  const def = SKILLS[skillId];
  if (!def) return false;
  const lvl = self.skills[skillId] ?? 1;
  const sp = def.spCost[lvl - 1] ?? 0;
  if (self.sp < sp) return false;
  return true;
}

// ============================================================================
// Action materialisation — turn ActionSpec into runtime Action
// ============================================================================

function materialiseAction(
  spec: ActionSpec,
  self: Character,
  target: Monster | undefined,
): Action | null {
  switch (spec.kind) {
    case 'castSkill': {
      const skillId = spec.skillId;
      if (!isSkillReady(self, skillId, /* tick checked above */ 0) && self.casting) return null;
      // target self vs current
      const targetUid = spec.target === 'self' || !target
        ? self.uid
        : target.uid;
      return { type: 'castSkill', skillId, targetUid };
    }
    case 'attack':
      if (!target) return null;
      return { type: 'attack', targetUid: target.uid };
    case 'useItem':
      return { type: 'useItem', itemId: spec.itemId };
    case 'retreat':
      return { type: 'moveTo', target: { x: self.position.x - 10, y: 0 } };
    case 'moveForward':
      return { type: 'moveTo', target: { x: self.position.x + 4, y: 0 } };
    case 'idle':
      return { type: 'idle' };
    default: {
      const _e: never = spec;
      void _e;
      return null;
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

const AGGRO_RANGE = 14;

function nearestMonster(
  self: Character,
  monsters: ReadonlyArray<Monster>,
  range: number,
): Monster | undefined {
  let best: Monster | undefined;
  let bestDist = Infinity;
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const d = Math.abs(m.position.x - self.position.x);
    if (d <= range && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

// Type re-exports for the editor.
export type { World };
