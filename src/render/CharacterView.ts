import * as Phaser from 'phaser';
import { snapPx } from '../core/display';
import type { HumanoidLook } from '../core/types';
import { ART_SCALE } from './registerArt';
import {
  FRAMES_PER_FACING,
  FRAME_ATTACK,
  FRAME_CAST,
  HANDS,
  HUM_FOOT_Y,
  HUM_H,
  ensureCreature,
  ensureFist,
  ensureWeapon,
  ensureHumanoid,
  CREATURE_FRAMES,
  type CreatureArtKind,
} from './characterArt';

/* Visual de um personagem: sombra + corpo (quadros) + arma, mão secundária e o punho que
 * segura a arma como sprites separados, dentro de um Container posicionado nos pés.
 * Coordenadas internas em pixels de arte (2× a unidade lógica); o container aplica a escala.
 *
 * Humanoides: 2 vistas (3/4 de frente e de costas, espelhadas) × 9 quadros — parado,
 * caminhada de 6 tempos, golpe e magia. A arma acompanha a mão em cada quadro.
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
  private fist: Phaser.GameObjects.Image | null = null;
  /** pose de ação em andamento (golpe ou magia) */
  private pose: 'atk' | 'cast' | null = null;
  private poseT = 0;
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
      const oy = opts.creature === 'slime' ? 0.93 : opts.creature === 'totem' ? 0.95 : opts.creature === 'spider' ? 0.89 : 0.9;
      this.body = scene.add.sprite(0, 0, this.baseKey, 0).setOrigin(0.5, oy);
      this.shadow.setScale(opts.creature === 'slime' ? 1.3 : opts.creature === 'totem' ? 1.1 : opts.creature === 'spider' ? 1.9 : 1.8, 1.2);
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
    this.fist?.destroy();
    this.weapon = null;
    this.off = null;
    this.fist = null;
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
      this.fist = this.scene.add.image(0, 0, ensureFist(this.scene.textures, look)).setOrigin(0.5, 0.5);
      this.root.add(this.fist);
    }
    this.layout(true);
  }

  private frameIndex(): number {
    if (this.creature) {
      const cf = CREATURE_FRAMES[this.creature];
      if (cf.idleCycle) return Math.floor(this.idleT / 0.4) % cf.idleCycle;
      if (this.poseT > 0 && cf.attack !== undefined) return cf.attack;
      if (!this.moving) return 0;
      return 1 + (Math.floor(this.walkT / cf.step) % cf.walk);
    }
    const base = this.facingN ? FRAMES_PER_FACING : 0;
    if (this.poseT > 0 && this.pose) return base + (this.pose === 'cast' ? FRAME_CAST : FRAME_ATTACK);
    if (!this.moving) return base;
    // caminhada de 6 tempos
    return base + 1 + (Math.floor(this.walkT / 0.085) % 6);
  }

  /** Mãos no quadro atual (pixels de arte, relativas aos pés). */
  private hands(): (typeof HANDS)[number] {
    return HANDS[this.frameIndex() % FRAMES_PER_FACING];
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
    if (this.poseT > 0) {
      this.poseT -= dt;
      if (this.poseT <= 0) this.pose = null;
    }
    this.body.setFrame(this.frameIndex());
    // respiração parada e recuperação do avanço (o quique da caminhada já está nos quadros)
    let bob = 0;
    if (!this.creature && !this.moving && this.poseT <= 0) bob = Math.sin(this.idleT * 2.4) > 0.6 ? -1 : 0;
    if (this.creature === 'totem') bob = Math.round(Math.sin(this.idleT * 2) * 2);
    this.lungeX *= Math.pow(0.0005, dt);
    this.lungeY *= Math.pow(0.0005, dt);
    this.stretch *= Math.pow(0.0008, dt);
    this.body.setPosition(Math.round(this.lungeX), Math.round(bob + this.lungeY));
    this.body.setScale(1 + this.stretch * 0.5, 1 - this.stretch * 0.5);
    if (this.creature) return;
    const dir = this.flip ? -1 : 1;
    const h = this.hands();
    const lx = Math.round(this.lungeX);
    const ly = Math.round(bob + this.lungeY);
    if (this.weapon && !this.swinging) this.weapon.setPosition(h.main.x * dir + lx, h.main.y + ly);
    if (this.off) this.off.setPosition(h.off.x * dir + lx, h.off.y + ly);
    if (this.fist && this.weapon) this.fist.setPosition(Math.round(this.weapon.x), Math.round(this.weapon.y)).setVisible(this.weapon.visible);
  }

  private layout(force: boolean): void {
    this.body.setFlipX(this.flip);
    const dir = this.flip ? -1 : 1;
    const h = this.hands();
    if (this.weapon) {
      this.weapon.setFlipX(this.flip);
      if (!this.swinging) {
        this.weapon.setPosition(h.main.x * dir, h.main.y);
        this.weapon.setRotation(this.idleRotation() * dir);
      }
    }
    this.fist?.setFlipX(this.flip);
    if (this.off) {
      this.off.setFlipX(this.flip);
      this.off.setPosition(h.off.x * dir, h.off.y);
    }
    if (!force && !this.weapon && !this.off) return;
    // escudo e arma ficam nas mãos, à frente do corpo; o punho por cima do cabo
    this.root.removeAll(false);
    this.root.add(this.shadow);
    this.root.add(this.body);
    if (this.off) this.root.add(this.off);
    if (this.weapon) this.root.add(this.weapon);
    if (this.fist) this.root.add(this.fist);
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
    this.pose = kind === 'cast' ? 'cast' : 'atk';
    this.poseT = Math.max(0.16, duration + 0.06);
    this.body.setFrame(this.frameIndex());
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
    const hand = this.hands().main;
    const hx = hand.x * dir;
    const hy = hand.y;
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
    this.fist?.setTintFill(0xffffff);
  }

  setTint(color: number | null): void {
    this.tintColor = color;
    if (this.flashTimer <= 0) this.applyTint();
  }

  private applyTint(): void {
    for (const o of [this.body, this.weapon, this.off, this.fist]) {
      if (!o) continue;
      if (this.tintColor === null) o.clearTint();
      else o.setTint(this.tintColor);
    }
  }

  setPosition(x: number, y: number, depth: number): void {
    // alinhado a pixels reais da tela: o personagem não "vibra" contra o cenário
    this.root.setPosition(snapPx(x), snapPx(y));
    this.root.setDepth(depth);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    if (this.fist) this.scene.tweens.killTweensOf(this.fist);
    if (this.weapon) this.scene.tweens.killTweensOf(this.weapon);
    this.root.destroy(true);
  }
}
