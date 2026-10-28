import { bus } from '../core/events';
import { ITEMS } from '../data/items';
import { SHOPS } from '../data/loot';
import { game } from '../game';
import { itemIcon } from '../render/icons';
import { clear, h, img } from './dom';
import { itemSubtitle, rarityColor, reqParts, statLines } from './itemText';
import { openModal } from './modal';

/* Loja: comprar e vender. O preço de compra muda com a reputação da facção da loja. */
export function openShop(shopId: string): void {
  const shop = SHOPS[shopId];
  if (!shop) return;
  let tab: 'buy' | 'sell' = 'buy';
  const body = h('div');
  const goldEl = h('div', { class: 'gold-line' });
  const tabs = h('div', { class: 'chips', style: 'margin:8px 0' });
  const content = h('div', null, h('div', { class: 'row' }, h('h2', { class: 'grow', style: 'margin:0' }, shop.name), goldEl), tabs, body);
  const m = openModal(content, { wide: true, onClose: () => off() });

  const render = () => {
    goldEl.textContent = `🪙 ${game.state.player.gold}`;
    clear(tabs);
    for (const [id, label] of [['buy', 'Comprar'], ['sell', 'Vender']] as const) {
      tabs.appendChild(
        h('button', { class: `chip${tab === id ? ' sel' : ''}`, onclick: () => ((tab = id), render()) }, label),
      );
    }
    const mult = game.priceMultiplier(shopId);
    if (mult !== 1) {
      tabs.appendChild(h('span', { class: 'muted', style: 'font-size:12px;align-self:center' }, mult < 1 ? `Desconto de reputação: ${Math.round((1 - mult) * 100)}%` : `Sobretaxa: ${Math.round((mult - 1) * 100)}%`));
    }
    clear(body);
    if (tab === 'buy') {
      for (const id of shop.stock) {
        const def = ITEMS[id];
        const price = game.buyPrice(shopId, id);
        const reqs = reqParts(def);
        const canAfford = game.state.player.gold >= price;
        body.appendChild(
          h(
            'div',
            { class: 'shop-row' },
            img(itemIcon(def)),
            h(
              'div',
              null,
              h('b', { style: `color:${rarityColor(def)}` }, def.name),
              h('small', null, [itemSubtitle(def), ...statLines(def)].filter(Boolean).join(' · ')),
              reqs.length ? h('small', null, 'Requer: ', reqs.map((r) => h('span', { class: r.ok ? 'good' : 'bad' }, r.text + ' '))) : null,
            ),
            h(
              'div',
              { class: 'col', style: 'align-items:flex-end;gap:4px' },
              h('span', { class: 'p' }, `${price} 🪙`),
              h('button', { class: 'btn small primary', disabled: !canAfford, onclick: () => game.buy(shopId, id) }, 'Comprar'),
            ),
          ),
        );
      }
    } else {
      const inv = game.state.inventory;
      if (!inv.length) body.appendChild(h('p', { class: 'muted' }, 'Inventário vazio.'));
      inv.forEach((e, idx) => {
        const def = ITEMS[e.id];
        const price = game.sellPrice(e.id);
        body.appendChild(
          h(
            'div',
            { class: 'shop-row' },
            img(itemIcon(def)),
            h('div', null, h('b', { style: `color:${rarityColor(def)}` }, `${def.name}${e.qty > 1 ? ` ×${e.qty}` : ''}`), h('small', null, itemSubtitle(def))),
            price > 0
              ? h(
                  'div',
                  { class: 'col', style: 'align-items:flex-end;gap:4px' },
                  h('span', { class: 'p' }, `${price} 🪙`),
                  h(
                    'div',
                    { class: 'row' },
                    e.qty > 1 ? h('button', { class: 'btn small ghost', onclick: () => game.sell(idx, e.qty) }, 'Tudo') : null,
                    h('button', { class: 'btn small', onclick: () => game.sell(idx, 1) }, 'Vender'),
                  ),
                )
              : h('span', { class: 'muted', style: 'font-size:12px' }, 'Não vendável'),
          ),
        );
      });
    }
    body.appendChild(h('div', { class: 'm-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Fechar')));
  };
  const off = bus.on('inventory:changed', render);
  render();
}
