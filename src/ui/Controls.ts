import { bus } from '../core/events';
import { input, type ActionName } from '../core/input';
import { ITEMS } from '../data/items';
import { SKILLS } from '../data/skills';
import { game } from '../game';
import { itemIcon, skillIcon } from '../render/icons';
import { sfx } from '../systems/sfx';
import { clear, h, img, isTouchDevice } from './dom';

/* Controles: joystick flutuante (metade esquerda), botão de ataque grande, 4 habilidades
 * em arco, esquiva, poção e botão de interação contextual. Teclado e mouse funcionam junto.
 *
 * Teclado: WASD/setas mover · J ou clique atacar · 1-4 habilidades · Espaço esquivar
 *          E interagir · Q poção · I inventário · M mapa · C personagem · K habilidades
 *          L missões · Esc menu */

const ATTACK_ICON: Record<string, string> = {};

function weaponIcon(): string {
  const id = game.state.equipment.mainHand;
  if (!id) {
    if (!ATTACK_ICON.fist) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 16;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#e3b48c';
      c.fillRect(4, 5, 8, 7);
      c.fillStyle = '#1b1a24';
      c.fillRect(4, 8, 8, 1);
      ATTACK_ICON.fist = cv.toDataURL();
    }
    return ATTACK_ICON.fist;
  }
  return itemIcon(ITEMS[id]);
}

export class Controls {
  readonly el: HTMLElement;
  private zone = h('div', { class: 'stick-zone' });
  private base = h('div', { class: 'stick-base idle' });
  private knob = h('div', { class: 'stick-knob' });
  private stickHint = h('div', { class: 'stick-hint' }, 'Arraste para mover');
  private actions = h('div', { class: 'actions' });
  private attack: HTMLButtonElement;
  private skills: HTMLButtonElement[] = [];
  private skillCd: HTMLDivElement[] = [];
  private skillCdTxt: HTMLDivElement[] = [];
  private dodge: HTMLButtonElement;
  private potion: HTMLButtonElement;
  private potionBadge = h('span', { class: 'badge' }, '0');
  private interact = h('button', { class: 'interact-btn hidden' });
  private stickId: number | null = null;
  private stickCenter = { x: 0, y: 0 };
  private keys = new Set<string>();
  private lastSkillKey = '';
  private lastWeapon = '';

