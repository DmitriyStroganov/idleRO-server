/**
 * The simulation core. Pure logic — no DOM, no rendering.
 *
 * - Fixed tick rate: 20 tps (TICK_MS = 50).
 * - Deterministic: same (initial world, seed, strategies) → same outcome.
 * - Sim exposes `stepWorld(world, strategies, rng)` which advances the world
 *   by exactly one tick. The renderer calls this from the main loop.
 *
 * Responsibilities:
 *   - Spawn / respawn monsters
 *   - Run each Character's AI strategy
 *   - Execute the chosen Action (move, attack, cast, loot, item)
 *   - Apply damage, status effects, deaths
 *   - Drop loot
 *   - Award EXP on kills
 */

import type {
  Action,
  ArmorSlot,
  Character,
  DroppedItem,
  Entity,
  EquipmentInstance,
  InventoryEntry,
  MobSpawn,
  Monster,
  SkillDef,
  SkillId,
  World,
} from '@engine/types';
import { TICK_MS } from '@engine/types';
import type { CardModifiers } from '@engine/formulas/cards';
import { createRng, nextInt, nextFloat, type RngState } from '@engine/rng';
import { MOBS } from '@data/mobs';
import { SKILLS } from '@data/skills';
import { ITEMS, CARD_DB } from '@data/items';
import { JOBS } from '@data/jobs';
import { getLootTable } from '@data/loot';
import { aggregateCards } from '@engine/formulas/cards';
import { computePhysicalDamage } from '@engine/formulas/damage';
import { amotionMs, aspd } from '@engine/formulas/aspd';
import { castTimeMs, afterCastMs } from '@engine/formulas/cast';
import {
  effectiveStats,
  flee,
  hit,
  maxHp,
  maxSp,
} from '@engine/formulas/stats';
import { armorRefineDef } from '@engine/formulas/refine';
import type { AiStrategy } from '../ai/strategy';

// ============================================================================
// World construction
// ============================================================================

export interface WorldInit {
  seed: number;
  mapLength: number;
  playerStartX: number;
  spawns: MobSpawn[];
}

export function createWorld(init: WorldInit): World {
  const tiles = new Array(init.mapLength).fill(null).map(() => ({ type: 0 }));
  return {
    tick: 0,
    seed: init.seed,
    map: {
      id: 'map:default',
      name: 'Training Field',
      length: init.mapLength,
      bandHeight: 3,
      tiles,
      spawnPoints: init.spawns,
      playerStartX: init.playerStartX,
      offlineSafe: true,
    },
    players: [],
    monsters: [],
    droppedItems: [],
  };
}

// ============================================================================
// Player / monster creation
// ============================================================================

let nextUid = 1;
function newUid(prefix: string): string {
  return `${prefix}:${nextUid++}`;
}

/** Create a fresh Novice at base/job level 1. */
export function createCharacter(opts: {
  jobId?: typeof JOBS[keyof typeof JOBS]['id'];
  baseLevel?: number;
  jobLevel?: number;
  name?: string;
}): Character {
  const jobId = opts.jobId ?? 'Novice';
  const job = JOBS[jobId];
  const baseLevel = opts.baseLevel ?? 1;
  const jobLevel = opts.jobLevel ?? 1;
  const baseStats = { ...job.baseStats };
  const uid = newUid('player');

  const character: Character = {
    uid,
    kind: 'player',
    position: { x: 0, y: 0 },
    facing: 0,
    spriteKey: `Body_${jobId}`,
    hp: 1,
    maxHp: 1,
    sp: 0,
    maxSp: 0,
    statusEffects: [],
    nextAttackAt: 0,
    castFinishAt: 0,
    moveSpeed: 3,
    sprite: { animation: 'idle', startedAt: 0, facing: 'right' },
    jobId,
    baseLevel,
    jobLevel,
    exp: 0,
    jobExp: 0,
    statPoints: 48,
    skillPoints: 0,
    zeny: 0,
    stats: { base: baseStats, equip: zeroStats(), buff: zeroStats() },
    skills: {},
    equipment: {},
    inventory: [],
    appearance: {
      layers: { body: `Body_${jobId}` },
      hairColor: 0,
      clothColor: 0,
      skinColor: 0,
      scale: 1,
    },
    lastSeenAt: Date.now(),
    offlineBaseline: { expPerMin: 0, jobExpPerMin: 0, sampledAt: 0 },
    offlineMode: false,
  };

  recomputeCharacterStats(character);
  character.hp = character.maxHp;
  character.sp = character.maxSp;
  return character;
}

