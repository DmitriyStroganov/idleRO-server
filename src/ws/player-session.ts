/**
 * PlayerSession — owns the live Character + per-map World for one connected
 * player. The server's main loop ticks every session; state changes are
 * broadcast to the client over WebSocket.
 *
 * Lifecycle:
 *   1. Client opens WS connection with access token.
 *   2. Server loads (or creates) the Character + current-map World from DB.
 *   3. Session joins the global tick loop (20 tps).
 *   4. Commands arrive over WS → mutate Character via character-ops.
 *   5. Periodic flush (every 5s) writes Character + World back to DB.
 *   6. Disconnect → final flush + remove from tick loop.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { characters, characterMapStates } from '../db/schema.js';
import {
  createCharacter,
  createWorld,
  stepWorld,
  recomputeCharacterStats,
} from '@engine/sim';
import type {
  Character,
  World,
  MobSpawn,
} from '@engine/types';
import { createRng, type RngState } from '@engine/rng';
import { MOBS } from '@data/mobs';
import type { AiStrategy } from '@ai/strategy';
import { presetStrategy } from '@ai/preset-executor';
import { priorityListStrategy } from '@ai/priority-list';
import { PRESETS } from '@ai/strategy';
import {
  allocateStat,
  learnSkill,
  equipItem,
  unequipItem,
  attemptRefine,
  socketCard,
  removeCard,
} from '@engine/character-ops';
import { nextFloat } from '@engine/rng';
import { computeOfflineProgress, type OfflineResult } from '@engine/offline-progress';
import type { Command, OutMessage } from './protocol.js';

/** Build the default starting map. Poring near spawn, then progressively harder. */
function defaultMapSpawns(): MobSpawn[] {
  const spawns: MobSpawn[] = [];
  const pool = [
    // Starter zone — only Porings, easy kills for a fresh Novice.
    { mobId: 'Mob_Poring' as const, count: 12, range: [3, 30] as const },
    // Mid-starter — Lunatic, still easy but hits a bit harder.
    { mobId: 'Mob_Lunatic' as const, count: 10, range: [25, 70] as const },
    { mobId: 'Mob_Spore' as const, count: 8,  range: [60, 120] as const },
    { mobId: 'Mob_Wolf' as const,  count: 6,  range: [100, 200] as const },
    { mobId: 'Mob_Savage' as const, count: 4, range: [180, 280] as const },
    // Boss at the end.
    { mobId: 'Mob_Eddga' as const, count: 1, range: [280, 281] as const },
  ];
  for (const g of pool) {
    for (let i = 0; i < g.count; i++) {
      const x = g.range[0] + Math.floor(Math.random() * (g.range[1] - g.range[0]));
      spawns.push({ x, mobId: g.mobId, respawnMs: 10_000, maxAlive: 3, dynamicSpawn: false });
    }
  }
  return spawns;
}

const DEFAULT_MAP_ID = 'map:training_field';

export class PlayerSession {
  readonly userId: number;
  readonly username: string;
  character: Character;
  world: World;
  currentMapId: string;
  private strategy: AiStrategy;
  private rng: RngState;
  private lastFlushAt = 0;
  private paused = false;
  /** Rolling kill-events window (last 5 min) used to compute offline baseline. */
  private recentKillEvents: { at: number; exp: number; jobExp: number }[] = [];
  /** Returned from handleCommand to signal the caller to close the socket. */
  static readonly CLOSE_SIGNAL = 'close' as const;

  constructor(
    userId: number,
    username: string,
    character: Character,
    world: World,
    mapId: string,
    private send: (msg: OutMessage) => void,
  ) {
    this.userId = userId;
    this.username = username;
    this.character = character;
    this.world = world;
    this.currentMapId = mapId;
    this.rng = createRng((userId * 7919) | 0);
    this.strategy = this.resolveStrategy(character);

    // Log session start for debugging.
    const aliveMobs = world.monsters.filter((m) => m.hp > 0).length;
    console.log(JSON.stringify({
      event: 'session_start',
      userId,
      username,
      jobId: character.jobId,
      baseLevel: character.baseLevel,
      jobLevel: character.jobLevel,
      hp: character.hp,
      maxHp: character.maxHp,
      sp: character.sp,
      position: character.position.x,
      equipment: Object.keys(character.equipment),
      inventoryCount: character.inventory.length,
      skills: Object.keys(character.skills),
      statPoints: character.statPoints,
      skillPoints: character.skillPoints,
      worldTick: world.tick,
      monsterCount: aliveMobs,
      mapId,
    }));
  }

  private lastDebugLog = 0;
  private lastStatePush = 0;

