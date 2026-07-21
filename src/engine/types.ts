/**
 * Fundamental type definitions for the idleRO engine.
 * Pure data — no DOM, no runtime behaviour. Just contracts.
 *
 * Design goals:
 * - Determinism-friendly (no `any`, no Date.now() inside engine)
 * - Data-driven (ItemDef / CardDef / MobDef describe the world)
 * - Faithful to Ragnarok Online pre-Renewal mechanics.
 *
 * Reference: iRowiki classic + rathena src/map/*.cpp + db/pre-re/*
 */

// ============================================================================
// Primitives
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

// ============================================================================
// enums (as literal unions — TS-friendly, no runtime indirection)
// ============================================================================

/** The six primary stats in RO. */
export type StatKey =
  | 'STR'
  | 'AGI'
  | 'VIT'
  | 'INT'
  | 'DEX'
  | 'LUK';

export const STAT_KEYS: readonly StatKey[] = [
  'STR', 'AGI', 'VIT', 'INT', 'DEX', 'LUK',
] as const;

export type BaseStats = Record<StatKey, number>;

/** The 10 RO elements. Used on weapons, monster armor, and spells. */
export type Element =
  | 'Neutral'
  | 'Water'
  | 'Earth'
  | 'Fire'
  | 'Wind'
  | 'Poison'
  | 'Holy'
  | 'Shadow'
  | 'Ghost'
  | 'Undead';

export const ELEMENTS: readonly Element[] = [
  'Neutral', 'Water', 'Earth', 'Fire', 'Wind',
  'Poison', 'Holy', 'Shadow', 'Ghost', 'Undead',
] as const;

/** Monster race — drives racial card bonuses (Hydra, Thara Frog, ...). */
export type Race =
  | 'Formless'
  | 'Undead'
  | 'Brute'
  | 'Plant'
  | 'Insect'
  | 'Fish'
  | 'Demon'
  | 'DemiHuman'
  | 'Angel'
  | 'Dragon';

/** Monster size — drives size-weapon penalty and size cards. */
export type Size = 'Small' | 'Medium' | 'Large';

/** Armor element of a monster (NOT the same as attack element). */
export type MonsterElementProperty = 1 | 2 | 3 | 4; // level of element

// ============================================================================
// IDs
// ============================================================================

export type JobId = string;       // e.g. 'Novice', 'Archer', 'Hunter', 'Sniper'
export type ItemId = string;      // e.g. 'Weapon_Bow'
export type CardId = string;      // e.g. 'Card_Hydra'
export type MobId = string;       // e.g. 'Mob_Lunatic'
export type SkillId = string;     // e.g. 'Skill_DoubleStrafe'
export type SetId = string;       // card / equipment set
export type StatusEffectId = string;

// ============================================================================
// Stats container
// ============================================================================

/**
 * Full snapshot of a character's stat block at a given moment.
 * `base`  — invested stat points (allocated via /statpoint command)
 * `equip` — flat bonuses from gear + cards (e.g. Matyr Card +1 AGI)
 * `buff`  — temporary bonuses from skills (Blessing, Gloria, ...)
 */
export interface StatBlock {
  base: BaseStats;
  equip: BaseStats;
  buff: BaseStats;
}

/** Total effective stat after base + equip + buff. */
export type EffectiveStats = BaseStats;

// ============================================================================
// Items, Equipment, Cards
// ============================================================================

export type ItemType =
  | 'weapon'
  | 'armor'
  | 'ammunition'
  | 'card'
  | 'consumable'
  | 'etc';

export type WeaponType =
  | 'Bow'
  | 'Sword'
  | 'Dagger'
  | 'Spear'
  | 'Axe'
  | 'Mace'
  | 'Staff'
  | 'Knuckle'
  | 'Instrument'
  | 'Whip'
  | 'Book'
  | 'Katar'
  | 'Handgun'
  | 'Rifle'
  | 'Shotgun'
  | 'Gatling'
  | 'Grenade'
  | 'Fist';

export type ArmorSlot =
  | 'HeadTop'
  | 'HeadMid'
  | 'HeadLow'
  | 'Armor'
  | 'Weapon'
  | 'Shield'
  | 'Garment'
  | 'Shoes'
  | 'Accessory1'
  | 'Accessory2';

export type WeaponLevel = 1 | 2 | 3 | 4;

/**
 * Static definition of an item type (immutable).
 * Many "instances" of the same itemId can exist in inventories.
 */
