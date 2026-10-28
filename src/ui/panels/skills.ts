import { BALANCE } from '../../config';
import { ATTR_KEYS, type SkillSchool } from '../../core/types';
import { SCHOOLS, SKILL_LIST, TIER_COLORS, skillName, skillTier } from '../../data/skills';
import { game } from '../../game';
import { skillIcon } from '../../render/icons';
import { canLearn, mastery, nextReq, skillCooldown, skillPower } from '../../systems/progression';
import { h, img } from '../dom';
import type { PanelCtx } from '../Menu';

let selectedSlot = 0;

export function renderSkills(el: HTMLElement, ctx: PanelCtx): void {
  const p = game.state.player;
  const hb = p.hotbar;

  const slots = hb.map((id, i) => {
    const def = id ? SKILL_LIST.find((s) => s.id === id) : null;
    return h(
      'button',
      {
        class: `hb-slot${i === selectedSlot ? ' sel' : ''}`,
        onclick: () => {
          selectedSlot = i;
          ctx.rerender();
        },
        title: def ? skillName(def, p.skills[def.id] ?? 0) : 'Vazio',
      },
      h('span', { class: 'n' }, String(i + 1)),
      def ? img(skillIcon(def, skillTier(def, p.skills[def.id] ?? 0))) : h('span', { class: 'muted' }, '+'),
    );
  });

  el.appendChild(
    h(
      'div',
      { class: 'card', style: 'margin-bottom:12px' },
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap' },
        h('h3', { style: 'margin:0' }, 'Habilidades'),
        h('span', { class: p.skillPoints > 0 ? 'good' : 'muted', style: 'font-weight:700' }, `${p.skillPoints} ponto(s) de habilidade`),
      ),
      h('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 10px' }, `Qualquer personagem aprende qualquer escola — basta cumprir os requisitos. Cada habilidade tem até ${BALANCE.maxMastery} níveis de maestria. Escolha um atalho abaixo e toque em "Usar no atalho".`),
      h('div', { class: 'hotbar-edit' }, h('span', { class: 'muted', style: 'font-size:12px' }, 'Atalhos:'), slots, hb[selectedSlot] ? h('button', { class: 'btn small ghost', onclick: () => (game.setHotbar(selectedSlot, null), ctx.rerender()) }, 'Limpar atalho') : null),
    ),
  );

  const bySchool = new Map<SkillSchool, typeof SKILL_LIST>();
  for (const s of SKILL_LIST) {
    if (!bySchool.has(s.school)) bySchool.set(s.school, []);
    bySchool.get(s.school)!.push(s);
  }
  const d = game.derived;
  const cols = h('div', { class: 'grid2' });
  for (const [school, skills] of bySchool) {
    const info = SCHOOLS[school];
    const box = h(
      'div',
      { class: 'school' },
      h('div', { class: 'school-head' }, h('span', { style: `width:12px;height:12px;border-radius:3px;background:${info.color};display:inline-block` }), h('b', null, info.name), h('small', { class: 'muted' }, info.desc)),
    );
    for (const s of skills) {
      const m = mastery(game.state, s.id);
      const can = canLearn(game.state, s.id);
      const req = nextReq(game.state, s);
      const reqEls = ATTR_KEYS.filter((k) => req[k]).map((k) => h('span', { class: p.attrs[k] >= req[k]! ? 'good' : 'bad' }, `${k} ${req[k]}`));
      if (s.reqLevel) reqEls.push(h('span', { class: p.level >= s.reqLevel ? 'good' : 'bad' }, `Nível ${s.reqLevel}`));
      const power = Math.round(skillPower(s, Math.max(1, m), d));
      const powerLabel = s.kind === 'heal' ? `Cura ~${Math.round(15 + power * 1.6)}` : s.kind === 'barrier' ? `Escudo ${Math.round(20 + power * 2.2)}` : s.kind === 'summon' || s.kind === 'blink' || s.kind === 'buff' ? '' : `Poder ${power}`;
      const inHotbar = hb.indexOf(s.id);
      const tier = skillTier(s, m);
      // linha de evolução: estágio base → evolução 1 (maestria 3) → evolução 2 (maestria 5)
      const evo = h(
        'div',
        { class: 'evo' },
        [{ at: 1, name: s.name, desc: s.desc }, ...(s.tiers ?? [])].map((t, i) =>
          h(
            'div',
            { class: `evo-step${m >= t.at ? ' on' : ''}${i === tier && m > 0 ? ' cur' : ''}`, style: `--tc:${TIER_COLORS[i]}`, title: t.desc },
            img(skillIcon(s, i)),
            h('div', null, h('b', null, t.name), h('small', null, i === 0 ? 'Base' : `Maestria ${t.at}`), i > 0 ? h('span', { class: 'evo-desc' }, t.desc) : null),
          ),
        ),
      );
      box.appendChild(
        h(
          'div',
          { class: `skill-card${tier > 0 ? ' evolved t' + tier : ''}` },
          img(skillIcon(s, tier)),
          h(
            'div',
            null,
            h(
              'div',
              { class: 'row', style: 'justify-content:space-between' },
              h('span', { class: 's-name', style: tier > 0 ? `color:${TIER_COLORS[tier]}` : '' }, skillName(s, m)),
              h('span', { class: 'mastery', title: `Maestria ${m}/${BALANCE.maxMastery}` }, Array.from({ length: BALANCE.maxMastery }, (_, i) => h('i', { class: i < m ? 'on' : '' }))),
            ),
            h('div', { class: 's-desc' }, s.desc),
            s.tiers ? evo : null,
            h('div', { class: 'reqs muted' }, `Mana ${s.mp}`, `· Recarga ${skillCooldown(s, Math.max(1, m)).toFixed(1)} s`, powerLabel ? `· ${powerLabel}` : null),
            reqEls.length ? h('div', { class: 'reqs', style: 'margin-top:3px' }, h('span', { class: 'muted' }, m > 0 ? 'Próximo nível requer:' : 'Requer:'), reqEls) : null,
            h(
              'div',
              { class: 'row', style: 'margin-top:8px;flex-wrap:wrap' },
              m < BALANCE.maxMastery
                ? h(
                    'button',
                    { class: `btn small${can.ok ? ' primary' : ''}`, disabled: !can.ok, title: can.reason ?? '', onclick: () => (game.learnSkill(s.id), ctx.rerender()) },
                    m === 0 ? 'Aprender (1 ponto)' : `Melhorar → ${m + 1}`,
                  )
                : h('span', { class: 'gold', style: 'font-size:13px' }, 'Maestria máxima'),
              m > 0
                ? h(
                    'button',
                    { class: 'btn small', onclick: () => (game.setHotbar(selectedSlot, s.id), ctx.rerender()) },
                    inHotbar >= 0 ? `No atalho ${inHotbar + 1} → mover p/ ${selectedSlot + 1}` : `Usar no atalho ${selectedSlot + 1}`,
                  )
                : null,
              !can.ok && m < BALANCE.maxMastery && can.reason ? h('small', { class: 'muted' }, can.reason) : null,
            ),
          ),
        ),
      );
    }
    cols.appendChild(box);
  }
  el.appendChild(cols);
}