  /** Run one simulation tick (50ms). Called by the global scheduler. */
  tick(now: number): void {
    if (this.paused) return;
    const strategies = new Map<string, AiStrategy>([[this.character.uid, this.strategy]]);
    const events = stepWorld(this.world, strategies, this.rng);

    // Log critical events for debugging.
    for (const ev of events) {
      if (ev.kind === 'death' && ev.uid === this.character.uid) {
        console.log(JSON.stringify({
          event: 'player_died', userId: this.userId,
          tick: this.world.tick, hp: this.character.hp,
          position: this.character.position.x,
        }));
      }
      if (ev.kind === 'kill' && ev.killerUid === this.character.uid) {
        console.log(JSON.stringify({
          event: 'player_kill', userId: this.userId,
          mobId: ev.mobId, exp: this.character.exp,
          baseLevel: this.character.baseLevel,
        }));
      }
      if (ev.kind === 'levelUp') {
        console.log(JSON.stringify({
          event: 'level_up', userId: this.userId,
          levelKind: (ev as { levelKind?: string }).levelKind,
          newLevel: (ev as { newLevel?: number }).newLevel,
        }));
      }
    }

    // Periodic status log (every 5s).
    if (now - this.lastDebugLog > 5_000) {
      this.lastDebugLog = now;
      const aliveMobs = this.world.monsters.filter((m) => m.hp > 0).length;
      const aggroMobs = this.world.monsters.filter((m) => m.aggroTargetUid === this.character.uid).length;
      console.log(JSON.stringify({
        event: 'status',
        userId: this.userId,
        tick: this.world.tick,
        hp: Math.ceil(this.character.hp),
        maxHp: this.character.maxHp,
        sp: Math.ceil(this.character.sp),
        exp: Math.floor(this.character.exp),
        baseLevel: this.character.baseLevel,
        position: this.character.position.x.toFixed(1),
        aliveMobs,
        aggroMobs,
        animation: this.character.sprite.animation,
        paused: this.paused,
      }));
    }

    // Send periodic state updates so the client renderer can animate
    // positions / HP / sprite frames even when no events are generated.
    // (Without this the client's world snapshot is frozen between
    // explicit commands like open_town.)
    if (now - this.lastStatePush > 250) {
      this.lastStatePush = now;
      this.send({
        type: 'state',
        character: this.character,
        world: this.world,
      });
    }

    // Track kill events for offline baseline (5-minute sliding window).
    for (const ev of events) {
      if (ev.kind === 'kill' && ev.killerUid === this.character.uid && ev.mobId) {
        const def = MOBS[ev.mobId as keyof typeof MOBS];
        if (def) {
          this.recentKillEvents.push({ at: now, exp: def.baseExp, jobExp: def.jobExp });
        }
      }
    }
    // Trim to last 5 minutes.
    if (this.recentKillEvents.length > 0) {
      const cutoff = now - 5 * 60_000;
      while (this.recentKillEvents.length > 0 && this.recentKillEvents[0]!.at < cutoff) {
        this.recentKillEvents.shift();
      }
    }

    // Periodic flush.
    if (now - this.lastFlushAt > 5_000) {
      this.lastFlushAt = now;
      void this.flush();
    }

    if (events.length > 0) {
      this.send({
        type: 'events',
        tick: this.world.tick,
        events: events.map((e) => ({
          kind: e.kind,
          attackerUid: 'attackerUid' in e ? (e as any).attackerUid : undefined,
          targetUid: 'targetUid' in e ? (e as any).targetUid : undefined,
          damage: 'damage' in e ? (e as any).damage : undefined,
          isCrit: 'isCrit' in e ? (e as any).isCrit : undefined,
          skillId: 'skillId' in e ? (e as any).skillId : undefined,
          itemId: 'itemId' in e ? (e as any).itemId : undefined,
          count: 'count' in e ? (e as any).count : undefined,
          mobId: 'mobId' in e ? (e as any).mobId : undefined,
          levelKind: 'levelKind' in e ? (e as any).levelKind : undefined,
          newLevel: 'newLevel' in e ? (e as any).newLevel : undefined,
          whoUid: 'whoUid' in e ? (e as any).whoUid : undefined,
          uid: 'uid' in e ? (e as any).uid : undefined,
        })),
      });
    }
  }

