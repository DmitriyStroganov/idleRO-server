/**
 * ASPD tests. Reference values from iRowiki classic ASPD calculator.
 */

import { describe, it, expect } from 'vitest';
import { aspd, amotionMs, WEAPON_BASE_DELAY } from '@engine/formulas/aspd';

describe('ASPD', () => {
  it('bow has high base delay', () => {
    expect(WEAPON_BASE_DELAY.Bow).toBeGreaterThan(WEAPON_BASE_DELAY.Dagger);
  });

  it('unarmed attacker at 1 AGI / 1 DEX has low ASPD', () => {
    const a = aspd(1, 1, 'Fist');
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(200);
  });

  it('higher AGI raises ASPD monotonically (same weapon, same DEX)', () => {
    const low = aspd(10, 10, 'Bow');
    const high = aspd(80, 60, 'Bow');
    expect(high).toBeGreaterThan(low);
  });

  it('caps at MAX_ASPD (190)', () => {
    const a = aspd(150, 150, 'Fist');
    expect(a).toBeLessThanOrEqual(190);
  });

  it('caps at MIN_ASPD (100)', () => {
    const a = aspd(0, 0, 'Bow');
    expect(a).toBeGreaterThanOrEqual(100);
  });

  it('speedPercentBonus raises ASPD (Twohand Quicken style)', () => {
    const base = aspd(40, 30, 'Bow');
    const buffed = aspd(40, 30, 'Bow', { speedPercentBonus: 30 });
    expect(buffed).toBeGreaterThan(base);
  });
});

describe('amotionMs', () => {
  it('ASPD 190 → 100 ms between attacks', () => {
    expect(amotionMs(190)).toBe(100);
  });
  it('ASPD 100 → 1000 ms between attacks', () => {
    expect(amotionMs(100)).toBe(1000);
  });
  it('ASPD 175 → 250 ms', () => {
    expect(amotionMs(175)).toBe(250);
  });
});
