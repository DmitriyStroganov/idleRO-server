/**
 * Tests for the stat formulas. Values are checked against the canonical
 * pre-Renewal formulas from iRowiki classic.
 */

import { describe, it, expect } from 'vitest';
import {
  effectiveStats,
  hit,
  flee,
  crit,
  statusAttack,
  magicAttack,
  weaponDamageRange,
  statPointCost,
  maxHp,
  maxSp,
} from '@engine/formulas/stats';
import type { StatBlock, JobDef } from '@engine/types';

const job: Pick<JobDef, 'hpModifier' | 'hpMultiplier' | 'spModifier' | 'spMultiplier'> = {
  hpModifier: 80,
  hpMultiplier: 22,
  spModifier: 2,
  spMultiplier: 0.3,
};

describe('effectiveStats', () => {
  it('sums base + equip + buff', () => {
    const stats: StatBlock = {
      base: { STR: 10, AGI: 20, VIT: 30, INT: 40, DEX: 50, LUK: 60 },
      equip: { STR: 1, AGI: 2, VIT: 3, INT: 4, DEX: 5, LUK: 6 },
      buff: { STR: 0, AGI: 0, VIT: 0, INT: 0, DEX: 0, LUK: 0 },
    };
    const e = effectiveStats(stats);
    expect(e.STR).toBe(11);
    expect(e.AGI).toBe(22);
    expect(e.VIT).toBe(33);
    expect(e.INT).toBe(44);
    expect(e.DEX).toBe(55);
    expect(e.LUK).toBe(66);
  });
});

describe('hit / flee / crit', () => {
  it('HIT = baseLevel + DEX', () => {
    expect(hit(50, 30)).toBe(80);
  });
  it('HIT with Blind penalty -25', () => {
    expect(hit(50, 30, 25)).toBe(55);
  });
  it('FLEE = baseLevel + AGI', () => {
    expect(flee(50, 30)).toBe(80);
  });
  it('CRIT = LUK * 0.3', () => {
    expect(crit(30)).toBeCloseTo(9);
  });
  it('CRIT with bonus', () => {
    expect(crit(30, 9)).toBeCloseTo(18); // 1 SS card
  });
});

describe('ATK / MATK', () => {
  it('statusATK = STR + floor(STR/10)^2 + floor(DEX/5) + floor(LUK/5)', () => {
    // STR 50, DEX 60, LUK 5
    // = 50 + 25 + 12 + 1 = 88
    expect(statusAttack(50, 60, 5)).toBe(88);
  });
  it('MATK min/max grows with INT', () => {
    const m = magicAttack(70);
    // min = 70 + floor(70/7)^2 = 70 + 100 = 170
    // max = 70 + floor(70/5)^2 = 70 + 196 = 266
    expect(m.min).toBe(170);
    expect(m.max).toBe(266);
  });
});

describe('weaponDamageRange', () => {
  it('at low DEX, has variance', () => {
    const r = weaponDamageRange(50, 10);
    expect(r.max).toBe(50);
    // variance = 50 * (1 - 0.1) = 45; min = 50 - 45 = 5
    expect(r.min).toBe(5);
  });
  it('at DEX 100+, no variance', () => {
    const r = weaponDamageRange(50, 100);
    expect(r.min).toBe(50);
    expect(r.max).toBe(50);
  });
});

describe('statPointCost', () => {
  it('costs 2 from stat value 0..9', () => {
    expect(statPointCost(5)).toBe(2);
  });
  it('costs 3 from 10..19', () => {
    expect(statPointCost(15)).toBe(3);
  });
  it('costs 11 at 99', () => {
    expect(statPointCost(99)).toBe(11);
  });
});

describe('HP / SP', () => {
  it('computes MaxHP for Archer base 50 / VIT 1', () => {
    const hp = maxHp(50, 1, job);
    // = floor(80 + 50*22 + 1) = floor(1181) = 1181
    expect(hp).toBe(1181);
  });
  it('applies percentBonus', () => {
    const hp = maxHp(50, 1, job, { percentBonus: 10 });
    // base 1181, +10% → 1299 (with floor)
    expect(hp).toBe(1299);
  });
  it('computes MaxSP', () => {
    const sp = maxSp(50, 20, job);
    // = floor(2 + 50*0.3 + 20) = floor(37) = 37
    expect(sp).toBe(37);
  });
});
