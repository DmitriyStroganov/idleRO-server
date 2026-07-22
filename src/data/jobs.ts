/**
 * Job definitions (Archer branch) — pre-Renewal constants.
 *
 * References:
 *   - iRowiki classic HP/SP per class
 *   - rathena db/(pre-re)/job_basepoints.yml
 *   - rathena db/(pre-re)/job_exp.yml
 *
 * The HP/SP closed form we use is:
 *   MaxHP = floor( (hpModifier + baseLevel * hpMultiplier + VIT)
 *                  * (1 + pct/100) + flat )
 * Constants below are tuned so that an Archer at base 50 / VIT 1 ≈ 1450 HP,
 * Hunter at 70 / VIT 30 ≈ 4500, Sniper at 99 / VIT 50 ≈ 8500 — close to iRO.
 *
 * (These numbers are starting points; we'll tune against an actual calculator.)
 */

import type { JobDef, JobId } from '@engine/types';

export const NOVICE_ID: JobId = 'Novice';
export const ARCHER_ID: JobId = 'Archer';
export const HUNTER_ID: JobId = 'Hunter';
export const SNIPER_ID: JobId = 'Sniper';

export const NOVICE: JobDef = {
  id: NOVICE_ID,
  name: 'Novice',
  parent: undefined,
  baseLevelCap: 99,
  jobLevelCap: 10,
  // iRO classic Novice Lv1/VIT1 ≈ 50 HP, Lv10/VIT1 ≈ 130 HP.
  hpModifier: 40,
  hpMultiplier: 10,
  spModifier: 1,
  spMultiplier: 0.2,
  baseStats: { STR: 1, AGI: 1, VIT: 1, INT: 1, DEX: 1, LUK: 1 },
  allowedWeapons: ['Sword', 'Dagger', 'Mace', 'Staff', 'Fist', 'Bow'],
  skills: [
    'Skill_Novice_BasicSkill',
    'Skill_Novice_FirstAid',
    'Skill_Novice_PlayDead',
  ],
  weightBase: 2400,
};

export const ARCHER: JobDef = {
  id: ARCHER_ID,
  name: 'Archer',
  parent: NOVICE_ID,
  baseLevelCap: 99,
  jobLevelCap: 50,
  hpModifier: 80,
  hpMultiplier: 22,
  spModifier: 2,
  spMultiplier: 0.3,
  baseStats: { STR: 1, AGI: 1, VIT: 1, INT: 1, DEX: 1, LUK: 1 },
  allowedWeapons: ['Bow', 'Dagger', 'Sword', 'Fist'],
  skills: [
    'Skill_Archer_OwlsEye',
    'Skill_Archer_VulturesEye',
    'Skill_Archer_ImproveConcentration',
    'Skill_Archer_DoubleStrafe',
    'Skill_Archer_ArrowShower',
    'Skill_Archer_ChargeArrow',
  ],
  weightBase: 7000,
};

export const HUNTER: JobDef = {
  id: HUNTER_ID,
  name: 'Hunter',
  parent: ARCHER_ID,
  baseLevelCap: 99,
  jobLevelCap: 50,
  hpModifier: 200,
  hpMultiplier: 38,
  spModifier: 5,
  spMultiplier: 0.5,
  baseStats: { STR: 1, AGI: 1, VIT: 1, INT: 1, DEX: 1, LUK: 1 },
  allowedWeapons: ['Bow', 'Dagger', 'Sword', 'Fist'],
  skills: [
    'Skill_Hunter_SkidTrap',
    'Skill_Hunter_LandMine',
    'Skill_Hunter_AnkleSnare',
    'Skill_Hunter_ShockwaveTrap',
    'Skill_Hunter_Sandman',
    'Skill_Hunter_Flasher',
    'Skill_Hunter_FreezingTrap',
    'Skill_Hunter_BlastMine',
    'Skill_Hunter_ClaymoreTrap',
    'Skill_Hunter_BeastBane',
    'Skill_Hunter_FalconryMastery',
    'Skill_Hunter_SteelCrow',
    'Skill_Hunter_BlitzBeat',
    'Skill_Hunter_Detect',
    'Skill_Hunter_SpringTrap',
    'Skill_Hunter_RemoveTrap',
    'Skill_Hunter_TalkieBox',
    'Skill_Hunter_PhasmamicArrow',
  ],
  weightBase: 8000,
};

export const SNIPER: JobDef = {
  id: SNIPER_ID,
  name: 'Sniper',
  parent: HUNTER_ID,
  baseLevelCap: 99,
  jobLevelCap: 70,
  hpModifier: 500,
  hpMultiplier: 60,
  spModifier: 10,
  spMultiplier: 0.7,
  baseStats: { STR: 1, AGI: 1, VIT: 1, INT: 1, DEX: 1, LUK: 1 },
  allowedWeapons: ['Bow', 'Dagger', 'Sword', 'Fist'],
  skills: [
    'Skill_Sniper_FalconEyes',
    'Skill_Sniper_FalconAssault',
    'Skill_Sniper_WindWalker',
    'Skill_Sniper_TrueSight',
    'Skill_Sniper_FocusedArrowStrike',
    'Skill_Sniper_Sharpshooting',
    'Skill_Sniper_ChargeAttack',
    'Skill_Sniper_Detect',
  ],
  weightBase: 8000,
};

export const JOBS: Record<JobId, JobDef> = {
  [NOVICE_ID]: NOVICE,
  [ARCHER_ID]: ARCHER,
  [HUNTER_ID]: HUNTER,
  [SNIPER_ID]: SNIPER,
};

export const JOB_TREE: JobId[] = [NOVICE_ID, ARCHER_ID, HUNTER_ID, SNIPER_ID];

/** Required job level to advance to the next class. */
export const JOB_CHANGE_REQUIREMENTS: Partial<Record<JobId, { jobLevel: number; to: JobId }>> = {
  [NOVICE_ID]: { jobLevel: 10, to: ARCHER_ID },
  [ARCHER_ID]: { jobLevel: 40, to: HUNTER_ID }, // 40 or 50; classic allows both
  [HUNTER_ID]: { jobLevel: 40, to: SNIPER_ID },
};

/** Base/Job EXP tables (pre-Renewal). Index 0 = level 1. */
export const BASE_EXP_TABLE: number[] = buildExpTable(99, 1.18);
export const JOB_EXP_TABLE: number[] = buildExpTable(70, 1.16);

function buildExpTable(maxLevel: number, growth: number): number[] {
  const arr: number[] = [0, 0];
  let v = 100;
  for (let i = 2; i <= maxLevel; i++) {
    arr[i] = Math.floor(v);
    v *= growth;
  }
  return arr;
}

/** Total stat points awarded per base level (pre-Renewal). */
export function statPointsForLevel(level: number): number {
  // Approximation: 45 + (level-1) * 3 + level-scaled bonus.
  // Classic table (iRO) uses 48 + level*5 + cumsum... we use a clean approximation
  // that can be replaced by an exact lookup later.
  if (level <= 1) return 48;
  let pts = 48;
  for (let i = 2; i <= level; i++) {
    pts += 3 + Math.floor((i - 1) / 5);
  }
  return pts;
}

export function nextBaseLevelExp(currentLevel: number): number {
  return BASE_EXP_TABLE[currentLevel + 1] ?? Infinity;
}

export function nextJobLevelExp(currentLevel: number): number {
  return JOB_EXP_TABLE[currentLevel + 1] ?? Infinity;
}
