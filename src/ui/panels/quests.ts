import { bus } from '../../core/events';
import { NPCS } from '../../data/npcs';
import { QUESTS, QUEST_LIST } from '../../data/quests';
import { game } from '../../game';
import { h } from '../dom';
import type { PanelCtx } from '../Menu';

let selectedId: string | null = null;

export function renderQuests(el: HTMLElement, ctx: PanelCtx): void {
  const st = game.state;
  if (typeof ctx.arg === 'string') selectedId = ctx.arg;
  const groups: { title: string; ids: string[]; cls: string }[] = [
    { title: 'Ativas', ids: [], cls: '' },
    { title: 'Disponíveis', ids: [], cls: '' },
    { title: 'Concluídas', ids: [], cls: 'done' },
    { title: 'Rotas fechadas', ids: [], cls: 'closed' },
    { title: 'Falhadas', ids: [], cls: 'closed' },
  ];
  for (const q of QUEST_LIST) {
    const s = game.quests.status(q.id);
    if (s === 'active') groups[0].ids.push(q.id);
    else if (s === 'available' && !q.autoStart && q.id !== 'q_fragmento') groups[1].ids.push(q.id);
    else if (s === 'done') groups[2].ids.push(q.id);
    else if (s === 'closed') groups[3].ids.push(q.id);
    else if (s === 'failed') groups[4].ids.push(q.id);
  }
  if (!selectedId || !QUESTS[selectedId]) selectedId = st.tracked ?? groups[0].ids[0] ?? groups[1].ids[0] ?? null;

  const list = h('div');
  for (const g of groups) {
    if (!g.ids.length) continue;
    list.appendChild(h('div', { class: 'list-section' }, `${g.title} (${g.ids.length})`));
    for (const id of g.ids) {
      const q = QUESTS[id];
      list.appendChild(
        h(
          'button',
          { class: `list-item ${g.cls}${id === selectedId ? ' sel' : ''}`, onclick: () => ((selectedId = id), ctx.rerender()) },
          h('span', { class: 'tag' }, q.code),
          h('span', { class: 'grow' }, q.name),
          st.tracked === id ? h('span', { class: 'gold' }, '◆') : null,
        ),
      );
    }
  }
  if (!list.childElementCount) list.appendChild(h('p', { class: 'muted' }, 'Nenhuma missão ainda. Converse com as pessoas de Eldenor.'));

  const detail = h('div', { class: 'card' });
  if (selectedId) {
    const def = QUESTS[selectedId];
    const qs = st.quests[selectedId];
    const status = game.quests.status(selectedId);
    const giver = NPCS[def.giver];
    detail.append(
      h('div', { class: 'muted', style: 'font-size:12px' }, `${def.code} · ${def.type === 'main' ? 'Campanha principal' : 'Missão secundária'}${giver ? ` · ${giver.name}, ${giver.title}` : ''}`),
      h('h3', { style: 'font-size:20px;margin:4px 0 8px' }, def.name),
      h('p', { style: 'line-height:1.5' }, def.summary),
    );
    if (status === 'available') {
      detail.appendChild(h('p', { class: 'gold' }, `Fale com ${giver?.name ?? 'quem oferece a missão'} para começar.`));
    }
    if (qs) {
      const steps = h('ul', { class: 'steps' });
      def.steps.forEach((s, i) => {
        if (i < qs.step || qs.status === 'done') steps.appendChild(h('li', { class: 'done' }, s.text));
        else if (i === qs.step && qs.status === 'active') steps.appendChild(h('li', { class: 'cur' }, game.quests.stepLabel(selectedId!)));
      });
      if (qs.status === 'active' && qs.step < def.steps.length - 1) steps.appendChild(h('li', { class: 'muted' }, '…'));
      detail.appendChild(steps);
      if (qs.status === 'closed') detail.appendChild(h('p', { class: 'bad' }, 'Esta rota foi fechada por uma escolha sua. As consequências ficam registradas.'));
    }
    if (def.excludes?.length) detail.appendChild(h('p', { class: 'muted', style: 'font-size:13px' }, `Escolha exclusiva: aceitar esta missão fecha “${def.excludes.map((x) => QUESTS[x].name).join(', ')}”.`));
    detail.appendChild(h('div', { class: 'reward' }, h('b', { class: 'gold' }, 'Recompensas: '), game.quests.rewardText(def)));
    if (status === 'active') {
      const marker = game.quests.marker(selectedId);
      detail.appendChild(
        h(
          'div',
          { class: 'row', style: 'margin-top:10px;flex-wrap:wrap' },
          h(
            'button',
            {
              class: `btn small${st.tracked === selectedId ? '' : ' primary'}`,
              onclick: () => {
                st.tracked = st.tracked === selectedId ? null : selectedId;
                bus.emit('quest:changed', { id: selectedId! });
                ctx.rerender();
              },
            },
            st.tracked === selectedId ? 'Parar de rastrear' : 'Rastrear',
          ),
          marker ? h('button', { class: 'btn small', onclick: () => ctx.goTab('mapa', marker) }, '🗺️ Ver no mapa') : null,
        ),
      );
    }
  } else {
    detail.appendChild(h('p', { class: 'muted' }, 'Selecione uma missão.'));
  }
  el.appendChild(h('div', { class: 'list-detail' }, list, detail));
}