  /** Pause sim when the player is in a Town screen. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.send({ type: 'paused', paused: true });
    else this.send({ type: 'paused', paused: false });
  }

  /**
   * Apply a command from the client.
   * Returns PlayerSession.CLOSE_SIGNAL when the WS should be closed
   * (currently only for `go_offline`).
   */
  async handleCommand(cmd: Command): Promise<typeof PlayerSession.CLOSE_SIGNAL | void> {
    switch (cmd.kind) {
      case 'open_town':
        this.setPaused(true);
        // Force a flush so the town screen sees the latest state.
        await this.flush();
        this.send({ type: 'state', character: this.character, world: this.world });
        return;
      case 'close_town':
        this.setPaused(false);
        return;
      case 'change_preset': {
        this.character.behavior = { kind: 'preset', presetId: cmd.presetId };
        this.strategy = this.resolveStrategy(this.character);
        return;
      }
      case 'change_behavior': {
        this.character.behavior = { kind: 'priorityList', config: cmd.config };
        this.strategy = this.resolveStrategy(this.character);
        return;
      }
      case 'allocate_stat': {
        allocateStat(this.character, cmd.stat);
        this.send({ type: 'state', character: this.character, world: this.world });
        return;
      }
      case 'learn_skill': {
        learnSkill(this.character, cmd.skillId);
        this.send({ type: 'state', character: this.character, world: this.world });
        return;
      }
      case 'equip_item': {
        equipItem(this.character, cmd.itemUid);
        this.send({ type: 'state', character: this.character, world: this.world });
        return;
      }
      case 'unequip_item': {
        unequipItem(this.character, cmd.slot as any);
        this.send({ type: 'state', character: this.character, world: this.world });
        return;
      }
      case 'refine_item': {
        const roll = nextFloat({ lo: Date.now() & 0xffffffff, hi: 0 });
        attemptRefine(this.character, { itemUid: cmd.itemUid, roll });
        this.send({ type: 'state', character: this.character, world: this.world });
        return;
      }
      case 'socket_card': {
        socketCard(this.character, cmd.itemUid, cmd.cardId as any);
        this.send({ type: 'state', character: this.character, world: this.world });
        return;
      }
      case 'remove_card': {
        removeCard(this.character, cmd.itemUid, cmd.slotIdx);
        this.send({ type: 'state', character: this.character, world: this.world });
        return;
      }
      case 'change_map':
        // TODO: implement map switching — load characterMapStates for the new map.
        this.send({ type: 'error', error: 'not_implemented', kind: 'change_map' });
        return;

      case 'go_offline': {
        // Explicit user action — flush state, mark offline, signal close.
        this.character.offlineMode = true;
        this.character.lastSeenAt = Date.now();
        await this.flush();
        this.send({ type: 'offline_mode', mode: true });
        return PlayerSession.CLOSE_SIGNAL;
      }

      default:
        this.send({ type: 'error', error: 'unknown_command', kind: (cmd as { kind: string }).kind });
    }
  }

  /** Persist current state to DB. */
  async flush(): Promise<void> {
    // Refresh offline baseline from the 5-minute kill window.
    const now = Date.now();
    if (this.recentKillEvents.length > 0) {
      const totalExp = this.recentKillEvents.reduce((s, e) => s + e.exp, 0);
      const totalJob = this.recentKillEvents.reduce((s, e) => s + e.jobExp, 0);
      this.character.offlineBaseline = {
        expPerMin: Math.floor(totalExp / 5),
        jobExpPerMin: Math.floor(totalJob / 5),
        sampledAt: now,
      };
    }
    this.character.lastSeenAt = now;

    // Upsert character snapshot + denormalised fields.
    const charRow = {
      userId: this.userId,
      slot: 'main',
      snapshot: this.character as any,
      currentMapId: this.currentMapId,
      jobId: this.character.jobId,
      baseLevel: this.character.baseLevel,
      jobLevel: this.character.jobLevel,
      zeny: this.character.zeny,
      playtimeMs: 0, // TODO: accumulate session time
      lastSeenAt: new Date(now),
      offlineBaselineExpPerMin: this.character.offlineBaseline.expPerMin,
      offlineBaselineJobExpPerMin: this.character.offlineBaseline.jobExpPerMin,
      offlineMode: this.character.offlineMode ? 1 : 0,
      updatedAt: new Date(now),
    };
    const existing = await db.select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.userId, this.userId), eq(characters.slot, 'main')))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(characters).values(charRow);
    } else {
      await db.update(characters).set(charRow).where(eq(characters.id, existing[0].id));
    }

    // Upsert per-map state.
    const mapRow = {
      characterId: existing[0]?.id ?? 0,
      mapId: this.currentMapId,
      state: this.world as any,
      updatedAt: new Date(),
    };
    // Need the character id — fetch again if just inserted.
    if (existing.length === 0) {
      const fresh = await db.select({ id: characters.id })
        .from(characters)
        .where(and(eq(characters.userId, this.userId), eq(characters.slot, 'main')))
        .limit(1);
      mapRow.characterId = fresh[0]?.id ?? 0;
    }
    if (mapRow.characterId === 0) return;

    const existingMap = await db.select()
      .from(characterMapStates)
      .where(and(
        eq(characterMapStates.characterId, mapRow.characterId),
        eq(characterMapStates.mapId, this.currentMapId),
      ))
      .limit(1);
    if (existingMap.length === 0) {
      await db.insert(characterMapStates).values(mapRow);
    } else {
      await db.update(characterMapStates).set({ state: mapRow.state, updatedAt: mapRow.updatedAt })
        .where(eq(characterMapStates.characterId, mapRow.characterId));
    }
  }

  private resolveStrategy(c: Character): AiStrategy {
    if (c.behavior?.kind === 'priorityList') {
      return priorityListStrategy(c.behavior.config);
    }
    const pid = (c.behavior?.kind === 'preset' ? c.behavior.presetId : 'aggressive') as keyof typeof PRESETS;
    return presetStrategy(PRESETS[pid] ?? PRESETS.aggressive);
  }
}

