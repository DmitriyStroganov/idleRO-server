/**
 * Built-in priority-list configs.
 *
 * These mirror the Level 1 presets (aggressive / defensive / ...) but as
 * explicit rule lists. They serve two purposes:
 *   1. A sane default for new players.
 *   2. A starting point in the visual editor — duplicate and tweak.
 */

import type { PriorityListConfig } from './priority-list';

export const BUILTIN_LISTS: Record<string, PriorityListConfig> = {
  'aggressive-list': {
    id: 'aggressive-list',
    name: 'Aggressive (rules)',
    description: 'Spam Double Strafe on cooldown, auto-attack in between.',
    rules: [
      {
        id: 'r1', enabled: true, label: 'Buff: Improve Concentration',
        condition: { kind: 'and', conds: [
          { kind: 'skillLearned', skillId: 'Skill_Archer_ImproveConcentration', minLevel: 1 },
          { kind: 'statusMissing', id: 'Buff_ImproveConcentration' },
          { kind: 'skillReady', skillId: 'Skill_Archer_ImproveConcentration' },
        ] },
        action: { kind: 'castSkill', skillId: 'Skill_Archer_ImproveConcentration', target: 'self' },
      },
      {
        id: 'r2', enabled: true, label: 'Heal at low HP',
        condition: { kind: 'hpFraction', op: '<', value: 0.30 },
        action: { kind: 'useItem', itemId: 'Item_Consum_RedPotion' },
      },
      {
        id: 'r3', enabled: true, label: 'Double Strafe',
        condition: { kind: 'and', conds: [
          { kind: 'skillLearned', skillId: 'Skill_Archer_DoubleStrafe' },
          { kind: 'skillReady', skillId: 'Skill_Archer_DoubleStrafe' },
        ] },
        action: { kind: 'castSkill', skillId: 'Skill_Archer_DoubleStrafe', target: 'current' },
      },
      {
        id: 'r4', enabled: true, label: 'Auto-attack fallback',
        condition: { kind: 'true' },
        action: { kind: 'attack' },
      },
      {
        id: 'r5', enabled: true, label: 'Move forward if no target',
        condition: { kind: 'true' },
        action: { kind: 'moveForward' },
      },
    ],
  },

  'defensive-list': {
    id: 'defensive-list',
    name: 'Defensive (rules)',
    description: 'Auto-attack only. Heal early. Retreat at critical HP.',
    rules: [
      {
        id: 'r1', enabled: true, label: 'Retreat at critical HP',
        condition: { kind: 'hpFraction', op: '<', value: 0.20 },
        action: { kind: 'retreat' },
      },
      {
        id: 'r2', enabled: true, label: 'Heal at 50%',
        condition: { kind: 'hpFraction', op: '<', value: 0.50 },
        action: { kind: 'useItem', itemId: 'Item_Consum_RedPotion' },
      },
      {
        id: 'r3', enabled: true, label: 'Auto-attack',
        condition: { kind: 'true' },
        action: { kind: 'attack' },
      },
      {
        id: 'r4', enabled: true, label: 'Move forward',
        condition: { kind: 'true' },
        action: { kind: 'moveForward' },
      },
    ],
  },

  'aoe-list': {
    id: 'aoe-list',
    name: 'AoE Farmer (rules)',
    description: 'Arrow Shower when 3+ monsters are near. Double Strafe otherwise.',
    rules: [
      {
        id: 'r1', enabled: true, label: 'Buff: Improve Concentration',
        condition: { kind: 'and', conds: [
          { kind: 'skillLearned', skillId: 'Skill_Archer_ImproveConcentration' },
          { kind: 'statusMissing', id: 'Buff_ImproveConcentration' },
          { kind: 'skillReady', skillId: 'Skill_Archer_ImproveConcentration' },
        ] },
        action: { kind: 'castSkill', skillId: 'Skill_Archer_ImproveConcentration', target: 'self' },
      },
      {
        id: 'r2', enabled: true, label: 'Arrow Shower on clusters',
        condition: { kind: 'and', conds: [
          { kind: 'aggroCount', op: '>=', value: 3 },
          { kind: 'skillReady', skillId: 'Skill_Archer_ArrowShower' },
        ] },
        action: { kind: 'castSkill', skillId: 'Skill_Archer_ArrowShower', target: 'current' },
      },
      {
        id: 'r3', enabled: true, label: 'Heal if low',
        condition: { kind: 'hpFraction', op: '<', value: 0.40 },
        action: { kind: 'useItem', itemId: 'Item_Consum_OrangePotion' },
      },
      {
        id: 'r4', enabled: true, label: 'Double Strafe',
        condition: { kind: 'and', conds: [
          { kind: 'skillLearned', skillId: 'Skill_Archer_DoubleStrafe' },
          { kind: 'skillReady', skillId: 'Skill_Archer_DoubleStrafe' },
        ] },
        action: { kind: 'castSkill', skillId: 'Skill_Archer_DoubleStrafe', target: 'current' },
      },
      {
        id: 'r5', enabled: true, label: 'Auto-attack',
        condition: { kind: 'true' },
        action: { kind: 'attack' },
      },
      {
        id: 'r6', enabled: true, label: 'Move forward',
        condition: { kind: 'true' },
        action: { kind: 'moveForward' },
      },
    ],
  },

  'sniper-kite-list': {
    id: 'sniper-kite-list',
    name: 'Sniper Kite (rules)',
    description: 'Keep distance, snipe with Focused Arrow Strike.',
    rules: [
      {
        id: 'r1', enabled: true, label: 'Buff: True Sight',
        condition: { kind: 'and', conds: [
          { kind: 'skillLearned', skillId: 'Skill_Sniper_TrueSight' },
          { kind: 'statusMissing', id: 'Buff_TrueSight' },
          { kind: 'skillReady', skillId: 'Skill_Sniper_TrueSight' },
        ] },
        action: { kind: 'castSkill', skillId: 'Skill_Sniper_TrueSight', target: 'self' },
      },
      {
        id: 'r2', enabled: true, label: 'Retreat if too close',
        condition: { kind: 'targetDistance', op: '<', value: 3 },
        action: { kind: 'retreat' },
      },
      {
        id: 'r3', enabled: true, label: 'Focused Arrow Strike',
        condition: { kind: 'and', conds: [
          { kind: 'skillLearned', skillId: 'Skill_Sniper_FocusedArrowStrike' },
          { kind: 'skillReady', skillId: 'Skill_Sniper_FocusedArrowStrike' },
        ] },
        action: { kind: 'castSkill', skillId: 'Skill_Sniper_FocusedArrowStrike', target: 'current' },
      },
      {
        id: 'r4', enabled: true, label: 'Double Strafe',
        condition: { kind: 'skillReady', skillId: 'Skill_Archer_DoubleStrafe' },
        action: { kind: 'castSkill', skillId: 'Skill_Archer_DoubleStrafe', target: 'current' },
      },
      {
        id: 'r5', enabled: true, label: 'Auto-attack',
        condition: { kind: 'true' },
        action: { kind: 'attack' },
      },
    ],
  },
};

export const DEFAULT_LIST_ID = 'aggressive-list';