export function createMonster(mobId: keyof typeof MOBS, x: number, spawn?: MobSpawn): Monster {
  const def = MOBS[mobId];
  if (!def) throw new Error(`Unknown mob: ${mobId}`);
  const uid = newUid('mob');
  return {
    uid,
    kind: 'monster',
    position: { x, y: 0 },
    facing: Math.PI,
    spriteKey: def.spriteKey,
    hp: def.baseHp,
    maxHp: def.baseHp,
    sp: def.baseSp,
    maxSp: def.baseSp,
    statusEffects: [],
    nextAttackAt: 0,
    castFinishAt: 0,
    moveSpeed: def.moveSpeed,
    sprite: { animation: 'idle', startedAt: 0, facing: 'left' },
    mobId,
    spawnX: x,
    spawnDescriptor: spawn,
  };
}

// ============================================================================
// Stats recompute — central place that keeps derived values in sync
// ============================================================================

/** Recompute maxHp/maxSp/equip-stats from current equipment + cards. */
export function recomputeCharacterStats(c: Character): void {
  const job = JOBS[c.jobId];
  const equipStats = collectEquipStats(c);
  const cardsMods = collectCardModifiers(c);

  // Add card stat bonuses to equip block
  for (const k of Object.keys(cardsMods.stats) as (keyof typeof c.stats.equip)[]) {
    equipStats[k] += cardsMods.stats[k] ?? 0;
  }
  c.stats.equip = equipStats;

  const eff = effectiveStats(c.stats);

  const hpPct = cardsMods.hpPercent;
  const spPct = cardsMods.spPercent;

  c.maxHp = maxHp(c.baseLevel, eff.VIT, job, { percentBonus: hpPct });
  c.maxSp = maxSp(c.baseLevel, eff.INT, job, { percentBonus: spPct });
  c.hp = Math.min(c.hp, c.maxHp);
  c.sp = Math.min(c.sp, c.maxSp);
}

function collectEquipStats(c: Character): Character['stats']['equip'] {
  const out = zeroStats();
  for (const slot of Object.keys(c.equipment) as ArmorSlot[]) {
    const inst = c.equipment[slot];
    if (!inst) continue;
    const def = ITEMS[inst.itemId];
    if (!def) continue;
    // Stat bonuses from items are usually 0 in pre-Renewal starter gear;
    // future items with stat bonuses would add them here.
  }
  return out;
}

function collectCardModifiers(c: Character): CardModifiers {
  const ids: string[] = [];
  for (const slot of Object.keys(c.equipment) as ArmorSlot[]) {
    const inst = c.equipment[slot];
    if (!inst) continue;
    for (const cardId of inst.cards) ids.push(cardId);
  }
  return aggregateCards(ids, CARD_DB);
}

// ============================================================================
// Public combat helpers (used by AI / scripts)
// ============================================================================

export interface CharacterCombatView {
  effStr: number;
  effAgi: number;
  effVit: number;
  effInt: number;
  effDex: number;
  effLuk: number;
  attackElement: import('@engine/types').Element;
  weaponType: import('@engine/types').WeaponType;
  weaponLevel: import('@engine/types').WeaponLevel;
  weaponAtk: number;
  weaponRefine: number;
  ammunitionAtk?: number;
  ammunitionElement?: import('@engine/types').Element;
  cardMods: CardModifiers;
  hit: number;
  crit: number;
}

