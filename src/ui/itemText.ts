import { ATTR_KEYS, type ItemDef } from '../core/types';
import { RARITY_COLOR } from '../data/items';
import { game } from '../game';

const WEAPON_NAMES: Record<string, string> = {
  sword: 'Espada',
  axe: 'Machado',
  dagger: 'Adaga',
  mace: 'Maça',
  bow: 'Arco',
  staff: 'Cajado',
};
const ARMOR_NAMES: Record<string, string> = {
  head: 'Cabeça',
  chest: 'Peitoral',
  legs: 'Pernas',
  gloves: 'Luvas',
  cape: 'Capa',
};

export function itemSubtitle(def: ItemDef): string {
  if (def.weaponType) return `${WEAPON_NAMES[def.weaponType]} · ${def.hands === 'two' ? 'duas mãos' : 'uma mão'}`;
  if (def.offhandType) return def.offhandType === 'shield' ? 'Escudo · mão secundária' : 'Foco mágico · mão secundária';
  if (def.armorSlot) return `Armadura · ${ARMOR_NAMES[def.armorSlot]}`;
  switch (def.category) {
    case 'accessory':
      return 'Acessório';
    case 'consumable':
      return 'Consumível';
    case 'material':
      return 'Material';
    case 'quest':
      return 'Item de missão';
    default:
      return '';
  }
}

export function statLines(def: ItemDef): string[] {
  const s = def.stats;
  const out: string[] = [];
  if (s) {
    if (s.dmg) out.push(`Dano ${s.dmg}`);
    if (s.mag) out.push(`Magia +${s.mag}`);
    if (s.armor) out.push(`Armadura +${s.armor}`);
    if (s.hp) out.push(`Vida +${s.hp}`);
    if (s.mp) out.push(`Mana +${s.mp}`);
    if (s.crit) out.push(`Crítico +${Math.round(s.crit * 100)}%`);
    if (s.speed) out.push(`Velocidade +${Math.round(s.speed * 100)}%`);
    if (s.attrs) for (const k of ATTR_KEYS) if (s.attrs[k]) out.push(`${k} +${s.attrs[k]}`);
  }
  if (def.use?.heal) out.push(`Recupera ${def.use.heal} de vida`);
  if (def.use?.mana) out.push(`Recupera ${def.use.mana} de mana`);
  if (def.use?.regen) out.push(`Regenera ${def.use.regen} de vida em 10 s`);
  return out;
}

export function reqParts(def: ItemDef): { text: string; ok: boolean }[] {
  if (!def.req) return [];
  const a = game.state.player.attrs;
  return ATTR_KEYS.filter((k) => def.req![k]).map((k) => ({ text: `${k} ${def.req![k]}`, ok: a[k] >= def.req![k]! }));
}

export function rarityColor(def: ItemDef): string {
  return RARITY_COLOR[def.rarity ?? 'comum'];
}

export const STAT_LABEL: Record<string, string> = {
  dmg: 'Dano',
  mag: 'Magia',
  armor: 'Armadura',
  hp: 'Vida',
  mp: 'Mana',
  crit: 'Crítico',
};
