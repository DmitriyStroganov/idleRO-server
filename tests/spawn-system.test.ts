/**
 * Tests for the spawn system — prevents double-spawn during death animation.
 */

import { describe, it, expect } from 'vitest';
import { createWorld, stepWorld, createCharacter, recomputeCharacterStats } from '@engine/sim';
import { createRng } from '@engine/rng';
import { presetStrategy } from '@ai/preset-executor';
import { PRESETS } from '@ai/strategy';
import type { MobSpawn } from '@engine/types';

function setupWorld(spawns: MobSpawn[], playerX = 10) {
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

describe('spawn system', () => {
  it('respects maxAlive=1 — only 1 monster from a spawn point', () => {
    const { world, strat, rng } = setupWorld([
      { x: 15, mobId: 'Mob_Poring', respawnMs: 0, maxAlive: 1 },
    ]);

    for (let i = 0; i < 50; i++) stepWorld(world, strat, rng);

    const porings = world.monsters.filter((m) => m.mobId === 'Mob_Poring');
    expect(porings.length).toBeLessThanOrEqual(1);
  });

  it('does NOT spawn a second monster while corpse is in death animation', () => {
    const { world, strat, rng } = setupWorld([
      { x: 12, mobId: 'Mob_Lunatic', respawnMs: 0, maxAlive: 1 },
    ]);

    // Kill the mob
    let killed = false;
    for (let i = 0; i < 100; i++) {
      const events = stepWorld(world, strat, rng);
      if (events.some((e) => e.kind === 'kill')) { killed = true; break; }
    }
    expect(killed).toBe(true);

    // Mob is dead but still in array. Run 10 ticks — no new spawn.
    for (let i = 0; i < 10; i++) stepWorld(world, strat, rng);
    const count = world.monsters.filter((m) => m.mobId === 'Mob_Lunatic').length;
    expect(count).toBe(1); // still just the dead one
  });

  it('spawns a new monster after corpse is cleaned up (>1s)', () => {
    const { world, strat, rng } = setupWorld([
      { x: 12, mobId: 'Mob_Lunatic', respawnMs: 0, maxAlive: 1 },
    ]);

    // Kill mob
    for (let i = 0; i < 100; i++) {
      stepWorld(world, strat, rng);
      if (world.monsters.some((m) => m.hp <= 0)) break;
    }

    // Run 30 ticks (1.5s) — corpse removed, new mob spawned
    for (let i = 0; i < 30; i++) stepWorld(world, strat, rng);
    const alive = world.monsters.filter((m) => m.hp > 0 && m.mobId === 'Mob_Lunatic');
    expect(alive.length).toBe(1);
  });

  it('respects maxAlive for multiple spawn points', () => {
    const spawns: MobSpawn[] = [
      { x: 15, mobId: 'Mob_Poring', respawnMs: 0, maxAlive: 2 },
      { x: 25, mobId: 'Mob_Lunatic', respawnMs: 0, maxAlive: 1 },
    ];
    const { world, strat, rng } = setupWorld(spawns);

    for (let i = 0; i < 50; i++) stepWorld(world, strat, rng);

    const porings = world.monsters.filter((m) => m.spawnDescriptor === spawns[0]);
    const lunatics = world.monsters.filter((m) => m.spawnDescriptor === spawns[1]);
    expect(porings.length).toBeLessThanOrEqual(2);
    expect(lunatics.length).toBeLessThanOrEqual(1);
  });
});