export function getCharacterCombatView(c: Character): CharacterCombatView {
  const eff = effectiveStats(c.stats);
  const cardsMods = collectCardModifiers(c);

  const weaponInst = c.equipment['Weapon'];
  const weaponDef = weaponInst ? ITEMS[weaponInst.itemId] : undefined;
  const weaponType = weaponDef?.weaponType ?? 'Fist';
  const weaponLevel = weaponDef?.weaponLevel ?? 1;
  const weaponAtk = weaponDef?.attack ?? 0;
  const weaponRefine = weaponInst?.refine ?? 0;
  const weaponElement = weaponDef?.element ?? 'Neutral';

  const ammo = c.ammunition;
  const ammoDef = ammo ? ITEMS[ammo.itemId] : undefined;

  const lukCrit = eff.LUK * 0.3;
  const critFromCards = cardsMods.critRate;
  const hitFromCards = cardsMods.hitFlat;

  return {
    effStr: eff.STR,
    effAgi: eff.AGI,
    effVit: eff.VIT,
    effInt: eff.INT,
    effDex: eff.DEX,
    effLuk: eff.LUK,
    attackElement: weaponElement,
    weaponType,
    weaponLevel,
    weaponAtk,
    weaponRefine,
    ammunitionAtk: ammoDef?.attack,
    ammunitionElement: ammoDef?.element,
    cardMods: cardsMods,
    hit: hit(c.baseLevel, eff.DEX) + hitFromCards,
    crit: lukCrit + critFromCards,
  };
}

/** Equip-defense for damage mitigation. */
export function getCharacterDefensiveView(c: Character): {
  equipDef: number;
  vitDef: number;
  cardMods: CardModifiers;
} {
  const equipDef = (Object.keys(c.equipment) as ArmorSlot[])
    .map((slot) => {
      const inst = c.equipment[slot]!;
      const def = ITEMS[inst.itemId];
      let d = def?.defense ?? 0;
      d += armorRefineDef(inst.refine);
      return d;
    })
    .reduce((a, b) => a + b, 0);
  const vitDef = effectiveStats(c.stats).VIT;
  return { equipDef, vitDef, cardMods: collectCardModifiers(c) };
}

// ============================================================================
// Simulation step
// ============================================================================

export interface SimResult {
  world: World;
  events: SimEvent[];
}

export type SimEvent =
  | { kind: 'attack'; attackerUid: string; targetUid: string; damage: number; isCrit: boolean; tick: number }
  | { kind: 'miss'; attackerUid: string; targetUid: string; tick: number }
  | { kind: 'castStart'; casterUid: string; skillId: SkillId; tick: number }
  | { kind: 'castResolve'; casterUid: string; skillId: SkillId; tick: number }
  | { kind: 'kill'; killerUid: string; victimUid: string; mobId?: string; tick: number }
  | { kind: 'death'; uid: string; tick: number }
  | { kind: 'loot'; whoUid: string; itemId: string; count: number; tick: number }
  | { kind: 'levelUp'; whoUid: string; levelKind: 'base' | 'job'; newLevel: number; tick: number };

/** Advance the world by one tick (50 ms). */
const PLAYER_RESPAWN_HP_FRACTION = 1.0;     // full HP on respawn
const PLAYER_RESPAWN_EXP_PENALTY = 0;       // 0% exp loss (alpha — be kind)

/** Respawn a dead player: reset HP/SP, move to spawn point, clear aggro. */
function respawnPlayer(p: Character, world: World, events: SimEvent[]): void {
  recomputeCharacterStats(p);
  p.hp = Math.floor(p.maxHp * PLAYER_RESPAWN_HP_FRACTION);
  p.sp = p.maxSp;
  if (PLAYER_RESPAWN_EXP_PENALTY > 0) {
    p.exp = Math.floor(p.exp * (1 - PLAYER_RESPAWN_EXP_PENALTY));
  }
  p.position.x = world.map.playerStartX;
  p.sprite.animation = 'idle';
  p.sprite.startedAt = world.tick;
  p.sprite.facing = 'right';
  p.casting = undefined;
  p.castFinishAt = 0;
  p.nextAttackAt = world.tick;
  p.statusEffects = [];
  // Clear aggro on monsters that were targeting this player.
  for (const m of world.monsters) {
    if (m.aggroTargetUid === p.uid) {
      m.aggroTargetUid = undefined;
      m.position.x = m.spawnX;
      m.sprite.animation = 'idle';
    }
  }
  events.push({ kind: 'castResolve' as never, casterUid: p.uid, skillId: '__respawn' as never, tick: world.tick });
}