export interface ItemDef {
  id: ItemId;
  name: string;
  type: ItemType;
  description?: string;

  // weapon-specific
  weaponLevel?: WeaponLevel;
  weaponType?: WeaponType;
  attack?: number;            // base ATK of weapon
  element?: Element;          // inherent weapon element (e.g. Fire Sword)
  /** Size modifiers — weapon-type-specific; usually fetched from WeaponSizeTable. */
  sizeModifier?: Record<Size, number>;

  // armor-specific
  armorSlot?: ArmorSlot;
  defense?: number;           // equip DEF
  magicDefense?: number;      // equip MDEF

  // slots
  slots: number;              // 0..4 weapon, 0..1 armor (typical)

  // refinement
  refineable: boolean;
  /** Hard cap on refinement level; defaults to 10. */
  maxRefine?: number;

  // weight (pre-Renewal ASPD formula uses weapon weight)
  weight: number;

  // required to equip
  requiredLevel?: number;
  requiredJob?: JobId[];

  // set membership
  partOfSet?: SetId;

  /**
   * Sprite layer key for the renderer. When equipped, this string tells
   * the renderer which visual layer to composite onto the character.
   * Examples: 'Sakkat', 'Cap', 'HunterBow', 'Buckler', 'Muffler'.
   * If omitted, the item has no distinct visual (bare body).
   */
  spriteKey?: string;
}

/**
 * A specific piece of equipment owned by a player.
 * This is the type that lives in inventory and is mutated
 * when refined / carded / upgraded.
 */
export interface EquipmentInstance {
  uid: string;                // unique instance id
  itemId: ItemId;
  refine: number;             // 0..maxRefine
  cards: CardId[];            // length === ItemDef.slots
}

/**
 * Card bonuses are deliberately decomposed by *category*.
 * Pre-Renewal damage formula:
 *   raceMods, elementMods, sizeMods STACK ADDITIVELY within a category
 *   but categories MULTIPLY against each other.
 * Expressing cards in this shape lets the damage pipeline apply them correctly.
 */
export interface CombatBonus {
  kind:
    | 'raceDamage'        // +X% damage vs Race   (Hydra, Santa Poring variants)
    | 'elementDamage'     // +X% damage vs Element (Vadon, Draining)
    | 'sizeDamage'        // +X% damage vs Size   (Minorous, Skeleton Worker)
    | 'raceDefense'       // -X% damage taken from Race (Thara Frog, Raydric)
    | 'elementDefense'    // -X% damage taken from Element (Pasana-style)
    | 'critRate'          // +X CRIT             (Soldier Skeleton)
    | 'attackFlat'        // +X ATK              (Andre)
    | 'attackPercent'     // +X% ATK             (rare, mostly custom)
    | 'fleeFlat'          // +X FLEE             (Whisper)
    | 'hitFlat'           // +X HIT              (Mummy)
    | 'hpPercent'         // +X% MaxHP           (Peco Peco, Matyr)
    | 'spPercent'         // +X% MaxSP           (Sohee, Willow)
    | 'aspdFlat'          // +X ASPD             (Baphomet Jr. - actually -X delay)
    | 'statBonus'         // +X Stat             (Tarou +5 ATK, etc.)
    | 'castTimePercent'   // -X% cast time       (Phen-like via set)
    | 'afterCastPercent'  // -X% after-cast delay
    | 'custom';           // for one-off scripts (Ghostring, Golden Thief Bug)
  target?: Race | Element | Size;
  stat?: StatKey;             // for statBonus
  value: number;              // signed integer or fraction (0.2 = 20%)
}

export interface CardSetBonus {
  setId: SetId;
  requiredCards: CardId[];
  bonuses: CombatBonus[];
  /** Optional equipment pieces required to complete the set. */
  requiredItems?: ItemId[];
}

export interface CardDef {
  id: CardId;
  name: string;
  /** Which armor slot the card is socketed into. */
  slot: ArmorSlot | 'Weapon' | 'Ammunition';
  bonuses: CombatBonus[];
  /** Cards that, when combined, grant extra bonuses. */
  partOfSet?: SetId;
  description?: string;
}

// ============================================================================
// Jobs
// ============================================================================

export interface JobDef {
  id: JobId;
  name: string;
  parent?: JobId;             // for tree progression (Novice → Archer → Hunter → Sniper)

  baseLevelCap: number;       // 99 for non-expanded
  jobLevelCap: number;        // 50 or 70

