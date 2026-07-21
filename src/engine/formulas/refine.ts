/**
 * Pre-Renewal refinement ("upgrade") system.
 *
 * References:
 *   - iRowiki classic Upgrading: https://irowiki.org/classic/Item_Upgrade
 *   - rathena db/(pre-re)/refine_db.yml
 *   - rathena src/map/upgrade.cpp
 *
 * Per-level ATK bonus for weapons (pre-Renewal):
 *   lv1: +2 ATK  lv2: +3 ATK  lv3: +5 ATK  lv4: special (irregular)
 *   lv4 weapons have a custom table; classic iRO approx:
 *     +1:+5, +2:+7, +3:+9, +4:+11, ... (simplified to +5 per level here)
 *
 * Per-level DEF bonus for armor:
 *   +0.7 equip DEF per level (rounded down at the end of computation)
 *
 * Safe refine limit: +4 for both weapons and armor.
 * At +5 and above the item can break (weapon) or vanish (armor) on failure.
 */

import type { WeaponLevel } from '@engine/types';

/** ATK per refine level, indexed by weapon level (1..4) → array index 0..refine. */
export const WEAPON_REFINE_ATK: Record<WeaponLevel, number[]> = {
  1: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  2: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30],
  3: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  4: [0, 5, 7, 9, 11, 14, 17, 20, 23, 26, 30],
};

/** Equip DEF per refine level for armor (pre-Renewal: 0.7 / level). */
export const ARMOR_REFINE_DEF: number[] = [
  0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9, 5.6, 6.3, 7.0,
];

/**
 * Success chance (0..1) of refining from level N to N+1.
 * Indexed by current refine (0..9). Source: rathena refine_db.yml (classic iRO).
 */
export const REFINE_SUCCESS_RATE: {
  weapon: number[][];  // [weaponLevel-1][currentRefine]
  armor: number[];
} = {
  // weapon[0..3] = weaponLevel 1..4; inner array indexed by target refine (0..9).
  weapon: [
    // lv1
    [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 0.50, 0.20, 0.20, 0.20],
    // lv2
    [1.00, 1.00, 1.00, 1.00, 1.00, 0.50, 0.20, 0.20, 0.20, 0.20],
    // lv3
    [1.00, 1.00, 1.00, 1.00, 0.50, 0.25, 0.15, 0.10, 0.08, 0.05],
    // lv4
    [1.00, 1.00, 1.00, 0.50, 0.33, 0.25, 0.15, 0.10, 0.08, 0.05],
  ],
  armor: [
    1.00, 1.00, 1.00, 1.00, 0.60, 0.40, 0.30, 0.20, 0.15, 0.10,
  ],
};

/** Safe refine limit (no break below this). */
export const SAFE_REFINE = 4;

/**
 * Bonus ATK granted by the weapon's refine level.
 *
 * @param refineLevel 0..10
 * @param weaponLevel 1..4
 */
export function weaponRefineAtk(refineLevel: number, weaponLevel: WeaponLevel): number {
  if (refineLevel <= 0) return 0;
  const table = WEAPON_REFINE_ATK[weaponLevel];
  return table[Math.min(refineLevel, 10)] ?? 0;
}

/** Bonus equip DEF granted by armor's refine level. */
export function armorRefineDef(refineLevel: number): number {
  if (refineLevel <= 0) return 0;
  return ARMOR_REFINE_DEF[Math.min(refineLevel, 10)] ?? 0;
}

/** Success rate for the next refine attempt. */
export function refineSuccessRate(
  currentRefine: number,
  kind: 'weapon' | 'armor',
  weaponLevel: WeaponLevel = 1,
): number {
  if (currentRefine < 0 || currentRefine >= 10) return 0;
  if (kind === 'armor') {
    return REFINE_SUCCESS_RATE.armor[currentRefine] ?? 0;
  }
  const row = REFINE_SUCCESS_RATE.weapon[weaponLevel - 1] ?? REFINE_SUCCESS_RATE.weapon[0]!;
  return row[currentRefine] ?? 0;
}
/** Material needed for a refine attempt (pre-Renewal, classic iRO). */
export function refineMaterial(
  kind: 'weapon' | 'armor',
  weaponLevel: WeaponLevel,
): ItemRef {
  if (kind === 'armor') return 'Oridecon';
  if (weaponLevel === 1) return 'Phracon';
  if (weaponLevel === 2) return 'Emveretarcon';
  return 'Oridecon'; // lv3 + lv4
}

/** Zeny cost of a refine attempt (classic iRO: 200 * (currentRefine+1) * weaponLevel). */
export function refineZenyCost(
  currentRefine: number,
  kind: 'weapon' | 'armor',
  weaponLevel: WeaponLevel,
): number {
  if (currentRefine < 0 || currentRefine >= 10) return 0;
  const base = (currentRefine + 1) * 200;
  return kind === 'armor' ? base : base * weaponLevel;
}

/** Reference id for refine materials (kept loose — data/items resolves). */
export type ItemRef = 'Phracon' | 'Emveretarcon' | 'Oridecon';
