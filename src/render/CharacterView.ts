import * as Phaser from 'phaser';
import type { HumanoidLook } from '../core/types';
import { ART_SCALE } from './registerArt';
import { HAND_MAIN, HAND_OFF, HUM_FOOT_Y, HUM_H, ensureCreature, ensureHumanoid, ensureWeapon, type CreatureArtKind } from './characterArt';

/* Visual de um personagem: sombra + corpo (quadros) + arma e mão secundária como sprites
 * separados, dentro de um Container posicionado nos pés. Coordenadas internas em pixels
 * de arte (2× a unidade lógica); o container aplica a escala.
 *
 * Animações de ataque: preparação curta → golpe rápido → continuação, com avanço do corpo
 * e “esticar e achatar”. Combos alternam a direção do golpe. */

export type CreatureKind = CreatureArtKind;
export type SwingKind = 'melee' | 'reverse' | 'heavy' | 'thrust' | 'ranged' | 'spin' | 'cast';

export class CharacterView {
  readonly root: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private weapon: Phaser.GameObjects.Image | null = null;
  private off: Phaser.GameObjects.Image | null = null;
  private weaponStyle = '';
  private facingN = false;
  private flip = false;
  private walkT = 0;
  private idleT = Math.random() * 3;
  private moving = false;
  private swinging = false;
  private baseKey = '';
  private creature: CreatureKind | null = null;
  private flashTimer = 0;
  private tintColor: number | null = null;
  private lungeX = 0;
  private lungeY = 0;
  private stretch = 0;
  scale = 1;
  baseAlpha = 1;

