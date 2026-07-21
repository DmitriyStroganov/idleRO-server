/**
 * Pre-Renewal physical damage pipeline.
 *
 * Stage order (faithful to rathena battle.cpp / iRowiki classic):
 *
 *   1. roll hit/flee (unless crit or skill ignoresFlee)
 *   2. roll crit
 *   3. base ATK  = statusATK + weaponATK(±variance) + refineATK + ammoATK + flatFromCards
 *   4. apply skill multiplier (and skill flags: ignoreDef, ignoresFlee, ...)
 *   5. card damage multipliers (race × element × size — multiplicative categories)
 *   6. element multiplier (atkElement vs targetElementProperty)
 *   7. weapon size penalty
 *   8. crit bonus (+50% if crit)
 *   9. subtract target DEF (equip DEF + VIT)
 *  10. apply target damage reduction (cards, skills)
 *  11. clamp to [1, ∞) unless attack is allowed to deal 0 (Miss / Pneuma)
 *
 * Magic damage follows a similar structure but with MATK variance and MDEF;
 * it's in damage_magic.ts (post-MVP).
 */

import type {
  CardModifiers,
} from '@engine/formulas/cards';
import {
  cardDamageMultiplier,
} from '@engine/formulas/cards';
import type {
  Element,
  Race,
  Size,
  WeaponLevel,
  WeaponType,
} from '@engine/types';
import type { RngState } from '@engine/rng';
import { nextFloat } from '@engine/rng';
import { weaponRefineAtk } from '@engine/formulas/refine';
import { weaponDamageRange } from '@engine/formulas/stats';

/** Per-weapon-type size modifier (Small / Medium / Large), 0..1. */
export const WEAPON_SIZE_TABLE: Record<WeaponType, [Size, number][]> & {
  [k: string]: [Size, number][];
} = {
  // [Small, Medium, Large] as fraction
  Fist:    [['Small', 1.00], ['Medium', 1.00], ['Large', 1.00]],
  Dagger:  [['Small', 1.00], ['Medium', 0.75], ['Large', 0.50]],
  Sword:   [['Small', 0.75], ['Medium', 1.00], ['Large', 0.75]],
  Spear:   [['Small', 0.75], ['Medium', 0.75], ['Large', 1.00]],
  Axe:     [['Small', 0.50], ['Medium', 0.75], ['Large', 1.00]],
  Mace:    [['Small', 0.75], ['Medium', 1.00], ['Large', 1.00]],
  Staff:   [['Small', 0.75], ['Medium', 1.00], ['Large', 1.00]],
  Bow:     [['Small', 1.00], ['Medium', 1.00], ['Large', 1.00]],
  Knuckle: [['Small', 1.00], ['Medium', 1.00], ['Large', 1.00]],
  Instrument: [['Small', 0.75], ['Medium', 1.00], ['Large', 1.00]],
  Whip:    [['Small', 0.75], ['Medium', 1.00], ['Large', 1.00]],
  Book:    [['Small', 0.75], ['Medium', 1.00], ['Large', 1.00]],
  Katar:   [['Small', 0.75], ['Medium', 1.00], ['Large', 0.75]],
  Handgun: [['Small', 1.00], ['Medium', 1.00], ['Large', 1.00]],
  Rifle:   [['Small', 1.00], ['Medium', 1.00], ['Large', 1.00]],
  Shotgun: [['Small', 0.75], ['Medium', 1.00], ['Large', 1.00]],
  Gatling: [['Small', 1.00], ['Medium', 1.00], ['Large', 1.00]],
  Grenade: [['Small', 0.75], ['Medium', 1.00], ['Large', 1.00]],
};

/**
 * Element-vs-element multiplier table (atk element rows, def element cols).
 * Returns a fraction (1.0 = neutral). Pre-Renewal uses these base values,
 * adjusted up to 4× for monster element levels (we apply level scaling separately).
 */
