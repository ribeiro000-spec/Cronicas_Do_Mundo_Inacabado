import { bus, type CineLine } from '../core/events';
import { portraitCanvas } from '../render/characterArt';
import { sfx } from '../systems/sfx';
import { clear, h } from './dom';

/* Cenas de apresentação: faixas de cinema, cartão com o nome do chefe e falas com retrato.
 * A cena do mundo controla a câmera e o tempo; aqui fica só a parte visual e o "pular". */
export class Cinematic {
  private el: HTMLElement | null = null;
  private lineBox: HTMLElement | null = null;
  private typing: number | null = null;
  private autoTimer: number | null = null;
  private lines: CineLine[] = [];
  private idx = 0;
  private onDone: (() => void) | null = null;
  private full = '';
  private textEl: HTMLElement | null = null;
  private onKey = (e: KeyboardEvent) => this.key(e);

  constructor() {
    bus.on('cinematic:start', () => this.open());
    bus.on('cinematic:title', (t) => this.title(t.name, t.subtitle));
    bus.on('cinematic:dialogue', (d) => this.dialogue(d.lines, d.onDone));
    bus.on('cinematic:end', () => this.close());
  }

  private open(): void {
    this.close(true);
    const root = document.getElementById('ui')!;
    root.classList.add('cinematic');
    const skip = h('button', { class: 'cine-skip', onclick: () => this.skip() }, 'Pular ▸▸');
    this.lineBox = h('div', { class: 'cine-line hidden' });
    this.el = h('div', { class: 'cine' }, h('div', { class: 'cine-bar top' }), h('div', { class: 'cine-bar bottom' }, this.lineBox), skip);
    root.appendChild(this.el);
    window.addEventListener('keydown', this.onKey, true);
  }

  private title(name: string, subtitle: string): void {
    if (!this.el) return;
    sfx.play('boss');
    const card = h(
      'div',
      { class: 'cine-title' },
      h('div', { class: 'ct-line' }),
      h('div', { class: 'ct-name' }, name),
      h('div', { class: 'ct-sub' }, subtitle),
      h('div', { class: 'ct-line' }),
    );
    this.el.appendChild(card);
    setTimeout(() => card.classList.add('out'), 2300);
    setTimeout(() => card.remove(), 3000);
  }

  private dialogue(lines: CineLine[], onDone: () => void): void {
    if (!this.el || !this.lineBox) {
      onDone();
      return;
    }
    this.lines = lines;
    this.idx = 0;
    this.onDone = onDone;
    this.lineBox.classList.remove('hidden');
    this.lineBox.onclick = () => this.next();
    this.show();
  }

  private show(): void {
    const box = this.lineBox!;
    const line = this.lines[this.idx];
    clear(box);
    const portrait = line.look ? h('div', { class: 'cl-portrait' }, portraitCanvas(line.look, 3)) : null;
    this.textEl = h('div', { class: 'cl-text' });
    const body = h('div', { class: 'cl-body' }, h('div', { class: 'cl-name' }, line.who), this.textEl, h('div', { class: 'cl-more' }, 'toque para continuar ▸'));
    box.classList.toggle('right', line.side === 'right');
    if (portrait) box.append(portrait, body);
    else box.append(body);
    this.full = line.text;
    this.type();
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = window.setTimeout(() => this.next(), 1800 + line.text.length * 55);
  }

  private type(): void {
    if (this.typing) clearInterval(this.typing);
    const el = this.textEl!;
    el.textContent = '';
    let i = 0;
    this.typing = window.setInterval(() => {
      i += 1;
      el.textContent = this.full.slice(0, i);
      if (i >= this.full.length && this.typing) {
        clearInterval(this.typing);
        this.typing = null;
      }
    }, 22);
  }

  private next(): void {
    if (!this.lines.length) return;
    // primeiro toque completa o texto; o segundo avança
    if (this.typing) {
      clearInterval(this.typing);
      this.typing = null;
      if (this.textEl) this.textEl.textContent = this.full;
      return;
    }
    sfx.play('click');
    this.idx++;
    if (this.idx >= this.lines.length) {
      const done = this.onDone;
      this.lines = [];
      this.onDone = null;
      if (this.autoTimer) clearTimeout(this.autoTimer);
      this.lineBox?.classList.add('hidden');
      done?.();
      return;
    }
    this.show();
  }

  private skip(): void {
    sfx.play('click');
    this.lines = [];
    this.onDone = null;
    bus.emit('cinematic:skip');
    this.close();
  }

  private key(e: KeyboardEvent): void {
    if (!this.el) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.skip();
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      e.stopPropagation();
      this.next();
    } else {
      // durante a cena, nenhuma tecla chega ao jogo
      e.stopPropagation();
    }
  }

  close(immediate = false): void {
    if (this.typing) clearInterval(this.typing);
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.typing = null;
    this.autoTimer = null;
    window.removeEventListener('keydown', this.onKey, true);
    document.getElementById('ui')?.classList.remove('cinematic');
    const el = this.el;
    this.el = null;
    this.lineBox = null;
    if (!el) return;
    if (immediate) el.remove();
    else {
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    }
  }
}
