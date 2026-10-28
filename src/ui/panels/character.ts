import { BALANCE, xpToNext } from '../../config';
import { ATTR_KEYS, type AttrKey, type Attrs } from '../../core/types';
import { formatTime } from '../../core/util';
import { ARCHETYPES } from '../../data/archetypes';
import { FACTIONS, repTier } from '../../data/factions';
import { playerLook } from '../../entities/Player';
import { game } from '../../game';
import { fullFigureCanvas } from '../../render/characterArt';
import { derive } from '../../systems/stats';
import { h } from '../dom';
import type { PanelCtx } from '../Menu';

const ATTR_INFO: Record<AttrKey, { name: string; desc: string }> = {
  FOR: { name: 'Força', desc: 'Dano físico, armas pesadas, quebra de defesa' },
  DES: { name: 'Destreza', desc: 'Precisão, arcos e adagas, crítico, velocidade' },
  INT: { name: 'Inteligência', desc: 'Magia arcana, grimórios e cajados' },
  VON: { name: 'Vontade', desc: 'Mana, bênçãos, invocações, cura' },
  VIG: { name: 'Vigor', desc: 'Vida, resistência, armaduras pesadas' },
  AFI: { name: 'Afinidade', desc: 'Natureza, elementos, efeitos especiais' },
};

/* Distribuição staged: o jogador vê o resultado estimado antes de confirmar (GDD §12). */
const staged: Partial<Attrs> = {};

export function renderCharacter(el: HTMLElement, ctx: PanelCtx): void {
  const st = game.state;
  const p = st.player;
  const arch = ARCHETYPES.find((a) => a.id === p.archetype);
  if (ATTR_KEYS.reduce((s, k) => s + (staged[k] ?? 0), 0) > p.unspent) clearStaged();
  const spent = ATTR_KEYS.reduce((s, k) => s + (staged[k] ?? 0), 0);
  const left = p.unspent - spent;
  const preview: Attrs = { ...p.attrs };
  for (const k of ATTR_KEYS) preview[k] += staged[k] ?? 0;
  const cur = game.derived;
  const next = derive(st, preview);
  const need = xpToNext(p.level);

  const figure = fullFigureCanvas(playerLook(), 4);
  figure.style.width = '120px';
  const info = h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'row', style: 'align-items:flex-start;gap:14px' },
      figure,
      h(
        'div',
        { class: 'col grow', style: 'gap:4px' },
        h('h3', { style: 'margin:0' }, p.name),
        h('div', { class: 'muted' }, `Nível ${p.level} · início como ${arch?.name ?? p.archetype}`),
        h('div', null, `XP ${p.xp} / ${need}`),
        h('div', { class: 'bar xp', style: 'height:7px' }, h('div', { class: 'fill', style: `transform:scaleX(${Math.min(1, p.xp / need)})` })),
        h('small', { class: 'muted' }, 'Ao subir de nível o XP volta a 0 (o excedente não é carregado). Ao morrer, você volta ao último salvamento e perde 20% do XP do nível atual.'),
        h('div', { class: 'gold-line' }, `🪙 ${p.gold} ouro`),
        h('small', { class: 'muted' }, `Tempo de jogo ${formatTime(st.meta.playtime)} · Mortes ${st.meta.deaths}`),
      ),
    ),
  );

  const rows = ATTR_KEYS.map((k) => {
    const add = staged[k] ?? 0;
    const bonus = cur.attrs[k] - p.attrs[k];
    return h(
      'div',
      { class: 'attr-row' },
      h('span', { class: 'ab' }, k),
      h('div', null, h('div', null, ATTR_INFO[k].name), h('div', { class: 'desc' }, ATTR_INFO[k].desc)),
      h(
        'span',
        { class: 'val' },
        String(p.attrs[k] + add),
        add ? h('span', { class: 'plus' }, ` +${add}`) : null,
        bonus ? h('div', { class: 'muted', style: 'font-size:11px;font-weight:600' }, `(${bonus > 0 ? '+' : ''}${bonus} equip.)`) : null,
      ),
      h('button', { class: 'round-btn', disabled: add <= 0, onclick: () => ((staged[k] = add - 1), ctx.rerender()) }, '−'),
      h('button', { class: 'round-btn', disabled: left <= 0, onclick: () => ((staged[k] = add + 1), ctx.rerender()) }, '+'),
    );
  });

  const statRow = (label: string, a: number, b: number, fmt: (n: number) => string = (n) => String(Math.round(n))) => {
    const diff = b - a;
    return [
      h('span', null, label),
      h('span', null, fmt(a), Math.abs(diff) > 0.001 ? h('span', { class: diff > 0 ? 'delta-up' : 'delta-down' }, ` → ${fmt(b)}`) : null),
    ];
  };
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const one = (n: number) => n.toFixed(1);

  const attrsCard = h(
    'div',
    { class: 'card' },
    h('h3', null, 'Atributos ', h('span', { class: left > 0 ? 'good' : 'muted', style: 'font-family:var(--sans);font-size:13px' }, `· ${left} ponto(s) livre(s)`)),
    rows,
    h(
      'div',
      { class: 'row', style: 'margin-top:10px;justify-content:flex-end' },
      h('button', { class: 'btn ghost small', disabled: spent === 0, onclick: () => (clearStaged(), ctx.rerender()) }, 'Desfazer'),
      h(
        'button',
        {
          class: 'btn primary small',
          disabled: spent === 0,
          onclick: () => {
            if (game.allocate({ ...staged })) {
              clearStaged();
              ctx.rerender();
            }
          },
        },
        'Confirmar distribuição',
      ),
    ),
    h('small', { class: 'muted' }, `Cada nível dá ${BALANCE.attrPointsPerLevel} pontos. Acima de ${BALANCE.attrSoftCap}, um atributo rende metade.`),
  );

  const statsCard = h(
    'div',
    { class: 'card' },
    h('h3', null, spent ? 'Estatísticas (prévia)' : 'Estatísticas'),
    h(
      'div',
      { class: 'stat-list' },
      statRow('Vida máxima', cur.maxHp, next.maxHp),
      statRow('Mana máxima', cur.maxMp, next.maxMp),
      statRow('Ataque físico', cur.atk, next.atk),
      statRow('Poder mágico', cur.mag, next.mag),
      statRow('Poder de cura', cur.heal, next.heal),
      statRow('Armadura', cur.armor, next.armor),
      statRow('Chance de crítico', cur.crit, next.crit, pct),
      statRow('Dano crítico', cur.critMult, next.critMult, (n) => `×${n.toFixed(2)}`),
      statRow('Velocidade', cur.speed, next.speed, one),
    ),
  );

  const repCard = h(
    'div',
    { class: 'card' },
    h('h3', null, 'Reputação'),
    FACTIONS.map((f) => {
      const v = st.rep[f.id] ?? 0;
      const w = Math.abs(v) / 2;
      return h(
        'div',
        { class: 'rep-row', title: f.goal },
        h('div', null, h('div', null, f.name), h('small', { class: 'muted' }, `${repTier(v)} (${v > 0 ? '+' : ''}${v})`)),
        h('div', { class: 'rep-bar' }, h('i', { style: `background:${v >= 0 ? f.color : '#c84a4a'};${v >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`}` })),
      );
    }),
    h('small', { class: 'muted' }, 'A reputação muda preços, missões e acesso. É possível colaborar com várias facções.'),
  );

  el.appendChild(h('div', { class: 'grid2' }, h('div', { class: 'col', style: 'gap:12px' }, info, statsCard, repCard), attrsCard));
}

function clearStaged(): void {
  for (const k of ATTR_KEYS) delete staged[k];
}
