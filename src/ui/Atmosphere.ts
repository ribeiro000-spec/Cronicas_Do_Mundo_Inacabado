import { bus } from '../core/events';
import { game } from '../game';
import { h } from './dom';

/* Atmosfera por área: um leve filtro de cor e uma vinheta por cima do jogo
 * (camadas DOM baratas, sem custo para o WebGL). */

const TINTS: Record<string, { color: string; vignette: number }> = {
  'Floresta dos Sinos Mudos': { color: 'rgba(20, 70, 50, 0.16)', vignette: 0.55 },
  'Clareira do Sino': { color: 'rgba(60, 90, 40, 0.1)', vignette: 0.42 },
  'Ruínas Antigas': { color: 'rgba(60, 40, 110, 0.16)', vignette: 0.6 },
  'Campos de Orvalho': { color: 'rgba(255, 190, 90, 0.08)', vignette: 0.3 },
  Valedouro: { color: 'rgba(255, 190, 90, 0.07)', vignette: 0.3 },
  'Vila de Eldenor': { color: 'rgba(255, 170, 90, 0.06)', vignette: 0.32 },
  'Lago de Orvalho': { color: 'rgba(60, 130, 200, 0.1)', vignette: 0.36 },
  'Acampamento dos Saqueadores': { color: 'rgba(120, 50, 30, 0.12)', vignette: 0.48 },
  'Estrada das Caravanas': { color: 'rgba(200, 160, 100, 0.06)', vignette: 0.34 },
};

export class Atmosphere {
  readonly el: HTMLElement;
  private tint: HTMLElement;
  private vignette: HTMLElement;

  constructor() {
    this.tint = h('div', { class: 'atmo-tint' });
    this.vignette = h('div', { class: 'atmo-vignette' });
    this.el = h('div', { class: 'atmo hidden' }, this.tint, this.vignette);
    document.body.insertBefore(this.el, document.getElementById('ui'));
    bus.on('area:entered', ({ name }) => this.apply(name));
    bus.on('state:changed', () => this.el.classList.toggle('off', !game.settings.particles));
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
  }

  private apply(area: string): void {
    const t = TINTS[area] ?? { color: 'rgba(0,0,0,0)', vignette: 0.34 };
    this.tint.style.background = t.color;
    this.vignette.style.opacity = String(t.vignette);
  }
}
