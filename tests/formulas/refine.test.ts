/**
 * Refine (weapon/armor upgrade) tests.
 */

import { describe, it, expect } from 'vitest';
import {
  weaponRefineAtk,
  armorRefineDef,
  refineSuccessRate,
  SAFE_REFINE,
} from '@engine/formulas/refine';

describe('weaponRefineAtk', () => {
  it('returns 0 at +0', () => {
    expect(weaponRefineAtk(0, 1)).toBe(0);
  });
  it('+5 lv1 weapon = +10 ATK', () => {
    expect(weaponRefineAtk(5, 1)).toBe(10);
  });
  it('+10 lv3 weapon = +50 ATK', () => {
    expect(weaponRefineAtk(10, 3)).toBe(50);
  });
  it('+10 lv1 weapon = +20 ATK', () => {
    expect(weaponRefineAtk(10, 1)).toBe(20);
  });
  it('clamps beyond +10', () => {
    expect(weaponRefineAtk(99, 1)).toBe(20);
  });
});

describe('armorRefineDef', () => {
  it('0.7 per level (pre-Renewal)', () => {
    expect(armorRefineDef(1)).toBeCloseTo(0.7);
    expect(armorRefineDef(4)).toBeCloseTo(2.8);
    expect(armorRefineDef(7)).toBeCloseTo(4.9);
  });
});

describe('refineSuccessRate', () => {
  it('safe up to +4 (rate 100%)', () => {
    for (let i = 0; i < SAFE_REFINE; i++) {
      expect(refineSuccessRate(i, 'armor')).toBe(1);
      expect(refineSuccessRate(i, 'weapon', 1)).toBe(1);
    }
  });
  it('rate drops below 100% after safe limit', () => {
    expect(refineSuccessRate(5, 'armor')).toBeLessThan(1);
    expect(refineSuccessRate(7, 'armor')).toBeLessThan(refineSuccessRate(5, 'armor'));
  });
  it('returns 0 at +10 (cannot refine further)', () => {
    expect(refineSuccessRate(10, 'armor')).toBe(0);
  });
});
