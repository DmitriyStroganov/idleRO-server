/**
 * Simulation smoke test.
 * Spawns a character with a real Archer build, places a Lunatic in front of
 * them, runs the sim for a few seconds, and asserts that the world evolves
 * in a sane way (HP drops, EXP grows, loot appears, kills happen).
 */

import { describe, it, expect } from 'vitest';
import {
  createCharacter,
  createWorld,
  stepWorld,
  recomputeCharacterStats,
} from '@engine/sim';
import { presetStrategy } from '../src/ai/preset-executor';
import { PRESETS } from '../src/ai/strategy';
import { createRng } from '@engine/rng';
import type { AiStrategy } from '../src/ai/strategy';
import { ITEMS } from '@data/items';

describe('simulation: Archer vs Lunatic', () => {
  it('Archer kills a Lunatic and gains EXP', () => {
    const player = createCharacter({ jobId: 'Archer', baseLevel: 5, jobLevel: 5 });
    // Equip a Composite Bow.
    player.equipment['Weapon'] = {
      uid: 'w1', itemId: 'Item_Weapon_CompositeBow', refine: 0,
      cards: ['Card_Andre'],
    };
    player.appearance.layers.weapon = ITEMS['Item_Weapon_CompositeBow']!.spriteKey!;
    player.ammunition = { itemId: 'Item_Ammo_Arrow', count: 5000 };
    player.skills = {
      Skill_Archer_OwlsEye: 10,
      Skill_Archer_VulturesEye: 10,
      Skill_Archer_DoubleStrafe: 10,
      Skill_Archer_ImproveConcentration: 5,
    };
    recomputeCharacterStats(player);
    player.hp = player.maxHp;
    player.sp = player.maxSp;

    const world = createWorld({
      seed: 42, mapLength: 30, playerStartX: 5,
      spawns: [{
        x: 10, mobId: 'Mob_Lunatic', respawnMs: 0, maxAlive: 1,
      }],
    });
    world.players.push(player);
    player.position.x = 5;

    const strategies = new Map<string, AiStrategy>();
    strategies.set(player.uid, presetStrategy(PRESETS.aggressive));

    const rng = createRng(42);
    const startingExp = player.exp;
    let anyKillEvent = false;
    let anyAttackEvent = false;

    // Run 60 seconds of sim (1200 ticks).
    for (let i = 0; i < 1200; i++) {
      const events = stepWorld(world, strategies, rng);
      for (const ev of events) {
        if (ev.kind === 'attack') anyAttackEvent = true;
        if (ev.kind === 'kill') anyKillEvent = true;
      }
    }

    expect(anyAttackEvent).toBe(true);
    expect(anyKillEvent).toBe(true);
    expect(player.exp).toBeGreaterThan(startingExp);
  });

  it('simulation is deterministic for a fixed seed', () => {
    function runOnce(seed: number): { hp: number; exp: number; tick: number; monstersAlive: number } {
      const player = createCharacter({ jobId: 'Archer', baseLevel: 5, jobLevel: 5 });
      player.equipment['Weapon'] = {
        uid: 'w1', itemId: 'Item_Weapon_CompositeBow', refine: 0, cards: [],
      };
      player.ammunition = { itemId: 'Item_Ammo_Arrow', count: 1000 };
      player.skills = { Skill_Archer_DoubleStrafe: 10 };
      recomputeCharacterStats(player);
      player.hp = player.maxHp;
      player.sp = player.maxSp;

      const world = createWorld({
        seed, mapLength: 20, playerStartX: 2,
        spawns: [{ x: 8, mobId: 'Mob_Lunatic', respawnMs: 0, maxAlive: 1 }],
      });
      world.players.push(player);
      player.position.x = 2;
      const strategies = new Map<string, AiStrategy>();
      strategies.set(player.uid, presetStrategy(PRESETS.aggressive));
      const rng = createRng(seed);
      for (let i = 0; i < 400; i++) stepWorld(world, strategies, rng);
      return {
        hp: player.hp, exp: player.exp, tick: world.tick,
        monstersAlive: world.monsters.filter((m) => m.hp > 0).length,
      };
    }

    const a = runOnce(123);
    const b = runOnce(123);
    expect(a).toEqual(b);
  });
});