  constructor(private openMenu: (tab?: string) => void) {
    this.base.appendChild(this.knob);
    this.zone.append(this.base, this.stickHint);
    this.attack = this.makeButton('abtn attack', 'attack', 'J');
    this.dodge = this.makeButton('abtn dodge', 'dodge', '␣');
    this.dodge.prepend(h('span', null, '💨'));
    this.potion = this.makeButton('abtn potion', 'potion', 'Q');
    this.potion.append(img(itemIcon(ITEMS.pocao_vida)), this.potionBadge);
    for (let i = 0; i < 4; i++) {
      const b = this.makeButton('abtn skill', `skill${i}` as ActionName, String(i + 1));
      const cd = h('div', { class: 'cd' });
      const txt = h('div', { class: 'cdtxt' });
      b.append(cd, txt);
      this.skills.push(b);
      this.skillCd.push(cd);
      this.skillCdTxt.push(txt);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      // toque longo num atalho vazio abre a tela de habilidades
      b.addEventListener('pointerup', () => {
        if (!game.state.player.hotbar[i]) this.openMenu('habilidades');
      });
    }
    this.actions.append(this.attack, ...this.skills, this.dodge, this.potion);
    this.layoutButtons();
    this.interact.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      input.press('interact');
    });
    this.el = h('div', { class: 'controls' }, this.zone, this.actions, this.interact);
    this.setupStick();
    this.setupKeyboard();
    bus.on('interact:hint', ({ label }) => this.setHint(label));
    bus.on('skills:changed', () => (this.lastSkillKey = ''));
    bus.on('equipment:changed', () => (this.lastWeapon = ''));
    this.resetStickVisual();
    window.addEventListener('resize', () => this.resetStickVisual());
    window.addEventListener('controls-resize', () => {
      this.layoutButtons();
      this.resetStickVisual();
    });
  }

  private makeButton(cls: string, action: ActionName, key: string): HTMLButtonElement {
    const b = h('button', { class: cls, 'aria-label': action }) as HTMLButtonElement;
    if (!isTouchDevice()) b.appendChild(h('span', { class: 'key kbd' }, key));
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      b.classList.add('down');
      if (action === 'attack') input.setAttackTouch(true);
      input.press(action);
    });
    const up = () => {
      b.classList.remove('down');
      if (action === 'attack') input.setAttackTouch(false);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    return b;
  }

  layoutButtons(): void {
    const s = game.settings?.controlsScale ?? 1;
    document.documentElement.style.setProperty('--ctl', String(s));
    const box = 236 * s;
    const ax = box - 42 * s;
    const ay = box - 42 * s;
    const place = (el: HTMLElement, cx: number, cy: number, size: number) => {
      el.style.left = `${cx - (size * s) / 2}px`;
      el.style.top = `${cy - (size * s) / 2}px`;
    };
    const R = 112 * s;
    [180, 210, 240, 270].forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      place(this.skills[i], ax + Math.cos(a) * R, ay + Math.sin(a) * R, 56);
    });
    place(this.dodge, ax + Math.cos((225 * Math.PI) / 180) * 176 * s, ay + Math.sin((225 * Math.PI) / 180) * 176 * s, 52);
    place(this.potion, 26 * s, box - 24 * s, 46);
    this.attack.style.left = '';
    this.attack.style.top = '';
  }

  private resetStickVisual(): void {
    const r = this.zone.getBoundingClientRect();
    const x = Math.min(110, r.width * 0.3) + 20;
    const y = r.height - 100;
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.knob.style.transform = 'translate(0,0)';
    this.base.classList.add('idle');
    this.stickHint.style.left = `${x}px`;
    this.stickHint.style.top = `${y + 70}px`;
  }

  private setupStick(): void {
    const R = () => 50 * (game.settings?.controlsScale ?? 1);
    this.zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      sfx.unlock();
      this.stickId = e.pointerId;
      try {
        this.zone.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const r = this.zone.getBoundingClientRect();
      this.stickCenter = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX - r.left}px`;
      this.base.style.top = `${e.clientY - r.top}px`;
      this.base.classList.remove('idle');
      this.stickHint.classList.add('hidden');
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.stickCenter.x;
      let dy = e.clientY - this.stickCenter.y;
      const d = Math.hypot(dx, dy);
      const max = R();
      if (d > max) {
        dx = (dx / d) * max;
        dy = (dy / d) * max;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      let nx = dx / max;
      let ny = dy / max;
      const m = Math.hypot(nx, ny);
      if (m < 0.18) nx = ny = 0;
      else {
        // curva de resposta: mais precisão perto do centro
        const k = Math.min(1, (m - 0.18) / 0.82);
        nx = (nx / m) * Math.max(0.35, k);
        ny = (ny / m) * Math.max(0.35, k);
      }
      input.setStick(nx, ny);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      input.setStick(0, 0);
      this.resetStickVisual();
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
  }

  private setupKeyboard(): void {
    const recompute = () => {
      const k = this.keys;
      const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      input.setKeys(x, y);
    };
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!game.running) return;
      sfx.unlock();
      const menus: Record<string, string> = { KeyI: 'inventario', KeyM: 'mapa', KeyC: 'personagem', KeyK: 'habilidades', KeyL: 'missoes' };
      if (e.code === 'Escape' || e.code === 'Tab') {
        e.preventDefault();
        if (!game.paused) this.openMenu();
        return;
      }
      if (menus[e.code]) {
        if (!game.paused) this.openMenu(menus[e.code]);
        return;
      }
      if (game.paused) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
      this.keys.add(e.code);
      recompute();
      switch (e.code) {
        case 'KeyJ':
          input.setAttackKey(true);
          input.press('attack');
          break;
        case 'Space':
        case 'ShiftLeft':
          input.press('dodge');
          break;
        case 'KeyE':
        case 'KeyF':
        case 'Enter':
          input.press('interact');
          break;
        case 'KeyQ':
          input.press('potion');
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
          input.press(`skill${Number(e.code.slice(5)) - 1}` as ActionName);
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      recompute();
      if (e.code === 'KeyJ') input.setAttackKey(false);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      input.reset();
    });
  }

  private setHint(label: string | null): void {
    if (!label) {
      this.interact.classList.add('hidden');
      return;
    }
    clear(this.interact);
    const icon = label === 'Falar' ? '💬' : label === 'Abrir' ? '🗝️' : label === 'Colher' ? '🌿' : label === 'Viajar' || label === 'Ativar' ? '✨' : '🔍';
    this.interact.append(h('span', null, icon), h('span', null, label));
    if (!isTouchDevice()) this.interact.append(h('span', { class: 'kbd' }, 'E'));
    this.interact.classList.remove('hidden');
  }

  update(): void {
    if (!game.state) return;
    const p = game.state.player;
    // ícone de ataque segue a arma
    const wid = game.state.equipment.mainHand ?? 'fist';
    if (wid !== this.lastWeapon) {
      this.lastWeapon = wid;
      this.attack.querySelector('img')?.remove();
      this.attack.prepend(img(weaponIcon()));
    }
    const hb = p.hotbar.join(',') + JSON.stringify(p.skills);
    if (hb !== this.lastSkillKey) {
      this.lastSkillKey = hb;
      p.hotbar.forEach((id, i) => {
        const b = this.skills[i];
        b.querySelector('img')?.remove();
        b.classList.toggle('empty', !id);
        if (id && SKILLS[id]) b.prepend(img(skillIcon(SKILLS[id])));
      });
    }
    p.hotbar.forEach((id, i) => {
      const cdEl = this.skillCd[i];
      const txt = this.skillCdTxt[i];
      if (!id) {
        cdEl.style.background = '';
        txt.textContent = '';
        return;
      }
      const cd = game.cooldowns[id];
      const left = cd?.left ?? 0;
      if (left > 0) {
        const f = left / cd.total;
        cdEl.style.background = `conic-gradient(rgba(0,0,0,0.65) ${f * 360}deg, transparent 0)`;
        txt.textContent = left >= 1 ? String(Math.ceil(left)) : left.toFixed(1);
      } else {
        cdEl.style.background = '';
        txt.textContent = '';
      }
      const def = SKILLS[id];
      this.skills[i].classList.toggle('nomana', !!def && p.mp < def.mp);
    });
    const n = game.potionCount();
    if (this.potionBadge.textContent !== String(n)) this.potionBadge.textContent = String(n);
  }
}