export function stepWorld(
  world: World,
  strategies: ReadonlyMap<string, AiStrategy>,
  rng: RngState,
): SimEvent[] {
  const events: SimEvent[] = [];
  world.tick += TICK_MS;

  // 1. Spawn / respawn monsters
  tickSpawns(world, rng);

  // 2. Update monster AI (very simple: aggro + walk + attack)
  for (const m of world.monsters) {
    if (m.hp <= 0) continue;
    tickMonster(m, world, events, rng);
  }

  // 3. Run player strategies (skip dead — they're handled by respawn below)
  for (const p of world.players) {
    if (p.hp <= 0) {
      // Auto-respawn after 3 seconds.
      if (p.castFinishAt > 0 && world.tick >= p.castFinishAt) {
        respawnPlayer(p, world, events);
      }
      continue;
    }
    const strat = strategies.get(p.uid);
    if (!strat) continue;
    const ctx = {
      self: p,
      world,
      monsters: world.monsters.filter((m) => m.hp > 0),
      tick: world.tick,
      state: {} as Record<string, number | string | boolean | undefined>,
    };
    const action = strat.decide(ctx);
    executePlayerAction(p, action, world, events, rng);
  }

  // 4. Tick status effects
  for (const e of allEntities(world)) {
    for (const se of e.statusEffects) {
      se.remainingMs -= TICK_MS;
    }
    e.statusEffects = e.statusEffects.filter((se) => se.remainingMs > 0);
  }

  // 5. Clean up dead monsters (remove from world after death animation).
  // IMPORTANT: spawn system counts monsters by spawn descriptor (including dead ones
  // still in the array) to prevent double-spawns during the death animation window.
  {
    // Mark death tick when monster dies (one-time).
    for (const m of world.monsters) {
      if (m.hp <= 0) {
        const dm = m as Monster & { deathTick?: number };
        if (dm.deathTick === undefined) dm.deathTick = world.tick;
      }
    }
    // Remove dead monsters after 1s.
    world.monsters = world.monsters.filter((m) => {
      if (m.hp <= 0) {
        const dm = m as Monster & { deathTick?: number };
        if (dm.deathTick !== undefined && world.tick - dm.deathTick >= 1000) return false;
      }
      return true;
    });
  }

  // 6. Loot auto-pickup (player walks over dropped items)
  for (const item of world.droppedItems) {
    if (item.ownerUid === undefined) continue;
    for (const p of world.players) {
      if (Math.abs(p.position.x - item.position.x) < 0.5) {
        addItemToInventory(p, item);
        events.push({ kind: 'loot', whoUid: p.uid, itemId: item.itemId, count: item.count, tick: world.tick });
        item.ownerUid = '__picked';
      }
    }
  }
  world.droppedItems = world.droppedItems.filter((i) => i.ownerUid !== '__picked');

  // 6. Clear dead monsters (after death animations / drop tables already applied)
  // (Death is handled inside tickMonster / executePlayerAction when hp crosses 0.)

  return events;
}

function* allEntities(world: World): Generator<Entity> {
  for (const p of world.players) yield p;
  for (const m of world.monsters) yield m;
}

// ============================================================================
// Spawning
// ============================================================================

function tickSpawns(world: World, _rng: RngState): void {
  for (const spawn of world.map.spawnPoints) {
    // Count ALL monsters for this spawn (including dead ones in death animation).
    // This prevents double-spawning while the corpse is still visible.
    const total = world.monsters.filter(
      (m) => m.spawnDescriptor === spawn,
    ).length;
    if (total >= spawn.maxAlive) continue;
    // Only spawn when player is near the spawn x (within 25 cells).
    const playerNear = world.players.some(
      (p) => Math.abs(p.position.x - spawn.x) < 25,
    );
    if (!playerNear && !spawn.dynamicSpawn) continue;
    // Check respawn timer via a per-spawn memory slot on the world (simple: spawn immediately if alive < max).
    if (total < spawn.maxAlive) {
      const m = createMonster(spawn.mobId, spawn.x, spawn);
      world.monsters.push(m);
    }
  }
  // Cap total alive for safety
  const MAX_MONSTERS = 60;
  if (world.monsters.length > MAX_MONSTERS) {
    world.monsters = world.monsters.slice(world.monsters.length - MAX_MONSTERS);
  }
}

// ============================================================================
// Monster AI
// ============================================================================

