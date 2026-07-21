/**
 * Card aggregation tests — the canonical "3 Hydra + 1 Skeleton Worker"
 * example from iRowiki classic is the gold test.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateCards,
  cardDamageMultiplier,
  cardDamageReduction,
} from '@engine/formulas/cards';
import { CARD_DB } from '@data/items';

describe('aggregateCards', () => {
  it('3× Hydra stacks additively → +60% vs DemiHuman', () => {
    const mods = aggregateCards(
      ['Card_Hydra', 'Card_Hydra', 'Card_Hydra'],
      CARD_DB,
    );
    expect(mods.raceDamage.DemiHuman).toBe(60);
  });

  it('Hydra + Vadon + Minorous stack across categories', () => {
    const mods = aggregateCards(
      ['Card_Hydra', 'Card_Vadon', 'Card_Minorous'],
      CARD_DB,
    );
    expect(mods.raceDamage.DemiHuman).toBe(20);
    expect(mods.elementDamage.Fire).toBe(20);
    expect(mods.sizeDamage.Large).toBe(15);
  });

  it('3 Hydra vs DemiHuman/Fire/Large multiplier = 1.6 (single category)', () => {
    const mods = aggregateCards(
      ['Card_Hydra', 'Card_Hydra', 'Card_Hydra'],
      CARD_DB,
    );
    const m = cardDamageMultiplier(mods, 'DemiHuman', 'Fire', 'Large');
    // 1.6 * 1 * 1 = 1.6
    expect(m).toBeCloseTo(1.6);
  });

  it('Hydra + Vadon + Minorous vs DemiHuman/Fire/Large = 1.2 * 1.2 * 1.15', () => {
    const mods = aggregateCards(
      ['Card_Hydra', 'Card_Vadon', 'Card_Minorous'],
      CARD_DB,
    );
    const m = cardDamageMultiplier(mods, 'DemiHuman', 'Fire', 'Large');
    expect(m).toBeCloseTo(1.2 * 1.2 * 1.15);
  });

  it('Thara Frog: -30% from DemiHuman as defender', () => {
    const mods = aggregateCards(['Card_TharaFrog'], CARD_DB);
    const r = cardDamageReduction(mods, 'DemiHuman', 'Neutral');
    // 1 - 0.30 = 0.70
    expect(r).toBeCloseTo(0.70);
  });

  it('Andre adds flat ATK', () => {
    const mods = aggregateCards(['Card_Andre', 'Card_Andre'], CARD_DB);
    expect(mods.attackFlat).toBe(40);
  });

  it('Soldier Skeleton adds 9 CRIT', () => {
    const mods = aggregateCards(['Card_SoldierSkeleton'], CARD_DB);
    expect(mods.critRate).toBe(9);
  });

  it('unknown card id is ignored gracefully', () => {
    const mods = aggregateCards(['Card_DoesNotExist'], CARD_DB);
    expect(mods.attackFlat).toBe(0);
  });
});
