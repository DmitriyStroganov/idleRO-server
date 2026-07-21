/**
 * Cast time & after-cast delay (pre-Renewal).
 *
 * References:
 *   - iRowiki classic Cast Time: https://irowiki.org/classic/Casting_Time
 *   - rathena src/map/skill.cpp (skill_castfix / skill_delayfix)
 *
 * Pre-Renewal formulas:
 *
 *   castTime_ms = baseCast_ms * max(0, 1 - DEX / 150)
 *               * (1 - castPercentBonus / 100)
 *
 *   The DEX cap is 150 (i.e. DEX ≥ 150 → instant cast).
 *   CastPercentBonus comes from cards (Sukamojian), buffs (Suffragium),
 *   and equipment (Magic Eyes).
 *
 * After-cast delay:
 *   afterCast_ms = baseDelay_ms * (1 - delayPercentBonus / 100)
 *   Capped above 0; no DEX reduction here.
 *
 * Note: pre-Renewal has no "fixed cast time" concept — that's Renewal.
 * Some skills (Asura Strike, GC) have hard-coded minimums we encode on the skill.
 */

/** Compute cast time for a skill in ms, given DEX and combined bonuses. */
export function castTimeMs(
  baseCastMs: number,
  dex: number,
  opts: { castPercentBonus?: number } = {},
): number {
  const { castPercentBonus = 0 } = opts;
  const dexFactor = Math.max(0, 1 - dex / 150);
  const bonusFactor = Math.max(0, 1 - castPercentBonus / 100);
  return Math.max(0, baseCastMs * dexFactor * bonusFactor);
}

/** After-cast delay in ms. */
export function afterCastMs(
  baseDelayMs: number,
  opts: { delayPercentBonus?: number } = {},
): number {
  const { delayPercentBonus = 0 } = opts;
  const factor = Math.max(0, 1 - delayPercentBonus / 100);
  return Math.max(0, baseDelayMs * factor);
}

/**
 * Whether the cast would be effectively instant (< 1 tick = 50 ms).
 * Used by the sim to skip the cast state entirely for very fast casts.
 */
export function isInstantCast(castMs: number): boolean {
  return castMs < 50;
}