function tickMonster(m: Monster, world: World, events: SimEvent[], rng: RngState): void {
  const def = MOBS[m.mobId];
  // Acquire target if aggressive or recently hit (simplified: aggro nearest player in range).
  if (!m.aggroTargetUid) {
    const target = world.players.find(
      (p) => p.hp > 0 && Math.abs(p.position.x - m.position.x) <= 10,
    );
    if (target && (def.aggressive || Math.abs(target.position.x - m.position.x) <= 3)) {
      m.aggroTargetUid = target.uid;
    }
  }
  if (!m.aggroTargetUid) return;
  const target = world.players.find((p) => p.uid === m.aggroTargetUid);
  if (!target || target.hp <= 0) {
    m.aggroTargetUid = undefined;
    return;
  }

  const distance = Math.abs(target.position.x - m.position.x);
  const targetDir = target.position.x > m.position.x ? 1 : -1;

  // Move toward target if out of attack range.
  // Stop at exactly attackRange distance — don't overshoot or walk through.
  if (distance > def.attackRange + 0.5) {
    const step = (def.moveSpeed * TICK_MS) / 1000;
    // Don't overshoot: move at most to attackRange + 0.5
    const maxStep = distance - (def.attackRange + 0.5);
    const actualStep = Math.min(step, maxStep);
    m.position.x += targetDir * actualStep;
    m.sprite.animation = 'walk';
    m.sprite.facing = targetDir > 0 ? 'right' : 'left';
    return;
  }

  // In range — face the player and attack.
  m.sprite.facing = targetDir > 0 ? 'right' : 'left';

  // Attack
  if (world.tick >= m.nextAttackAt) {
    m.sprite.animation = 'attack';
    m.sprite.startedAt = world.tick;
    const amotion = Math.floor((200 - def.attackSpeed) * 10);
    m.nextAttackAt = world.tick + amotion;

    const result = computePhysicalDamage(
      {
        attackerLevel: def.level,
        attackerStr: def.str,
        attackerDex: def.dex,
        attackerLuk: def.luk,
        attackerCrit: def.luk * 0.3,
        attackerHit: def.hit,
        attackElement: 'Neutral',
        weaponType: 'Fist',
        weaponLevel: 1,
        weaponAtk: def.attack,
        weaponRefine: 0,
        cardMods: { ...emptyMods() },
        targetRace: 'DemiHuman',         // players count as DemiHuman
        targetElement: 'Neutral',
        targetElementLevel: 1,
        targetSize: 'Medium',
        targetFlee: flee(target.baseLevel, effectiveStats(target.stats).AGI),
        targetEquipDef: getCharacterDefensiveView(target).equipDef,
        targetVitDef: getCharacterDefensiveView(target).vitDef,
        targetCardReduction: getCharacterDefensiveView(target).cardMods,
      },
      rng,
    );
    if (result.kind === 'hit') {
      target.hp -= result.damage;
      events.push({ kind: 'attack', attackerUid: m.uid, targetUid: target.uid, damage: result.damage, isCrit: result.isCrit, tick: world.tick });
      if (target.hp <= 0) {
        target.hp = 0;
        target.sprite.animation = 'dead';
        target.sprite.startedAt = world.tick;
        // Schedule respawn 3s later (PlayerSession will pick this up via the
        // castFinishAt reuse in stepWorld's player loop).
        if (target.kind === 'player') {
          target.castFinishAt = world.tick + 3000;
        }
        events.push({ kind: 'death', uid: target.uid, tick: world.tick });
      }
    } else if (result.kind === 'miss') {
      events.push({ kind: 'miss', attackerUid: m.uid, targetUid: target.uid, tick: world.tick });
    }
  }
}

// (distance helper removed — inlined after the 1D refactor)

// ============================================================================
// Player action execution
// ============================================================================

