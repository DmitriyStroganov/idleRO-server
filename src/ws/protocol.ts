/**
 * WebSocket message protocol — shared between server and (eventually) client.
 *
 * Two channels:
 *   In  (client → server): Command messages
 *   Out (server → client): state patches, events, acks
 */

import type { Character, World, SkillId, StatKey } from '@engine/types';
import type { PriorityListConfig } from '@ai/priority-list';

// ============================================================================
// In (client → server)
// ============================================================================

export type Command =
  | { kind: 'open_town' }
  | { kind: 'close_town' }
  | { kind: 'change_preset'; presetId: string }
  | { kind: 'change_behavior'; config: PriorityListConfig }
  | { kind: 'allocate_stat'; stat: StatKey }
  | { kind: 'learn_skill'; skillId: SkillId }
  | { kind: 'equip_item'; itemUid: string }
  | { kind: 'unequip_item'; slot: string }
  | { kind: 'refine_item'; itemUid: string }
  | { kind: 'socket_card'; itemUid: string; cardId: string }
  | { kind: 'remove_card'; itemUid: string; slotIdx: number }
  | { kind: 'change_map'; mapId: string }
  | { kind: 'go_offline' };

export interface InMessage {
  type: 'command';
  command: Command;
}

// ============================================================================
// Out (server → client)
// ============================================================================

export interface SimEventWire {
  kind: string;
  attackerUid?: string;
  targetUid?: string;
  damage?: number;
  isCrit?: boolean;
  skillId?: string;
  itemId?: string;
  count?: number;
  mobId?: string;
  levelKind?: 'base' | 'job';
  newLevel?: number;
  whoUid?: string;
  uid?: string;
}

export interface OfflineResultWire {
  applied: boolean;
  offlineMs: number;
  effectiveMs: number;
  expGained: number;
  jobExpGained: number;
  levelsGained: number;
  jobLevelsGained: number;
  died: boolean;
}

export type OutMessage =
  | { type: 'hello'; user: { id: number; username: string } }
  | { type: 'state'; character: Character; world: World }
  | { type: 'events'; tick: number; events: SimEventWire[] }
  | { type: 'paused'; paused: boolean }
  | { type: 'command_ack'; ok: boolean; error?: string }
  | { type: 'error'; error: string; kind?: string }
  | { type: 'offline_mode'; mode: boolean }
  | { type: 'offline_applied'; result: OfflineResultWire };
