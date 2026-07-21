/**
 * Loot tables for monsters (pre-Renewal drop rates).
 *
 * Cards drop at 0.01% (1/10000) — the canonical RO drop rate for normal mobs.
 * MVP bosses have higher card rates (often 0.1%..10%) and rare drops.
 */

export interface LootEntry {
  itemId: string;
  /** Drop chance 0..1. */
  chance: number;
  /** Quantity range. */
  min: number;
  max: number;
  /** If true, this is a "rare" (card) — visual emphasis in UI. */
  rare?: boolean;
}

export interface LootTable {
  id: string;
  entries: LootEntry[];
}

export const LOOT_TABLES: Record<string, LootTable> = {
  Loot_Lunatic: {
    id: 'Loot_Lunatic',
    entries: [
      { itemId: 'Item_Carrot', chance: 0.55, min: 1, max: 1 },
      { itemId: 'Item_Apple', chance: 0.40, min: 1, max: 1 },
      { itemId: 'Item_Jellopy', chance: 0.70, min: 1, max: 2 },
      { itemId: 'Item_Feather', chance: 0.20, min: 1, max: 1 },
      { itemId: 'Item_Pet_Egg_Lunatic', chance: 0.02, min: 1, max: 1 },
      { itemId: 'Card_Lunatic', chance: 0.0001, min: 1, max: 1, rare: true },
    ],
  },
  Loot_Spore: {
    id: 'Loot_Spore',
    entries: [
      { itemId: 'Item_Spore', chance: 0.65, min: 1, max: 1 },
      { itemId: 'Item_RedHerb', chance: 0.30, min: 1, max: 2 },
      { itemId: 'Item_MushroomSpore', chance: 0.20, min: 1, max: 1 },
      { itemId: 'Card_Spore', chance: 0.0001, min: 1, max: 1, rare: true },
    ],
  },
  Loot_Wolf: {
    id: 'Loot_Wolf',
    entries: [
      { itemId: 'Item_WolfClaw', chance: 0.50, min: 1, max: 2 },
      { itemId: 'Item_AnimalSkin', chance: 0.25, min: 1, max: 1 },
      { itemId: 'Item_RedHerb', chance: 0.20, min: 1, max: 1 },
      { itemId: 'Card_Wolf', chance: 0.0001, min: 1, max: 1, rare: true },
    ],
  },
  Loot_Savage: {
    id: 'Loot_Savage',
    entries: [
      { itemId: 'Item_AnimalSkin', chance: 0.55, min: 1, max: 2 },
      { itemId: 'Item_RawMeat', chance: 0.40, min: 1, max: 1 },
      { itemId: 'Item_WhiteHerb', chance: 0.10, min: 1, max: 1 },
      { itemId: 'Card_Savage', chance: 0.0001, min: 1, max: 1, rare: true },
    ],
  },
  Loot_Eddga: {
    id: 'Loot_Eddga',
    entries: [
      { itemId: 'Item_TigerSkin', chance: 1.0, min: 1, max: 3 },
      { itemId: 'Item_BurningHeart', chance: 0.5, min: 1, max: 1 },
      { itemId: 'Item_OldVioletBox', chance: 0.3, min: 1, max: 1 },
      { itemId: 'Item_Apple', chance: 0.5, min: 1, max: 3 },
      { itemId: 'Card_Eddga', chance: 0.10, min: 1, max: 1, rare: true },
    ],
  },
};

export function getLootTable(id: string): LootTable {
  return LOOT_TABLES[id] ?? { id, entries: [] };
}
