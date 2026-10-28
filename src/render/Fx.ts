import * as Phaser from 'phaser';
import { depthOf, toScreen } from '../core/iso';
import { game } from '../game';
import { ART_SCALE } from './registerArt';

/* Efeitos visuais: números de dano, cortes, faíscas de impacto, anéis de área, raios,
 * partículas. Todas as imagens do atlas 'fx' estão em 2× e são exibidas com ART_SCALE. */

const R_SCREEN_X = 22.63; // raio de 1 tile do mundo projetado (eixo horizontal da elipse)
const ADD = Phaser.BlendModes.ADD;

export type SlashStyle = 'slash' | 'heavy' | 'thin' | 'thrust';

export class Fx {
  constructor(private scene: Phaser.Scene) {}

  private get particlesOn(): boolean {
    return game.settings.particles;
  }

  private img(x: number, y: number, frame: string, depth: number): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, 'fx', frame).setScale(ART_SCALE).setDepth(depth);
  }

  number(x: number, y: number, text: string, color: number, big = false): void {
    if (!game.settings.damageNumbers) return;
    const s = toScreen(x, y);
    const t = this.scene.add.bitmapText(s.x, s.y - 26, 'dmg', text).setOrigin(0.5, 1);
    t.setTint(color).setDepth(2_000_000).setLetterSpacing(-1);
    const dx = (Math.random() - 0.5) * 16;
    const base = big ? 1.6 : 1;
    t.setScale(base * 1.8);
    this.scene.tweens.add({ targets: t, scale: base, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      x: s.x + dx,
      y: s.y - 46 - (big ? 6 : 0),
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: t, alpha: 0, duration: 220, onComplete: () => t.destroy() });
      },
    });
  }

  label(x: number, y: number, text: string, color = '#ffffff', size = 9): void {
    const s = toScreen(x, y);
    const t = this.scene.add
      .text(s.x, s.y - 36, text, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#1b1a24', strokeThickness: 3, resolution: 8 })
      .setOrigin(0.5, 1)
      .setDepth(2_000_001);
    this.scene.tweens.add({ targets: t, y: s.y - 50, alpha: { from: 1, to: 0 }, delay: 700, duration: 800, onComplete: () => t.destroy() });
  }

  /**
   * Rastro do golpe. angle = direção na tela; reverse inverte o sentido do arco (combos).
   */
  slash(x: number, y: number, angleScreen: number, scale = 1, color = 0xffffff, style: SlashStyle = 'slash', reverse = false): void {
    const s = toScreen(x, y);
    const frame = style === 'heavy' ? 'slash_heavy' : style === 'thin' ? 'slash_thin' : style === 'thrust' ? 'thrust' : 'slash';
    const d = depthOf(x, y) + 40;
    const sx = scale * ART_SCALE * (style === 'thrust' ? 0.9 : 0.85);
    const sy = scale * ART_SCALE * (style === 'thrust' ? 0.7 : 0.6) * (reverse ? -1 : 1);
    // camada colorida + núcleo branco aditivo
    const outer = this.scene.add.image(s.x, s.y - 12, 'fx', frame).setRotation(angleScreen).setScale(sx * 0.75, sy * 0.75).setTint(color).setDepth(d).setAlpha(0.9);
    const core = this.scene.add.image(s.x, s.y - 12, 'fx', frame).setRotation(angleScreen).setScale(sx * 0.68, sy * 0.68).setBlendMode(ADD).setDepth(d + 1);
    const rot = reverse ? -0.5 : 0.5;
    this.scene.tweens.add({ targets: [outer, core], scaleX: sx * 1.1, scaleY: sy * 1.1, rotation: angleScreen + rot, duration: 90, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: [outer, core], alpha: 0, delay: 70, duration: 150, onComplete: () => (outer.destroy(), core.destroy()) });
  }

  /** Faísca de impacto (estrela) + pequenas lascas. */
  impact(x: number, y: number, color = 0xffffff, crit = false): void {
    const s = toScreen(x, y);
    const d = depthOf(x, y) + 60;
    const star = this.img(s.x, s.y - 12, crit ? 'star8' : 'star', d).setBlendMode(ADD).setTint(color).setRotation(Math.random() * Math.PI);
    const k = crit ? 1.3 : 0.9;
    star.setScale(ART_SCALE * 0.3 * k);
    this.scene.tweens.add({ targets: star, scale: ART_SCALE * k, alpha: { from: 1, to: 0 }, duration: crit ? 260 : 180, ease: 'Cubic.easeOut', onComplete: () => star.destroy() });
    this.burst(x, y, color, crit ? 8 : 4, 'spark', crit ? 20 : 12, 12);
  }

  /** Anel que se expande (impacto em área). */
  ring(x: number, y: number, r: number, color: number, dur = 300, frame: 'ring' | 'shock' = 'ring'): void {
    const s = toScreen(x, y);
    const img = this.img(s.x, s.y, frame, -400_000).setTint(color).setBlendMode(frame === 'shock' ? ADD : Phaser.BlendModes.NORMAL);
    const w = ((r * 2 * R_SCREEN_X) / 64) * ART_SCALE;
    img.setScale(w * 0.3);
    this.scene.tweens.add({ targets: img, scale: w, alpha: { from: 1, to: 0 }, duration: dur, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
  }

  /** Aviso no chão (telegrafia de ataque). */
  telegraph(x: number, y: number, r: number, color: number, dur: number, key: 'disk' | 'rune' = 'disk'): Phaser.GameObjects.Image {
    const s = toScreen(x, y);
    const img = this.img(s.x, s.y, key, -450_000).setTint(color).setAlpha(0.85);
    const w = ((r * 2 * R_SCREEN_X) / 64) * ART_SCALE;
    img.setScale(0.2 * w);
    this.scene.tweens.add({ targets: img, scale: w, duration: Math.min(dur * 1000, 260), ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: { from: 0.5, to: 0.95 }, duration: 150, yoyo: true, repeat: Math.max(0, Math.floor(dur / 0.3)) });
    if (key === 'rune') this.scene.tweens.add({ targets: img, rotation: 0.6, duration: dur * 1000 });
    this.scene.time.delayedCall(dur * 1000, () => img.destroy());
    return img;
  }

  burst(x: number, y: number, color: number, count = 8, frame = 'spark', spread = 18, lift = 10): void {
    if (!this.particlesOn) count = Math.min(count, 2);
    const s = toScreen(x, y);
    for (let i = 0; i < count; i++) {
      const p = this.img(s.x, s.y - lift, frame, depthOf(x, y) + 50).setTint(color);
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.4 + Math.random() * 0.6);
      this.scene.tweens.add({
        targets: p,
        x: s.x + Math.cos(a) * d,
        y: s.y - lift + Math.sin(a) * d * 0.6 - 6,
        alpha: 0,
        scale: { from: ART_SCALE, to: ART_SCALE * 0.3 },
        duration: 300 + Math.random() * 260,
        onComplete: () => p.destroy(),
      });
    }
  }

  rise(x: number, y: number, frame: string, color: number, count = 6, add = false): void {
    if (!this.particlesOn) count = Math.min(count, 2);
    const s = toScreen(x, y);
    for (let i = 0; i < count; i++) {
      const p = this.img(s.x + (Math.random() - 0.5) * 18, s.y - Math.random() * 6, frame, depthOf(x, y) + 50).setTint(color);
      if (add) p.setBlendMode(ADD);
      this.scene.tweens.add({ targets: p, y: p.y - 22 - Math.random() * 14, alpha: 0, delay: i * 55, duration: 700, onComplete: () => p.destroy() });
    }
  }

  dust(x: number, y: number, count = 3): void {
    if (!this.particlesOn) return;
    const s = toScreen(x, y);
    for (let i = 0; i < count; i++) {
      const p = this.img(s.x + (Math.random() - 0.5) * 8, s.y - 1, 'dust', depthOf(x, y) - 1).setTint(0xd8c8a0).setAlpha(0.7);
      this.scene.tweens.add({ targets: p, x: p.x + (Math.random() - 0.5) * 14, y: p.y - 4, alpha: 0, scale: ART_SCALE * 1.6, duration: 450, onComplete: () => p.destroy() });
    }
  }

  heal(x: number, y: number): void {
    this.rise(x, y, 'heal', 0x7dff9a, 7, true);
    this.ring(x, y, 1.2, 0x7dff9a, 450, 'shock');
  }

  levelUp(x: number, y: number): void {
    this.ring(x, y, 2.4, 0xffd36a, 650, 'shock');
    this.rise(x, y, 'mote', 0xffe9a0, 16, true);
    const s = toScreen(x, y);
    const pillar = this.img(s.x, s.y - 30, 'ray', depthOf(x, y) + 2).setBlendMode(ADD).setTint(0xffe08a).setAlpha(0);
    pillar.setScale(ART_SCALE * 0.8, ART_SCALE * 0.7);
    this.scene.tweens.add({ targets: pillar, alpha: { from: 0.9, to: 0 }, duration: 900, onComplete: () => pillar.destroy() });
  }

  explosion(x: number, y: number, r: number, color = 0xff8a3a): void {
    this.ring(x, y, r, color, 380, 'shock');
    this.burst(x, y, color, 14, 'spark', r * 18, 6);
    this.burst(x, y, 0xffe08a, 6, 'fire', r * 10, 4);
    const s = toScreen(x, y);
    const flash = this.img(s.x, s.y - 6, 'glow', depthOf(x, y) + 60).setBlendMode(ADD).setTint(color);
    flash.setScale(ART_SCALE * r * 1.4);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: ART_SCALE * r * 2, duration: 260, onComplete: () => flash.destroy() });
  }

  /** Raio em zigue-zague entre dois pontos do mundo. */
  lightning(x0: number, y0: number, x1: number, y1: number, color = 0x9cd8ff): void {
    const a = toScreen(x0, y0);
    const b = toScreen(x1, y1);
    const g = this.scene.add.graphics().setDepth(Math.max(depthOf(x0, y0), depthOf(x1, y1)) + 80).setBlendMode(ADD);
    const pts: [number, number][] = [[a.x, a.y - 14]];
    const n = 7;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 10, a.y - 14 + (b.y - a.y) * t + (Math.random() - 0.5) * 8]);
    }
    pts.push([b.x, b.y - 14]);
    const draw = (w: number, c: number, al: number) => {
      g.lineStyle(w, c, al);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
      g.strokePath();
    };
    draw(3, color, 0.6);
    draw(1, 0xffffff, 1);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  /** Brilho rápido no corpo (ex.: lançar feitiço). */
  glowAt(x: number, y: number, color: number, size = 1, dur = 300): void {
    const s = toScreen(x, y);
    const g = this.img(s.x, s.y - 14, 'glow', depthOf(x, y) + 30).setBlendMode(ADD).setTint(color);
    g.setScale(ART_SCALE * size * 0.6);
    this.scene.tweens.add({ targets: g, scale: ART_SCALE * size * 1.4, alpha: { from: 0.9, to: 0 }, duration: dur, onComplete: () => g.destroy() });
  }

  smoke(sx: number, sy: number, depth: number): void {
    const p = this.scene.add.image(sx, sy, 'fx', 'smoke').setScale(ART_SCALE * 0.5).setDepth(depth).setAlpha(0.55).setTint(0xd8d4dc);
    this.scene.tweens.add({ targets: p, x: sx + 10 + Math.random() * 8, y: sy - 26, scale: ART_SCALE * 1.3, alpha: 0, duration: 2600, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
  }

  ember(sx: number, sy: number, depth: number): void {
    const p = this.scene.add.image(sx + (Math.random() - 0.5) * 6, sy, 'fx', 'mote').setScale(ART_SCALE * 0.5).setDepth(depth).setBlendMode(ADD).setTint(0xffa040);
    this.scene.tweens.add({ targets: p, x: p.x + (Math.random() - 0.5) * 10, y: sy - 18 - Math.random() * 10, alpha: 0, duration: 900, onComplete: () => p.destroy() });
  }

  sparkle(sx: number, sy: number, depth: number): void {
    const p = this.scene.add.image(sx + (Math.random() - 0.5) * 40, sy + (Math.random() - 0.5) * 16, 'fx', 'spark').setScale(ART_SCALE * 0.6).setDepth(depth).setBlendMode(ADD).setTint(0xbfe8ff);
    this.scene.tweens.add({ targets: p, alpha: { from: 1, to: 0 }, scale: ART_SCALE * 0.2, duration: 500, onComplete: () => p.destroy() });
  }

  /** Redemoinho de lâminas ao redor de um ponto (golpe giratório e evoluções). */
  whirl(x: number, y: number, r: number, color: number, dur = 280, turns = 1, reverse = false): void {
    const s = toScreen(x, y);
    const d = depthOf(x, y) + 45;
    const box = this.scene.add.container(s.x, s.y - 8).setDepth(d).setScale(1, 0.5);
    const k = (r * R_SCREEN_X) / 62;
    const dir = reverse ? -1 : 1;
    const parts: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 2; i++) {
      const outer = this.scene.add.image(0, 0, 'fx', 'slash_heavy').setScale(k).setTint(color).setAlpha(0.85).setRotation(i * Math.PI);
      const core = this.scene.add.image(0, 0, 'fx', 'slash_heavy').setScale(k * 0.94).setBlendMode(ADD).setRotation(i * Math.PI);
      parts.push(outer, core);
    }
    box.add(parts);
    this.scene.tweens.add({ targets: box, rotation: Math.PI * 2 * turns * dir, duration: dur, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: box, alpha: 0, delay: dur * 0.7, duration: dur * 0.45, onComplete: () => box.destroy() });
    this.dust(x, y, 4);
  }

  /** Flecha caindo do céu (Chuva de Flechas). */
  fallingArrow(x: number, y: number, color = 0xffffff, fire = false): void {
    const s = toScreen(x, y);
    const d = depthOf(x, y) + 30;
    const a = this.img(s.x - 18, s.y - 90, 'arrow', d).setRotation(Math.PI / 2 - 0.2).setTint(color);
    this.scene.tweens.add({
      targets: a,
      x: s.x,
      y: s.y - 6,
      duration: 150,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.dust(x, y, 1);
        if (fire) {
          const f = this.img(s.x, s.y - 4, 'fire', d).setOrigin(0.5, 1).setBlendMode(ADD);
          this.scene.tweens.add({ targets: f, alpha: 0, scaleY: ART_SCALE * 1.5, duration: 420, onComplete: () => f.destroy() });
        }
        this.scene.tweens.add({ targets: a, alpha: 0, delay: 140, duration: 200, onComplete: () => a.destroy() });
      },
    });
  }

  /** Martelo de luz que cai do céu. */
  dropHammer(x: number, y: number, size: number, color: number, onImpact: () => void): void {
    const s = toScreen(x, y);
    const d = depthOf(x, y) + 70;
    const ray = this.img(s.x, s.y - 40, 'ray', d - 1).setBlendMode(ADD).setTint(color).setAlpha(0);
    ray.setScale(ART_SCALE * 0.6 * size, ART_SCALE * 0.6);
    this.scene.tweens.add({ targets: ray, alpha: 0.8, duration: 200 });
    const hm = this.img(s.x, s.y - 110, 'hammer', d).setOrigin(0.5, 1).setScale(ART_SCALE * size).setTint(color).setAlpha(0);
    hm.setRotation(-0.5);
    this.scene.tweens.add({
      targets: hm,
      y: s.y - 2,
      alpha: 1,
      rotation: 0,
      duration: 300,
      ease: 'Quad.easeIn',
      onComplete: () => {
        onImpact();
        this.ring(x, y, 1.6 * size, color, 380, 'shock');
        this.burst(x, y, color, 10, 'spark', 26 * size, 8);
        this.dust(x, y, 6);
        this.scene.tweens.add({ targets: [hm, ray], alpha: 0, delay: 160, duration: 260, onComplete: () => (hm.destroy(), ray.destroy()) });
      },
    });
  }

  /** Rocha que rompe o chão (Fenda Sísmica). */
  crack(x: number, y: number, color = 0xb08a5a, big = false): void {
    const s = toScreen(x, y);
    const d = depthOf(x, y) + 5;
    const k = big ? 1.3 : 1;
    const r = this.img(s.x + (Math.random() - 0.5) * 6, s.y + 2, 'shard', d).setOrigin(0.5, 1).setTint(color);
    r.setScale(ART_SCALE * k, 0);
    r.setRotation((Math.random() - 0.5) * 0.5);
    this.scene.tweens.add({ targets: r, scaleY: ART_SCALE * k, duration: 90, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: r, alpha: 0, scaleY: 0, delay: 500, duration: 260, onComplete: () => r.destroy() });
    this.dust(x, y, 2);
  }

  /** Espinho de gelo saindo do chão. */
  iceSpike(x: number, y: number, hold = 900): Phaser.GameObjects.Image {
    const s = toScreen(x, y);
    const sp = this.img(s.x, s.y + 3, 'ice', depthOf(x, y) + 6).setOrigin(0.5, 1);
    sp.setScale(ART_SCALE * (0.8 + Math.random() * 0.5), 0);
    this.scene.tweens.add({ targets: sp, scaleY: ART_SCALE * (0.9 + Math.random() * 0.5), duration: 120, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: sp, alpha: 0, delay: hold, duration: 300, onComplete: () => sp.destroy() });
    return sp;
  }

  /** Coluna de luz (evoluções, invocações). */
  pillar(x: number, y: number, color: number, w = 1, dur = 700): void {
    const s = toScreen(x, y);
    const p = this.img(s.x, s.y - 40, 'ray', depthOf(x, y) + 3).setBlendMode(ADD).setTint(color).setAlpha(0);
    p.setScale(ART_SCALE * 0.7 * w, ART_SCALE * 0.6);
    this.scene.tweens.add({ targets: p, alpha: { from: 0.95, to: 0 }, scaleX: ART_SCALE * 0.2 * w, duration: dur, ease: 'Quad.easeIn', onComplete: () => p.destroy() });
  }

  /** Chama no chão que dura um tempo (Bomba Solar). */
  flame(x: number, y: number, dur = 600): void {
    const s = toScreen(x, y);
    const f = this.img(s.x + (Math.random() - 0.5) * 6, s.y, 'fire', depthOf(x, y) + 4).setOrigin(0.5, 1).setBlendMode(ADD).setAlpha(0.9);
    f.setScale(ART_SCALE * (0.8 + Math.random() * 0.6));
    this.scene.tweens.add({ targets: f, scaleY: f.scaleY * 1.4, y: f.y - 3, alpha: 0, duration: dur, onComplete: () => f.destroy() });
  }

  /** Imagem que segue um ator (auras, escudos). */
  attached(frame: string, color: number, add = true): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, 'fx', frame).setScale(ART_SCALE).setTint(color);
    if (add) img.setBlendMode(ADD);
    return img;
  }

  shake(intensity = 0.004, dur = 120): void {
    if (!game.settings.screenShake) return;
    this.scene.cameras.main.shake(dur, intensity);
  }
}
