/**
 * Tests for character operations (allocate / learn / equip / refine / socket).
 */

import { describe, it, expect } from 'vitest';
import {
  allocateStat,
  learnSkill,
  equipItem,
  unequipItem,
  canChangeJob,
  changeJob,
  giveItem,
  attemptRefine,
  socketCard,
  removeCard,
} from '@engine/character-ops';
import { createCharacter, recomputeCharacterStats } from '@engine/sim';
import { ITEMS } from '@data/items';

describe('allocateStat', () => {
  it('deducts stat points and increases the stat', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.statPoints = 100;
    const res = allocateStat(c, 'DEX');
    expect(res.ok).toBe(true);
    expect(c.stats.base.DEX).toBe(2);     // 1 → 2
    expect(c.statPoints).toBe(98);        // cost was 2
  });

  it('refuses when out of points', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.statPoints = 0;
    const res = allocateStat(c, 'STR');
    expect(res.ok).toBe(false);
  });

  it('uses the tiered cost (2 + floor(N/10))', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.statPoints = 1000;
    c.stats.base.STR = 10;
    allocateStat(c, 'STR');
    expect(c.statPoints).toBe(1000 - 3);  // cost 3 at STR=10
  });

  it('tops up HP/SP when VIT/INT allocated', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.statPoints = 100;
    const oldMaxHp = c.maxHp;
    allocateStat(c, 'VIT');
    expect(c.maxHp).toBeGreaterThan(oldMaxHp);
    expect(c.hp).toBe(c.maxHp);
  });
});

describe('learnSkill', () => {
  it('refuses skills from a different job', () => {
    const c = createCharacter({ jobId: 'Novice' });
    c.skillPoints = 10;
    const res = learnSkill(c, 'Skill_Archer_DoubleStrafe');
    expect(res.ok).toBe(false);
  });

  it('increments skill level and deducts a point', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.skillPoints = 5;
    const res = learnSkill(c, 'Skill_Archer_DoubleStrafe');
    expect(res.ok).toBe(true);
    expect(c.skills.Skill_Archer_DoubleStrafe).toBe(1);
    expect(c.skillPoints).toBe(4);
  });

  it('blocks at max level', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.skills.Skill_Archer_DoubleStrafe = 10;
    c.skillPoints = 5;
    const res = learnSkill(c, 'Skill_Archer_DoubleStrafe');
    expect(res.ok).toBe(false);
  });
});

describe('equipItem / unequipItem', () => {
  it('equips a weapon from inventory and swaps the previous one back', () => {
    const c = createCharacter({ jobId: 'Archer' });
    // Pre-equip a Composite Bow
    c.equipment['Weapon'] = {
      uid: 'w1', itemId: 'Item_Weapon_CompositeBow', refine: 0, cards: [],
    };
    // Put a Hunter Bow in inventory (Hunter-restricted — but we're an Archer so should refuse)
    c.inventory.push({
      uid: 'w2', itemId: 'Item_Weapon_HunterBow', count: 1,
      instance: { uid: 'w2', itemId: 'Item_Weapon_HunterBow', refine: 0, cards: [] },
    });
    const res = equipItem(c, 'w2');
    expect(res.ok).toBe(false);  // Archer can't equip Hunter Bow
  });

  it('swaps equipment and stores the previous piece in inventory', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.equipment['Weapon'] = {
      uid: 'w1', itemId: 'Item_Weapon_NoviceBow', refine: 0, cards: [],
    };
    c.inventory.push({
      uid: 'w2', itemId: 'Item_Weapon_CompositeBow', count: 1,
      instance: { uid: 'w2', itemId: 'Item_Weapon_CompositeBow', refine: 0, cards: [] },
    });
    const res = equipItem(c, 'w2');
    expect(res.ok).toBe(true);
    expect(c.equipment['Weapon']?.itemId).toBe('Item_Weapon_CompositeBow');
    // Previous bow should be back in inventory.
    expect(c.inventory.some((e) => e.itemId === 'Item_Weapon_NoviceBow')).toBe(true);
  });

  it('unequip puts the piece back into inventory', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.equipment['Weapon'] = {
      uid: 'w1', itemId: 'Item_Weapon_NoviceBow', refine: 0, cards: [],
    };
    const res = unequipItem(c, 'Weapon');
    expect(res.ok).toBe(true);
    expect(c.equipment['Weapon']).toBeUndefined();
    expect(c.inventory.length).toBe(1);
  });
});

