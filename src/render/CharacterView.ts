import * as Phaser from 'phaser';
import type { HumanoidLook } from '../core/types';
import { HUM_FOOT_Y, HUM_H, ensureCreature, ensureHumanoid, ensureWeapon } from './characterArt';

/* Visual de um personagem: sombra + corpo (quadros) + arma e mão secundária como sprites
 * separados. Tudo dentro de um Container posicionado nos pés. */

export type CreatureKind = 'slime' | 'wolf' | 'boar' | 'spider';

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
  private moving = false;
  private swinging = false;
  private baseKey = '';
  private creature: CreatureKind | null = null;
  private flashTimer = 0;
  private tintColor: number | null = null;
  scale = 1;

  constructor(
    private scene: Phaser.Scene,
    opts: { look?: HumanoidLook; creature?: CreatureKind; color?: string; scale?: number },
  ) {
    this.scale = opts.scale ?? 1;
    this.root = scene.add.container(0, 0);
    this.shadow = scene.add.image(0, 0, 'fx', 'shadow').setOrigin(0.5, 0.5).setAlpha(0.9);
    this.root.add(this.shadow);
    if (opts.creature) {
      this.creature = opts.creature;
      this.baseKey = ensureCreature(scene.textures, opts.creature, opts.color ?? '#888888');
      this.body = scene.add.sprite(0, 0, this.baseKey, 0).setOrigin(0.5, opts.creature === 'slime' ? 0.95 : 0.92);
      this.shadow.setScale(opts.creature === 'slime' ? 1 : 1.4, 1);
    } else {
      this.body = scene.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, HUM_FOOT_Y / HUM_H);
    }
    this.root.add(this.body);
    this.root.setScale(this.scale);
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
    this.layout();
  }

  private frameIndex(): number {
    if (this.creature) {
      if (!this.moving) return 0;
      return Math.floor(this.walkT / 0.12) % 2 === 0 ? 1 : 2;
    }
    const step = this.moving ? (Math.floor(this.walkT / 0.13) % 2 === 0 ? 1 : 2) : 0;
    return (this.facingN ? 3 : 0) + step;
  }

  /** Vira o personagem de acordo com a direção na tela. */
  face(sx: number, sy: number): void {
    if (Math.abs(sx) < 0.01 && Math.abs(sy) < 0.01) return;
    const prevN = this.facingN;
    const prevFlip = this.flip;
    if (Math.abs(sx) > 0.01) this.flip = sx < 0;
    if (!this.creature) this.facingN = sy < -0.15 * Math.abs(sx);
    if (prevN !== this.facingN || prevFlip !== this.flip) this.layout();
  }

  setMoving(moving: boolean, dt: number): void {
    this.moving = moving;
    if (moving) this.walkT += dt;
    else this.walkT = 0;
    this.body.setFrame(this.frameIndex());
    const bob = !this.creature && moving && Math.floor(this.walkT / 0.13) % 2 === 0 ? -1 : 0;
    this.body.y = bob;
    if (this.creature === 'slime') this.body.y = 0;
  }

  update(dt: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.applyTint();
    }
  }

  private layout(): void {
    this.body.setFlipX(this.flip);
    const dir = this.flip ? -1 : 1;
    if (this.weapon) {
      this.weapon.setFlipX(this.flip);
      this.weapon.setPosition(5 * dir, -9);
      if (!this.swinging) this.weapon.setRotation(this.idleRotation() * dir);
    }
    if (this.off) {
      this.off.setFlipX(this.flip);
      this.off.setPosition(-5 * dir, -9);
    }
    // ordem: de costas, arma e escudo ficam atrás do corpo
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
        return 0.12;
      case 'axe':
        return 0.5;
      default:
        return 0.42;
    }
  }

  /** Animação de ataque. */
  swing(kind: 'melee' | 'ranged' | 'spin' | 'cast', duration = 0.25): void {
    if (this.creature) {
      const dir = this.flip ? -1 : 1;
      this.scene.tweens.add({ targets: this.body, x: { from: 0, to: 4 * dir }, duration: duration * 400, yoyo: true, ease: 'Quad.easeOut' });
      return;
    }
    if (!this.weapon) {
      this.scene.tweens.add({ targets: this.body, x: { from: 0, to: this.flip ? -2 : 2 }, duration: 70, yoyo: true });
      return;
    }
    const w = this.weapon;
    const dir = this.flip ? -1 : 1;
    this.swinging = true;
    this.scene.tweens.killTweensOf(w);
    const done = () => {
      this.swinging = false;
      w.setRotation(this.idleRotation() * dir);
      w.setPosition(5 * dir, -9);
    };
    if (kind === 'spin') {
      this.scene.tweens.add({ targets: w, rotation: { from: 0, to: Math.PI * 2 * dir }, duration: duration * 1000, onComplete: done });
    } else if (kind === 'ranged') {
      this.scene.tweens.add({ targets: w, x: { from: 5 * dir, to: 3 * dir }, duration: duration * 500, yoyo: true, onComplete: done });
    } else if (kind === 'cast') {
      this.scene.tweens.add({ targets: w, rotation: { from: -0.4 * dir, to: 0.2 * dir }, y: { from: -12, to: -9 }, duration: duration * 1000, onComplete: done });
    } else {
      this.scene.tweens.add({
        targets: w,
        rotation: { from: -1.7 * dir, to: 2.0 * dir },
        duration: Math.max(90, duration * 1000),
        ease: 'Cubic.easeOut',
        onComplete: done,
      });
    }
  }

  flash(): void {
    this.flashTimer = 0.09;
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
    this.root.setPosition(Math.round(x), Math.round(y));
    this.root.setDepth(depth);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    if (this.weapon) this.scene.tweens.killTweensOf(this.weapon);
    this.root.destroy(true);
  }
}