  constructor(
    private scene: Phaser.Scene,
    opts: { look?: HumanoidLook; creature?: CreatureKind; color?: string; scale?: number; spirit?: boolean },
  ) {
    this.scale = opts.scale ?? 1;
    this.root = scene.add.container(0, 0);
    this.shadow = scene.add.image(0, 0, 'fx', 'shadow').setOrigin(0.5, 0.5).setAlpha(0.95);
    this.root.add(this.shadow);
    if (opts.creature) {
      this.creature = opts.creature;
      this.baseKey = ensureCreature(scene.textures, opts.creature, opts.color ?? '#888888', !!opts.spirit);
      const oy = opts.creature === 'slime' ? 0.94 : opts.creature === 'totem' ? 0.95 : 0.92;
      this.body = scene.add.sprite(0, 0, this.baseKey, 0).setOrigin(0.5, oy);
      this.shadow.setScale(opts.creature === 'slime' ? 1.3 : opts.creature === 'totem' ? 1.1 : 1.8, 1.2);
    } else {
      this.body = scene.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, HUM_FOOT_Y / HUM_H);
      this.shadow.setScale(1.1, 1);
    }
    this.root.add(this.body);
    this.root.setScale(ART_SCALE * this.scale);
    if (opts.look) this.setLook(opts.look);
  }

  setLook(look: HumanoidLook): void {
    this.baseKey = ensureHumanoid(this.scene.textures, look);
    this.body.setTexture(this.baseKey, this.frameIndex());
    this.weapon?.destroy();
    this.off?.destroy();
    this.weapon = null;
    this.off = null;
    this.weaponStyle = look.main?.style ?? '';
    if (look.off) {
      const w = ensureWeapon(this.scene.textures, look.off);
      this.off = this.scene.add.image(0, 0, w.key).setOrigin(w.gripX / w.w, w.gripY / w.h);
      this.root.add(this.off);
    }
    if (look.main) {
      const w = ensureWeapon(this.scene.textures, look.main);
      this.weapon = this.scene.add.image(0, 0, w.key).setOrigin(w.gripX / w.w, w.gripY / w.h);
      this.root.add(this.weapon);
    }
    this.layout(true);
  }

  private frameIndex(): number {
    if (this.creature) {
      if (this.creature === 'totem') return Math.floor(this.idleT / 0.4) % 3;
      if (!this.moving) return 0;
      return Math.floor(this.walkT / 0.11) % 2 === 0 ? 1 : 2;
    }
    if (!this.moving) return this.facingN ? 3 : 0;
    // ciclo de 4 tempos: passo A · passagem · passo B · passagem
    const phase = Math.floor(this.walkT / 0.1) % 4;
    const step = phase === 0 ? 1 : phase === 2 ? 2 : 0;
    return (this.facingN ? 3 : 0) + step;
  }

  /** Vira o personagem de acordo com a direção na tela. */
  face(sx: number, sy: number): void {
    if (Math.abs(sx) < 0.01 && Math.abs(sy) < 0.01) return;
    const prevN = this.facingN;
    const prevFlip = this.flip;
    if (Math.abs(sx) > 0.01) this.flip = sx < 0;
    if (!this.creature) this.facingN = sy < -0.15 * Math.abs(sx);
    if (prevN !== this.facingN || prevFlip !== this.flip) this.layout(false);
  }

  get facingRight(): boolean {
    return !this.flip;
  }

  setMoving(moving: boolean, dt: number): void {
    this.moving = moving;
    if (moving) this.walkT += dt;
    else this.walkT = 0;
    this.body.setFrame(this.frameIndex());
  }

  update(dt: number): void {
    this.idleT += dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.applyTint();
    }
    // respiração parada, quique ao andar, recuperação do avanço
    let bob = 0;
    if (this.moving && !this.creature) bob = Math.floor(this.walkT / 0.1) % 2 === 1 ? -2 : 0;
    else if (!this.creature) bob = Math.sin(this.idleT * 2.4) > 0.6 ? -1 : 0;
    if (this.creature === 'slime') bob = 0;
    if (this.creature === 'totem') {
      this.body.setFrame(this.frameIndex());
      bob = Math.round(Math.sin(this.idleT * 2) * 2);
    }
    this.lungeX *= Math.pow(0.0005, dt);
    this.lungeY *= Math.pow(0.0005, dt);
    this.stretch *= Math.pow(0.0008, dt);
    this.body.setPosition(Math.round(this.lungeX), Math.round(bob + this.lungeY));
    this.body.setScale(1 + this.stretch * 0.5, 1 - this.stretch * 0.5);
    const dir = this.flip ? -1 : 1;
    if (this.weapon && !this.swinging) this.weapon.setPosition(HAND_MAIN.x * dir + this.lungeX, HAND_MAIN.y + bob + this.lungeY);
    if (this.off) this.off.setPosition(HAND_OFF.x * dir + this.lungeX, HAND_OFF.y + bob + this.lungeY);
  }

  private layout(force: boolean): void {
    this.body.setFlipX(this.flip);
    const dir = this.flip ? -1 : 1;
    if (this.weapon) {
      this.weapon.setFlipX(this.flip);
      if (!this.swinging) {
        this.weapon.setPosition(HAND_MAIN.x * dir, HAND_MAIN.y);
        this.weapon.setRotation(this.idleRotation() * dir);
      }
    }
    if (this.off) {
      this.off.setFlipX(this.flip);
      this.off.setPosition(HAND_OFF.x * dir, HAND_OFF.y);
    }
    if (!force && !this.weapon && !this.off) return;
    // de costas, arma e escudo ficam atrás do corpo
    this.root.removeAll(false);
    this.root.add(this.shadow);
    if (this.facingN) {
      if (this.weapon) this.root.add(this.weapon);
      if (this.off) this.root.add(this.off);
      this.root.add(this.body);
    } else {
      this.root.add(this.body);
      if (this.off) this.root.add(this.off);
      if (this.weapon) this.root.add(this.weapon);
    }
  }

  private idleRotation(): number {
    switch (this.weaponStyle) {
      case 'bow':
        return 0.05;
      case 'staff':
        return 0.1;
      case 'axe':
        return 0.45;
      case 'dagger':
        return 0.6;
      default:
        return 0.38;
    }
  }

  /** Avança o corpo na direção do golpe (dx, dy na tela). */
  lunge(dx: number, dy: number, amount = 6): void {
    const d = Math.hypot(dx, dy) || 1;
    this.lungeX = (dx / d) * amount;
    this.lungeY = (dy / d) * amount * 0.6;
    this.stretch = 0.12;
  }

  squash(amount = 0.2): void {
    this.stretch = -amount;
  }

  /** Animação de ataque. */
  swing(kind: SwingKind, duration = 0.25): void {
    if (this.creature) {
      const dir = this.flip ? -1 : 1;
      this.lunge(dir, 0, 10);
      return;
    }
    if (!this.weapon) {
      this.lunge(this.flip ? -1 : 1, 0, 5);
      return;
    }
    const w = this.weapon;
    const dir = this.flip ? -1 : 1;
    const hx = HAND_MAIN.x * dir;
    const hy = HAND_MAIN.y;
    this.swinging = true;
    this.scene.tweens.killTweensOf(w);
    const ms = Math.max(90, duration * 1000);
    const done = () => {
      this.swinging = false;
      w.setRotation(this.idleRotation() * dir);
      w.setPosition(hx, hy);
      w.setScale(1);
    };
    switch (kind) {
      case 'spin':
        this.scene.tweens.add({ targets: w, rotation: { from: 0, to: Math.PI * 2 * dir }, duration: ms, onComplete: done });
        break;
      case 'ranged':
        // puxa a corda (encolhe) e solta com recuo
        this.scene.tweens.chain({
          targets: w,
          tweens: [
            { scaleX: 0.82, x: hx - 3 * dir, duration: ms * 0.45, ease: 'Quad.easeOut' },
            { scaleX: 1, x: hx + 2 * dir, duration: ms * 0.2, ease: 'Back.easeOut' },
            { x: hx, duration: ms * 0.35 },
          ],
          onComplete: done,
        });
        break;
      case 'cast':
        this.scene.tweens.chain({
          targets: w,
          tweens: [
            { rotation: -0.5 * dir, y: hy - 8, duration: ms * 0.45, ease: 'Quad.easeOut' },
            { rotation: 0.35 * dir, y: hy + 2, duration: ms * 0.3, ease: 'Cubic.easeIn' },
            { rotation: this.idleRotation() * dir, y: hy, duration: ms * 0.25 },
          ],
          onComplete: done,
        });
        break;
      case 'thrust':
        this.scene.tweens.chain({
          targets: w,
          tweens: [
            { rotation: 1.45 * dir, x: hx - 4 * dir, duration: ms * 0.3, ease: 'Quad.easeOut' },
            { x: hx + 12 * dir, duration: ms * 0.25, ease: 'Expo.easeOut' },
            { x: hx, duration: ms * 0.45 },
          ],
          onComplete: done,
        });
        break;
      case 'heavy':
        // levanta acima da cabeça e desce com tudo
        this.scene.tweens.chain({
          targets: w,
          tweens: [
            { rotation: -2.4 * dir, y: hy - 6, duration: ms * 0.45, ease: 'Back.easeOut' },
            { rotation: 1.9 * dir, y: hy + 4, duration: ms * 0.22, ease: 'Expo.easeIn' },
            { rotation: this.idleRotation() * dir, y: hy, duration: ms * 0.33 },
          ],
          onComplete: done,
        });
        break;
      case 'reverse':
        this.scene.tweens.chain({
          targets: w,
          tweens: [
            { rotation: 2.1 * dir, duration: ms * 0.25, ease: 'Quad.easeOut' },
            { rotation: -1.6 * dir, duration: ms * 0.4, ease: 'Expo.easeOut' },
            { rotation: this.idleRotation() * dir, duration: ms * 0.35 },
          ],
          onComplete: done,
        });
        break;
      default:
        this.scene.tweens.chain({
          targets: w,
          tweens: [
            { rotation: -1.9 * dir, duration: ms * 0.25, ease: 'Quad.easeOut' },
            { rotation: 2.1 * dir, duration: ms * 0.4, ease: 'Expo.easeOut' },
            { rotation: this.idleRotation() * dir, duration: ms * 0.35 },
          ],
          onComplete: done,
        });
    }
  }

  flash(): void {
    this.flashTimer = 0.08;
    this.body.setTintFill(0xffffff);
    this.weapon?.setTintFill(0xffffff);
  }

  setTint(color: number | null): void {
    this.tintColor = color;
    if (this.flashTimer <= 0) this.applyTint();
  }

  private applyTint(): void {
    for (const o of [this.body, this.weapon, this.off]) {
      if (!o) continue;
      if (this.tintColor === null) o.clearTint();
      else o.setTint(this.tintColor);
    }
  }

  setPosition(x: number, y: number, depth: number): void {
    this.root.setPosition(x, y);
    this.root.setDepth(depth);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    if (this.weapon) this.scene.tweens.killTweensOf(this.weapon);
    this.root.destroy(true);
  }
}
