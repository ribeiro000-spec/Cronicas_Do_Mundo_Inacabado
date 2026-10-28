import { BALANCE } from '../../config';
import type { EquipSlot, ItemCategory } from '../../core/types';
import { ITEMS } from '../../data/items';
import { playerLook } from '../../entities/Player';
import { game } from '../../game';
import { fullFigureCanvas } from '../../render/characterArt';
import { itemIcon } from '../../render/icons';
import { SLOT_NAMES, compareWithEquipped, isEquippable, slotOptions } from '../../systems/inventory';
import { meetsReq } from '../../systems/stats';
import { h, img } from '../dom';
import { STAT_LABEL, itemSubtitle, rarityColor, reqParts, statLines } from '../itemText';
import type { PanelCtx } from '../Menu';
import { confirmBox } from '../modal';

type Filter = 'all' | 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'quest';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'weapon', label: 'Armas' },
  { id: 'armor', label: 'Armaduras' },
  { id: 'accessory', label: 'Acessórios' },
  { id: 'consumable', label: 'Consumíveis' },
  { id: 'material', label: 'Materiais' },
  { id: 'quest', label: 'Missão' },
];

let filter: Filter = 'all';
let search = '';
let selected: { kind: 'inv'; index: number } | { kind: 'eq'; slot: EquipSlot } | null = null;

const LEFT: EquipSlot[] = ['head', 'chest', 'legs', 'gloves', 'cape'];
const RIGHT: EquipSlot[] = ['mainHand', 'offHand', 'acc1', 'acc2'];
const SLOT_SHORT: Record<EquipSlot, string> = {
  head: 'Cabeça',
  chest: 'Peito',
  legs: 'Pernas',
  gloves: 'Luvas',
  cape: 'Capa',
  mainHand: 'Mão princ.',
  offHand: 'Mão sec.',
  acc1: 'Acess. 1',
  acc2: 'Acess. 2',
};

export function renderInventory(el: HTMLElement, ctx: PanelCtx): void {
  const st = game.state;
  const eq = st.equipment;
  if (selected?.kind === 'inv' && !st.inventory[selected.index]) selected = null;

  const slotBtn = (slot: EquipSlot) => {
    const id = eq[slot];
    const def = id ? ITEMS[id] : null;
    const main = eq.mainHand ? ITEMS[eq.mainHand] : null;
    const locked = slot === 'offHand' && main?.hands === 'two';
    const sel = selected?.kind === 'eq' && selected.slot === slot;
    return h(
      'button',
      {
        class: `slot${sel ? ' sel' : ''}${locked ? ' locked' : ''}`,
        title: SLOT_NAMES[slot],
        onclick: () => {
          selected = { kind: 'eq', slot };
          ctx.rerender();
        },
      },
      def ? img(itemIcon(def)) : h('span', { class: 'ph' }, locked ? 'Duas mãos' : SLOT_SHORT[slot]),
    );
  };

  const fig = fullFigureCanvas(playerLook(), 4);
  const doll = h(
    'div',
    { class: 'card' },
    h('h3', null, 'Equipamento'),
    h('div', { class: 'doll' }, h('div', { class: 'slots' }, LEFT.map(slotBtn)), h('div', { class: 'figure' }, fig), h('div', { class: 'slots' }, RIGHT.map(slotBtn))),
    h('small', { class: 'muted' }, 'Cada peça muda só a parte correspondente do personagem. Armas de duas mãos ocupam a mão secundária.'),
  );

  // grade
  const q = search.trim().toLowerCase();
  const grid = h('div', { class: 'inv-grid' });
  st.inventory.forEach((e, i) => {
    const def = ITEMS[e.id];
    if (filter !== 'all' && def.category !== (filter as ItemCategory)) return;
    if (q && !def.name.toLowerCase().includes(q)) return;
    const sel = selected?.kind === 'inv' && selected.index === i;
    const unmet = isEquippable(def) && !meetsReq(st, def);
    grid.appendChild(
      h(
        'button',
        {
          class: `slot${sel ? ' sel' : ''}${unmet ? ' unmet' : ''}`,
          style: `border-color:${def.rarity && def.rarity !== 'comum' ? rarityColor(def) : ''}`,
          title: def.name,
          onclick: () => {
            selected = { kind: 'inv', index: i };
            ctx.rerender();
          },
          ondblclick: () => {
            if (isEquippable(def)) game.equip(i);
            else if (def.use) game.useItem(i);
          },
        },
        img(itemIcon(def)),
        e.qty > 1 ? h('span', { class: 'qty' }, String(e.qty)) : null,
      ),
    );
  });
  for (let k = st.inventory.length; k < BALANCE.inventorySize && filter === 'all' && !q; k++) grid.appendChild(h('div', { class: 'slot', style: 'opacity:.35' }));

  const searchInput = h('input', { type: 'text', placeholder: 'Buscar…', value: search, style: 'flex:1;min-width:120px' }) as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    search = searchInput.value;
    ctx.rerender();
    const again = el.querySelector('input[type=text]') as HTMLInputElement | null;
    again?.focus();
    again?.setSelectionRange(again.value.length, again.value.length);
  });
  searchInput.addEventListener('keydown', (e) => e.stopPropagation());

  const right = h(
    'div',
    { class: 'card' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { style: 'margin:0' }, 'Inventário'), h('span', { class: 'muted' }, `${st.inventory.length}/${BALANCE.inventorySize}`), h('span', { class: 'gold-line' }, `🪙 ${st.player.gold}`)),
    h(
      'div',
      { class: 'filters', style: 'margin-top:8px' },
      FILTERS.map((f) => h('button', { class: `chip${filter === f.id ? ' sel' : ''}`, onclick: () => ((filter = f.id), ctx.rerender()) }, f.label)),
      searchInput,
    ),
    grid,
    detail(ctx),
  );

  el.appendChild(h('div', { class: 'inv-layout' }, doll, right));
}