function executePlayerAction(
  p: Character,
  action: Action,
  world: World,
  events: SimEvent[],
  rng: RngState,
): void {
  switch (action.type) {
    case 'idle':
      p.sprite.animation = 'idle';
      break;

    case 'moveTo': {
      const dir = action.target.x > p.position.x ? 1 : -1;
      const step = (p.moveSpeed * TICK_MS) / 1000;
      const dx = action.target.x - p.position.x;
      p.position.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
      p.sprite.animation = 'walk';
      p.sprite.facing = dir > 0 ? 'right' : 'left';
      p.facing = dir > 0 ? 0 : Math.PI;
      break;
    }

    case 'attack': {
      const target = world.monsters.find((m) => m.uid === action.targetUid);
      if (!target || target.hp <= 0) return;
      const distance = Math.abs(target.position.x - p.position.x);
      const meleeRange = 1.5;
      // Walk into melee range, but don't overshoot past the mob.
      if (distance > meleeRange) {
        const step = (p.moveSpeed * TICK_MS) / 1000;
        const maxStep = distance - meleeRange;
        const actualStep = Math.min(step, maxStep);
        p.position.x += Math.sign(target.position.x - p.position.x) * actualStep;
        p.sprite.animation = 'walk';
        p.sprite.facing = target.position.x > p.position.x ? 'right' : 'left';
        return;
      }
      if (world.tick < p.nextAttackAt) return;

      p.sprite.animation = 'attack';
      p.sprite.startedAt = world.tick;
      const view = getCharacterCombatView(p);
      const playerAspd = aspd(view.effAgi, view.effDex, view.weaponType);
      p.nextAttackAt = world.tick + amotionMs(playerAspd);

      const def = MOBS[target.mobId];
      const result = computePhysicalDamage(
        {
          attackerLevel: p.baseLevel,
          attackerStr: view.effStr,
          attackerDex: view.effDex,
          attackerLuk: view.effLuk,
          attackerCrit: view.crit,
          attackerHit: view.hit,
          attackElement: view.attackElement,
          weaponType: view.weaponType,
          weaponLevel: view.weaponLevel,
          weaponAtk: view.weaponAtk,
          weaponRefine: view.weaponRefine,
          ammunitionAtk: view.ammunitionAtk,
          ammunitionElement: view.ammunitionElement,
          cardMods: view.cardMods,
          targetRace: def.race,
          targetElement: def.element,
          targetElementLevel: def.elementLevel,
          targetSize: def.size,
          targetFlee: def.flee,
          targetEquipDef: def.defense,
          targetVitDef: def.vit,
        },
        rng,
      );
      applyDamageResult(p, target, result, world, events);
      break;
    }

    case 'castSkill': {
      const skillId = action.skillId;
      const skill: SkillDef | undefined = SKILLS[skillId];
      if (!skill) return;
      const level = p.skills[skillId] ?? 0;
      if (level === 0) return;
      const sp = skill.spCost[level - 1] ?? 0;
      if (p.sp < sp) return;
      if (p.casting) return;
      if (world.tick < p.castFinishAt) return;

      // Start casting (or instant-resolve).
      const view = getCharacterCombatView(p);
      const baseCast = skill.castTimeMs[level - 1] ?? 0;
      const ct = castTimeMs(baseCast, view.effDex);

      p.sp -= sp;

      if (ct <= TICK_MS) {
        // Instant — resolve now.
        resolveSkill(p, skill, level, action, world, events, rng);
        p.castFinishAt = world.tick + afterCastMs(skill.afterCastDelayMs[level - 1] ?? 0);
      } else {
        p.casting = {
          skillId,
          targetUid: action.targetUid,
          startedAt: world.tick,
          baseCastMs: ct,
        };
        p.castFinishAt = world.tick + ct;
        p.sprite.animation = 'cast';
        p.sprite.startedAt = world.tick;
        events.push({ kind: 'castStart', casterUid: p.uid, skillId, tick: world.tick });
      }
      break;
    }

    case 'useItem': {
      const entry = p.inventory.find((e) => e.itemId === action.itemId);
      if (!entry || entry.count <= 0) return;
      if (action.itemId === 'Item_Consum_RedPotion') {
        p.hp = Math.min(p.maxHp, p.hp + 45);
      } else if (action.itemId === 'Item_Consum_OrangePotion') {
        p.hp = Math.min(p.maxHp, p.hp + 105);
      }
      entry.count -= 1;
      if (entry.count <= 0) {
        p.inventory = p.inventory.filter((e) => e !== entry);
      }
      break;
    }

    case 'loot': {
      const item = world.droppedItems.find((i) => i.uid === action.itemUid);
      if (!item) return;
      if (Math.abs(p.position.x - item.position.x) > 1.5) return;
      addItemToInventory(p, item);
      events.push({ kind: 'loot', whoUid: p.uid, itemId: item.itemId, count: item.count, tick: world.tick });
      world.droppedItems = world.droppedItems.filter((i) => i !== item);
      break;
    }

    case 'death':
      // No-op; respawn handled by the caller (town logic).
      break;
  }

  // Resolve any finished casts at the end of the tick.
  if (p.casting && world.tick >= p.castFinishAt) {
    const casting = p.casting;
    p.casting = undefined;
    const skill = SKILLS[casting.skillId];
    if (skill) {
      const level = p.skills[casting.skillId] ?? 1;
      resolveSkill(
        p, skill, level,
        { type: 'castSkill', skillId: casting.skillId, targetUid: casting.targetUid },
        world, events, rng,
      );
      p.castFinishAt = world.tick + afterCastMs(skill.afterCastDelayMs[level - 1] ?? 0);
    }
  }
}