const ELEMENT_TABLE: Record<Element, Record<Element, number>> = {
  Neutral: { Neutral: 1.00, Water: 1.00, Earth: 1.00, Fire: 1.00, Wind: 1.00, Poison: 1.00, Holy: 1.00, Shadow: 1.00, Ghost: 0.25, Undead: 1.00 },
  Water:   { Neutral: 1.00, Water: 0.25, Earth: 1.00, Fire: 1.50, Wind: 0.50, Poison: 1.00, Holy: 1.00, Shadow: 1.00, Ghost: 0.75, Undead: 1.00 },
  Earth:   { Neutral: 1.00, Water: 1.00, Earth: 0.25, Fire: 0.50, Wind: 1.50, Poison: 1.00, Holy: 1.00, Shadow: 1.00, Ghost: 0.75, Undead: 1.00 },
  Fire:    { Neutral: 1.00, Water: 0.50, Earth: 1.50, Fire: 0.25, Wind: 1.00, Poison: 1.00, Holy: 1.00, Shadow: 1.00, Ghost: 0.75, Undead: 1.50 },
  Wind:    { Neutral: 1.00, Water: 1.50, Earth: 0.50, Fire: 1.00, Wind: 0.25, Poison: 1.00, Holy: 1.00, Shadow: 1.00, Ghost: 0.75, Undead: 1.00 },
  Poison:  { Neutral: 1.00, Water: 1.00, Earth: 1.00, Fire: 1.00, Wind: 1.00, Poison: 0.00, Holy: 0.75, Shadow: 0.50, Ghost: 0.75, Undead: 0.50 },
  Holy:    { Neutral: 1.00, Water: 1.00, Earth: 1.00, Fire: 1.00, Wind: 1.00, Poison: 1.00, Holy: 0.00, Shadow: 1.25, Ghost: 1.00, Undead: 1.50 },
  Shadow:  { Neutral: 1.00, Water: 1.00, Earth: 1.00, Fire: 1.00, Wind: 1.00, Poison: 1.00, Holy: 1.25, Shadow: 0.00, Ghost: 1.00, Undead: 0.00 },
  Ghost:   { Neutral: 0.00, Water: 0.75, Earth: 0.75, Fire: 0.75, Wind: 0.75, Poison: 0.75, Holy: 0.75, Shadow: 0.75, Ghost: 1.25, Undead: 0.75 },
  Undead:  { Neutral: 1.00, Water: 1.00, Earth: 1.00, Fire: 1.00, Wind: 1.00, Poison: 0.50, Holy: 1.00, Shadow: 1.00, Ghost: 0.00, Undead: 0.00 },
};

/**
 * Get element multiplier. For monster element levels > 1, the multiplier
 * is amplified toward 0 or 2 (typical pre-Renewal approximation).
 */
export function elementMultiplier(
  attackElement: Element,
  defenseElement: Element,
  defenseLevel = 1,
): number {
  const base = ELEMENT_TABLE[attackElement][defenseElement] ?? 1;
  if (defenseLevel <= 1) return base;
  if (base === 1) return 1;
  // For levels 2..4: move multiplier further from 1 by the level factor.
  // (approximation; rathena uses per-level tables in db/attr_fix.yml)
  if (base < 1) return Math.max(0, 1 - (1 - base) * defenseLevel);
  return 1 + (base - 1) * defenseLevel;
}

/** Lookup weapon size modifier (Small/Medium/Large → fraction). */
export function weaponSizeModifier(
  weapon: WeaponType,
  size: Size,
): number {
  const rows = WEAPON_SIZE_TABLE[weapon] ?? WEAPON_SIZE_TABLE.Fist;
  const row = rows.find(([s]) => s === size);
  return row ? row[1] : 1;
}

/** Inputs to the damage computation. */
export interface DamageInput {
  // Attacker
  attackerLevel: number;
  attackerStr: number;
  attackerDex: number;
  attackerLuk: number;
  attackerCrit: number;          // %
  attackerHit: number;           // level + DEX (+ cards)
  attackElement: Element;

  // Weapon
  weaponType: WeaponType;
  weaponLevel: WeaponLevel;
  weaponAtk: number;             // base ATK of the weapon item
  weaponRefine: number;          // 0..10
  ammunitionAtk?: number;        // for bows (arrows add ATK)
  ammunitionElement?: Element;   // arrow element overrides weapon element

  // Skill
  skillMultiplier?: number;      // 1 = auto-attack
  skillIgnoresDef?: boolean;
  skillIgnoresFlee?: boolean;
  skillAlwaysHits?: boolean;
  skillCritMultiplier?: number;  // override default 1.5× crit
  skillCanCrit?: boolean;

  // Cards / gear
  cardMods: CardModifiers;
  attackPercentBonus?: number;   // +% ATK from gear (rare)

  // Target
  targetRace: Race;
  targetElement: Element;
  targetElementLevel: number;
  targetSize: Size;
  targetFlee: number;
  targetEquipDef: number;
  targetVitDef: number;          // VIT-based DEF (subtracted separately)
  targetCardReduction?: CardModifiers;
  targetSkillReduction?: number; // e.g. Energy Coat, -X%
}

