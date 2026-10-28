import { bus, type HighlightSpec } from '../core/events';
import { ITEMS } from '../data/items';
import { SKILLS } from '../data/skills';
import { itemIcon, skillIcon } from '../render/icons';
import { sfx } from '../systems/sfx';
import { h, img } from './dom';
import { popPause, pushPause } from './modal';

/* Cartões de destaque: itens importantes de missão, missão concluída, fragmentos de mapa,
 * evolução de habilidade e chefe derrotado. Pausam o jogo e aparecem um de cada vez. */
export class Highlight {
  private queue: HighlightSpec[] = [];
  private current: HTMLElement | null = null;
  private closeTimer: number | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (!this.current) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape' || e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      e.stopPropagation();
      this.dismiss();
    }
  };

  constructor(private canShow: () => boolean) {
    bus.on('highlight', (spec) => {
      this.queue.push(spec);
      // pequena espera: junta os cartões de uma mesma ação (ex.: missão + item)
      setTimeout(() => this.pump(), 250);
    });
    bus.on('cinematic:end', () => setTimeout(() => this.pump(), 500));
  }

  /** Mostra o próximo cartão quando for possível (fora de cenas e diálogos). */
  pump(): void {
    if (this.current || !this.queue.length) return;
    if (!this.canShow()) {
      setTimeout(() => this.pump(), 600);
      return;
    }
    this.show(this.queue.shift()!);
  }

  clear(): void {
    this.queue = [];
    if (this.current) this.dismiss();
  }

  private show(spec: HighlightSpec): void {
    const color = spec.color ?? '#e8c66a';
    let icon: HTMLElement | null = null;
    if (spec.skillId && SKILLS[spec.skillId]) icon = img(skillIcon(SKILLS[spec.skillId], spec.tier ?? 0));
    else if (spec.itemId && ITEMS[spec.itemId]) icon = img(itemIcon(ITEMS[spec.itemId]));
    const glyph = spec.kind === 'quest' ? '✦' : spec.kind === 'fragment' ? '🗺' : spec.kind === 'boss' ? '⚔' : spec.kind === 'skill' ? '✧' : '★';
    const btn = h('button', { class: 'btn primary', onclick: () => this.dismiss() }, 'Continuar');
    const card = h(
      'div',
      { class: `hl-card k-${spec.kind}` },
      h('div', { class: 'hl-rays' }),
      h('div', { class: 'hl-icon' }, icon ?? h('span', { class: 'hl-glyph' }, glyph)),
      h('div', { class: 'hl-title' }, spec.title),
      h('div', { class: 'hl-name' }, spec.name),
      spec.text ? h('div', { class: 'hl-text' }, spec.text) : null,
      h('div', { class: 'hl-actions' }, btn),
    );
    const back = h('div', { class: 'hl-back', style: `--hl:${color}` }, card);
    back.addEventListener('pointerdown', (e) => {
      if (e.target === back) this.dismiss();
    });
    document.getElementById('ui')!.appendChild(back);
    this.current = back;
    pushPause();
    window.addEventListener('keydown', this.onKey, true);
    sfx.play(spec.kind === 'skill' || spec.kind === 'boss' ? 'levelup' : 'quest');
    // fecha sozinho depois de um tempo, para nunca travar o jogo
    this.closeTimer = window.setTimeout(() => this.dismiss(), 9000);
    setTimeout(() => btn.focus({ preventScroll: true }), 50);
  }

  private dismiss(): void {
    if (!this.current) return;
    const el = this.current;
    this.current = null;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    window.removeEventListener('keydown', this.onKey, true);
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
    popPause();
    if (this.queue.length) setTimeout(() => this.pump(), 320);
  }

  get busy(): boolean {
    return !!this.current;
  }
}