  /** HP/SP modifiers per base/job level — pre-Renewal formula. */
  hpModifier: number;         // aHP = 35 + BaseLevel * aHPm + (1 + bSig...
  spModifier: number;

  /** Per-base-level HP/SP growth constant. */
  hpMultiplier: number;
  spMultiplier: number;

  /** Starting stat point allocation (Novice gets 9 in everything? actually 1, with bonus). */
  baseStats: BaseStats;

  /** Which weapon types this job can equip. */
  allowedWeapons: WeaponType[];

  /** Map of skillId → SkillDef for this job. */
  skills: SkillId[];

  /** Weight capacity base. */
  weightBase: number;
}

// ============================================================================
// Skills
// ============================================================================

export type SkillTargetType =
  | 'self'
  | 'enemy'
  | 'ally'
  | 'ground'
  | 'area';

export interface SkillDef {
  id: SkillId;
  name: string;
  job: JobId;
  maxLevel: number;
  targetType: SkillTargetType;

  /** Range in cells (1 = melee, 5+ = ranged). */
  range: number;

  /** Area-of-effect radius (for Arrow Shower, etc.) — 0 = single-target. */
  splashRadius?: number;

  /** Base cast time in ms at skill level (index 0 = level 1). */
  castTimeMs: number[];       // pre-DEX cast reduction

  /** After-cast delay in ms per level. */
  afterCastDelayMs: number[];

  /** Skill cooldown (rare in pre-Renewal, but e.g. Asura Strike). */
  cooldownMs?: number[];

  /** SP cost per level. */
  spCost: number[];

  /** Required skills to unlock this one. */
  prerequisites?: Partial<Record<SkillId, number>>;

  /**
   * Damage multiplier per skill level.
   * For skills that don't deal damage (buffs/heals), use `flags.noDamage`.
   */
  damageMultiplier?: number[];

  /** Skill flags — boolean toggles for behaviour. */
  flags?: {
    isPhysical?: boolean;
    isMagic?: boolean;
    ranged?: boolean;
    ignoresFlee?: boolean;     // e.g. certain skills always hit
    ignoresDef?: boolean;
    canCrit?: boolean;
    noDamage?: boolean;
    isBuff?: boolean;
    isDebuff?: boolean;
    isHeal?: boolean;
  };

  /** Fixed cast-time portion (Renewal concept, but some pre-Renewal skills have it). */
  fixedCastMs?: number[];

  /** HP/SP cost (for Asura, etc.). */
  hpCost?: number[];

  /** Status effects applied on hit. */
  inflictStatus?: { id: StatusEffectId; chance: number; durationMs: number; level?: number }[];
}

// ============================================================================
// Monsters
// ============================================================================

export interface MobDef {
  id: MobId;
  name: string;
  level: number;
  race: Race;
  size: Size;
  element: Element;
  elementLevel: MonsterElementProperty; // 1..4; 1 = "100% Neutral"

  baseHp: number;
  baseSp: number;

  /** Stats used by the monster damage formula. */
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;

  /** Offensive / defensive ratings. */
  attack: number;             // total ATK (attack1+attack2 averaged in rathena)
  attackRange: number;        // cells
  defense: number;            // equip DEF (subtract from incoming damage)
  magicDefense: number;
  hit: number;                // = level + DEX (derived, but stored)
  flee: number;               // = level + AGI
  attackSpeed: number;        // 1..200

  /** Movement speed in cells per second. */
  moveSpeed: number;

  /** Aggression: true = aggro on sight, false = reacts only when hit. */
  aggressive: boolean;

  /** Experience rewards. */
  baseExp: number;
  jobExp: number;

  /** Loot table — see MobLoot in data/mobs. */
  lootTableId: string;

  /** SpriteKey for the renderer. */
  spriteKey: string;
}

// ============================================================================
// Status Effects
// ============================================================================

export interface StatusEffectDef {
  id: StatusEffectId;
  name: string;
  /** Effects applied while active — stat overrides, etc. */
  statOverrides?: Partial<BaseStats>;
  /** Disables actions of certain kind. */
  flags?: {
    cantMove?: boolean;
    cantAttack?: boolean;
    cantCast?: boolean;
    cantUseItems?: boolean;
  };
}

export interface ActiveStatusEffect {
  id: StatusEffectId;
  remainingMs: number;
  level: number;
  sourceUid?: string;
}