export type DamageResult =
  | { kind: 'miss' }
  | { kind: 'hit'; damage: number; isCrit: boolean }
  | { kind: 'blocked' };         // Pneuma / Safety Wall — placeholder

/**
 * Full pre-Renewal physical damage calculation.
 * Pure function — takes a deterministic RNG state.
 */
export function computePhysicalDamage(
  input: DamageInput,
  rng: RngState,
): DamageResult {
  // 1. Hit / Flee
  const isCritRoll = nextFloat(rng) * 100 < input.attackerCrit;
  // Crits always hit (and use max weapon ATK). Otherwise normal hit calc.
  const isAlwaysHit = isCritRoll || input.skillAlwaysHits === true || input.skillIgnoresFlee === true;
  if (!isAlwaysHit) {
    // Pre-Renewal: hitChance% = (attackerHit - targetFlee) + 80  ... clamped [5, 95]
    // Various sources use slightly different offsets; we use the canonical iRO classic:
    //   hitChance = (100 - (flee - hit)) clamped [5, 95]
    const raw = 100 - Math.max(0, input.targetFlee - input.attackerHit);
    const hitChance = Math.max(5, Math.min(95, raw)) / 100;
    if (nextFloat(rng) > hitChance) {
      return { kind: 'miss' };
    }
  }

  // 2. Base ATK assembly
  const statusAtk =
    input.attackerStr + Math.floor(input.attackerStr / 10) ** 2
    + Math.floor(input.attackerDex / 5) + Math.floor(input.attackerLuk / 5);

  const range = weaponDamageRange(input.weaponAtk, input.attackerDex);
  const weaponAtk = isCritRoll ? range.max : (range.min + nextFloat(rng) * (range.max - range.min));

  const refineAtk = weaponRefineAtk(input.weaponRefine, input.weaponLevel);
  const ammoAtk = input.ammunitionAtk ?? 0;
  const flatFromCards = input.cardMods.attackFlat;
  const pctFromCards = input.cardMods.attackPercent / 100;
  const pctFromGear = (input.attackPercentBonus ?? 0) / 100;

  const baseAtk =
    (statusAtk + weaponAtk + refineAtk + ammoAtk + flatFromCards)
    * (1 + pctFromCards + pctFromGear);

  // 3. Skill multiplier
  const skillMult = input.skillMultiplier ?? 1;
  let dmg = baseAtk * skillMult;

  // 4. Card damage multipliers (race × element × size — multiplicative)
  dmg *= cardDamageMultiplier(
    input.cardMods, input.targetRace, input.targetElement, input.targetSize,
  );

  // 5. Element multiplier (atk element vs target property)
  const atkEl = input.ammunitionElement ?? input.attackElement;
  dmg *= elementMultiplier(atkEl, input.targetElement, input.targetElementLevel);

  // 6. Weapon size penalty
  dmg *= weaponSizeModifier(input.weaponType, input.targetSize);

  // 7. Crit bonus
  const critMultiplier = input.skillCritMultiplier ?? 1.5;
  const canCrit = input.skillCanCrit !== false; // default true
  if (isCritRoll && canCrit) {
    dmg *= critMultiplier;
  }

  // 8. Target DEF (equip + VIT)
  if (!input.skillIgnoresDef) {
    dmg -= input.targetEquipDef + input.targetVitDef;
  }

  // 9. Target card reduction
  if (input.targetCardReduction) {
    // Defender-side element reductions (e.g. Raydric Card: -20% from Neutral)
    // are keyed on the ATTACK's element, which we look up via elementDefense.
    // Race-keyed reductions (Thara Frog) would require knowing the attacker's
    // race — for the MVP we expose that via targetCardReduction as-is.
    const reductionFromEl = input.targetCardReduction.elementDefense[input.targetElement] ?? 0;
    if (reductionFromEl > 0) {
      dmg *= 1 - reductionFromEl / 100;
    }
  }

  // Skill-level reduction (Energy Coat etc.)
  if (input.targetSkillReduction && input.targetSkillReduction > 0) {
    dmg *= 1 - Math.min(0.9, input.targetSkillReduction);
  }

  // 10. Floor at 1 (a hit always does ≥1 damage in pre-Renewal)
  const damage = Math.max(1, Math.floor(dmg));

  return { kind: 'hit', damage, isCrit: isCritRoll };
}