describe('giveItem', () => {
  it('adds stackable items to an existing stack', () => {
    const c = createCharacter({ jobId: 'Archer' });
    giveItem(c, 'Item_Consum_RedPotion', 3);
    expect(c.inventory[0]!.count).toBe(3);
    giveItem(c, 'Item_Consum_RedPotion', 2);
    expect(c.inventory[0]!.count).toBe(5);
  });

  it('creates separate equipment instances', () => {
    const c = createCharacter({ jobId: 'Archer' });
    giveItem(c, 'Item_Weapon_CompositeBow', 2);
    expect(c.inventory.length).toBe(2);
    expect(c.inventory[0]!.instance).toBeTruthy();
    expect(c.inventory[1]!.instance).toBeTruthy();
    expect(c.inventory[0]!.instance).not.toBe(c.inventory[1]!.instance);
  });
});

describe('canChangeJob / changeJob', () => {
  it('refuses when job level is too low', () => {
    const c = createCharacter({ jobId: 'Novice', jobLevel: 5 });
    const res = canChangeJob(c);
    expect(res.ok).toBe(false);
  });

  it('allows at job level 10 (Novice→Archer) and resets job level', () => {
    const c = createCharacter({ jobId: 'Novice', jobLevel: 10 });
    const check = canChangeJob(c);
    expect(check.ok).toBe(true);
    expect(check.to).toBe('Archer');
    const res = changeJob(c, 'Archer');
    expect(res.ok).toBe(true);
    expect(c.jobId).toBe('Archer');
    expect(c.jobLevel).toBe(1);
    expect(c.skillPoints).toBeGreaterThan(0);
  });
});

describe('attemptRefine', () => {
  it('refuses on non-refineable item', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.inventory.push({
      uid: 'p', itemId: 'Item_Consum_RedPotion', count: 1,
    });
    const res = attemptRefine(c, { itemUid: 'p', roll: 0 });
    expect(res.ok).toBe(false);
  });

  it('succeeds at +0 → +1 (rate 100%) and charges zeny + material', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.zeny = 10000;
    c.inventory.push({ uid: 'ph', itemId: 'Item_Phracon', count: 5 });
    c.equipment['Weapon'] = {
      uid: 'w', itemId: 'Item_Weapon_CompositeBow', refine: 0, cards: [],
    };
    const res = attemptRefine(c, { itemUid: 'w', roll: 0 });
    expect(res.ok).toBe(true);
    expect(res.newRefine).toBe(1);
    expect(c.equipment['Weapon']!.refine).toBe(1);
    // Phracon consumed.
    expect(c.inventory.find((e) => e.itemId === 'Item_Phracon')!.count).toBe(4);
    // Zeny reduced.
    expect(c.zeny).toBeLessThan(10000);
  });

  it('breaks the item on a failed +5+ attempt', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.zeny = 100000;
    c.inventory.push({ uid: 'o', itemId: 'Item_Oridecon', count: 5 });
    c.equipment['Weapon'] = {
      uid: 'w', itemId: 'Item_Weapon_HunterBow', refine: 7, cards: [],
    };
    // roll = 1.0 → failure guaranteed.
    const res = attemptRefine(c, { itemUid: 'w', roll: 1.0 });
    expect(res.ok).toBe(false);
    expect(res.broke).toBe(true);
    expect(c.equipment['Weapon']).toBeUndefined();
  });
});

describe('socketCard / removeCard', () => {
  it('sockets a card into an empty slot and removes one from inventory', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.equipment['Weapon'] = {
      uid: 'w', itemId: 'Item_Weapon_CompositeBow', refine: 0,
      cards: [null as never, null as never, null as never],  // 3 slots
    };
    c.inventory.push({ uid: 'hc', itemId: 'Card_Hydra', count: 2 });
    const res = socketCard(c, 'w', 'Card_Hydra');
    expect(res.ok).toBe(true);
    expect(c.equipment['Weapon']!.cards[0]).toBe('Card_Hydra');
    expect(c.inventory.find((e) => e.itemId === 'Card_Hydra')!.count).toBe(1);
  });

  it('refuses when slots are full', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.equipment['Weapon'] = {
      uid: 'w', itemId: 'Item_Weapon_CompositeBow', refine: 0,
      cards: ['Card_Hydra', 'Card_Hydra', 'Card_Hydra'],
    };
    c.inventory.push({ uid: 'hc', itemId: 'Card_Hydra', count: 2 });
    const res = socketCard(c, 'w', 'Card_Hydra');
    expect(res.ok).toBe(false);
  });

  it('removes a card from a slot and returns it to inventory', () => {
    const c = createCharacter({ jobId: 'Archer' });
    c.equipment['Weapon'] = {
      uid: 'w', itemId: 'Item_Weapon_CompositeBow', refine: 0,
      cards: ['Card_Andre', null as never, null as never],
    };
    const res = removeCard(c, 'w', 0);
    expect(res.ok).toBe(true);
    expect(c.equipment['Weapon']!.cards[0]).toBeNull();
    expect(c.inventory.some((e) => e.itemId === 'Card_Andre')).toBe(true);
  });
});

void ITEMS;
void recomputeCharacterStats;
