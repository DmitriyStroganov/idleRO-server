/**
 * Item database (starter Archer branch).
 *
 * Weapons/armor use pre-Renewal stats from iRowiki classic items.
 * Cards are deliberately decomposed into CombatBonus[] so the damage
 * pipeline can stack them correctly.
 */

import type { CardDef, CardId, ItemDef, ItemId } from '@engine/types';

// ============================================================================
// Weapons — Archer line
// ============================================================================

export const ITEMS: Record<ItemId, ItemDef> = {
  // === Bows ===
  Item_Weapon_NoviceKnife: {
    id: 'Item_Weapon_NoviceKnife', name: 'Novice Knife',
    type: 'weapon', weaponLevel: 1, weaponType: 'Dagger',
    attack: 10, slots: 0, refineable: false, weight: 20,
    spriteKey: 'Sprite_Weapon_Knife',
  },
  Item_Weapon_NoviceBow: {
    id: 'Item_Weapon_NoviceBow', name: 'Novice Bow',
    type: 'weapon', weaponLevel: 1, weaponType: 'Bow',
    attack: 14, slots: 0, refineable: true, weight: 40,
    spriteKey: 'Sprite_Weapon_Bow_Basic',
  },
  Item_Weapon_CompositeBow: {
    id: 'Item_Weapon_CompositeBow', name: 'Composite Bow [3]',
    type: 'weapon', weaponLevel: 1, weaponType: 'Bow',
    attack: 29, slots: 3, refineable: true, weight: 90,
    spriteKey: 'Sprite_Weapon_Bow_Composite',
  },
  Item_Weapon_CrossBow: {
    id: 'Item_Weapon_CrossBow', name: 'CrossBow [2]',
    type: 'weapon', weaponLevel: 2, weaponType: 'Bow',
    attack: 65, slots: 2, refineable: true, weight: 90,
    spriteKey: 'Sprite_Weapon_Bow_Cross',
  },
  Item_Weapon_GakkungBow: {
    id: 'Item_Weapon_GakkungBow', name: 'Gakkung Bow [2]',
    type: 'weapon', weaponLevel: 3, weaponType: 'Bow',
    attack: 82, slots: 2, refineable: true, weight: 100,
    spriteKey: 'Sprite_Weapon_Bow_Gakkung',
  },
  Item_Weapon_HunterBow: {
    id: 'Item_Weapon_HunterBow', name: 'Hunter Bow',
    type: 'weapon', weaponLevel: 3, weaponType: 'Bow',
    attack: 125, slots: 0, refineable: true, weight: 200,
    requiredJob: ['Hunter'],
    spriteKey: 'Sprite_Weapon_Bow_Hunter',
  },
  Item_Weapon_BowOfRoguesTreasure: {
    id: 'Item_Weapon_BowOfRoguesTreasure', name: "Bow of Rogue's Treasure",
    type: 'weapon', weaponLevel: 4, weaponType: 'Bow',
    attack: 100, slots: 1, refineable: true, weight: 100,
    spriteKey: 'Sprite_Weapon_Bow_Rogue',
  },

  // === Ammunition ===
  Item_Ammo_Arrow: {
    id: 'Item_Ammo_Arrow', name: 'Arrow',
    type: 'ammunition', attack: 25, slots: 0, refineable: false, weight: 1,
  },
  Item_Ammo_FireArrow: {
    id: 'Item_Ammo_FireArrow', name: 'Fire Arrow',
    type: 'ammunition', attack: 25, slots: 0, refineable: false, weight: 1,
    element: 'Fire',
  },
  Item_Ammo_SilverArrow: {
    id: 'Item_Ammo_SilverArrow', name: 'Silver Arrow',
    type: 'ammunition', attack: 30, slots: 0, refineable: false, weight: 1,
    element: 'Holy',
  },

  // === Armor (Archer-relevant) ===
  Item_Armor_CottonShirt: {
    id: 'Item_Armor_CottonShirt', name: 'Cotton Shirt',
    type: 'armor', armorSlot: 'Armor', defense: 1,
    slots: 0, refineable: false, weight: 10,
    spriteKey: 'Sprite_Armor_CottonShirt',
  },
  Item_Armor_LeatherJacket: {
    id: 'Item_Armor_LeatherJacket', name: 'Leather Jacket',
    type: 'armor', armorSlot: 'Armor', defense: 6,
    slots: 0, refineable: true, weight: 60,
    spriteKey: 'Sprite_Armor_Leather',
  },
  Item_Armor_Tights: {
    id: 'Item_Armor_Tights', name: 'Tights [1]',
    type: 'armor', armorSlot: 'Armor', defense: 11,
    slots: 1, refineable: true, weight: 80,
    requiredJob: ['Hunter', 'Sniper'],
    spriteKey: 'Sprite_Armor_Tights',
  },
  Item_Armor_SilkRobe: {
    id: 'Item_Armor_SilkRobe', name: 'Silk Robe',
    type: 'armor', armorSlot: 'Armor', defense: 4,
    magicDefense: 10,
    slots: 1, refineable: true, weight: 40,
    spriteKey: 'Sprite_Armor_SilkRobe',
  },

  // === Garment ===
  Item_Armor_Hood: {
    id: 'Item_Armor_Hood', name: 'Hood',
    type: 'armor', armorSlot: 'Garment', defense: 1,
    slots: 1, refineable: true, weight: 20,
    spriteKey: 'Sprite_Garment_Hood',
  },
  Item_Armor_Muffler: {
    id: 'Item_Armor_Muffler', name: 'Muffler',
    type: 'armor', armorSlot: 'Garment', defense: 2,
    slots: 1, refineable: true, weight: 40,
    spriteKey: 'Sprite_Garment_Muffler',
  },

  // === Shoes ===
  Item_Armor_Sandals: {
    id: 'Item_Armor_Sandals', name: 'Sandals',
    type: 'armor', armorSlot: 'Shoes', defense: 1,
    slots: 1, refineable: true, weight: 20,
    spriteKey: 'Sprite_Shoes_Sandals',
  },
  Item_Armor_Boots: {
    id: 'Item_Armor_Boots', name: 'Boots',
    type: 'armor', armorSlot: 'Shoes', defense: 2,
    slots: 1, refineable: true, weight: 60,
    spriteKey: 'Sprite_Shoes_Boots',
  },

  // === Headgear (top) ===
  Item_Hat_Sakkat: {
    id: 'Item_Hat_Sakkat', name: 'Sakkat',
    type: 'armor', armorSlot: 'HeadTop', defense: 3,
    slots: 0, refineable: true, weight: 40,
    spriteKey: 'Sprite_Hat_Sakkat',
  },
  Item_Hat_Cap: {
    id: 'Item_Hat_Cap', name: 'Cap',
    type: 'armor', armorSlot: 'HeadTop', defense: 2,
    slots: 1, refineable: true, weight: 20,
    spriteKey: 'Sprite_Hat_Cap',
  },
  Item_Hat_FeatherBand: {
    id: 'Item_Hat_FeatherBand', name: 'Feather Band',
    type: 'armor', armorSlot: 'HeadTop', defense: 2,
    slots: 0, refineable: true, weight: 30,
    spriteKey: 'Sprite_Hat_FeatherBand',
  },

  // === Consumables ===
  Item_Consum_RedPotion: {
    id: 'Item_Consum_RedPotion', name: 'Red Potion',
    type: 'consumable', slots: 0, refineable: false, weight: 10,
  },
  Item_Consum_OrangePotion: {
    id: 'Item_Consum_OrangePotion', name: 'Orange Potion',
    type: 'consumable', slots: 0, refineable: false, weight: 15,
  },

  // === Etc / loot ===
  Item_Jellopy: { id: 'Item_Jellopy', name: 'Jellopy', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_Feather: { id: 'Item_Feather', name: 'Feather', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_Apple: { id: 'Item_Apple', name: 'Apple', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_Carrot: { id: 'Item_Carrot', name: 'Carrot', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_Spore: { id: 'Item_Spore', name: 'Spore', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_RedHerb: { id: 'Item_RedHerb', name: 'Red Herb', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_WhiteHerb: { id: 'Item_WhiteHerb', name: 'White Herb', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_MushroomSpore: { id: 'Item_MushroomSpore', name: 'Mushroom Spore', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_WolfClaw: { id: 'Item_WolfClaw', name: 'Wolf Claw', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_AnimalSkin: { id: 'Item_AnimalSkin', name: 'Animal Skin', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_RawMeat: { id: 'Item_RawMeat', name: 'Raw Meat', type: 'etc', slots: 0, refineable: false, weight: 2 },
  Item_Pet_Egg_Lunatic: { id: 'Item_Pet_Egg_Lunatic', name: 'Lunatic Egg', type: 'etc', slots: 0, refineable: false, weight: 1 },
  Item_TigerSkin: { id: 'Item_TigerSkin', name: 'Tiger Skin', type: 'etc', slots: 0, refineable: false, weight: 10 },
  Item_BurningHeart: { id: 'Item_BurningHeart', name: 'Burning Heart', type: 'etc', slots: 0, refineable: false, weight: 5 },
  Item_OldVioletBox: { id: 'Item_OldVioletBox', name: 'Old Violet Box', type: 'etc', slots: 0, refineable: false, weight: 30 },

  // === Refine materials ===
  Item_Phracon: { id: 'Item_Phracon', name: 'Phracon', type: 'etc', slots: 0, refineable: false, weight: 10 },
  Item_Emveretarcon: { id: 'Item_Emveretarcon', name: 'Emveretarcon', type: 'etc', slots: 0, refineable: false, weight: 10 },
  Item_Oridecon: { id: 'Item_Oridecon', name: 'Oridecon', type: 'etc', slots: 0, refineable: false, weight: 20 },
};

export function getItem(id: ItemId): ItemDef {
  const it = ITEMS[id];
  if (!it) throw new Error(`Unknown item id: ${id}`);
  return it;
}

// ============================================================================
// Cards (starter selection that demonstrates every CombatBonus category)
// ============================================================================

export const CARDS: Record<CardId, CardDef> = {
  Card_Lunatic: {
    id: 'Card_Lunatic', name: 'Lunatic Card',
    slot: 'Weapon',
    bonuses: [{ kind: 'critRate', value: 1 }],
    description: '+1 CRIT. Lucky bunny.',
  },
  Card_Spore: {
    id: 'Card_Spore', name: 'Spore Card',
    slot: 'Armor',
    bonuses: [{ kind: 'statBonus', stat: 'VIT', value: 1 }],
  },
  Card_Wolf: {
    id: 'Card_Wolf', name: 'Wolf Card',
    slot: 'Weapon',
    bonuses: [{ kind: 'attackFlat', value: 15 }],
  },
  Card_Savage: {
    id: 'Card_Savage', name: 'Savage Card',
    slot: 'Armor',
    bonuses: [{ kind: 'hpPercent', value: 23 }],
    description: 'A warrior card. +23% MaxHP (pre-Renewal value).',
  },

  // === Iconic RO cards (race/element/size categories) ===
  Card_Hydra: {
    id: 'Card_Hydra', name: 'Hydra Card',
    slot: 'Weapon',
    bonuses: [{ kind: 'raceDamage', target: 'DemiHuman', value: 20 }],
    description: 'CLASSIC: +20% damage vs DemiHuman.',
  },
  Card_Vadon: {
    id: 'Card_Vadon', name: 'Vadon Card',
    slot: 'Weapon',
    bonuses: [{ kind: 'elementDamage', target: 'Fire', value: 20 }],
  },
  Card_Minorous: {
    id: 'Card_Minorous', name: 'Minorous Card',
    slot: 'Weapon',
    bonuses: [{ kind: 'sizeDamage', target: 'Large', value: 15 }],
  },
  Card_SkeletonWorker: {
    id: 'Card_SkeletonWorker', name: 'Skeleton Worker Card',
    slot: 'Weapon',
    bonuses: [
      { kind: 'sizeDamage', target: 'Medium', value: 15 },
      { kind: 'attackFlat', value: 10 },
    ],
  },
  Card_Andre: {
    id: 'Card_Andre', name: 'Andre Card',
    slot: 'Weapon',
    bonuses: [{ kind: 'attackFlat', value: 20 }],
  },
  Card_SoldierSkeleton: {
    id: 'Card_SoldierSkeleton', name: 'Soldier Skeleton Card',
    slot: 'Weapon',
    bonuses: [{ kind: 'critRate', value: 9 }],
    description: 'The famous +9 CRIT card for crit-sins.',
  },

  Card_TharaFrog: {
    id: 'Card_TharaFrog', name: 'Thara Frog Card',
    slot: 'Shield',
    bonuses: [{ kind: 'raceDefense', target: 'DemiHuman', value: 30 }],
    description: '-30% damage from DemiHuman. PvP staple.',
  },
  Card_Raydric: {
    id: 'Card_Raydric', name: 'Raydric Card',
    slot: 'Garment',
    bonuses: [{ kind: 'elementDefense', target: 'Neutral', value: 20 }],
  },
  Card_Whisper: {
    id: 'Card_Whisper', name: 'Whisper Card',
    slot: 'Garment',
    bonuses: [{ kind: 'fleeFlat', value: 20 }],
  },
  Card_PecoPeco: {
    id: 'Card_PecoPeco', name: 'Peco Peco Card',
    slot: 'Armor',
    bonuses: [{ kind: 'hpPercent', value: 10 }],
  },
  Card_Matyr: {
    id: 'Card_Matyr', name: 'Matyr Card',
    slot: 'Shoes',
    bonuses: [
      { kind: 'hpPercent', value: 10 },
      { kind: 'statBonus', stat: 'AGI', value: 1 },
    ],
  },
  Card_Sohee: {
    id: 'Card_Sohee', name: 'Sohee Card',
    slot: 'Shoes',
    bonuses: [{ kind: 'spPercent', value: 15 }],
  },
  Card_Mummy: {
    id: 'Card_Mummy', name: 'Mummy Card',
    slot: 'Weapon',
    bonuses: [{ kind: 'hitFlat', value: 20 }],
  },

  // === MVP cards ===
  Card_Eddga: {
    id: 'Card_Eddga', name: 'Eddga Card',
    slot: 'Shoes',
    bonuses: [{ kind: 'custom', value: 0 }],
    description: 'Endure-effect when moving. (Custom hook.)',
  },
  Card_Ghostring: {
    id: 'Card_Ghostring', name: 'Ghostring Card',
    slot: 'Armor',
    bonuses: [
      { kind: 'elementDefense', target: 'Neutral', value: 75 },
      { kind: 'custom', value: 0 },
    ],
    description: 'Armor becomes Ghost 1. Reduces Neutral by 75%.',
  },
};

export const CARD_LIST: CardDef[] = Object.values(CARDS);

export const CARD_DB: ReadonlyMap<CardId, CardDef> = new Map(
  CARD_LIST.map((c) => [c.id, c]),
);

export function getCard(id: CardId): CardDef {
  const c = CARDS[id];
  if (!c) throw new Error(`Unknown card id: ${id}`);
  return c;
}
