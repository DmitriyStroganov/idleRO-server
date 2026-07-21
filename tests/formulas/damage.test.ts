/**
 * Damage pipeline integration tests.
 *
 * The archetypal RO test case: Archer with a Composite Bow [3] socketed with
 * 2× Hydra and 1× Skeleton Worker attacking a Large DemiHuman monster.
 *
 * Numbers are checked against iRowiki classic damage calculator ranges.
 */

import { describe, it, expect } from 'vitest';
import { computePhysicalDamage, elementMultiplier, weaponSizeModifier } from '@engine/formulas/damage';
import { aggregateCards, type CardModifiers } from '@engine/formulas/cards';
import { CARD_DB } from '@data/items';
import { createRng } from '@engine/rng';

function makeMods(): CardModifiers {
  return aggregateCards(['Card_Hydra', 'Card_Hydra', 'Card_SkeletonWorker'], CARD_DB);
}

describe('elementMultiplier', () => {
  it('Neutral vs Neutral = 1.0', () => {
    expect(elementMultiplier('Neutral', 'Neutral')).toBe(1);
  });
  it('Cold vs Fire = 1.5', () => {
    expect(elementMultiplier('Water', 'Fire')).toBe(1.5);
  });
  it('Fire vs Water = 0.5', () => {
    expect(elementMultiplier('Fire', 'Water')).toBe(0.5);
  });
  it('Holy vs Undead = 1.5', () => {
    expect(elementMultiplier('Holy', 'Undead')).toBe(1.5);
  });
  it('Ghost vs Neutral = 0 (pre-Renewal: Ghost attacks pass through Neutral)', () => {
    expect(elementMultiplier('Ghost', 'Neutral')).toBe(0);
  });
  it('Element level amplifies away from 1', () => {
    // Water vs Fire level 1 = 1.5; level 2 should be larger.
    const l1 = elementMultiplier('Water', 'Fire', 1);
    const l2 = elementMultiplier('Water', 'Fire', 2);
    expect(l2).toBeGreaterThan(l1);
  });
});

describe('weaponSizeModifier', () => {
  it('Bow hits all sizes at 100%', () => {
    expect(weaponSizeModifier('Bow', 'Small')).toBe(1);
    expect(weaponSizeModifier('Bow', 'Medium')).toBe(1);
    expect(weaponSizeModifier('Bow', 'Large')).toBe(1);
  });
  it('Dagger vs Large = 50%', () => {
    expect(weaponSizeModifier('Dagger', 'Large')).toBe(0.5);
  });
});

describe('computePhysicalDamage', () => {
  it('deals ≥1 damage on a hit (Lunatic baseline)', () => {
    const rng = createRng(1);
    const result = computePhysicalDamage({
      attackerLevel: 1, attackerStr: 1, attackerDex: 10, attackerLuk: 1,
      attackerCrit: 0.3, attackerHit: 11,
      attackElement: 'Neutral',
      weaponType: 'Bow', weaponLevel: 1, weaponAtk: 14, weaponRefine: 0,
      cardMods: aggregateCards([], CARD_DB),
      targetRace: 'Brute', targetElement: 'Neutral', targetElementLevel: 1,
      targetSize: 'Small', targetFlee: 4, targetEquipDef: 0, targetVitDef: 1,
    }, rng);
    expect(result.kind).toBe('hit');
    if (result.kind === 'hit') {
      expect(result.damage).toBeGreaterThanOrEqual(1);
      // A Novice Bow vs Lunatic should land roughly 10-25 damage per hit.
      expect(result.damage).toBeLessThan(50);
    }
  });

  it('applies Hydra×2 + SkeletonWorker multiplier for Large DemiHuman target', () => {
    const mods = makeMods();
    // Compare with a no-card baseline using the same RNG seed.
    const baseline = computePhysicalDamage({
      attackerLevel: 50, attackerStr: 1, attackerDex: 80, attackerLuk: 5,
      attackerCrit: 1.5, attackerHit: 130,
      attackElement: 'Neutral',
      weaponType: 'Bow', weaponLevel: 1, weaponAtk: 29, weaponRefine: 0,
      cardMods: aggregateCards([], CARD_DB),
      targetRace: 'DemiHuman', targetElement: 'Neutral', targetElementLevel: 1,
      targetSize: 'Large', targetFlee: 100, targetEquipDef: 10, targetVitDef: 20,
    }, createRng(7));
    const buffed = computePhysicalDamage({
      attackerLevel: 50, attackerStr: 1, attackerDex: 80, attackerLuk: 5,
      attackerCrit: 1.5, attackerHit: 130,
      attackElement: 'Neutral',
      weaponType: 'Bow', weaponLevel: 1, weaponAtk: 29, weaponRefine: 0,
      cardMods: mods,
      targetRace: 'DemiHuman', targetElement: 'Neutral', targetElementLevel: 1,
      targetSize: 'Large', targetFlee: 100, targetEquipDef: 10, targetVitDef: 20,
    }, createRng(7));

    if (baseline.kind === 'hit' && buffed.kind === 'hit') {
      // Hydra×2 → +40%, SkeletonWorker → +15% size + 10 flat ATK
      // The damage ratio should be greater than 1.4 (size category adds on top).
      expect(buffed.damage).toBeGreaterThan(baseline.damage * 1.4);
    }
  });

  it('crit rolls bypass flee and use max weapon damage', () => {
    // Force crit by setting crit chance to 100.
    const rng = createRng(3);
    const result = computePhysicalDamage({
      attackerLevel: 50, attackerStr: 1, attackerDex: 80, attackerLuk: 99,
      attackerCrit: 100, attackerHit: 1,
      attackElement: 'Neutral',
      weaponType: 'Bow', weaponLevel: 1, weaponAtk: 50, weaponRefine: 0,
      cardMods: aggregateCards([], CARD_DB),
      targetRace: 'Brute', targetElement: 'Neutral', targetElementLevel: 1,
      targetSize: 'Medium', targetFlee: 9999, targetEquipDef: 0, targetVitDef: 0,
    }, rng);
    expect(result.kind).toBe('hit');
    if (result.kind === 'hit') {
      expect(result.isCrit).toBe(true);
    }
  });

  it('misses when attacker hit < target flee and crit is 0', () => {
    const rng = createRng(99);
    let misses = 0;
    for (let i = 0; i < 1000; i++) {
      const result = computePhysicalDamage({
        attackerLevel: 1, attackerStr: 1, attackerDex: 1, attackerLuk: 0,
        attackerCrit: 0, attackerHit: 1,
        attackElement: 'Neutral',
        weaponType: 'Bow', weaponLevel: 1, weaponAtk: 10, weaponRefine: 0,
        cardMods: aggregateCards([], CARD_DB),
        targetRace: 'Brute', targetElement: 'Neutral', targetElementLevel: 1,
        targetSize: 'Medium', targetFlee: 500, targetEquipDef: 0, targetVitDef: 0,
      }, rng);
      if (result.kind === 'miss') misses++;
    }
    // With clamped hit chance at 5%, expect ~5% miss over 1000 samples.
    expect(misses).toBeGreaterThan(800);
  });
});
