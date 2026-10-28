import { xpToNext } from '../config';
import { bus } from '../core/events';
import { game } from '../game';
import { playerLook } from '../entities/Player';
import { portraitCanvas } from '../render/characterArt';
import { clear, h } from './dom';
import { MapRenderer } from './mapRender';
import type { WorldData } from '../world/WorldData';

/* HUD: retrato, barras de vida/mana/XP, minimapa, rastreador de missão,
 * barra do chefe, nome da região e avisos. Atualizado a cada quadro, mas só mexe
 * no DOM quando os valores mudam. */
export class Hud {
  readonly el: HTMLElement;
  private portrait = h('div', { class: 'portrait' });
  private lvl = h('div', { class: 'lvl' }, '1');
  private nameEl = h('span', null, '');
  private goldEl = h('span', { class: 'muted', style: 'font-weight:600' }, '');
  private hpFill = h('div', { class: 'fill' });
  private hpLag = h('div', { class: 'lag' });
  private hpShield = h('div', { class: 'shield', style: 'transform:scaleX(0)' });
  private hpTxt = h('div', { class: 'txt' });
  private mpFill = h('div', { class: 'fill' });
  private mpTxt = h('div', { class: 'txt' });
  private xpFill = h('div', { class: 'fill' });
  private buffs = h('div', { class: 'buffs' });
  private pointsBadge = h('div', { class: 'points-badge hidden' }, '+');
  private tracker = h('div', { class: 'tracker hidden' });
  private minimap = h('canvas', { class: 'minimap', width: 208, height: 208 }) as HTMLCanvasElement;
  private areaLabel = h('div', { class: 'area-label' }, '');
  private bossBar = h('div', { class: 'boss-bar hidden' });
  private banner = h('div', { class: 'area-banner' });
  private toasts = h('div', { class: 'toasts' });
  private fps = h('div', { class: 'fps hidden' });
  private menuDot = h('span', { class: 'dot hidden' });
  private map: MapRenderer;
  private last: Record<string, unknown> = {};
  private mmTimer = 0;
  private bannerTimer: number | null = null;

  constructor(
    world: WorldData,
    openMenu: (tab?: string) => void,
  ) {
    this.map = new MapRenderer(world);
    const player = h(
      'div',
      { class: 'hud-player', onclick: () => openMenu('personagem') },
      h('div', { style: 'position:relative' }, this.portrait, this.lvl),
      h(
        'div',
        { class: 'bars' },
        h('div', { class: 'name' }, this.nameEl, this.goldEl),
        h('div', { class: 'bar hp' }, this.hpLag, this.hpFill, this.hpShield, this.hpTxt),
        h('div', { class: 'bar mp' }, this.mpFill, this.mpTxt),
        h('div', { class: 'bar xp' }, this.xpFill),
        this.buffs,
      ),
      this.pointsBadge,
    );
    this.portrait.appendChild(this.lvl);
    const right = h(
      'div',
      { class: 'hud-right' },
      h('div', { class: 'minimap-wrap', onclick: () => openMenu('mapa') }, this.minimap, h('div', { class: 'compass' }, 'N')),
      this.areaLabel,
    );
    const menuBtn = h('button', { class: 'icon-btn', title: 'Menu (Esc)', 'aria-label': 'Menu', onclick: () => openMenu() }, '☰', this.menuDot);
    const invBtn = h('button', { class: 'icon-btn', title: 'Inventário (I)', 'aria-label': 'Inventário', onclick: () => openMenu('inventario') }, '🎒');
    const fsBtn = h('button', { class: 'icon-btn', title: 'Tela cheia', 'aria-label': 'Tela cheia', onclick: () => toggleFullscreen() }, '⛶');
    const top = h('div', { class: 'top-buttons' }, fsBtn, invBtn, menuBtn);
    this.tracker.addEventListener('click', () => openMenu('missoes'));
    this.el = h('div', { class: 'hud' }, player, this.tracker, right, top, this.bossBar, this.banner, this.toasts, this.fps);

    bus.on('toast', (t) => this.toast(t.text, t.kind ?? 'info'));
    bus.on('area:entered', ({ name }) => this.showBanner(name));
    bus.on('boss:update', (b) => this.updateBoss(b));
    bus.on('equipment:changed', () => this.refreshPortrait());
    bus.on('state:changed', () => (this.last.tracker = null));
    bus.on('quest:changed', () => (this.last.tracker = null));
    this.refreshPortrait();
  }

  refreshPortrait(): void {
    if (!game.state) return;
    clear(this.portrait);
    const cv = portraitCanvas(playerLook(), 3);
    this.portrait.appendChild(cv);
    this.portrait.appendChild(this.lvl);
  }