// ============================================================================
// Appearance — composite sprite system (RO-style paper-doll)
// ============================================================================
//
// The visual character is built from named *layers*, each one a sprite
// (or a placeholder shape until real assets arrive). When the player equips
// a Sakkat or a Hunter Bow, the corresponding layer key appears here and the
// renderer composites it on top of the body in the correct z-order.
//
// This decoupling means the engine can describe appearance in pure data,
// while the renderer (placeholder today, real RO sprites later) interprets it.

/**
 * The visual layers of a character, ordered back-to-front for rendering.
 * `undefined` means the layer is absent (e.g. no hat).
 */
export interface AppearanceLayers {
  body: string;            // base body, keyed by gender+job ("Body_Male_Archer")
  hair?: string;           // hairstyle id ("Hair_1")
  headTop?: string;        // hat / helmet ("Sakkat")
  headMid?: string;        // glasses / eye-wear ("Glasses")
  headLow?: string;        // beard / mask / cigar ("Flu_Mask")
  weapon?: string;         // weapon visual ("HunterBow")
  shield?: string;         // shield / left-hand item ("Buckler")
  garment?: string;        // cape / robe ("Muffler")
  robe?: string;           // full-body robe (overrides most other layers)
}

/**
 * Full appearance descriptor — what the renderer needs to draw a character.
 * Colors are palette indices (0..n) so the same sprite can be tinted differently.
 */
export interface Appearance {
  layers: AppearanceLayers;
  hairColor: number;       // 0..7 palette index
  clothColor: number;      // 0..n cloth-dye palette index
  skinColor: number;       // 0..n skin palette index
  /** Optional scale override; used for sex/age variety. Default 1.0. */
  scale?: number;
}

/**
 * Renderer-facing animation state for an entity. The sim advances the tick
 * counter; the renderer interprets it to pick a frame from each layer.
 */
export type SpriteAnimation =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'cast'
  | 'hurt'
  | 'dead'
  | 'pickup';

export interface SpriteState {
  animation: SpriteAnimation;
  /** Tick (ms, sim time) when the current animation started. */
  startedAt: number;
  /** Optional direction — for 1D we use 'left' | 'right'. */
  facing: 'left' | 'right';
}

// ============================================================================
// Runtime entities
// ============================================================================

export type EntityKind = 'player' | 'monster';

/**
 * Anything that exists on the map: player or monster.
 * Use a discriminated union so the sim can iterate uniformly.
 */
export interface Entity {
  uid: string;
  kind: EntityKind;
  position: Vec2;              // x = combat position (cells), y = visual offset
  facing: number;              // radians, 0 = +x
  spriteKey: string;

  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;

  statusEffects: ActiveStatusEffect[];

  /** Tick when this entity may next perform an attack action (ms, sim time). */
  nextAttackAt: number;
  /** Tick when this entity may next finish casting (ms). */
  castFinishAt: number;
  /** Current cast target skill + target uid. */
  casting?: { skillId: SkillId; targetUid: string; startedAt: number; baseCastMs: number };

  /** Movement target — entity walks toward this cell (y is ignored). */
  moveTarget?: Vec2;
  /** Movement speed in cells per second (already computed from AGI/skills). */
  moveSpeed: number;

  /** Renderer-facing animation state. */
  sprite: SpriteState;
}

export interface Character extends Entity {
  kind: 'player';
  jobId: JobId;
  baseLevel: number;
  jobLevel: number;
  exp: number;
  jobExp: number;
  statPoints: number;
  skillPoints: number;
  zeny: number;

  stats: StatBlock;
  /** Skill levels learned: skillId → level (0 = not learned). */
  skills: Partial<Record<SkillId, number>>;

  /** Equipped items keyed by armor slot. */
  equipment: Partial<Record<ArmorSlot, EquipmentInstance>>;
  /** Inventory: equipment instances + etc items (counts for stackables). */
  inventory: InventoryEntry[];

  /** Currently equipped ammunition (arrows) — required for Bow attacks. */
  ammunition?: { itemId: ItemId; count: number };

  /**
   * Behaviour descriptor — what drives the character's AI. Either:
   *   - a Level 1 preset id, OR
   *   - a Level 2 priority-list config (full rules)
   * If undefined, the loader defaults to `{ kind: 'preset', presetId: 'aggressive' }`.
   */
  behavior?: CharacterBehavior;

