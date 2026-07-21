/**
 * Regression: Archer with low SP stuck facing two Lunatics.
 *
 * Bug: canCastNow used spCost[0] (level-1 cost) instead of the cost for the
 * player's current skill level. The AI would pick castSkill every tick,
 * executePlayerAction would silently bail (real SP cost too high), and the
 * player would stand still taking damage.
 *
 * Fix: canCastNow now uses spCost[currentLevel - 1] AND checks the skill
 * is actually learned.
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
import type { MobSpawn } from '@engine/types';

describe('regression: low-SP Archer must still auto-attack', () => {
  it('attacks even when Improve Concentration cannot be afforded', () => {
    const player = createCharacter({ jobId: 'Archer', baseLevel: 5, jobLevel: 5 });
    player.equipment['Weapon'] = {
      uid: 'w1', itemId: 'Item_Weapon_CompositeBow', refine: 0, cards: [],
    };
    player.ammunition = { itemId: 'Item_Ammo_Arrow', count: 5000 };
    // Improve Concentration is learned at level 5 — its real SP cost is 16.
    // At base 5 / INT 1 the Archer's maxSp is only ~4, so the buff can NEVER
    // be cast. The AI must fall through to auto-attack rather than stall.
    player.skills = {
      Skill_Archer_ImproveConcentration: 5,
      Skill_Archer_DoubleStrafe: 10,    // also too expensive at this maxSp
    };
    recomputeCharacterStats(player);
    player.hp = player.maxHp;
    player.sp = player.maxSp;

    // Two Lunatics right on top of the player.
    const spawns: MobSpawn[] = [
      { x: 6, mobId: 'Mob_Lunatic', respawnMs: 0, maxAlive: 1 },
      { x: 6, mobId: 'Mob_Lunatic', respawnMs: 0, maxAlive: 1 },
    ];
    const world = createWorld({ seed: 1, mapLength: 20, playerStartX: 5, spawns });
    world.players.push(player);
    player.position.x = 5;

    const strategies = new Map<string, AiStrategy>();
    strategies.set(player.uid, presetStrategy(PRESETS.aggressive));
    const rng = createRng(1);

    let attacks = 0;
    let firstAttackTick = -1;
    for (let i = 0; i < 400; i++) {     // 20 seconds
      const events = stepWorld(world, strategies, rng);
      for (const ev of events) {
        if (ev.kind === 'attack' && ev.attackerUid === player.uid) {
          if (firstAttackTick < 0) firstAttackTick = world.tick;
          attacks++;
        }
      }
    }

    expect(firstAttackTick).toBeGreaterThan(-1);
    expect(attacks).toBeGreaterThan(5);
  });
});
