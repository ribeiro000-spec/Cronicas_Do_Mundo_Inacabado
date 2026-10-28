import { CODEX, CODEX_LIST } from '../../data/codex';
import { game } from '../../game';
import { h } from '../dom';
import type { PanelCtx } from '../Menu';

let selected: string | null = null;

export function renderCodex(el: HTMLElement, ctx: PanelCtx): void {
  const known = game.state.codex.filter((id) => CODEX[id]);
  if (!selected || !known.includes(selected)) selected = known[known.length - 1] ?? null;
  const cats = new Map<string, string[]>();
  for (const e of CODEX_LIST) {
    if (!known.includes(e.id)) continue;
    if (!cats.has(e.category)) cats.set(e.category, []);
    cats.get(e.category)!.push(e.id);
  }
  const list = h('div', null, h('div', { class: 'muted', style: 'font-size:13px' }, `${known.length} de ${CODEX_LIST.length} descobertas`));
  for (const [cat, ids] of cats) {
    list.appendChild(h('div', { class: 'list-section' }, cat));
    for (const id of ids) {
      list.appendChild(h('button', { class: `list-item${id === selected ? ' sel' : ''}`, onclick: () => ((selected = id), ctx.rerender()) }, CODEX[id].title));
    }
  }
  const missing = CODEX_LIST.length - known.length;
  if (missing > 0) list.appendChild(h('div', { class: 'list-section' }, `??? (${missing} por descobrir)`));
  const entry = selected ? CODEX[selected] : null;
  const detail = h(
    'div',
    { class: 'card' },
    entry
      ? [h('div', { class: 'muted', style: 'font-size:12px' }, entry.category), h('h3', { style: 'font-size:22px;margin:4px 0 10px' }, entry.title), h('p', { class: 'codex-text' }, entry.text)]
      : h('p', { class: 'muted' }, 'Explore, converse e complete missões para preencher o diário.'),
  );
  el.appendChild(h('div', { class: 'list-detail' }, list, detail));
}
