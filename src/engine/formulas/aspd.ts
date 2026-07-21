/**
 * Pre-Renewal ASPD (Attack Speed) formula.
 *
 * Reference: iRowiki classic ASPD + rathena src/map/battle.cpp
 *
 * Formula:
 *   ASPD = 200 - (250 - AGI - DEX/4) * weaponDelay * (1 - equipSpeedBonus)
 *
 *   where:
 *     - weaponDelay is per weapon-type (Bow 0.075 * 10? — we store as fraction 0..1)
 *     - equipSpeedBonus includes Twohand Quicken, Adrenaline Rush, etc.
 *
 * Capped to [100, 190] for non-expanded classes (iRO classic cap).
 *
 * The reciprocal gives the per-attack delay in ms:
 *   attackDelayMs = 1000 * 50 / (200 - ASPD)
 *   (pre-Renewal: Amotion = floor( (200 - ASPD) / 100 * baseFrames ))
 *   We use a simplified form: amotion_ms = floor( (200 - ASPD) * 10 )
 *
 * The 50/100 multiplier reflects the 20-tick sim rate (50 ms per tick).
 */

import type { WeaponType } from '@engine/types';

/**
 * Per-weapon-type "base delay" multiplier (fraction of max possible delay).
 * Sourced from rathena db/(pre-re)/job_basepoints.yml and aspd_db.txt.
 *
 * Lower number = faster. Bows have a high base delay (archers are slow by default
 * and rely on high AGI/DEX to reach high ASPD).
 */
export const WEAPON_BASE_DELAY: Record<WeaponType, number> = {
  Bow: 0.075,
  Sword: 0.045,
  Dagger: 0.045,
  Spear: 0.065,
  Axe: 0.070,
  Mace: 0.060,
  Staff: 0.060,
  Knuckle: 0.045,
  Instrument: 0.045,
  Whip: 0.045,
  Book: 0.055,
  Katar: 0.045,
  Handgun: 0.060,
  Rifle: 0.070,
  Shotgun: 0.090,
  Gatling: 0.060,
  Grenade: 0.090,
  Fist: 0.040,
};

/** Hard caps for non-expanded classes (iRO classic). */
export const MIN_ASPD = 100;
export const MAX_ASPD = 190;

/**
 * Compute ASPD given raw inputs.
 *
 * @param agi   effective AGI
 * @param dex   effective DEX
 * @param weapon  weapon type (Fist if unarmed)
 * @param opts  equip/buff percentage ASPD bonuses (e.g. Quicken = 30)
 */
export function aspd(
  agi: number,
  dex: number,
  weapon: WeaponType,
  opts: { speedPercentBonus?: number } = {},
): number {
  const baseDelay = WEAPON_BASE_DELAY[weapon] ?? WEAPON_BASE_DELAY.Fist;
  const pct = opts.speedPercentBonus ?? 0;
  const factor = baseDelay * (1 - pct / 100);
  const raw = 200 - (250 - agi - dex / 4) * factor;
  return clamp(Math.floor(raw), MIN_ASPD, MAX_ASPD);
}

/**
 * Convert ASPD → Amotion (ms between attack starts).
 * Pre-Renewal: amotion_ms = floor( (200 - ASPD) * 10 )
 * For very high ASPD (190) this is 100 ms — i.e. 10 attacks per second.
 */
export function amotionMs(aspdValue: number): number {
  return Math.floor((200 - aspdValue) * 10);
}

/** Clamp helper (also used elsewhere). */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
