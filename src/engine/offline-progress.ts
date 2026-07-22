/**
 * Offline-progression calculator.
 *
 * Called on PlayerSession load (reconnect) when (now - lastSeenAt) is large
 * enough. Computes the exp the character would have gained if it had kept
 * farming at the recorded baseline rate, with an 8-hour cap.
 *
 * Design rules (locked in with the user):
 *   - 8h hard cap (anti-abuse)
 *   - Hybrid baseline: rolling 5-min online average if present, else
 *     per-map estimate.
 *   - EXP only — no loot, no cards, no drops.
 *   - Death: only on offline-unsafe maps (MVP / PvP / dungeons). On safe
 *     maps the character is immortal. Death = 50% exp applied.
 *   - Silent: returns the result for the caller to optionally surface;
 *     no UI popup required.
 */

import type { Character, GameMap } from '@engine/types';
import { recomputeCharacterStats } from '@engine/sim';
import { nextFloat, type RngState } from '@engine/rng';
import { MOBS } from '@data/mobs';

export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;          // 8 hours
export const OFFLINE_THRESHOLD_MS = 60 * 1000;             // ignore <1 min
const DANGER_ZONE_DEATH_PER_HOUR = 0.01;                   // 1% / hour

export interface OfflineResult {
  applied: boolean;
  offlineMs: number;
  effectiveMs: number;
  expGained: number;
  jobExpGained: number;
  levelsGained: number;
  jobLevelsGained: number;
  died: boolean;
}

export const NO_OFFLINE_RESULT: OfflineResult = {
  applied: false,
  offlineMs: 0,
  effectiveMs: 0,
  expGained: 0,
  jobExpGained: 0,
  levelsGained: 0,
  jobLevelsGained: 0,
  died: false,
};

/**
 * Apply offline progression to a character in-place. Returns the summary.
 *
 * Caller is responsible for picking the RNG seed (per-user, per-reconnect).
 */
export function computeOfflineProgress(
  c: Character,
  map: GameMap,
  rng: RngState,
  now: number = Date.now(),
): OfflineResult {
  const offlineMs = now - c.lastSeenAt;
  if (offlineMs < OFFLINE_THRESHOLD_MS) {
    return { ...NO_OFFLINE_RESULT, offlineMs };
  }

  const effectiveMs = Math.min(offlineMs, OFFLINE_CAP_MS);
  const minutes = effectiveMs / 60_000;

  // Hybrid baseline.
  const expPerMin = c.offlineBaseline.expPerMin > 0
    ? c.offlineBaseline.expPerMin
    : estimateExpPerMinFromMap(map);
  const jobExpPerMin = c.offlineBaseline.jobExpPerMin > 0
    ? c.offlineBaseline.jobExpPerMin
    : Math.floor(expPerMin * 0.5);

  // Death roll on danger-zones.
  let died = false;
  let multiplier = 1;
  if (!map.offlineSafe) {
    const hours = effectiveMs / 3_600_000;
    const deathChance = Math.min(0.99, hours * DANGER_ZONE_DEATH_PER_HOUR);
    if (nextFloat(rng) < deathChance) {
      died = true;
      multiplier = 0.5; // died on average mid-way
    }
  }

  const expGained = Math.floor(expPerMin * minutes * multiplier);
  const jobExpGained = Math.floor(jobExpPerMin * minutes * multiplier);

  // Apply.
  const beforeBase = c.baseLevel;
  const beforeJob = c.jobLevel;
  c.exp += expGained;
  c.jobExp += jobExpGained;
  while (canLevelUp(c)) {
    c.baseLevel += 1;
    c.statPoints += 3 + Math.floor((c.baseLevel - 1) / 5);
  }
  while (canJobLevelUp(c)) {
    c.jobLevel += 1;
    c.skillPoints += 1;
  }
  recomputeCharacterStats(c);
  c.hp = died ? 1 : c.maxHp;
  c.sp = c.maxSp;
  c.lastSeenAt = now;

  return {
    applied: true,
    offlineMs,
    effectiveMs,
    expGained,
    jobExpGained,
    levelsGained: c.baseLevel - beforeBase,
    jobLevelsGained: c.jobLevel - beforeJob,
    died,
  };
}

/**
 * Conservative per-map exp/minute estimate.
 * Used when the character has no measured online baseline (new character,
 * first session after creation, long absence so baseline is stale).
 *
 * Heuristic: 30 kills/min × average base exp of the mobs that spawn on
 * this map. For starter maps that's ~900 exp/min; for MVP maps much higher.
 */
function estimateExpPerMinFromMap(map: GameMap): number {
  if (map.spawnPoints.length === 0) return 100;
  const exps = map.spawnPoints
    .map((s) => MOBS[s.mobId]?.baseExp ?? 0)
    .filter((e) => e > 0);
  if (exps.length === 0) return 100;
  const avg = exps.reduce((a, b) => a + b, 0) / exps.length;
  return Math.floor(30 * avg);
}

// Local copies of the level-up checks (mirrored from sim.ts to avoid a
// cross-module cycle). These formulas must stay in sync with awardKill.
function canLevelUp(c: Character): boolean {
  const needed = Math.floor(100 * Math.pow(1.18, c.baseLevel - 1));
  return c.exp >= needed && c.baseLevel < 99;
}
function canJobLevelUp(c: Character): boolean {
  const needed = Math.floor(50 * Math.pow(1.16, c.jobLevel - 1));
  return c.jobExp >= needed;
}
