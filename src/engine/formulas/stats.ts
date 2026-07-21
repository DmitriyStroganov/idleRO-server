/**
 * Pre-Renewal stat formulas.
 *
 * References:
 *   - iRowiki classic: https://irowiki.org/classic/Stats
 *   - rathena src/map/status.cpp (status_calc_* functions)
 *   - iRO vanilla calculator (use as numeric reference)
 *
 * Conventions:
 *   - All flat bonuses from gear/cards/buffs are summed upstream into
 *     `effective(stats)` — see `effectiveStats()` below.
 *   - HP/SP formulas use job-specific constants defined in data/jobs.ts.
 */

import type {
  EffectiveStats,
  JobDef,
  StatBlock,
  StatKey,
} from '@engine/types';
import { STAT_KEYS } from '@engine/types';

/** Sum base + equip + buff into one effective stat block. */
export function effectiveStats(stats: StatBlock): EffectiveStats {
  const out = {} as EffectiveStats;
  for (const k of STAT_KEYS) {
    out[k] = stats.base[k] + stats.equip[k] + stats.buff[k];
  }
  return out;
}

/**
 * Pre-Renewal MaxHP formula:
 *   MaxHP = floor( BaseHP + (BaseLevel / JobHPMultiplier) * 25
 *                  + (VIT / 100) * (BaseLevel / JobHPMultiplier) * 25
 *                  + ItemBonusHP )
 * Simplified canonical form (used by most classic calculators):
 *   MaxHP = floor( (35 + BaseLevel * HPm + (VIT / 100) * (JobHPConst) )
 *                  * (1 + MaxHPPercentFromGear / 100) + FlatHPFromGear )
 *
 * In practice rathena computes it as a per-base-level linear interpolation
 * between two values stored per-job. For our purposes we use the closed form:
 *   MaxHP = floor( (jobHpA + BaseLevel * jobHpB + VIT) * (1 + pct/100) + flat )
 * Constants `jobHpA` / `jobHpB` come from JobDef (stored as hpModifier / hpMultiplier).
 */
export function maxHp(
  baseLevel: number,
  vit: number,
  job: Pick<JobDef, 'hpModifier' | 'hpMultiplier'>,
  opts: { flatBonus?: number; percentBonus?: number } = {},
): number {
  const { flatBonus = 0, percentBonus = 0 } = opts;
  const base = job.hpModifier + baseLevel * job.hpMultiplier + vit;
  const result = (base * (100 + percentBonus)) / 100 + flatBonus;
  return Math.floor(result);
}

/** Pre-Renewal MaxSP. */
export function maxSp(
  baseLevel: number,
  intStat: number,
  job: Pick<JobDef, 'spModifier' | 'spMultiplier'>,
  opts: { flatBonus?: number; percentBonus?: number } = {},
): number {
  const { flatBonus = 0, percentBonus = 0 } = opts;
  const base = job.spModifier + baseLevel * job.spMultiplier + intStat;
  const result = (base * (100 + percentBonus)) / 100 + flatBonus;
  return Math.floor(result);
}

/**
 * HIT (chance to land a physical hit before flee).
 *   HIT = BaseLevel + DEX + SkillBonuses - Blind penalty (if active)
 * Blind subtracts 25; caller passes that via `blindPenalty`.
 */
export function hit(baseLevel: number, dex: number, blindPenalty = 0): number {
  return baseLevel + dex - blindPenalty;
}

/**
 * FLEE (chance to dodge a physical hit).
 *   FLEE = BaseLevel + AGI + SkillBonuses
 * Note: attacks have a 5% minimum hit / 95% max hit cap baked in elsewhere.
 */
export function flee(baseLevel: number, agi: number): number {
  return baseLevel + agi;
}

/**
 * Critical rate (%).
 *   CRIT = LUK * 0.3 + bonuses
 * (Some sources use 0.3, iRO classic uses 0.3 — verified against irowiki.)
 */
export function crit(luk: number, bonus = 0): number {
  return luk * 0.3 + bonus;
}

/** Critical shield — subtracts from attacker CRIT. */
export function critShield(luk: number): number {
  return luk * 0.2;
}

/**
 * Minimum physical ATK from STR (pre-Renewal status ATK).
 *   statusATK_min = STR + floor(STR/10)^2 + DEX/5 + LUK/5
 *   statusATK_max = STR + floor(STR/10)^2 + DEX/5 + LUK/5 (same in pre-Renewal)
 * (No variance in classic — variance comes from the weapon.)
 */
export function statusAttack(
  str: number,
  dex: number,
  luk: number,
): number {
  const strBonus = Math.floor(str / 10) ** 2;
  return str + strBonus + Math.floor(dex / 5) + Math.floor(luk / 5);
}

/**
 * Minimum/maximum MATK from INT (pre-Renewal).
 *   MATK_min = INT + floor(INT/7)^2
 *   MATK_max = INT + floor(INT/5)^2
 */
export function magicAttack(intStat: number): { min: number; max: number } {
  return {
    min: intStat + Math.floor(intStat / 7) ** 2,
    max: intStat + Math.floor(intStat / 5) ** 2,
  };
}

/**
 * Final ATK variance: weapon damage has a variance that depends on DEX.
 *   variance = (weaponATK_max - weaponATK_min) * (1 - DEX/100) clamped ≥ 0
 * Higher DEX → less variance. At DEX ≥ 100 weapon damage is always max.
 *
 * Returned as the [min, max] ATK to feed into damage roll.
 */
export function weaponDamageRange(
  weaponAtk: number,
  dex: number,
): { min: number; max: number } {
  const v = weaponAtk * Math.max(0, 1 - dex / 100);
  return {
    min: Math.max(0, weaponAtk - v),
    max: weaponAtk,
  };
}

/**
 * Stat point cost for the NEXT point in `stat`.
 * Pre-Renewal: cumulative cost = floor(statValue / 10) + 2
 *   So: cost to go from N to N+1 is  2 + floor(N / 10)
 *
 * This is the per-point cost, NOT cumulative.
 */
export function statPointCost(currentValue: number): number {
  return 2 + Math.floor(currentValue / 10);
}

/** Total stat points awarded at a given base level (pre-Renewal table). */
export function statPointsForBaseLevel(level: number): number {
  // Pre-Renewal formula: 3 * (level-1) + sum_{i=2..level} floor(i/5) ... approximation.
  // Closed form used by iRO classic:
  //   pt(L) = (L-1)*3 + floor((L-1)*(L-2)/10) ... we use the standard table.
  // To stay simple, sum: for i in 2..level: statPointCost cumulative gives a curve.
  let pts = 0;
  for (let lvl = 2; lvl <= level; lvl++) {
    pts += 3 + Math.floor((lvl - 1) / 5);
  }
  return pts;
}

/**
 * Returns true if the given effective stat is within RO's 1..99 range
 * (pre-Renewal cap). Used as a sanity check.
 */
export function isStatInBounds(value: number): boolean {
  return value >= 1 && value <= 99;
}

/** Helper: pick the effective value of a specific stat. */
export function eff(stats: EffectiveStats, key: StatKey): number {
  return stats[key];
}
