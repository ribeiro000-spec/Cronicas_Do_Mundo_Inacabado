import { BALANCE } from '../config';
import type { EquipSlot, GameState, ItemDef } from '../core/types';
import { ITEMS } from '../data/items';
import { meetsReq } from './stats';

/* Inventário com pilhas e equipamento modular por slots.
 * Regras do GDD: armas de duas mãos ocupam (e bloqueiam) a mão secundária;
 * espada + escudo, duas adagas, arma de uma mão + foco são combinações válidas. */

export function count(state: GameState, id: string): number {
  return state.inventory.reduce((s, e) => (e.id === id ? s + e.qty : s), 0);
}

export function usedSlots(state: GameState): number {
  return state.inventory.length;
}

function maxStack(def: ItemDef): number {
  return def.stack ?? 1;
}

/** Quantas unidades cabem. */
export function room(state: GameState, id: string): number {
  const def = ITEMS[id];
  if (!def) return 0;
  const stack = maxStack(def);
  let r = 0;
  for (const e of state.inventory) if (e.id === id) r += stack - e.qty;
  r += (BALANCE.inventorySize - state.inventory.length) * stack;
  return r;
}

/** Adiciona até `qty`; devolve quanto coube. */
export function addItem(state: GameState, id: string, qty = 1): number {
  const def = ITEMS[id];
  if (!def || qty <= 0) return 0;
  const stack = maxStack(def);
  let left = qty;
  for (const e of state.inventory) {
    if (left <= 0) break;
    if (e.id !== id || e.qty >= stack) continue;
    const put = Math.min(stack - e.qty, left);
    e.qty += put;
    left -= put;
  }
  while (left > 0 && state.inventory.length < BALANCE.inventorySize) {
    const put = Math.min(stack, left);
    state.inventory.push({ id, qty: put });
    left -= put;
  }
  return qty - left;
}

export function removeItem(state: GameState, id: string, qty = 1): boolean {
  if (count(state, id) < qty) return false;
  let left = qty;
  for (let i = state.inventory.length - 1; i >= 0 && left > 0; i--) {
    const e = state.inventory[i];
    if (e.id !== id) continue;
    const take = Math.min(e.qty, left);
    e.qty -= take;
    left -= take;
    if (e.qty <= 0) state.inventory.splice(i, 1);
  }
  return true;
}

export function removeAt(state: GameState, index: number, qty = 1): boolean {
  const e = state.inventory[index];
  if (!e || e.qty < qty) return false;
  e.qty -= qty;
  if (e.qty <= 0) state.inventory.splice(index, 1);
  return true;
}

export type EquipResult = { ok: true; msg?: string } | { ok: false; reason: string };

export function isEquippable(def: ItemDef): boolean {
  return def.category === 'weapon' || def.category === 'armor' || def.category === 'accessory';
}

/** Slots possíveis para um item (para mostrar os botões certos na interface). */
export function slotOptions(state: GameState, def: ItemDef): EquipSlot[] {
  if (def.category === 'armor' && def.armorSlot) return [def.armorSlot];
  if (def.category === 'accessory') return ['acc1', 'acc2'];
  if (def.offhandType) return ['offHand'];
  if (def.weaponType) {
    if (def.hands === 'two') return ['mainHand'];
    const main = state.equipment.mainHand ? ITEMS[state.equipment.mainHand] : null;
    const canOff = !main || main.hands !== 'two';
    return canOff ? ['mainHand', 'offHand'] : ['mainHand'];
  }
  return [];
}

export const SLOT_NAMES: Record<EquipSlot, string> = {
  head: 'Cabeça',
  chest: 'Peitoral',
  legs: 'Pernas e botas',
  gloves: 'Luvas',
  cape: 'Capa',
  mainHand: 'Mão principal',
  offHand: 'Mão secundária',
  acc1: 'Acessório 1',
  acc2: 'Acessório 2',
};

export function equipFromInventory(state: GameState, invIndex: number, target?: EquipSlot): EquipResult {
  const entry = state.inventory[invIndex];
  if (!entry) return { ok: false, reason: 'Item não encontrado.' };
  const def = ITEMS[entry.id];
  if (!def || !isEquippable(def)) return { ok: false, reason: 'Este item não pode ser equipado.' };
  if (!meetsReq(state, def)) return { ok: false, reason: 'Você não cumpre os requisitos de atributo.' };

  const options = slotOptions(state, def);
  let slot: EquipSlot | undefined = target && options.includes(target) ? target : undefined;
  if (!slot) {
    if (def.category === 'accessory') slot = !state.equipment.acc1 ? 'acc1' : !state.equipment.acc2 ? 'acc2' : 'acc1';
    else slot = options[0];
  }
  if (!slot) return { ok: false, reason: 'Nenhum espaço compatível.' };

  // o que sai do corpo
  const toUnequip: EquipSlot[] = [];
  if (state.equipment[slot]) toUnequip.push(slot);
  if (slot === 'mainHand' && def.hands === 'two' && state.equipment.offHand) toUnequip.push('offHand');
  if (slot === 'offHand') {
    const main = state.equipment.mainHand ? ITEMS[state.equipment.mainHand] : null;
    if (main?.hands === 'two') toUnequip.push('mainHand');
  }

  // espaço: o item equipado libera uma vaga (se for o último da pilha)
  const freed = entry.qty === 1 ? 1 : 0;
  const free = BALANCE.inventorySize - state.inventory.length + freed;
  if (toUnequip.length > free) return { ok: false, reason: 'Inventário cheio.' };

  removeAt(state, invIndex, 1);
  const msgs: string[] = [];
  for (const s of toUnequip) {
    const id = state.equipment[s];
    if (!id) continue;
    state.equipment[s] = null;
    addItem(state, id, 1);
    if (s !== slot) msgs.push(`${ITEMS[id].name} foi para o inventário (mãos ocupadas).`);
  }
  state.equipment[slot] = def.id;
  return { ok: true, msg: msgs.join(' ') || undefined };
}

export function unequip(state: GameState, slot: EquipSlot): EquipResult {
  const id = state.equipment[slot];
  if (!id) return { ok: false, reason: 'Nada equipado.' };
  if (room(state, id) < 1) return { ok: false, reason: 'Inventário cheio.' };
  state.equipment[slot] = null;
  addItem(state, id, 1);
  return { ok: true };
}

/** Comparação simples: diferença de estatísticas entre o item e o que está no slot. */
export function compareWithEquipped(state: GameState, def: ItemDef, slot?: EquipSlot): Record<string, number> {
  const s = slot ?? slotOptions(state, def)[0];
  const cur = s && state.equipment[s] ? ITEMS[state.equipment[s]!] : null;
  const keys = ['dmg', 'mag', 'armor', 'hp', 'mp'] as const;
  const out: Record<string, number> = {};
  for (const k of keys) {
    const d = (def.stats?.[k] ?? 0) - (cur?.stats?.[k] ?? 0);
    if (d !== 0) out[k] = d;
  }
  const dc = (def.stats?.crit ?? 0) - (cur?.stats?.crit ?? 0);
  if (dc !== 0) out.crit = dc;
  return out;
}