function applyDamageResult(
  attacker: Character,
  target: Monster,
  result: ReturnType<typeof computePhysicalDamage>,
  world: World,
  events: SimEvent[],
): void {
  if (result.kind === 'miss') {
    events.push({ kind: 'miss', attackerUid: attacker.uid, targetUid: target.uid, tick: world.tick });
    return;
  }
  if (result.kind !== 'hit') return;
  target.hp -= result.damage;
  events.push({ kind: 'attack', attackerUid: attacker.uid, targetUid: target.uid, damage: result.damage, isCrit: result.isCrit, tick: world.tick });

  if (target.hp <= 0) {
    target.hp = 0;
    target.sprite.animation = 'dead';
    target.sprite.startedAt = world.tick;
    events.push({ kind: 'kill', killerUid: attacker.uid, victimUid: target.uid, mobId: target.mobId, tick: world.tick });
    awardKill(attacker, target, world, events, rngStateFromWorld(world));
  }
}

function resolveSkill(
  caster: Character,
  skill: SkillDef,
  level: number,
  action: Extract<Action, { type: 'castSkill' }>,
  world: World,
  events: SimEvent[],
  rng: RngState,
): void {
  events.push({ kind: 'castResolve', casterUid: caster.uid, skillId: skill.id, tick: world.tick });
  // Buffs (self-target): add a status effect.
  if (skill.flags?.isBuff) {
    caster.statusEffects.push({
      id: buffStatusIdForSkill(skill.id),
      remainingMs: 60_000,        // 60s default for buffs
      level,
    });
    recomputeCharacterStats(caster);
    return;
  }
  if (skill.flags?.isHeal) {
    if (skill.id === 'Skill_Novice_FirstAid') {
      caster.hp = Math.min(caster.maxHp, caster.hp + 5);
    }
    return;
  }

  // Damage skills
  if (!skill.damageMultiplier) return;
  const mult = skill.damageMultiplier[level - 1] ?? 1;

  if (skill.targetType === 'enemy' || skill.targetType === 'ground') {
    const targets: Monster[] = [];
    const primary = world.monsters.find((m) => m.uid === action.targetUid);
    if (primary && primary.hp > 0) targets.push(primary);
    if ((skill.splashRadius ?? 0) > 0) {
      for (const m of world.monsters) {
        if (m.hp <= 0 || m === primary) continue;
        if (primary && Math.abs(m.position.x - primary.position.x) <= (skill.splashRadius ?? 0)) {
          targets.push(m);
        }
      }
    }
    const view = getCharacterCombatView(caster);
    for (const target of targets) {
      const def = MOBS[target.mobId];
      const result = computePhysicalDamage(
        {
          attackerLevel: caster.baseLevel,
          attackerStr: view.effStr,
          attackerDex: view.effDex,
          attackerLuk: view.effLuk,
          attackerCrit: view.crit,
          attackerHit: view.hit,
          attackElement: view.attackElement,
          weaponType: view.weaponType,
          weaponLevel: view.weaponLevel,
          weaponAtk: view.weaponAtk,
          weaponRefine: view.weaponRefine,
          ammunitionAtk: view.ammunitionAtk,
          ammunitionElement: view.ammunitionElement,
          cardMods: view.cardMods,
          skillMultiplier: mult,
          skillIgnoresDef: skill.flags?.ignoresDef,
          skillIgnoresFlee: skill.flags?.ignoresFlee,
          skillCanCrit: skill.flags?.canCrit,
          targetRace: def.race,
          targetElement: def.element,
          targetElementLevel: def.elementLevel,
          targetSize: def.size,
          targetFlee: def.flee,
          targetEquipDef: def.defense,
          targetVitDef: def.vit,
        },
        rng,
      );
      applyDamageResult(caster, target, result, world, events);
    }
  }
}

