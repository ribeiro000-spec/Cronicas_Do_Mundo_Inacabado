import * as Phaser from 'phaser';
import { depthOf, toScreen } from '../core/iso';
import { game } from '../game';

/* Efeitos visuais: números de dano, cortes, anéis de área, partículas simples. */

const R_SCREEN_X = 22.63; // raio de 1 tile do mundo projetado (eixo horizontal da elipse)

export class Fx {
  constructor(private scene: Phaser.Scene) {}

  private get particlesOn(): boolean {
    return game.settings.particles;
  }

  number(x: number, y: number, text: string, color: number, big = false): void {
    if (!game.settings.damageNumbers) return;
    const s = toScreen(x, y);
    const t = this.scene.add.bitmapText(s.x, s.y - 26, 'dmg', text).setOrigin(0.5, 1);
    t.setTint(color).setDepth(2_000_000).setScale(big ? 2 : 1).setLetterSpacing(-1);
    const dx = (Math.random() - 0.5) * 14;
    this.scene.tweens.add({
      targets: t,
      x: s.x + dx,
      y: s.y - 44 - (big ? 6 : 0),
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: t, alpha: 0, duration: 220, onComplete: () => t.destroy() });
      },
    });
  }

  label(x: number, y: number, text: string, color = '#ffffff'): void {
    const s = toScreen(x, y);
    const t = this.scene.add
      .text(s.x, s.y - 34, text, { fontFamily: 'system-ui, sans-serif', fontSize: '9px', color, stroke: '#1b1a24', strokeThickness: 3, resolution: 3 })
      .setOrigin(0.5, 1)
      .setDepth(2_000_001);
    this.scene.tweens.add({ targets: t, y: s.y - 48, alpha: { from: 1, to: 0 }, delay: 500, duration: 700, onComplete: () => t.destroy() });
  }

  slash(x: number, y: number, angleScreen: number, scale = 1, color = 0xffffff): void {
    const s = toScreen(x, y);
    const img = this.scene.add.image(s.x, s.y - 10, 'fx', 'slash').setRotation(angleScreen).setScale(scale * 0.8, scale * 0.55).setTint(color);
    img.setDepth(depthOf(x, y) + 2).setAlpha(0.95);
    this.scene.tweens.add({ targets: img, alpha: 0, scaleX: scale * 1.15, duration: 170, onComplete: () => img.destroy() });
  }

  /** Anel que se expande (impacto em área). */
  ring(x: number, y: number, r: number, color: number, dur = 300): void {
    const s = toScreen(x, y);
    const img = this.scene.add.image(s.x, s.y, 'fx', 'ring').setTint(color).setDepth(-400_000);
    const w = (r * 2 * R_SCREEN_X) / 64;
    img.setScale(w * 0.3);
    this.scene.tweens.add({ targets: img, scale: w, alpha: { from: 1, to: 0 }, duration: dur, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
  }

  /** Aviso no chão (telegrafia de ataque) — devolve o objeto para remover depois. */
  telegraph(x: number, y: number, r: number, color: number, dur: number, key: 'disk' | 'rune' = 'disk'): Phaser.GameObjects.Image {
    const s = toScreen(x, y);
    const img = this.scene.add.image(s.x, s.y, 'fx', key).setTint(color).setDepth(-450_000).setAlpha(0.85);
    const w = (r * 2 * R_SCREEN_X) / 64;
    img.setScale(0.2 * w);
    this.scene.tweens.add({ targets: img, scale: w, duration: Math.min(dur * 1000, 260), ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: { from: 0.55, to: 0.95 }, duration: 160, yoyo: true, repeat: Math.max(0, Math.floor(dur / 0.32)) });
    this.scene.time.delayedCall(dur * 1000, () => img.destroy());
    return img;
  }

  burst(x: number, y: number, color: number, count = 8, frame = 'spark', spread = 18, lift = 10): void {
    if (!this.particlesOn) count = Math.min(count, 2);
    const s = toScreen(x, y);
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.image(s.x, s.y - lift, 'fx', frame).setTint(color).setDepth(depthOf(x, y) + 3);
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.4 + Math.random() * 0.6);
      this.scene.tweens.add({
        targets: p,
        x: s.x + Math.cos(a) * d,
        y: s.y - lift + Math.sin(a) * d * 0.6 - 6,
        alpha: 0,
        scale: { from: 1, to: 0.3 },
        duration: 300 + Math.random() * 250,
        onComplete: () => p.destroy(),
      });
    }
  }

  rise(x: number, y: number, frame: string, color: number, count = 6): void {
    if (!this.particlesOn) count = Math.min(count, 2);
    const s = toScreen(x, y);
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.image(s.x + (Math.random() - 0.5) * 18, s.y - Math.random() * 6, 'fx', frame).setTint(color).setDepth(depthOf(x, y) + 3);
      this.scene.tweens.add({
        targets: p,
        y: p.y - 22 - Math.random() * 12,
        alpha: 0,
        delay: i * 60,
        duration: 650,
        onComplete: () => p.destroy(),
      });
    }
  }

  heal(x: number, y: number): void {
    this.rise(x, y, 'heal', 0x7dff9a, 7);
  }

  levelUp(x: number, y: number): void {
    this.ring(x, y, 2.2, 0xffd36a, 600);
    this.rise(x, y, 'spark', 0xffe9a0, 14);
  }

  explosion(x: number, y: number, r: number, color = 0xff8a3a): void {
    this.ring(x, y, r, color, 380);
    this.burst(x, y, color, 14, 'spark', r * 18, 6);
    this.burst(x, y, 0xffe08a, 6, 'fire', r * 10, 4);
  }

  shake(intensity = 0.004, dur = 120): void {
    if (!game.settings.screenShake) return;
    this.scene.cameras.main.shake(dur, intensity);
  }
}
