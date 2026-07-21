/**
 * Card modifier aggregation (pre-Renewal).
 *
 * Cards in RO add bonuses from many distinct categories. Two key rules:
 *   1. Within a category, bonuses STACK ADDITIVELY (e.g. 3× Hydra = +60%).
 *   2. Categories MULTIPLY against each other in the damage formula.
 *
 * This file produces a flat, queryable `CardModifiers` object from a list of
 * card ids. The damage pipeline consumes it without knowing about cards.
 */

import type {
  BaseStats,
  CardDef,
  CardId,
  CombatBonus,
  Element,
  Race,
  Size,
  StatKey,
} from '@engine/types';
import { STAT_KEYS } from '@engine/types';

// Cast helpers — CombatBonus.target is a union, so we narrow per category.
const asRace = (t: unknown): Race => t as Race;
const asElement = (t: unknown): Element => t as Element;
const asSize = (t: unknown): Size => t as Size;

/** Per-category aggregated modifiers ready for the damage pipeline. */
export interface CardModifiers {
  /** +X% damage vs Race — added across cards of same race. */
  raceDamage: Partial<Record<Race, number>>;
  /** +X% damage vs Element — added across cards of same element. */
  elementDamage: Partial<Record<Element, number>>;
  /** +X% damage vs Size — added across cards of same size. */
  sizeDamage: Partial<Record<Size, number>>;

  /** -X% damage taken from Race (defender perspective). */
  raceDefense: Partial<Record<Race, number>>;
  /** -X% damage taken from Element. */
  elementDefense: Partial<Record<Element, number>>;

  critRate: number;          // sum
  attackFlat: number;        // sum
  attackPercent: number;     // sum, applied as +X% of total ATK
  fleeFlat: number;
  hitFlat: number;
  hpPercent: number;
  spPercent: number;
  aspdPercent: number;
  castTimePercent: number;   // reduction, applied as 1 - X/100
  afterCastPercent: number;
  stats: Partial<BaseStats>;

  /** One-off custom hooks (Ghostring, GTB). Pipeline may special-case by id. */
  custom: { cardId: CardId; bonus: CombatBonus }[];
}

export function emptyCardModifiers(): CardModifiers {
  return {
    raceDamage: {},
    elementDamage: {},
    sizeDamage: {},
    raceDefense: {},
    elementDefense: {},
    critRate: 0,
    attackFlat: 0,
    attackPercent: 0,
    fleeFlat: 0,
    hitFlat: 0,
    hpPercent: 0,
    spPercent: 0,
    aspdPercent: 0,
    castTimePercent: 0,
    afterCastPercent: 0,
    stats: {},
    custom: [],
  };
}

function addStatBonus(out: CardModifiers, stat: StatKey, value: number): void {
  out.stats[stat] = (out.stats[stat] ?? 0) + value;
}

/** Apply a single combat bonus to the running aggregate. */
function applyBonus(out: CardModifiers, cardId: CardId, bonus: CombatBonus): void {
  switch (bonus.kind) {
    case 'raceDamage': {
      const r = asRace(bonus.target);
      out.raceDamage[r] = (out.raceDamage[r] ?? 0) + bonus.value;
      break;
    }
    case 'elementDamage': {
      const e = asElement(bonus.target);
      out.elementDamage[e] = (out.elementDamage[e] ?? 0) + bonus.value;
      break;
    }
    case 'sizeDamage': {
      const s = asSize(bonus.target);
      out.sizeDamage[s] = (out.sizeDamage[s] ?? 0) + bonus.value;
      break;
    }
    case 'raceDefense': {
      const r = asRace(bonus.target);
      out.raceDefense[r] = (out.raceDefense[r] ?? 0) + bonus.value;
      break;
    }
    case 'elementDefense': {
      const e = asElement(bonus.target);
      out.elementDefense[e] = (out.elementDefense[e] ?? 0) + bonus.value;
      break;
    }
    case 'critRate':         out.critRate += bonus.value; break;
    case 'attackFlat':       out.attackFlat += bonus.value; break;
    case 'attackPercent':    out.attackPercent += bonus.value; break;
    case 'fleeFlat':         out.fleeFlat += bonus.value; break;
    case 'hitFlat':          out.hitFlat += bonus.value; break;
    case 'hpPercent':        out.hpPercent += bonus.value; break;
    case 'spPercent':        out.spPercent += bonus.value; break;
    case 'aspdFlat':         out.aspdPercent += bonus.value; break;
    case 'castTimePercent':  out.castTimePercent += bonus.value; break;
    case 'afterCastPercent': out.afterCastPercent += bonus.value; break;
    case 'statBonus':
      if (bonus.stat) addStatBonus(out, bonus.stat, bonus.value);
      break;
    case 'custom':
      out.custom.push({ cardId, bonus });
      break;
    default:
      // If CombatBonus.kind gains a new variant we won't notice at compile time
      // (CombatBonus is a single interface, not a discriminated union), so
      // runtime behaviour here is to ignore unknown kinds.
      break;
  }
}

/**
 * Aggregate all bonuses from a list of card ids.
 *
 * @param cardIds     flat list of cards from ALL equipped gear
 * @param cardDb      lookup table
 */
export function aggregateCards(
  cardIds: readonly CardId[],
  cardDb: ReadonlyMap<CardId, CardDef>,
): CardModifiers {
  const out = emptyCardModifiers();
  for (const id of cardIds) {
    const def = cardDb.get(id);
    if (!def) continue;
    for (const bonus of def.bonuses) {
      applyBonus(out, id, bonus);
    }
  }
  return out;
}

/** Total +X% damage vs (race, element, size) — multiplied across categories. */
export function cardDamageMultiplier(
  mods: CardModifiers,
  race: Race,
  element: Element,
  size: Size,
): number {
  const r = (mods.raceDamage[race] ?? 0) / 100;
  const e = (mods.elementDamage[element] ?? 0) / 100;
  const s = (mods.sizeDamage[size] ?? 0) / 100;
  return (1 + r) * (1 + e) * (1 + s);
}

/** Total -X% damage taken from (race, element) — multiplied across categories. */
export function cardDamageReduction(
  mods: CardModifiers,
  race: Race,
  element: Element,
): number {
  const r = (mods.raceDefense[race] ?? 0) / 100;
  const e = (mods.elementDefense[element] ?? 0) / 100;
  return Math.max(0, 1 - r - e);
}

/** Total stats bonus from cards. */
export function cardStatBonuses(mods: CardModifiers): BaseStats {
  const out = {} as BaseStats;
  for (const k of STAT_KEYS) {
    out[k] = mods.stats[k] ?? 0;
  }
  return out;
}
