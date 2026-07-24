/**
 * Tests for attack range — player must walk to melee range before attacking.
 */

import { describe, it, expect } from 'vitest';
import { createWorld, stepWorld, createCharacter, recomputeCharacterStats } from '@engine/sim';
import { createRng } from '@engine/rng';
import { presetStrategy } from '@ai/preset-executor';
import { PRESETS } from '@ai/strategy';
import type { MobSpawn } from '@engine/types';

function setupWorld(spawns: MobSpawn[], playerX = 2) {
  const world = createWorld({ seed: 1, mapLength: 50, playerStartX: playerX, spawns });
  const player = createCharacter({ jobId: 'Archer', baseLevel: 20, jobLevel: 20 });
  player.atk = 999;
  player.stats.base.DEX = 99;
  recomputeCharacterStats(player);
  player.hp = player.maxHp;
  player.sp = player.maxSp;
  world.players.push(player);
  player.position.x = playerX;
  const strat = new Map([[player.uid, presetStrategy(PRESETS.aggressive)]]);
  const rng = createRng(1);
  return { world, player, strat, rng };
}

describe('attack range', () => {
  it('player does not damage mob when far away', () => {
    const { world, strat, rng } = setupWorld([
      { x: 20, mobId: 'Mob_Poring', respawnMs: 0, maxAlive: 1 },
    ], 2);

    // Run 1 tick — mob at x=20, player at x=2, distance=18 >> 1.5
    stepWorld(world, strat, rng);
    const mob = world.monsters.find((m) => m.hp > 0);
    expect(mob).toBeDefined();
    expect(mob!.hp).toBe(mob!.maxHp); // mob not damaged
  });

  it('player damages mob only when within melee range (1.5 cells)', () => {
    const { world, player, strat, rng } = setupWorld([
      { x: 5, mobId: 'Mob_Poring', respawnMs: 0, maxAlive: 1 },
    ], 2);

    let damaged = false;
    for (let i = 0; i < 200; i++) {
      stepWorld(world, strat, rng);
      const mob = world.monsters.find((m) => m.hp > 0);
      if (mob && mob.hp < mob.maxHp) {
        damaged = true;
        const distance = Math.abs(mob.position.x - player.position.x);
        expect(distance).toBeLessThanOrEqual(2.0);
        break;
      }
    }
    expect(damaged).toBe(true);
  });

  it('player walks toward mob (position changes over ticks)', () => {
    const { world, player, strat, rng } = setupWorld([
      { x: 20, mobId: 'Mob_Poring', respawnMs: 0, maxAlive: 1 },
    ], 2);

    const startX = player.position.x;
    for (let i = 0; i < 20; i++) stepWorld(world, strat, rng);
    expect(player.position.x).toBeGreaterThan(startX);
  });
});