function detail(ctx: PanelCtx): HTMLElement | null {
  const st = game.state;
  if (!selected) return h('p', { class: 'muted', style: 'font-size:13px;margin-top:10px' }, 'Toque num item para ver detalhes. Toque duas vezes para equipar ou usar.');
  let def;
  let qty = 1;
  let index = -1;
  if (selected.kind === 'inv') {
    const e = st.inventory[selected.index];
    if (!e) return null;
    def = ITEMS[e.id];
    qty = e.qty;
    index = selected.index;
  } else {
    const id = st.equipment[selected.slot];
    if (!id) return h('p', { class: 'muted', style: 'margin-top:10px' }, `${SLOT_NAMES[selected.slot]}: vazio.`);
    def = ITEMS[id];
  }
  const reqs = reqParts(def);
  const stats = statLines(def);
  const actions: HTMLElement[] = [];
  let compare: HTMLElement | null = null;

  if (selected.kind === 'inv') {
    if (isEquippable(def)) {
      const opts = slotOptions(st, def);
      const ok = meetsReq(st, def);
      if (def.category === 'accessory') {
        actions.push(h('button', { class: 'btn small primary', disabled: !ok, onclick: () => game.equip(index, 'acc1') }, 'Equipar (acess. 1)'));
        actions.push(h('button', { class: 'btn small', disabled: !ok, onclick: () => game.equip(index, 'acc2') }, 'Equipar (acess. 2)'));
      } else if (opts.length > 1) {
        actions.push(h('button', { class: 'btn small primary', disabled: !ok, onclick: () => game.equip(index, 'mainHand') }, 'Mão principal'));
        actions.push(h('button', { class: 'btn small', disabled: !ok, onclick: () => game.equip(index, 'offHand') }, 'Mão secundária'));
      } else {
        actions.push(h('button', { class: 'btn small primary', disabled: !ok, onclick: () => game.equip(index) }, 'Equipar'));
      }
      const diff = compareWithEquipped(st, def);
      const keys = Object.keys(diff);
      compare = keys.length
        ? h(
            'div',
            { class: 'reqs', style: 'margin-top:4px' },
            h('span', { class: 'muted' }, 'Comparado ao equipado:'),
            keys.map((k) => {
              const v = diff[k];
              const txt = k === 'crit' ? `${Math.round(v * 100)}%` : String(v);
              return h('span', { class: v > 0 ? 'good' : 'bad' }, `${STAT_LABEL[k]} ${v > 0 ? '+' : ''}${txt}`);
            }),
          )
        : h('div', { class: 'muted', style: 'font-size:12px;margin-top:4px' }, 'Mesmos valores do item equipado.');
      if (def.hands === 'two' && st.equipment.offHand) actions.push(h('small', { class: 'muted' }, 'Vai liberar a mão secundária.'));
    }
    if (def.use) actions.push(h('button', { class: 'btn small primary', onclick: () => game.useItem(index) }, 'Usar'));
    if (def.category !== 'quest') {
      actions.push(
        h(
          'button',
          {
            class: 'btn small danger',
            onclick: async () => {
              const okDrop = await confirmBox('Descartar item', `Descartar ${qty > 1 ? 'todos os ' + qty + '× ' : ''}${def.name}? Não dá para desfazer.`, 'Descartar', true);
              if (okDrop) {
                game.dropItem(index, qty);
                selected = null;
                ctx.rerender();
              }
            },
          },
          'Descartar',
        ),
      );
    }
  } else {
    const slot = selected.slot;
    actions.push(h('button', { class: 'btn small', onclick: () => game.unequip(slot) }, 'Desequipar'));
  }
  const sell = game.sellPrice(def.id);
  return h(
    'div',
    { class: 'item-detail card', style: 'background:var(--panel-3)' },
    h(
      'div',
      { class: 'i-head' },
      img(itemIcon(def)),
      h('div', null, h('div', { class: 'i-name', style: `color:${rarityColor(def)}` }, def.name, qty > 1 ? ` ×${qty}` : ''), h('div', { class: 'muted', style: 'font-size:12px' }, itemSubtitle(def), def.rarity ? ` · ${def.rarity}` : '')),
    ),
    stats.length ? h('div', { class: 'reqs', style: 'margin-top:6px;font-size:13px' }, stats.map((s) => h('span', null, s))) : null,
    reqs.length ? h('div', { class: 'reqs', style: 'margin-top:4px' }, h('span', { class: 'muted' }, 'Requer:'), reqs.map((r) => h('span', { class: r.ok ? 'good' : 'bad' }, r.text))) : null,
    compare,
    h('div', { class: 'i-desc' }, def.desc),
    sell > 0 ? h('small', { class: 'muted' }, `Valor de venda: ${sell} 🪙`) : null,
    h('div', { class: 'actions-row' }, actions),
  );
}