// ============================================================================
// Loader — fetch or create a session's state from the DB.
// ============================================================================

export async function loadOrCreateSession(
  userId: number,
  username: string,
  send: (msg: OutMessage) => void,
): Promise<PlayerSession> {
  // Find existing character.
  const charRows = await db.select()
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.slot, 'main')))
    .limit(1);
  let character: Character;
  let mapId: string;
  let characterId: number | undefined;

  if (charRows.length > 0) {
    const row = charRows[0];
    characterId = row.id;
    character = row.snapshot as unknown as Character;
    mapId = row.currentMapId;

    // Reconcile offline baseline + offlineMode from DB columns (in case
    // the snapshot predates the migration that added these fields).
    if (!character.offlineBaseline) {
      character.offlineBaseline = {
        expPerMin: row.offlineBaselineExpPerMin ?? 0,
        jobExpPerMin: row.offlineBaselineJobExpPerMin ?? 0,
        sampledAt: 0,
      };
    }
    if (typeof character.lastSeenAt !== 'number') {
      character.lastSeenAt = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : Date.now();
    }
    if (typeof character.offlineMode !== 'boolean') {
      character.offlineMode = !!row.offlineMode;
    }
  } else {
    // Fresh Novice Lv1/Job1.
    character = createCharacter({ jobId: 'Novice', baseLevel: 1, jobLevel: 1 });
    applyStarterKit(character);
    recomputeCharacterStats(character);
    character.hp = character.maxHp;
    character.sp = character.maxSp;
    mapId = DEFAULT_MAP_ID;
  }

  // Load per-map state, or generate a fresh world.
  let world: World;
  if (characterId !== undefined) {
    const mapRows = await db.select()
      .from(characterMapStates)
      .where(and(
        eq(characterMapStates.characterId, characterId),
        eq(characterMapStates.mapId, mapId),
      ))
      .limit(1);
    if (mapRows.length > 0) {
      world = mapRows[0].state as unknown as World;
    } else {
      world = freshWorld();
    }
  } else {
    world = freshWorld();
  }

  // Apply offline-progression calc (silently — caller can surface via state).
  const offlineRng = createRng((userId * 7919) ^ Date.now());
  const offlineResult = computeOfflineProgress(character, world.map, offlineRng);
  // Reset offline flag now that we've loaded them back.
  character.offlineMode = false;

  // Place character at the start.
  character.position.x = world.map.playerStartX;
  world.players = [character];

  const session = new PlayerSession(userId, username, character, world, mapId, send);
  // Stash the offline result so the caller can include it in the hello burst.
  (session as unknown as { pendingOfflineResult: OfflineResult }).pendingOfflineResult = offlineResult;
  return session;
}

function freshWorld(): World {
  return createWorld({
    seed: 1234,
    mapLength: 320,
    playerStartX: 2,
    spawns: defaultMapSpawns(),
  });
}

/**
 * Equip a fresh character with a basic RO-style starter kit:
 *   - Novice Knife (weapon)
 *   - Cotton Shirt (armor)
 *   - 10 Red Potions
 *   - 100 Zeny
 * Also pre-learn Novice First Aid so they have at least one active skill.
 */
function applyStarterKit(c: Character): void {
  c.equipment['Weapon'] = {
    uid: `starter-weapon-${c.uid}`,
    itemId: 'Item_Weapon_NoviceKnife',
    refine: 0,
    cards: [],
  };
  c.equipment['Armor'] = {
    uid: `starter-armor-${c.uid}`,
    itemId: 'Item_Armor_CottonShirt',
    refine: 0,
    cards: [],
  };
  c.appearance.layers.body = `Body_${c.jobId}`;
  c.inventory.push({ uid: `starter-potions-${c.uid}`, itemId: 'Item_Consum_RedPotion', count: 10 });
  c.zeny = 100;
  // Pre-learn First Aid — a Novice's only meaningful skill.
  c.skills['Skill_Novice_FirstAid'] = 1;
}
