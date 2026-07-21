/**
 * Skill database (Archer branch) — pre-Renewal values.
 *
 * Numbers verified against iRowiki classic skill pages where possible.
 * Damage multipliers are per skill level (index 0 = level 1).
 */

import type { SkillDef, SkillId } from '@engine/types';

export const SKILLS: Record<SkillId, SkillDef> = {
  // === Novice ===
  Skill_Novice_BasicSkill: {
    id: 'Skill_Novice_BasicSkill', name: 'Basic Skill', job: 'Novice',
    maxLevel: 9, targetType: 'self', range: 0,
    castTimeMs: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    afterCastDelayMs: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    spCost: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Novice_FirstAid: {
    id: 'Skill_Novice_FirstAid', name: 'First Aid', job: 'Novice',
    maxLevel: 1, targetType: 'self', range: 0,
    castTimeMs: [0], afterCastDelayMs: [500], spCost: [3],
    flags: { isHeal: true, noDamage: true },
  },
  Skill_Novice_PlayDead: {
    id: 'Skill_Novice_PlayDead', name: 'Play Dead', job: 'Novice',
    maxLevel: 1, targetType: 'self', range: 0,
    castTimeMs: [0], afterCastDelayMs: [1000], spCost: [5],
    flags: { noDamage: true, isBuff: true },
  },

  // === Archer ===
  Skill_Archer_OwlsEye: {
    id: 'Skill_Archer_OwlsEye', name: "Owl's Eye", job: 'Archer',
    maxLevel: 10, targetType: 'self', range: 0,
    castTimeMs: new Array(10).fill(0),
    afterCastDelayMs: new Array(10).fill(0),
    spCost: new Array(10).fill(0),
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Archer_VulturesEye: {
    id: 'Skill_Archer_VulturesEye', name: "Vulture's Eye", job: 'Archer',
    maxLevel: 10, targetType: 'self', range: 0,
    castTimeMs: new Array(10).fill(0),
    afterCastDelayMs: new Array(10).fill(0),
    spCost: new Array(10).fill(0),
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Archer_ImproveConcentration: {
    id: 'Skill_Archer_ImproveConcentration', name: 'Improve Concentration', job: 'Archer',
    maxLevel: 10, targetType: 'self', range: 0,
    castTimeMs: new Array(10).fill(0),
    afterCastDelayMs: new Array(10).fill(1500),
    spCost: [8, 10, 12, 14, 16, 18, 20, 22, 24, 25],
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Archer_DoubleStrafe: {
    id: 'Skill_Archer_DoubleStrafe', name: 'Double Strafe', job: 'Archer',
    maxLevel: 10, targetType: 'enemy', range: 9,
    castTimeMs: new Array(10).fill(0),         // instant
    afterCastDelayMs: new Array(10).fill(300),
    spCost: [12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    damageMultiplier: [1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7],
    flags: { isPhysical: true, ranged: true },
  },
  Skill_Archer_ArrowShower: {
    id: 'Skill_Archer_ArrowShower', name: 'Arrow Shower', job: 'Archer',
    maxLevel: 10, targetType: 'ground', range: 9, splashRadius: 2,
    castTimeMs: new Array(10).fill(0),
    afterCastDelayMs: new Array(10).fill(1000),
    spCost: [15, 15, 15, 15, 15, 15, 15, 15, 15, 15],
    damageMultiplier: [1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2],
    flags: { isPhysical: true, ranged: true },
  },
  Skill_Archer_ChargeArrow: {
    id: 'Skill_Archer_ChargeArrow', name: 'Charge Arrow', job: 'Archer',
    maxLevel: 1, targetType: 'enemy', range: 9,
    castTimeMs: [1500],
    afterCastDelayMs: [1000],
    spCost: [15],
    damageMultiplier: [1.5],
    flags: { isPhysical: true, ranged: true },
    inflictStatus: [{ id: 'StKnockback', chance: 1, durationMs: 0 }],
  },

  // === Hunter ===
  Skill_Hunter_BeastBane: {
    id: 'Skill_Hunter_BeastBane', name: 'Beast Bane', job: 'Hunter',
    maxLevel: 10, targetType: 'self', range: 0,
    castTimeMs: new Array(10).fill(0),
    afterCastDelayMs: new Array(10).fill(0),
    spCost: new Array(10).fill(0),
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Hunter_FalconryMastery: {
    id: 'Skill_Hunter_FalconryMastery', name: 'Falconry Mastery', job: 'Hunter',
    maxLevel: 1, targetType: 'self', range: 0,
    castTimeMs: [0], afterCastDelayMs: [0], spCost: [0],
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Hunter_SteelCrow: {
    id: 'Skill_Hunter_SteelCrow', name: 'Steel Crow', job: 'Hunter',
    maxLevel: 10, targetType: 'self', range: 0,
    castTimeMs: new Array(10).fill(0),
    afterCastDelayMs: new Array(10).fill(0),
    spCost: new Array(10).fill(0),
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Hunter_BlitzBeat: {
    id: 'Skill_Hunter_BlitzBeat', name: 'Blitz Beat', job: 'Hunter',
    maxLevel: 5, targetType: 'enemy', range: 9,
    castTimeMs: [1000, 1000, 1000, 1000, 1000],
    afterCastDelayMs: [1000, 1000, 1000, 1000, 1000],
    spCost: [10, 13, 16, 19, 22],
    damageMultiplier: [1.6, 2.0, 2.4, 2.8, 3.2],
    flags: { isPhysical: true, ranged: true, ignoresDef: false },
  },
  Skill_Hunter_AnkleSnare: {
    id: 'Skill_Hunter_AnkleSnare', name: 'Ankle Snare', job: 'Hunter',
    maxLevel: 5, targetType: 'ground', range: 4, splashRadius: 0,
    castTimeMs: [0, 0, 0, 0, 0],
    afterCastDelayMs: [500, 500, 500, 500, 500],
    spCost: [12, 12, 12, 12, 12],
    flags: { noDamage: true, isDebuff: true },
    inflictStatus: [{ id: 'StAnkleSnare', chance: 1, durationMs: 4000, level: 1 }],
  },
  Skill_Hunter_LandMine: {
    id: 'Skill_Hunter_LandMine', name: 'Land Mine', job: 'Hunter',
    maxLevel: 5, targetType: 'ground', range: 3, splashRadius: 1,
    castTimeMs: [500, 500, 500, 500, 500],
    afterCastDelayMs: [500, 500, 500, 500, 500],
    spCost: [10, 10, 10, 10, 10],
    damageMultiplier: [1.5, 2.0, 2.5, 3.0, 3.5],
    flags: { isPhysical: true },
  },
  Skill_Hunter_ClaymoreTrap: {
    id: 'Skill_Hunter_ClaymoreTrap', name: 'Claymore Trap', job: 'Hunter',
    maxLevel: 5, targetType: 'ground', range: 4, splashRadius: 2,
    castTimeMs: [500, 500, 500, 500, 500],
    afterCastDelayMs: [500, 500, 500, 500, 500],
    spCost: [15, 15, 15, 15, 15],
    damageMultiplier: [1.5, 2.0, 2.5, 3.0, 3.5],
    flags: { isPhysical: true },
  },
  Skill_Hunter_PhasmamicArrow: {
    id: 'Skill_Hunter_PhasmamicArrow', name: 'Phantasmic Arrow', job: 'Hunter',
    maxLevel: 1, targetType: 'enemy', range: 9,
    castTimeMs: [0], afterCastDelayMs: [500], spCost: [9],
    damageMultiplier: [1.5],
    flags: { isPhysical: true, ranged: true },
  },
  Skill_Hunter_SkidTrap: stub({ id: 'Skill_Hunter_SkidTrap' }),
  Skill_Hunter_ShockwaveTrap: stub({ id: 'Skill_Hunter_ShockwaveTrap' }),
  Skill_Hunter_Sandman: stub({ id: 'Skill_Hunter_Sandman' }),
  Skill_Hunter_Flasher: stub({ id: 'Skill_Hunter_Flasher' }),
  Skill_Hunter_FreezingTrap: stub({ id: 'Skill_Hunter_FreezingTrap' }),
  Skill_Hunter_BlastMine: stub({ id: 'Skill_Hunter_BlastMine' }),
  Skill_Hunter_Detect: stub({ id: 'Skill_Hunter_Detect' }),
  Skill_Hunter_SpringTrap: stub({ id: 'Skill_Hunter_SpringTrap' }),
  Skill_Hunter_RemoveTrap: stub({ id: 'Skill_Hunter_RemoveTrap' }),
  Skill_Hunter_TalkieBox: stub({ id: 'Skill_Hunter_TalkieBox' }),

  // === Sniper ===
  Skill_Sniper_FalconEyes: {
    id: 'Skill_Sniper_FalconEyes', name: 'Falcon Eyes', job: 'Sniper',
    maxLevel: 10, targetType: 'self', range: 0,
    castTimeMs: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
    afterCastDelayMs: new Array(10).fill(2000),
    spCost: [25, 28, 31, 34, 37, 40, 43, 46, 49, 55],
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Sniper_TrueSight: {
    id: 'Skill_Sniper_TrueSight', name: 'True Sight', job: 'Sniper',
    maxLevel: 10, targetType: 'self', range: 0,
    castTimeMs: new Array(10).fill(0),
    afterCastDelayMs: new Array(10).fill(0),
    spCost: new Array(10).fill(20),
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Sniper_WindWalker: {
    id: 'Skill_Sniper_WindWalker', name: 'Wind Walker', job: 'Sniper',
    maxLevel: 10, targetType: 'self', range: 0,
    castTimeMs: new Array(10).fill(0),
    afterCastDelayMs: new Array(10).fill(2000),
    spCost: new Array(10).fill(50),
    flags: { noDamage: true, isBuff: true },
  },
  Skill_Sniper_FalconAssault: {
    id: 'Skill_Sniper_FalconAssault', name: 'Falcon Assault', job: 'Sniper',
    maxLevel: 5, targetType: 'enemy', range: 9,
    castTimeMs: [1000, 1000, 1000, 1000, 1000],
    afterCastDelayMs: [1000, 1000, 1000, 1000, 1000],
    spCost: [30, 34, 38, 42, 46],
    damageMultiplier: [1.5, 2.5, 3.5, 4.5, 5.5],
    flags: { isPhysical: true, ranged: true, ignoresDef: true },
  },
  Skill_Sniper_FocusedArrowStrike: {
    id: 'Skill_Sniper_FocusedArrowStrike', name: 'Focused Arrow Strike', job: 'Sniper',
    maxLevel: 5, targetType: 'enemy', range: 9,
    castTimeMs: [2000, 2000, 2000, 2000, 2000],
    afterCastDelayMs: [500, 500, 500, 500, 500],
    spCost: [15, 18, 21, 24, 27],
    damageMultiplier: [3.0, 4.0, 5.0, 6.0, 7.0],
    flags: { isPhysical: true, ranged: true },
  },
  Skill_Sniper_Sharpshooting: {
    id: 'Skill_Sniper_Sharpshooting', name: 'Sharpshooting', job: 'Sniper',
    maxLevel: 5, targetType: 'enemy', range: 9,
    castTimeMs: [2000, 2000, 2000, 2000, 2000],
    afterCastDelayMs: [1000, 1000, 1000, 1000, 1000],
    spCost: [18, 22, 26, 30, 34],
    damageMultiplier: [2.0, 2.5, 3.0, 3.5, 4.0],
    flags: { isPhysical: true, ranged: true, canCrit: true },
  },
  Skill_Sniper_ChargeAttack: {
    id: 'Skill_Sniper_ChargeAttack', name: 'Charge Attack', job: 'Sniper',
    maxLevel: 5, targetType: 'enemy', range: 9,
    castTimeMs: [1500, 1500, 1500, 1500, 1500],
    afterCastDelayMs: [1000, 1000, 1000, 1000, 1000],
    spCost: [12, 14, 16, 18, 20],
    damageMultiplier: [1.2, 1.4, 1.6, 1.8, 2.0],
    flags: { isPhysical: true, ranged: true },
  },
  Skill_Sniper_Detect: stub({ id: 'Skill_Sniper_Detect' }),
};

/**
 * Helper to make a stub SkillDef for skills we haven't tuned yet.
 * They exist so progression doesn't crash; values are placeholders.
 */
function stub(opts: { id: SkillId }): SkillDef {
  return {
    id: opts.id,
    name: opts.id.replace(/^Skill_\w+_/, '').replace(/([A-Z])/g, ' $1').trim(),
    job: 'Hunter',
    maxLevel: 1,
    targetType: 'self',
    range: 0,
    castTimeMs: [0],
    afterCastDelayMs: [0],
    spCost: [0],
    flags: { noDamage: true },
  };
}
