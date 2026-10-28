import { BALANCE, xpToNext } from '../config';
import { ATTR_KEYS, type Attrs, type DerivedStats, type GameState, type SkillDef } from '../core/types';
import { SKILLS } from '../data/skills';

/* XP, nível, pontos, habilidades e penalidade de morte (GDD §4, §5 e §13). */

export interface XpResult {
  gained: number;
  leveledUp: boolean;
  discarded: number;
}

/** Soma XP. Ao subir de nível o XP volta a 0 e o excedente é descartado (regra do GDD). */
export function gainXp(state: GameState, amount: number): XpResult {
  const p = state.player;
  amount = Math.max(0, Math.floor(amount));
  if (amount === 0) return { gained: 0, leveledUp: false, discarded: 0 };
  const need = xpToNext(p.level);
  if (p.xp + amount >= need) {
    const discarded = p.xp + amount - need;
    p.level += 1;
    p.xp = 0;
    p.unspent += BALANCE.attrPointsPerLevel;
    p.skillPoints += BALANCE.skillPointsPerLevel;
    return { gained: amount, leveledUp: true, discarded };
  }
  p.xp += amount;
  return { gained: amount, leveledUp: false, discarded: 0 };
}

/** Distribui pontos (todos de uma vez, depois da prévia na interface). */
export function allocate(state: GameState, delta: Partial<Attrs>): boolean {
  const total = ATTR_KEYS.reduce((s, k) => s + (delta[k] ?? 0), 0);
  if (total <= 0 || total > state.player.unspent) return false;
  if (ATTR_KEYS.some((k) => (delta[k] ?? 0) < 0)) return false;
  for (const k of ATTR_KEYS) state.player.attrs[k] += delta[k] ?? 0;
  state.player.unspent -= total;
  return true;
}

export function mastery(state: GameState, skillId: string): number {
  return state.player.skills[skillId] ?? 0;
}

export function canLearn(state: GameState, skillId: string): { ok: boolean; reason?: string } {
  const def = SKILLS[skillId];
  if (!def) return { ok: false, reason: 'Habilidade desconhecida.' };
  const m = mastery(state, skillId);
  if (m >= BALANCE.maxMastery) return { ok: false, reason: 'Maestria máxima.' };
  if (state.player.skillPoints < 1) return { ok: false, reason: 'Sem pontos de habilidade.' };
  if (def.reqLevel && state.player.level < def.reqLevel) return { ok: false, reason: `Requer nível ${def.reqLevel}.` };
  if (def.req) {
    for (const k of ATTR_KEYS) {
      const need = (def.req[k] ?? 0) + (m > 0 ? m * 2 : 0) * ((def.req[k] ?? 0) > 0 ? 1 : 0);
      if (state.player.attrs[k] < need) return { ok: false, reason: `Requer ${k} ${need}.` };
    }
  }
  return { ok: true };
}

/** Requisito exibido para o próximo nível de maestria. */
export function nextReq(state: GameState, def: SkillDef): Partial<Attrs> {
  const m = mastery(state, def.id);
  const out: Partial<Attrs> = {};
  for (const k of ATTR_KEYS) {
    const base = def.req?.[k] ?? 0;
    if (base > 0) out[k] = base + (m > 0 ? m * 2 : 0);
  }
  return out;
}

export function learnOrUpgrade(state: GameState, skillId: string): boolean {
  if (!canLearn(state, skillId).ok) return false;
  state.player.skills[skillId] = mastery(state, skillId) + 1;
  state.player.skillPoints -= 1;
  // coloca no primeiro atalho livre quando aprende
  if (state.player.skills[skillId] === 1 && !state.player.hotbar.includes(skillId)) {
    const free = state.player.hotbar.indexOf(null);
    if (free >= 0) state.player.hotbar[free] = skillId;
  }
  return true;
}

export function skillPower(def: SkillDef, m: number, d: DerivedStats): number {
  const base = def.scale === 'atk' ? d.atk : def.scale === 'mag' ? d.mag : def.scale === 'heal' ? d.heal : (d.atk + d.mag) / 2;
  return base * def.power * (1 + 0.15 * (Math.max(1, m) - 1));
}

export function skillCooldown(def: SkillDef, m: number): number {
  return def.cd * (1 - 0.06 * (Math.max(1, m) - 1));
}

/**
 * Penalidade de morte: aplicada sobre o estado salvo, uma única vez por morte.
 * O id da morte fica registrado no próprio save; se o mesmo save for processado de novo
 * para a mesma morte, nada acontece.
 */
export function applyDeathPenalty(saved: GameState, deathId: string): { applied: boolean; lost: number; remaining: number } {
  if (saved.meta.lastPenalizedDeathId === deathId) {
    return { applied: false, lost: 0, remaining: saved.player.xp };
  }
  const before = saved.player.xp;
  const after = Math.floor(before * (1 - BALANCE.deathXpPenalty));
  saved.player.xp = after;
  saved.meta.lastPenalizedDeathId = deathId;
  saved.meta.lastDeathId = deathId;
  saved.meta.deaths += 1;
  return { applied: true, lost: before - after, remaining: after };
}
