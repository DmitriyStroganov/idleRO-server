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
import type { Command, OutMessage } from './protocol.js';

/** Build the default starting map (Archer test field, 320 cells). */
function defaultMapSpawns(): MobSpawn[] {
  const spawns: MobSpawn[] = [];
  const pool = [
    { mobId: 'Mob_Lunatic' as const, count: 12, range: [3, 60] as const },
    { mobId: 'Mob_Spore' as const, count: 10, range: [30, 120] as const },
    { mobId: 'Mob_Wolf' as const, count: 8, range: [80, 200] as const },
    { mobId: 'Mob_Savage' as const, count: 6, range: [150, 280] as const },
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
  }

  /** Run one simulation tick (50ms). Called by the global scheduler. */
  tick(now: number): void {
    if (this.paused) return;
    const strategies = new Map<string, AiStrategy>([[this.character.uid, this.strategy]]);
    const events = stepWorld(this.world, strategies, this.rng);

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

  /** Apply a command from the client. */
  async handleCommand(cmd: Command): Promise<void> {
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
      default:
        this.send({ type: 'error', error: 'unknown_command', kind: (cmd as { kind: string }).kind });
    }
  }

  /** Persist current state to DB. */
  async flush(): Promise<void> {
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
      updatedAt: new Date(),
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
  } else {
    // Fresh Novice Lv1/Job1.
    character = createCharacter({ jobId: 'Novice', baseLevel: 1, jobLevel: 1 });
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

  // Place character at the start.
  character.position.x = world.map.playerStartX;
  world.players = [character];

  return new PlayerSession(userId, username, character, world, mapId, send);
}

function freshWorld(): World {
  return createWorld({
    seed: 1234,
    mapLength: 320,
    playerStartX: 2,
    spawns: defaultMapSpawns(),
  });
}
