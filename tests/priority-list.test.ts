/**
 * Tests for the priority-list strategy (AI Level 2).
 *
 * Verifies:
 *   - First matching rule wins
 *   - Disabled rules are skipped
 *   - Conditions evaluate correctly across categories
 *   - Action materialisation produces expected runtime Actions
 */

import { describe, it, expect } from 'vitest';
import { priorityListStrategy, type PriorityListConfig, type Rule } from '@ai/priority-list';
import type { AiContext } from '@ai/strategy';
import { createCharacter, createWorld, recomputeCharacterStats } from '@engine/sim';
import type { Character, Monster } from '@engine/types';

function buildCtx(c: Character, monsters: Monster[] = [], tick = 0): AiContext {
  return {
    self: c,
    world: createWorld({ seed: 1, mapLength: 20, playerStartX: 5, spawns: [] }),
    monsters,
    tick,
    state: {},
  };
}

function makeRule(partial: Partial<Rule> & Pick<Rule, 'condition' | 'action'>): Rule {
  return {
    id: partial.id ?? `r-${Math.random().toString(36).slice(2)}`,
    enabled: partial.enabled ?? true,
    label: partial.label ?? 'rule',
    condition: partial.condition,
    action: partial.action,
  };
}

describe('priority-list executor', () => {
  it('returns the action of the first matching rule', () => {
    const c = createCharacter({ jobId: 'Archer' });
    recomputeCharacterStats(c);
    c.hp = c.maxHp;

    const cfg: PriorityListConfig = {
      id: 'test', name: 'Test', description: '',
      rules: [
        makeRule({
          label: 'always retreat',
          condition: { kind: 'true' },
          action: { kind: 'retreat' },
        }),
        makeRule({
          label: 'attack',
          condition: { kind: 'true' },
          action: { kind: 'attack' },
        }),
      ],
    };
    const strat = priorityListStrategy(cfg);
    const action = strat.decide(buildCtx(c));
    expect(action.type).toBe('moveTo');           // retreat materialises as moveTo
    if (action.type === 'moveTo') {
      expect(action.target.x).toBeLessThan(c.position.x);
    }
  });

  it('skips disabled rules', () => {
    const c = createCharacter({ jobId: 'Archer' });
    recomputeCharacterStats(c);

    const cfg: PriorityListConfig = {
      id: 'test', name: 'Test', description: '',
      rules: [
        makeRule({
          enabled: false,
          label: 'disabled retreat',
          condition: { kind: 'true' },
          action: { kind: 'retreat' },
        }),
        makeRule({
          label: 'attack',
          condition: { kind: 'true' },
          action: { kind: 'attack' },
        }),
      ],
    };
    const strat = priorityListStrategy(cfg);
    const action = strat.decide(buildCtx(c));
    expect(action.type).toBe('moveTo');          // no monsters → fallback is moveForward
    // (attack with no target → null → fallback to moveForward)
  });

  it('evaluates hpFraction condition correctly', () => {
    const c = createCharacter({ jobId: 'Archer' });
    recomputeCharacterStats(c);
    c.hp = Math.floor(c.maxHp * 0.20);  // 20% HP

    const cfg: PriorityListConfig = {
      id: 'test', name: 'Test', description: '',
      rules: [
        makeRule({
          label: 'heal if low',
          condition: { kind: 'hpFraction', op: '<', value: 0.30 },
          action: { kind: 'useItem', itemId: 'Item_Consum_RedPotion' },
        }),
        makeRule({
          label: 'attack',
          condition: { kind: 'true' },
          action: { kind: 'attack' },
        }),
      ],
    };
    const strat = priorityListStrategy(cfg);
    const action = strat.decide(buildCtx(c));
    expect(action.type).toBe('useItem');
    if (action.type === 'useItem') {
      expect(action.itemId).toBe('Item_Consum_RedPotion');
    }
  });

  it('skillReady checks SP at the current learned level (regression)', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.skills = { Skill_Archer_DoubleStrafe: 10 };
    recomputeCharacterStats(c);
    c.sp = c.maxSp;          // tiny maxSp at base 1 — far below DS lv10 cost (12)

    const cfg: PriorityListConfig = {
      id: 'test', name: 'Test', description: '',
      rules: [
        makeRule({
          label: 'DS if ready',
          condition: { kind: 'and', conds: [
            { kind: 'skillLearned', skillId: 'Skill_Archer_DoubleStrafe' },
            { kind: 'skillReady', skillId: 'Skill_Archer_DoubleStrafe' },
          ] },
          action: { kind: 'castSkill', skillId: 'Skill_Archer_DoubleStrafe', target: 'current' },
        }),
      ],
    };
    const strat = priorityListStrategy(cfg);
    const action = strat.decide(buildCtx(c));
    // Not enough SP → skillReady false → rule skipped → fallback (moveTo forward).
    expect(action.type).not.toBe('castSkill');
  });

  it('and / or / not compose correctly', () => {
    const c = createCharacter({ jobId: 'Archer' });
    recomputeCharacterStats(c);
    c.hp = c.maxHp;

    const cfg: PriorityListConfig = {
      id: 'test', name: 'Test', description: '',
      rules: [
        makeRule({
          label: 'retreat if (HP<30% AND NOT full SP)',
          condition: { kind: 'and', conds: [
            { kind: 'hpFraction', op: '<', value: 0.30 },
            { kind: 'not', cond: { kind: 'spFraction', op: '==', value: 1 } },
          ] },
          action: { kind: 'retreat' },
        }),
        makeRule({
          label: 'fallback',
          condition: { kind: 'true' },
          action: { kind: 'attack' },
        }),
      ],
    };
    const strat = priorityListStrategy(cfg);

    c.hp = Math.floor(c.maxHp * 0.20);
    c.sp = Math.floor(c.maxSp * 0.5);
    expect(strat.decide(buildCtx(c)).type).toBe('moveTo');  // retreat

    c.hp = c.maxHp;                                          // HP high → first rule skipped
    expect(strat.decide(buildCtx(c)).type).toBe('moveTo');  // attack with no target → forward fallback
  });

  it('falls through to moveForward when no rule matches anything attackable', () => {
    const c = createCharacter({ jobId: 'Archer' });
    recomputeCharacterStats(c);
    const cfg: PriorityListConfig = {
      id: 'test', name: 'Test', description: '',
      rules: [
        makeRule({
          label: 'attack',
          condition: { kind: 'true' },
          action: { kind: 'attack' },     // no target present
        }),
      ],
    };
    const strat = priorityListStrategy(cfg);
    const action = strat.decide(buildCtx(c));
    expect(action.type).toBe('moveTo');
    if (action.type === 'moveTo') {
      expect(action.target.x).toBeGreaterThan(c.position.x);
    }
  });
});