  private set(key: string, value: unknown, fn: () => void): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn();
  }

  update(dt: number): void {
    if (!game.state) return;
    const p = game.state.player;
    const d = game.derived;
    const hpF = Math.max(0, p.hp / d.maxHp);
    const mpF = Math.max(0, p.mp / d.maxMp);
    this.set('hp', Math.round(p.hp) + '/' + d.maxHp, () => {
      this.hpFill.style.transform = `scaleX(${hpF})`;
      this.hpLag.style.transform = `scaleX(${hpF})`;
      this.hpTxt.textContent = `${Math.ceil(p.hp)} / ${d.maxHp}`;
    });
    this.set('mp', Math.round(p.mp) + '/' + d.maxMp, () => {
      this.mpFill.style.transform = `scaleX(${mpF})`;
      this.mpTxt.textContent = `${Math.floor(p.mp)} / ${d.maxMp}`;
    });
    const scene = game.scene as unknown as { player?: { barrier: number } } | null;
    const barrier = scene?.player?.barrier ?? 0;
    this.set('shield', Math.round(barrier), () => {
      this.hpShield.style.transform = `scaleX(${Math.min(1, barrier / d.maxHp)})`;
    });
    const need = xpToNext(p.level);
    this.set('xp', p.xp + '/' + need, () => {
      this.xpFill.style.transform = `scaleX(${Math.min(1, p.xp / need)})`;
      this.xpFill.parentElement!.title = `XP ${p.xp} / ${need}`;
    });
    this.set('lvl', p.level, () => (this.lvl.textContent = String(p.level)));
    this.set('name', p.name, () => (this.nameEl.textContent = `${p.name} · Nv. ${p.level}`));
    this.set('lvlname', p.level, () => (this.nameEl.textContent = `${p.name} · Nv. ${p.level}`));
    this.set('gold', p.gold, () => (this.goldEl.textContent = `${p.gold} 🪙`));
    const pts = p.unspent + p.skillPoints;
    this.set('pts', pts, () => {
      this.pointsBadge.classList.toggle('hidden', pts <= 0);
      this.pointsBadge.textContent = `+${pts}`;
      this.menuDot.classList.toggle('hidden', pts <= 0);
    });
    const buffs: string[] = [];
    if (game.regen) buffs.push('🌿 Regeneração');
    if (barrier > 0) buffs.push('🛡️ Barreira');
    if (game.inCombat) buffs.push('⚔️ Em combate');
    this.set('buffs', buffs.join('|'), () => {
      clear(this.buffs);
      for (const b of buffs) this.buffs.appendChild(h('span', { class: 'buff' }, b));
    });
    this.set('area', game.currentArea, () => (this.areaLabel.textContent = game.currentArea || '—'));
    this.updateTracker();
    const ph = (this.el.querySelector('.hud-player') as HTMLElement | null)?.offsetHeight ?? 64;
    this.set('trackerTop', ph, () => (this.tracker.style.top = `calc(${8 + ph + 6}px + var(--safe-t))`));
    this.mmTimer -= dt;
    if (this.mmTimer <= 0) {
      this.mmTimer = 0.1;
      this.drawMinimap();
    }
    const showFps = game.settings.showFps;
    this.fps.classList.toggle('hidden', !showFps);
    if (showFps) this.set('fps', game.fps, () => (this.fps.textContent = `${game.fps} FPS`));
  }

  private updateTracker(): void {
    const id = game.state.tracked;
    const key = id ? `${id}:${game.quests.stepLabel(id)}` : '';
    this.set('tracker', key, () => {
      clear(this.tracker);
      if (!id || game.quests.status(id) !== 'active') {
        this.tracker.classList.add('hidden');
        return;
      }
      this.tracker.classList.remove('hidden');
      this.tracker.appendChild(h('div', { class: 't-title' }, game.questName(id)));
      this.tracker.appendChild(h('div', { class: 't-step' }, game.quests.stepLabel(id)));
    });
  }

  private drawMinimap(): void {
    const scene = game.scene as unknown as { player?: { x: number; y: number; fx: number; fy: number } } | null;
    const pl = scene?.player;
    if (!pl) return;
    const ctx = this.minimap.getContext('2d')!;
    const w = this.minimap.width;
    this.map.draw(ctx, w, w, { cx: pl.x, cy: pl.y, scale: 4.2 }, { player: pl, circle: true });
  }

  toast(text: string, kind: string): void {
    const t = h('div', { class: `toast ${kind}` }, text);
    this.toasts.appendChild(t);
    const max = window.innerHeight < 500 ? 3 : 4;
    while (this.toasts.children.length > max) this.toasts.firstElementChild?.remove();
    const life = kind === 'level' || kind === 'quest' ? 3600 : 2600;
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 450);
    }, life);
  }

  showBanner(name: string): void {
    clear(this.banner);
    this.banner.appendChild(h('div', { class: 'a-name' }, name));
    this.banner.appendChild(h('div', { class: 'a-line' }));
    this.banner.classList.add('show');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), 2600);
  }

  private updateBoss(b: { name: string; hp: number; maxHp: number; level: number; phase: number } | null): void {
    if (!b) {
      this.bossBar.classList.add('hidden');
      this.last.boss = null;
      return;
    }
    this.bossBar.classList.remove('hidden');
    const key = `${b.hp}/${b.phase}`;
    if (this.last.boss === key) return;
    this.last.boss = key;
    clear(this.bossBar);
    this.bossBar.appendChild(h('div', { class: 'b-name' }, h('span', null, b.name), h('span', { class: 'muted' }, `Nv. ${b.level}`)));
    const fill = h('div', { class: 'fill', style: `transform:scaleX(${b.hp / b.maxHp})` });
    this.bossBar.appendChild(h('div', { class: 'bar' }, fill, h('div', { class: 'txt' }, `${b.hp} / ${b.maxHp}`)));
    const names = ['Terreno', 'Agressividade', 'Forma Final'];
    this.bossBar.appendChild(h('div', { class: 'phases' }, names.map((n, i) => h('span', { class: i + 1 === b.phase ? 'on' : '' }, `${i + 1}. ${n}`))));
  }
}

export function toggleFullscreen(): void {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
        const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        so.lock?.('landscape').catch(() => {});
      });
    } else el.webkitRequestFullscreen?.();
  } catch {
    /* navegador sem suporte */
  }
}