  /**
   * Composite-sprite appearance descriptor. Recomputed whenever the player
   * changes equipment, hair style, or dye color.
   */
  appearance: Appearance;
}

/** Discriminated union for the behaviour driving a character's AI. */
export type CharacterBehavior =
  | { kind: 'preset'; presetId: string }
  | { kind: 'priorityList'; config: import('../ai/priority-list').PriorityListConfig };

export interface Monster extends Entity {
  kind: 'monster';
  mobId: MobId;
  /** Set on spawn to control respawn timer. */
  spawnId?: string;
  /** Currently-aggroed target entity uid. */
  aggroTargetUid?: string;
  /** X cell where this monster spawned — it returns here when losing aggro. */
  spawnX: number;
  /** Spawn descriptor used to respawn after death. */
  spawnDescriptor?: MobSpawn;
}

export interface InventoryEntry {
  uid: string;                 // unique for equipment instances
  itemId: ItemId;
  count: number;               // >1 for stackables
  instance?: EquipmentInstance; // present for equipment, undefined for etc/consumables
}

// ============================================================================
// Actions (output of AI / player decisions)
// ============================================================================

export type Action =
  | { type: 'idle' }
  | { type: 'moveTo'; target: Vec2 }
  | { type: 'attack'; targetUid: string }
  | { type: 'castSkill'; skillId: SkillId; targetUid: string; targetCell?: Vec2 }
  | { type: 'useItem'; itemId: ItemId; targetUid?: string }
  | { type: 'loot'; itemUid: string }
  | { type: 'death' };

// ============================================================================
// World
// ============================================================================
//
// Battle geometry: 1D lane ("runner" / side-scroller).
//   - Entity.position.x  is the ONLY combat-relevant coordinate.
//   - Entity.position.y  is a *visual* offset (jumping, floating effects) —
//                        the engine keeps it at 0; the renderer may animate it.
// Monsters spawn ahead of the player and walk towards them; the player
// auto-walks forward until combat engages. The camera follows the player.
// ============================================================================

export interface MapTile {
  /** 0 = walkable, >0 = blocked (wall/obstacle), negative = special (warp, town exit...). */
  type: number;
  /** Visual-only ground variant for the renderer (grass/sand/dungeon...). */
  terrain?: number;
}

/**
 * A linear game map: tiles laid out along the X axis.
 * `length` is the full extent in cells. `bandHeight` is purely visual
 * (how tall the ground band is on screen); it does NOT affect combat.
 */
export interface GameMap {
  id: string;
  name: string;
  length: number;                // horizontal extent in cells
  bandHeight: number;            // visual ground height (cells) — for renderer
  tiles: MapTile[];              // length === `length` above
  /** Spawn descriptors: where monsters appear along the lane. */
  spawnPoints: MobSpawn[];
  /** Logical end of the map — reaching it triggers town/boss transition. */
  exitX?: number;
  /** Where the player starts on this map. */
  playerStartX: number;
}

/** A mob spawn point along the lane. */
export interface MobSpawn {
  x: number;                     // cell along the lane where the mob appears
  mobId: MobId;                  // which monster
  /** Respawn delay in ms after death (0 = no respawn). */
  respawnMs: number;
  /** Maximum number of this mob alive at once from this spawn point. */
  maxAlive: number;
  /** If true, mob spawns ahead of player when in range; otherwise at fixed x. */
  dynamicSpawn?: boolean;
}

/** A dropped item on the ground. */
export interface DroppedItem {
  uid: string;
  itemId: ItemId;
  count: number;
  position: Vec2;
  droppedAt: number;           // sim time ms
  ownerUid?: string;           // first-hitter protection
  instance?: EquipmentInstance; // if it's equipment with refine/cards
}

export interface World {
  tick: number;                // sim time in ms (multiples of TICK_MS)
  map: GameMap;
  players: Character[];
  monsters: Monster[];
  droppedItems: DroppedItem[];
  /** Seed for deterministic RNG. */
  seed: number;
}

// ============================================================================
// Sim configuration constants
// ============================================================================

/** Fixed simulation tick in ms. 20 tps for smooth ASPD resolution. */
export const TICK_MS = 50;
export const TICKS_PER_SECOND = 1000 / TICK_MS;

/** Maximum base/job level of any non-expanded character. */
export const MAX_BASE_LEVEL = 99;
export const MAX_JOB_LEVEL_TRANSCEND = 70;
export const MAX_JOB_LEVEL_NORMAL = 50;
