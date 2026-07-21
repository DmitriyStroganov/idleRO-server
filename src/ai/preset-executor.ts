/**
 * Preset executor (AI Level 1).
 *
 * Turns a `PresetStrategyConfig` into a working `AiStrategy`. This is the
 * simplest behaviour layer — but it already produces fun, RO-like combat
 * because the underlying sim handles ASPD, cast bars, status effects, etc.
 */

import type {
  Action,
  Character,
  SkillId,
} from '@engine/types';
import type { AiContext, AiStrategy } from './strategy';
import type { PresetStrategyConfig } from './strategy';
import { SKILLS } from '@data/skills';

/**
 * Build an executable strategy from a preset config.
 * The returned object is pure — same context → same action.
 */
export function presetStrategy(cfg: PresetStrategyConfig): AiStrategy {
  return {
    id: `preset:${cfg.id}`,
    name: cfg.name,
    decide(ctx: AiContext): Action {
      const { self, monsters } = ctx;
      if (self.hp <= 0) return { type: 'death' };

      // HP-based retreat
      const hpFrac = self.hp / self.maxHp;
      if (cfg.retreatThreshold !== undefined && hpFrac <= cfg.retreatThreshold) {
        // Walk backwards (lower X) — toward town.
        return { type: 'moveTo', target: { x: self.position.x - 10, y: 0 } };
      }

      // Heal?
      if (cfg.healThreshold !== undefined && hpFrac <= cfg.healThreshold) {
        // Look for a heal potion in inventory.
        const potion = self.inventory.find(
          (e) => e.itemId === 'Item_Consum_RedPotion' || e.itemId === 'Item_Consum_OrangePotion',
        );
        if (potion && potion.count > 0) {
          return { type: 'useItem', itemId: potion.itemId };
        }
        // Or use First Aid if learned (Novice).
        if ((self.skills['Skill_Novice_FirstAid'] ?? 0) > 0) {
          return { type: 'castSkill', skillId: 'Skill_Novice_FirstAid', targetUid: self.uid };
        }
      }

      // Maintain buffs: find one that's not currently active AND we can cast.
      const missingBuff = (cfg.buffsToMaintain ?? []).find((sid) => {
        const learned = self.skills[sid] ?? 0;
        if (learned === 0) return false;
        if (self.statusEffects.some((se) => se.id === buffStatusId(sid))) return false;
        return canCastNow(self, sid, ctx.tick);
      });
      if (missingBuff) {
        return { type: 'castSkill', skillId: missingBuff, targetUid: self.uid };
      }

      // Pick target: nearest monster within aggro range.
      const target = nearestMonster(self, monsters, AGGRO_RANGE);
      if (!target) {
        // No enemies — walk forward (to the right) by default.
        return { type: 'moveTo', target: { x: self.position.x + 4, y: 0 } };
      }

      const distance = Math.abs(target.position.x - self.position.x);

      // Keep-distance behaviour (kiting).
      if (cfg.keepDistance > 0) {
        if (distance < cfg.keepDistance) {
          // Too close — back off.
          return { type: 'moveTo', target: { x: self.position.x - 2, y: 0 } };
        }
      }

      // Use AoE if 3+ monsters near us.
      const clustered = monsters.filter(
        (m) => Math.abs(m.position.x - self.position.x) <= 3 && m.hp > 0,
      );
      if (cfg.aoeSkill && clustered.length >= 3 && (self.skills[cfg.aoeSkill] ?? 0) > 0) {
        if (canCastNow(self, cfg.aoeSkill, ctx.tick)) {
          return { type: 'castSkill', skillId: cfg.aoeSkill, targetUid: target.uid };
        }
      }

      // Primary damage skill.
      if (cfg.primaryDamageSkill && (self.skills[cfg.primaryDamageSkill] ?? 0) > 0) {
        if (canCastNow(self, cfg.primaryDamageSkill, ctx.tick)) {
          return { type: 'castSkill', skillId: cfg.primaryDamageSkill, targetUid: target.uid };
        }
      }

      // Fall back to auto-attack.
      if (cfg.useAutoAttack && ctx.tick >= self.nextAttackAt) {
        return { type: 'attack', targetUid: target.uid };
      }

      // Idle — reposition toward target.
      return { type: 'moveTo', target: { x: target.position.x, y: 0 } };
    },
  };
}

/** Distance within which the AI notices monsters. */
const AGGRO_RANGE = 14;

function nearestMonster(
  self: Character,
  monsters: ReadonlyArray<{ uid: string; position: { x: number }; hp: number }>,
  range: number,
) {
  let best: { uid: string; position: { x: number }; hp: number } | undefined;
  let bestDist = Infinity;
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const d = Math.abs(m.position.x - self.position.x);
    if (d <= range && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

/** Whether the skill is ready to cast right now (no cast in progress, not on delay). */
function canCastNow(self: Character, skillId: SkillId, tick: number): boolean {
  if (self.casting) return false;
  if (tick < self.castFinishAt) return false;        // still in after-cast delay
  const def = SKILLS[skillId];
  if (!def) return false;
  const level = self.skills[skillId] ?? 0;
  if (level === 0) return false;                     // not learned
  // Use the SP cost of the CURRENT learned level — not level 1.
  // (e.g. Improve Concentration at lv5 costs 16 SP, not 8.)
  const sp = def.spCost[level - 1] ?? 0;
  if (self.sp < sp) return false;
  return true;
}

/** Map a buff skill to its on-character status-effect id. */
function buffStatusId(skillId: SkillId): string {
  switch (skillId) {
    case 'Skill_Archer_ImproveConcentration': return 'Buff_ImproveConcentration';
    case 'Skill_Archer_OwlsEye':              return 'Buff_OwlsEye';
    case 'Skill_Archer_VulturesEye':          return 'Buff_VulturesEye';
    case 'Skill_Sniper_TrueSight':            return 'Buff_TrueSight';
    case 'Skill_Sniper_WindWalker':           return 'Buff_WindWalker';
    case 'Skill_Sniper_FalconEyes':           return 'Buff_FalconEyes';
    default: return `Buff_${skillId}`;
  }
}
