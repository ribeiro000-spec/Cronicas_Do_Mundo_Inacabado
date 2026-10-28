import { bus } from '../core/events';
import { game } from '../game';
import { sfx } from '../systems/sfx';
import type { WorldData } from '../world/WorldData';
import { clear, h } from './dom';
import { popPause, pushPause } from './modal';
import { renderCharacter } from './panels/character';
import { renderCodex } from './panels/codex';
import { renderInventory } from './panels/inventory';
import { renderMap } from './panels/map';
import { renderQuests } from './panels/quests';
import { renderSkills } from './panels/skills';
import { renderSystem } from './panels/system';

export interface PanelCtx {
  world: WorldData;
  rerender(): void;
  close(): void;
  goTab(tab: string, arg?: unknown): void;
  arg?: unknown;
  toTitle(): void;
}

type Renderer = (el: HTMLElement, ctx: PanelCtx) => (() => void) | void;

const TABS: { id: string; label: string; icon: string; render: Renderer }[] = [
  { id: 'personagem', label: 'Personagem', icon: '🧝', render: renderCharacter },
  { id: 'habilidades', label: 'Habilidades', icon: '✨', render: renderSkills },
  { id: 'inventario', label: 'Inventário', icon: '🎒', render: renderInventory },
  { id: 'mapa', label: 'Mapa', icon: '🗺️', render: renderMap },
  { id: 'missoes', label: 'Missões', icon: '📜', render: renderQuests },
  { id: 'diario', label: 'Diário', icon: '📖', render: renderCodex },
  { id: 'sistema', label: 'Sistema', icon: '⚙️', render: renderSystem },
];

/* Menu em várias telas (GDD §12), em abas roláveis — funciona bem no celular. */
export class Menu {
  private el: HTMLElement | null = null;
  private body = h('div', { class: 'menu-body' });
  private tabsEl = h('div', { class: 'tabs' });
  private tab = 'personagem';
  private arg: unknown;
  private cleanup: (() => void) | void = undefined;
  private unsubs: (() => void)[] = [];
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-back')) {
      e.stopPropagation();
      this.close();
    }
  };

  constructor(
    private world: WorldData,
    private toTitle: () => void,
  ) {}

  get isOpen(): boolean {
    return !!this.el;
  }

  open(tab?: string, arg?: unknown): void {
    if (tab) this.tab = tab;
    this.arg = arg;
    if (this.el) {
      this.render();
      return;
    }
    pushPause();
    sfx.play('click');
    const close = h('button', { class: 'close-btn', 'aria-label': 'Fechar', onclick: () => this.close() }, '✕');
    this.el = h('div', { class: 'menu' }, h('div', { class: 'menu-box panel' }, h('div', { class: 'menu-head' }, this.tabsEl, close), this.body));
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    document.getElementById('ui')!.appendChild(this.el);
    window.addEventListener('keydown', this.onKey, true);
    this.unsubs.push(
      bus.on('inventory:changed', () => this.softRefresh(['inventario', 'personagem'])),
      bus.on('equipment:changed', () => this.softRefresh(['inventario', 'personagem'])),
      bus.on('skills:changed', () => this.softRefresh(['habilidades'])),
    );
    this.render();
  }

  private softRefresh(tabs: string[]): void {
    if (this.el && tabs.includes(this.tab)) this.render(true);
  }

  private renderTabs(): void {
    clear(this.tabsEl);
    const p = game.state.player;
    for (const t of TABS) {
      const dot = (t.id === 'personagem' && p.unspent > 0) || (t.id === 'habilidades' && p.skillPoints > 0);
      const b = h(
        'button',
        {
          class: `tab${t.id === this.tab ? ' sel' : ''}`,
          onclick: () => {
            sfx.play('click');
            this.tab = t.id;
            this.arg = undefined;
            this.render();
          },
        },
        h('span', null, t.icon),
        h('span', null, t.label),
        dot ? h('span', { class: 'dot' }) : null,
      );
      this.tabsEl.appendChild(b);
      if (t.id === this.tab) setTimeout(() => b.scrollIntoView({ inline: 'nearest', block: 'nearest' }), 0);
    }
  }

  render(keepScroll = false): void {
    if (!this.el) return;
    const scroll = this.body.scrollTop;
    if (typeof this.cleanup === 'function') this.cleanup();
    this.cleanup = undefined;
    this.renderTabs();
    clear(this.body);
    const t = TABS.find((x) => x.id === this.tab) ?? TABS[0];
    this.body.style.padding = t.id === 'mapa' ? '8px' : '';
    this.cleanup = t.render(this.body, {
      world: this.world,
      rerender: () => this.render(true),
      close: () => this.close(),
      goTab: (tab, arg) => this.open(tab, arg),
      arg: this.arg,
      toTitle: () => {
        this.close();
        this.toTitle();
      },
    });
    if (keepScroll) this.body.scrollTop = scroll;
  }

  close(): void {
    if (!this.el) return;
    if (typeof this.cleanup === 'function') this.cleanup();
    this.cleanup = undefined;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.el.remove();
    this.el = null;
    window.removeEventListener('keydown', this.onKey, true);
    popPause();
  }
}
