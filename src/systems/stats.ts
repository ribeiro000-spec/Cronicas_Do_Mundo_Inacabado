import { BALANCE } from '../config';
import { ATTR_KEYS, type AttackProfile, type Attrs, type DerivedStats, type EquipSlot, type GameState, type ItemDef } from '../core/types';
import { ITEMS } from '../data/items';

/* Atributos efetivos e estatísticas derivadas. A distribuição base nunca é alterada por
 * equipamentos ou efeitos — eles só somam por cima (GDD §4). */

/** Retornos decrescentes acima do limite suave. */
export function eff(v: number): number {
  const cap = BALANCE.attrSoftCap;
  return v <= cap ? v : cap + (v - cap) * 0.5;
}

export function equippedItems(state: GameState): { slot: EquipSlot; def: ItemDef }[] {
  const out: { slot: EquipSlot; def: ItemDef }[] = [];
  for (const [slot, id] of Object.entries(state.equipment) as [EquipSlot, string | null][]) {
    if (id && ITEMS[id]) out.push({ slot, def: ITEMS[id] });
  }
  return out;
}

export function totalAttrs(state: GameState, base: Attrs = state.player.attrs): Attrs {
  const a = { ...base };
  for (const { def } of equippedItems(state)) {
    const bonus = def.stats?.attrs;
    if (!bonus) continue;
    for (const k of ATTR_KEYS) a[k] += bonus[k] ?? 0;
  }
  return a;
}

function attackFor(state: GameState, atk: number, mag: number): AttackProfile {
  const main = state.equipment.mainHand ? ITEMS[state.equipment.mainHand] : null;
  const wt = main?.weaponType ?? 'fist';
  switch (wt) {
    case 'bow':
      return { kind: 'arrow', range: 8, arc: 0, cooldown: 0.62, power: atk, scale: 'atk', weaponType: wt };
    case 'staff':
      return { kind: 'orb', range: 7, arc: 0, cooldown: 0.66, power: mag * 0.85, scale: 'mag', weaponType: wt };
    case 'axe':
      return { kind: 'melee', range: 1.6, arc: 2.2, cooldown: 0.78, power: atk * 1.3, scale: 'atk', weaponType: wt };
    case 'dagger':
      return { kind: 'melee', range: 1.15, arc: 1.6, cooldown: 0.32, power: atk * 0.8, scale: 'atk', weaponType: wt };
    case 'mace':
      return { kind: 'melee', range: 1.35, arc: 1.8, cooldown: 0.55, power: atk, scale: 'atk', weaponType: wt };
    case 'sword':
      return { kind: 'melee', range: 1.45, arc: 1.9, cooldown: 0.45, power: atk, scale: 'atk', weaponType: wt };
    default:
      return { kind: 'melee', range: 1.1, arc: 1.6, cooldown: 0.45, power: atk * 0.6, scale: 'atk', weaponType: 'fist' };
  }
}

export function derive(state: GameState, baseOverride?: Attrs): DerivedStats {
  const p = state.player;
  const a = totalAttrs(state, baseOverride ?? p.attrs);
  const e = (k: keyof Attrs) => eff(a[k]);
  let weaponDmg = 0;
  let itemMag = 0;
  let armor = 0;
  let hp = 0;
  let mp = 0;
  let crit = 0;
  let speed = 0;
  let offhandWeaponDmg = 0;
  for (const { slot, def } of equippedItems(state)) {
    const s = def.stats ?? {};
    if (slot === 'mainHand') weaponDmg += s.dmg ?? 0;
    else if (slot === 'offHand' && def.weaponType) offhandWeaponDmg += s.dmg ?? 0;
    itemMag += s.mag ?? 0;
    armor += s.armor ?? 0;
    hp += s.hp ?? 0;
    mp += s.mp ?? 0;
    crit += s.crit ?? 0;
    speed += s.speed ?? 0;
  }
  const main = state.equipment.mainHand ? ITEMS[state.equipment.mainHand] : null;
  const wt = main?.weaponType;
  const physAttr = wt === 'bow' || wt === 'dagger' ? e('DES') : wt === 'mace' ? e('FOR') * 0.7 + e('VON') * 0.5 : e('FOR');

  const atk = Math.max(2, weaponDmg + offhandWeaponDmg * 0.45 + physAttr * 1.25 + p.level * 0.6);
  const mag = Math.max(1, itemMag + e('INT') * 1.45 + e('AFI') * 0.55 + p.level * 0.6);
  const heal = e('VON') * 1.3 + e('AFI') * 0.9 + itemMag * 0.4 + p.level;
  const totalArmor = armor + e('VIG') * 0.45;
  const critChance = Math.min(0.75, 0.05 + 0.25 * (1 - Math.exp(-e('DES') / 40)) + crit);

  return {
    maxHp: Math.round(40 + e('VIG') * 10 + p.level * 6 + hp),
    maxMp: Math.round(20 + e('VON') * 6 + e('INT') * 2 + p.level * 2 + mp),
    atk,
    mag,
    heal,
    armor: totalArmor,
    crit: critChance,
    critMult: 1.6 + Math.min(0.4, e('DES') * 0.005),
    speed: 3.4 * (1 + Math.min(0.2, e('DES') * 0.004)) + speed * 3.4,
    attack: attackFor(state, atk, mag),
    attrs: a,
  };
}

/** Requisitos de um item contra os atributos base (sem bônus de equipamento). */
export function meetsReq(state: GameState, def: ItemDef): boolean {
  if (!def.req) return true;
  const a = state.player.attrs;
  return ATTR_KEYS.every((k) => (def.req![k] ?? 0) <= a[k]);
}

/** Dano recebido depois da armadura. */
export function mitigate(dmg: number, armor: number): number {
  return Math.max(1, Math.round(dmg * (50 / (50 + Math.max(0, armor)))));
}