function buffStatusIdForSkill(skillId: SkillId): string {
  switch (skillId) {
    case 'Skill_Archer_ImproveConcentration': return 'Buff_ImproveConcentration';
    case 'Skill_Archer_OwlsEye': return 'Buff_OwlsEye';
    case 'Skill_Archer_VulturesEye': return 'Buff_VulturesEye';
    case 'Skill_Sniper_TrueSight': return 'Buff_TrueSight';
    case 'Skill_Sniper_WindWalker': return 'Buff_WindWalker';
    case 'Skill_Sniper_FalconEyes': return 'Buff_FalconEyes';
    default: return `Buff_${skillId}`;
  }
}

function awardKill(
  killer: Character,
  victim: Monster,
  world: World,
  events: SimEvent[],
  rng: RngState,
): void {
  const def = MOBS[victim.mobId];
  killer.exp += def.baseExp;
  killer.jobExp += def.jobExp;

  // Level up
  while (canLevelUp(killer)) {
    killer.baseLevel += 1;
    killer.statPoints += 3 + Math.floor((killer.baseLevel - 1) / 5);
    events.push({ kind: 'levelUp', whoUid: killer.uid, levelKind: 'base', newLevel: killer.baseLevel, tick: world.tick });
  }
  while (canJobLevelUp(killer)) {
    killer.jobLevel += 1;
    killer.skillPoints += 1;
    events.push({ kind: 'levelUp', whoUid: killer.uid, levelKind: 'job', newLevel: killer.jobLevel, tick: world.tick });
  }
  recomputeCharacterStats(killer);

  // Drop loot
  const table = getLootTable(def.lootTableId);
  for (const entry of table.entries) {
    if (nextFloat(rng) < entry.chance) {
      const count = nextInt(rng, entry.min, entry.max);
      world.droppedItems.push({
        uid: newUid('drop'),
        itemId: entry.itemId,
        count,
        position: { x: victim.position.x, y: 0 },
        droppedAt: world.tick,
        ownerUid: killer.uid,
      });
    }
  }
}

function canLevelUp(c: Character): boolean {
  // Minimal exp curve check; use a simple linear threshold for MVP.
  const needed = baseLevelNeeded(c.baseLevel);
  return c.exp >= needed && c.baseLevel < 99;
}
function canJobLevelUp(c: Character): boolean {
  const job = JOBS[c.jobId];
  const needed = jobLevelNeeded(c.jobLevel);
  return c.jobExp >= needed && c.jobLevel < job.jobLevelCap;
}
function baseLevelNeeded(level: number): number {
  return Math.floor(100 * Math.pow(1.18, level - 1));
}
function jobLevelNeeded(level: number): number {
  return Math.floor(50 * Math.pow(1.16, level - 1));
}

function addItemToInventory(p: Character, drop: DroppedItem): void {
  const def = ITEMS[drop.itemId];
  if (!def) return;
  if (def.type === 'weapon' || def.type === 'armor') {
    const inst: EquipmentInstance = drop.instance ?? {
      uid: newUid('eq'),
      itemId: drop.itemId,
      refine: 0,
      cards: [],
    };
    const entry: InventoryEntry = {
      uid: inst.uid,
      itemId: drop.itemId,
      count: 1,
      instance: inst,
    };
    p.inventory.push(entry);
  } else {
    const existing = p.inventory.find((e) => e.itemId === drop.itemId);
    if (existing) {
      existing.count += drop.count;
    } else {
      p.inventory.push({
        uid: newUid('etc'),
        itemId: drop.itemId,
        count: drop.count,
      });
    }
  }
}

function zeroStats(): Character['stats']['base'] {
  return { STR: 0, AGI: 0, VIT: 0, INT: 0, DEX: 0, LUK: 0 };
}

function emptyMods(): CardModifiers {
  // Local stub to avoid a circular import surface.
  return {
    raceDamage: {}, elementDamage: {}, sizeDamage: {},
    raceDefense: {}, elementDefense: {},
    critRate: 0, attackFlat: 0, attackPercent: 0, fleeFlat: 0,
    hitFlat: 0, hpPercent: 0, spPercent: 0, aspdPercent: 0,
    castTimePercent: 0, afterCastPercent: 0, stats: {}, custom: [],
  };
}

/** Keep a per-world RNG advancing for deterministic drops. */
function rngStateFromWorld(world: World): RngState {
  return createRng((world.seed ^ (world.tick | 0)) >>> 0);
}
