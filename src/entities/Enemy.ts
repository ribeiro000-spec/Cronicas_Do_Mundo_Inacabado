import * as Phaser from 'phaser';
import { bus } from '../core/events';
import { depthOf, toScreen } from '../core/iso';
import { rand } from '../core/util';
import { ENEMIES, type EnemyDef } from '../data/enemies';
import { game } from '../game';
import { CharacterView } from '../render/CharacterView';
import { sfx } from '../systems/sfx';
import { Actor, type Team } from './Actor';
import type { WorldCtx } from './ctx';

type AiState = 'idle' | 'chase' | 'windup' | 'recover' | 'charging' | 'flee' | 'return' | 'special';

/* Inimigos com máquina de estados legível: ocioso → persegue → prepara (brilha) → ataca → recupera.
 * A preparação visível é a “janela” que o jogador lê para esquivar. */
export class Enemy extends Actor {
  team: Team;
  view: CharacterView;
  def: EnemyDef;
  level: number;
  dmg: number;
  homeX: number;
  homeY: number;
  state: AiState = 'idle';
  stateT = 0;
  atkCd = 0;
  wanderX: number;
  wanderY: number;
  wanderT = 0;
  target: Actor | null = null;
  groupId?: string;
  tag?: string;
  life?: number;
  fled = false;
  chargeDx = 0;
  chargeDy = 0;
  chargeHit = false;
  detour = 0;
  detourT = 0;
  burnAcc = 0;
  lastHitAt = -99;
  speedMul = 1;
  cdMul = 1;
  /** acumulador para atualização reduzida quando longe do jogador */
  lodAcc = 0;
  boss: BossBrain | null = null;
  /** chefe adormecido (estátua) até a missão começar */
  dormant = false;
  elite = false;
  private aura: Phaser.GameObjects.Image | null = null;
  private bar: Phaser.GameObjects.Container;
  private barFill: Phaser.GameObjects.Rectangle;
  private barShownT = 0;
  private telegraphImg: Phaser.GameObjects.Image | null = null;

  constructor(
    ctx: WorldCtx,
    defId: string,
    x: number,
    y: number,
    level: number,
    opts: { team?: 'enemy' | 'ally'; tag?: string; groupId?: string; life?: number; elite?: boolean; dormant?: boolean } = {},
  ) {
    super(x, y);
    const def = ENEMIES[defId];
    this.elite = !!opts.elite && !def.boss;
    this.dormant = !!opts.dormant;
    this.def = def;
    this.level = level;
    this.team = opts.team ?? 'enemy';
    this.tag = opts.tag;
    this.groupId = opts.groupId;
    this.life = opts.life;
    this.radius = def.radius;
    this.maxHp = Math.round(def.hp + def.hpLv * (level - 1));
    this.hp = this.maxHp;
    this.dmg = def.dmg + def.dmgLv * (level - 1);
    this.armor = def.armor + (level - 1) * 0.5;
    if (this.elite) {
      this.maxHp = Math.round(this.maxHp * 2.2);
      this.hp = this.maxHp;
      this.dmg *= 1.4;
      this.armor += 3;
    }
    this.homeX = x;
    this.homeY = y;
    this.wanderX = x;
    this.wanderY = y;
    const scale = (def.scale ?? 1) * (this.elite ? 1.15 : 1);
    this.view =
      def.kind === 'humanoid'
        ? new CharacterView(ctx.stage, { look: def.look, scale })
        : new CharacterView(ctx.stage, { creature: def.kind, color: def.color, scale, spirit: def.spirit });
    this.view.setTint(this.baseTint());
    this.view.root.setAlpha(0);
    ctx.stage.tweens.add({ targets: this.view.root, alpha: 1, duration: 300 });
    if (this.elite || def.spirit) {
      this.aura = ctx.stage.add.image(0, 0, 'fx', 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(this.elite ? 0xffb030 : 0x7cd8ff).setAlpha(0.4);
      this.aura.setScale(0.5 * scale, 0.22 * scale);
    }

    const bw = def.boss ? 0 : 20;
    const bg = ctx.stage.add.rectangle(0, 0, bw + 2, 4, 0x1b1a24).setOrigin(0.5, 0.5);
    this.barFill = ctx.stage.add.rectangle(-bw / 2, 0, bw, 2, this.team === 'ally' ? 0x7cf0ff : this.elite ? 0xffa030 : 0xd8333b).setOrigin(0, 0.5);
    const items: Phaser.GameObjects.GameObject[] = [bg, this.barFill];
    if (this.team === 'enemy' && !def.boss) {
      const lv = ctx.stage.add
        .text(-bw / 2 - 2, 0, String(level), { fontFamily: 'system-ui, sans-serif', fontSize: '6px', fontStyle: 'bold', color: this.elite ? '#ffc060' : '#f4e9c8', stroke: '#1b1a24', strokeThickness: 2, resolution: 8 })
        .setOrigin(1, 0.5);
      items.push(lv);
    }
    this.bar = ctx.stage.add.container(0, 0, items).setVisible(false);
    if (def.boss) this.boss = new BossBrain();
    this.faceDir(rand(-1, 1), rand(-1, 1));
    this.syncView();
  }

  get isBoss(): boolean {
    return !!this.def.boss;
  }

  get speed(): number {
    return this.def.speed * this.speedMul * this.speedFactor;
  }

  showBar(): void {
    if (this.isBoss) return;
    this.barShownT = 4;
  }

  syncView(): void {
    super.syncView();
    const s = toScreen(this.x, this.y);
    const k = this.def.kind;
    const h = (k === 'humanoid' ? 36 : k === 'slime' ? 22 : k === 'totem' ? 32 : 26) * (this.def.scale ?? 1) * (this.elite ? 1.15 : 1);
    this.bar.setPosition(s.x, s.y - h);
    this.bar.setDepth(depthOf(this.x, this.y) + 5000);
    this.barFill.width = 20 * Math.max(0, this.hp / this.maxHp);
    if (this.aura) this.aura.setPosition(s.x, s.y).setDepth(depthOf(this.x, this.y) - 2);
    this.bar.setVisible(this.barShownT > 0 && !this.dead);
  }

  setTelegraph(on: boolean): void {
    this.view.setTint(on ? 0xff9a6a : this.baseTint());
  }

  baseTint(): number | null {
    if (this.dormant) return 0x9a98a8;
    if (this.boss && this.boss.phase >= 3) return 0xff9090;
    if (this.tag === 'eco') return 0xc8a8ff;
    if (this.elite) return 0xffe0b0;
    return null;
  }

  private pickTarget(ctx: WorldCtx): Actor | null {
    if (this.team === 'ally') {
      let best: Actor | null = null;
      let bd = 7;
      for (const e of ctx.enemies) {
        if (e.dead || e.team !== 'enemy' || e.dormant) continue;
        const d = e.distTo(ctx.player);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best;
    }
    let best: Actor | null = ctx.player.dead || game.dead ? null : ctx.player;
    let bd = best ? this.distTo(best) : Infinity;
    for (const e of ctx.enemies) {
      if (e.dead || e.team !== 'ally') continue;
      const d = this.distTo(e);
      if (d < bd - 0.5) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Persegue / foge com desvio simples de obstáculos. */
  steer(ctx: WorldCtx, tx: number, ty: number, speed: number, dt: number, away = false): void {
    let dx = tx - this.x;
    let dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return;
    dx /= d;
    dy /= d;
    if (away) {
      dx = -dx;
      dy = -dy;
    }
    if (this.def.stationary) {
      this.faceDir(dx, dy);
      return;
    }
    const step = speed * dt;
    if (this.detourT > 0) {
      this.detourT -= dt;
      const a = this.detour;
      const c = Math.cos(a);
      const s = Math.sin(a);
      if (this.move(ctx.grid, (dx * c - dy * s) * step, (dx * s + dy * c) * step)) {
        this.faceDir(dx, dy);
        return;
      }
    }
    const bx = this.x;
    const by = this.y;
    this.move(ctx.grid, dx * step, dy * step);
    if (Math.hypot(this.x - bx, this.y - by) < step * 0.3) {
      for (const a of [0.8, -0.8, 1.6, -1.6]) {
        const c = Math.cos(a);
        const s = Math.sin(a);
        if (this.move(ctx.grid, (dx * c - dy * s) * step, (dx * s + dy * c) * step)) {
          this.detour = a;
          this.detourT = 0.5;
          break;
        }
      }
    }
    this.faceDir(dx, dy);
  }

  engage(ctx: WorldCtx, target: Actor): void {
    if (this.state === 'chase' || this.state === 'windup' || this.state === 'recover' || this.state === 'charging') return;
    this.target = target;
    this.state = 'chase';
    if (this.boss) this.boss.onEngage(this, ctx);
    // alerta o grupo
    if (this.groupId) {
      for (const e of ctx.enemies) {
        if (e !== this && e.groupId === this.groupId && !e.dead && e.state === 'idle') {
          e.target = target;
          e.state = 'chase';
        }
      }
    }
  }

  update(ctx: WorldCtx, dt: number): void {
    if (this.dead) return;
    this.view.update(dt);
    if (this.dormant) {
      this.view.setMoving(false, dt);
      this.syncView();
      return;
    }
    if (this.barShownT > 0) this.barShownT -= dt;
    const burn = this.tickStatus(dt);
    if (burn > 0) {
      this.burnAcc += burn;
      if (this.burnAcc >= 3) {
        const n = Math.floor(this.burnAcc);
        this.burnAcc -= n;
        ctx.hitActor(this, n, { kind: 'fire', source: ctx.player });
        if (this.dead) return;
      }
    }
    if (this.life !== undefined) {
      this.life -= dt;
      if (this.life <= 0) {
        this.hp = 0;
        ctx.hitActor(this, 1, { silent: true });
        return;
      }
    }
    this.atkCd -= dt;
    this.stateT -= dt;
    const moving0x = this.x;
    const moving0y = this.y;

    if (this.stunT > 0) {
      if (this.state === 'windup') {
        this.state = 'chase';
        this.setTelegraph(false);
        this.clearTelegraph();
      }
      this.move(ctx.grid, 0, 0);
      this.view.setMoving(false, dt);
      this.syncView();
      return;
    }

    if (this.boss && this.boss.update(this, ctx, dt)) {
      this.view.setMoving(Math.hypot(this.x - moving0x, this.y - moving0y) > 0.001, dt);
      this.syncView();
      return;
    }

    const target = this.state === 'return' ? null : this.pickTarget(ctx);
    if (target) this.target = target;
    const a = this.def.attack;

    switch (this.state) {
      case 'idle': {
        if (this.team === 'ally') {
          const p = ctx.player;
          if (target) this.engage(ctx, target);
          else if (this.distTo(p) > 2.2) this.steer(ctx, p.x, p.y, this.speed, dt);
          break;
        }
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = rand(2, 5);
          this.wanderX = this.homeX + rand(-2.5, 2.5);
          this.wanderY = this.homeY + rand(-2.5, 2.5);
        }
        if (Math.hypot(this.wanderX - this.x, this.wanderY - this.y) > 0.3) this.steer(ctx, this.wanderX, this.wanderY, this.speed * 0.35, dt);
        if (target) {
          const d = this.distTo(target);
          if (d < this.def.aggro && ctx.grid.lineOfSight(this.x, this.y, target.x, target.y)) this.engage(ctx, target);
        }
        break;
      }
      case 'chase': {
        if (!target) {
          this.state = this.team === 'ally' ? 'idle' : 'return';
          break;
        }
        if (this.team === 'enemy' && Math.hypot(this.x - this.homeX, this.y - this.homeY) > this.def.leash) {
          this.state = 'return';
          break;
        }
        if (this.team === 'ally' && this.distTo(ctx.player) > 9) {
          this.state = 'idle';
          break;
        }
        if (this.def.flee && !this.fled && this.hp / this.maxHp < this.def.flee) {
          this.fled = true;
          this.state = 'flee';
          this.stateT = 2.5;
          break;
        }
        const d = this.distTo(target);
        if (a.type === 'melee') {
          if (d <= a.range + target.radius * 0.5) {
            this.faceTo(target.x, target.y);
            if (this.atkCd <= 0) this.beginWindup(ctx, a.windup);
          } else this.steer(ctx, target.x, target.y, this.speed, dt);
        } else if (a.type === 'ranged') {
          const keep = a.keepAway ?? 3;
          const los = ctx.grid.lineOfSight(this.x, this.y, target.x, target.y);
          if (d < keep) this.steer(ctx, target.x, target.y, this.speed * 0.85, dt, true);
          else if (d > a.range * 0.9 || !los) this.steer(ctx, target.x, target.y, this.speed, dt);
          else this.faceTo(target.x, target.y);
          if (d <= a.range && los && this.atkCd <= 0 && d >= keep * 0.6) this.beginWindup(ctx, a.windup);
        } else {
          // investida (javali)
          if (d <= 1.1 && this.atkCd <= 0) {
            this.faceTo(target.x, target.y);
            this.beginWindup(ctx, 0.35);
            this.chargeDx = 0;
          } else if (d <= a.range && d > 1.4 && this.atkCd <= 0 && ctx.grid.lineOfSight(this.x, this.y, target.x, target.y)) {
            this.faceTo(target.x, target.y);
            this.chargeDx = (target.x - this.x) / d;
            this.chargeDy = (target.y - this.y) / d;
            this.beginWindup(ctx, a.windup);
          } else if (d > 1.0) this.steer(ctx, target.x, target.y, this.speed, dt);
        }
        break;
      }
      case 'windup': {
        if (target && a.type !== 'charge') this.faceTo(target.x, target.y);
        const pulse = Math.floor(this.stateT * 12) % 2 === 0;
        this.view.setTint(pulse ? 0xffb07a : 0xff6a4a);
        if (this.stateT <= 0) {
          this.setTelegraph(false);
          this.clearTelegraph();
          this.performAttack(ctx, target);
        }
        break;
      }
      case 'charging': {
        const sp = 9 * dt;
        const moved = this.move(ctx.grid, this.chargeDx * sp, this.chargeDy * sp);
        this.faceDir(this.chargeDx, this.chargeDy);
        if (target && !this.chargeHit && this.distTo(target) < this.radius + target.radius + 0.3) {
          this.chargeHit = true;
          ctx.hitActor(target, this.dmg * 1.3, { source: this, knock: 0.5 });
        }
        if (!moved) {
          this.stunT = 0.6;
          ctx.fx.burst(this.x, this.y, 0xd0c0a0, 6, 'dot', 12, 4);
          this.stateT = 0;
        }
        if (this.stateT <= 0) {
          this.state = 'recover';
          this.stateT = 0.5;
        }
        break;
      }
      case 'recover': {
        if (target && a.type === 'ranged' && this.distTo(target) < (a.keepAway ?? 3)) this.steer(ctx, target.x, target.y, this.speed * 0.7, dt, true);
        if (this.stateT <= 0) this.state = 'chase';
        break;
      }
      case 'flee': {
        if (target) this.steer(ctx, target.x, target.y, this.speed * 1.1, dt, true);
        if (this.stateT <= 0) this.state = 'chase';
        break;
      }
      case 'return': {
        this.steer(ctx, this.homeX, this.homeY, this.speed * 1.3, dt);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
        if (Math.hypot(this.x - this.homeX, this.y - this.homeY) < 0.6) {
          this.state = 'idle';
          this.hp = this.maxHp;
          this.fled = false;
          this.target = null;
          if (this.boss) this.boss.reset(this);
        }
        break;
      }
      case 'special':
        break;
    }
    this.view.setMoving(Math.hypot(this.x - moving0x, this.y - moving0y) > 0.001, dt);
    this.syncView();
  }

  beginWindup(ctx: WorldCtx, t: number): void {
    this.state = 'windup';
    this.stateT = t;
    if (this.def.attack.type === 'charge' && this.chargeDx !== 0) {
      this.telegraphImg = ctx.fx.telegraph(this.x + this.chargeDx * 2, this.y + this.chargeDy * 2, 1.2, 0xff6a4a, t);
    }
  }

  clearTelegraph(): void {
    this.telegraphImg?.destroy();
    this.telegraphImg = null;
  }

  performAttack(ctx: WorldCtx, target: Actor | null): void {
    const a = this.def.attack;
    this.atkCd = a.cooldown * this.cdMul * rand(0.9, 1.15);
    this.state = 'recover';
    this.stateT = 0.3;
    if (!target) return;
    if (a.type === 'melee' || (a.type === 'charge' && this.chargeDx === 0)) {
      const st1 = toScreen(this.x, this.y);
      const st2 = toScreen(target.x, target.y);
      this.view.swing(this.isBoss && Math.random() < 0.4 ? 'heavy' : Math.random() < 0.5 ? 'melee' : 'reverse', this.isBoss ? 0.32 : 0.2);
      this.view.lunge(st2.x - st1.x, st2.y - st1.y, this.isBoss ? 8 : 6);
      const d = this.distTo(target);
      if (d <= a.range + target.radius + 0.35) {
        ctx.hitActor(target, this.dmg, { source: this, knock: this.isBoss ? 0.45 : 0.22 });
      } else {
        sfx.play('swing');
      }
      this.boss?.onMelee(this, ctx);
      const s1 = toScreen(this.x, this.y);
      const s2 = toScreen(target.x, target.y);
      if (this.def.kind === 'humanoid') ctx.fx.slash((this.x + target.x) / 2, (this.y + target.y) / 2, Math.atan2(s2.y - s1.y, s2.x - s1.x), 0.8 * (this.def.scale ?? 1), this.team === 'ally' ? 0xa8f0ff : 0xff9a8a, this.isBoss ? 'heavy' : 'slash', Math.random() < 0.5);
      else {
        // mordida/garras
        const mid = toScreen((this.x + target.x) / 2, (this.y + target.y) / 2);
        const claw = ctx.stage.add.image(mid.x, mid.y - 10, 'fx', 'claw').setScale(0.25 * (this.def.scale ?? 1)).setDepth(depthOf(target.x, target.y) + 50).setTint(this.team === 'ally' ? 0xa8f0ff : 0xffd0c0).setAlpha(0.9);
        ctx.stage.tweens.add({ targets: claw, alpha: 0, scale: 0.33 * (this.def.scale ?? 1), duration: 220, onComplete: () => claw.destroy() });
      }
    } else if (a.type === 'ranged') {
      this.view.swing('ranged', 0.2);
      const lead = 0.25;
      const tx = target.x + target.vx * lead;
      const ty = target.y + target.vy * lead;
      const d = Math.hypot(tx - this.x, ty - this.y) || 1;
      const kind = a.projectile ?? 'arrow';
      ctx.spawnProjectile({
        x: this.x,
        y: this.y,
        dx: (tx - this.x) / d,
        dy: (ty - this.y) / d,
        speed: kind === 'web' ? 7 : 10,
        range: a.range + 2,
        dmg: this.dmg,
        team: this.team === 'ally' ? 'player' : 'enemy',
        frame: kind === 'web' ? 'web' : kind === 'orb' ? (this.team === 'ally' ? 'orb' : 'orb_red') : 'arrow',
        tint: this.def.spirit ? 0x9ad0ff : undefined,
        onHit: kind === 'web' ? { slow: { t: 2, f: 0.5 } } : undefined,
        source: this,
      });
      sfx.play(kind === 'arrow' ? 'arrow' : 'magic');
    } else {
      this.state = 'charging';
      this.stateT = 0.5;
      this.chargeHit = false;
    }
  }

  destroyView(scene: Phaser.Scene): void {
    this.clearTelegraph();
    this.bar.destroy();
    this.aura?.destroy();
    this.view.setTint(0xffffff);
    this.view.squash(0.3);
    scene.tweens.add({
      targets: this.view.root,
      alpha: 0,
      y: this.view.root.y - 6,
      delay: 80,
      duration: 420,
      onComplete: () => this.view.destroy(),
    });
  }

  destroyNow(): void {
    this.clearTelegraph();
    this.bar.destroy();
    this.aura?.destroy();
    this.view.destroy();
  }
}

/* ======================================================================== chefe */

/** Cavaleiro Sem Brasão: três fases com padrões legíveis e janelas de vulnerabilidade. */
export class BossBrain {
  phase = 1;
  engaged = false;
  meleeCount = 0;
  specialT = 5;
  summoned = false;
  busy: 'slam' | 'charge' | 'rain' | null = null;
  busyT = 0;
  private barT = 0;
  private marks: { x: number; y: number }[] = [];

  reset(e: Enemy): void {
    this.phase = 1;
    this.engaged = false;
    this.meleeCount = 0;
    this.summoned = false;
    this.busy = null;
    e.speedMul = 1;
    e.cdMul = 1;
    e.view.setTint(null);
    bus.emit('boss:update', null);
  }

  /** A fala de abertura agora fica na cena de apresentação do chefe (WorldScene). */
  onEngage(e: Enemy, ctx: WorldCtx): void {
    if (this.engaged) return;
    this.engaged = true;
    sfx.play('boss');
    ctx.fx.shake(0.006, 400);
    if (game.hasItem('brasao_partido') && !game.state.flags.brasao_usado) {
      game.state.flags.brasao_usado = true;
      e.hp = Math.round(e.maxHp * 0.7);
      ctx.fx.label(e.x, e.y - 1, 'O cavaleiro hesita ao ver o brasão partido…', '#e0c070');
      game.toast('O Brasão Partido abalou o cavaleiro: ele começa enfraquecido.', 'good');
      game.unlockCodex('cavaleiro');
    }
    this.emitBar(e);
  }

  emitBar(e: Enemy): void {
    bus.emit('boss:update', { name: e.def.name, hp: Math.max(0, Math.round(e.hp)), maxHp: e.maxHp, level: 6, phase: this.phase });
  }

  /** Devolve true quando um ataque especial está controlando o chefe neste frame. */
  update(e: Enemy, ctx: WorldCtx, dt: number): boolean {
    if (!this.engaged) return false;
    this.barT -= dt;
    if (this.barT <= 0) {
      this.barT = 0.15;
      this.emitBar(e);
    }
    const frac = e.hp / e.maxHp;
    if (this.phase === 1 && frac < 0.66) this.enterPhase(e, ctx, 2);
    if (this.phase === 2 && frac < 0.33) this.enterPhase(e, ctx, 3);

    const target = ctx.player;
    if (this.busy) {
      this.busyT -= dt;
      if (this.busy === 'charge' && this.busyT < 0.5 && this.busyT > 0) {
        e.move(ctx.grid, e.chargeDx * 10 * dt, e.chargeDy * 10 * dt);
        if (!e.chargeHit && e.distTo(target) < 1.1) {
          e.chargeHit = true;
          ctx.hitActor(target, e.dmg * 1.4, { source: e, knock: 0.7 });
        }
      }
      if (this.busyT <= 0) this.resolve(e, ctx);
      return true;
    }
    if (e.state === 'return' || e.state === 'idle') return false;

    this.specialT -= dt;
    const d = e.distTo(target);
    if (this.specialT <= 0 && !game.dead) {
      if (this.phase >= 3 && Math.random() < 0.55) this.start(e, ctx, 'rain');
      else if (this.phase >= 2 && d > 2.5) this.start(e, ctx, 'charge');
      else if (d < 3) this.start(e, ctx, 'slam');
      this.specialT = this.phase === 1 ? 7 : this.phase === 2 ? 5.5 : 4.5;
      if (this.busy) return true;
    }
    return false;
  }

  /** Conta golpes: a cada três, o próximo vira um golpe no chão. */
  onMelee(e: Enemy, ctx: WorldCtx): void {
    this.meleeCount++;
    if (this.meleeCount % 3 === 0) this.start(e, ctx, 'slam');
  }

  private start(e: Enemy, ctx: WorldCtx, kind: 'slam' | 'charge' | 'rain'): void {
    this.busy = kind;
    e.state = 'special';
    if (kind === 'slam') {
      this.busyT = 0.95;
      ctx.fx.telegraph(e.x, e.y, 2.7, 0xff3a3a, 0.95);
      e.view.setTint(0xff6a4a);
    } else if (kind === 'charge') {
      const t = ctx.player;
      const d = e.distTo(t) || 1;
      e.chargeDx = (t.x - e.x) / d;
      e.chargeDy = (t.y - e.y) / d;
      e.chargeHit = false;
      e.faceDir(e.chargeDx, e.chargeDy);
      this.busyT = 1.2;
      for (let k = 1; k <= 4; k++) ctx.fx.telegraph(e.x + e.chargeDx * k * 1.2, e.y + e.chargeDy * k * 1.2, 0.8, 0xff6a4a, 0.7);
      e.view.setTint(0xffb07a);
    } else {
      this.busyT = 1.15;
      const p = ctx.player;
      this.marks = [{ x: p.x, y: p.y }];
      for (let k = 0; k < 3; k++) this.marks.push({ x: p.x + rand(-2.5, 2.5), y: p.y + rand(-2.5, 2.5) });
      for (const m of this.marks) ctx.fx.telegraph(m.x, m.y, 1.35, 0xff2a5a, 1.15, 'rune');
      ctx.fx.label(e.x, e.y, '“Lembrem… do que esqueceram!”', '#ff9ab0');
    }
  }

  private resolve(e: Enemy, ctx: WorldCtx): void {
    const kind = this.busy;
    this.busy = null;
    e.state = 'recover';
    e.stateT = this.phase >= 3 ? 0.5 : 0.8; // janela de vulnerabilidade depois do especial
    e.view.setTint(e.baseTint());
    const p = ctx.player;
    if (kind === 'slam') {
      e.view.swing('spin', 0.3);
      ctx.fx.explosion(e.x, e.y, 2.7, 0xff5a3a);
      ctx.fx.shake(0.01, 200);
      sfx.play('explosion');
      if (e.distTo(p) < 2.7 + p.radius) ctx.hitActor(p, e.dmg * 1.5, { source: e, knock: 0.8 });
    } else if (kind === 'rain') {
      sfx.play('explosion');
      for (const m of this.marks) {
        ctx.fx.explosion(m.x, m.y, 1.35, 0xff3a7a);
        if (Math.hypot(p.x - m.x, p.y - m.y) < 1.35 + p.radius) ctx.hitActor(p, e.dmg * 1.2, { source: e, knock: 0.4 });
      }
      ctx.fx.shake(0.008, 180);
    }
  }

  private enterPhase(e: Enemy, ctx: WorldCtx, phase: number): void {
    this.phase = phase;
    e.view.flash();
    ctx.fx.shake(0.01, 300);
    sfx.play('boss');
    if (phase === 2) {
      e.cdMul = 0.8;
      e.speedMul = 1.15;
      ctx.fx.label(e.x, e.y, '“O juramento… ainda vale!”', '#ffb0a0');
      game.toast('Fase 2 — Agressividade: mais velocidade e investidas.', 'warn');
      if (!this.summoned) {
        this.summoned = true;
        for (const [dx, dy] of [[2, 1], [-2, -1]]) ctx.spawnEnemy('esqueleto', e.x + dx, e.y + dy, 5, { tag: 'eco' });
      }
    } else {
      e.cdMul = 0.65;
      e.speedMul = 1.35;
      e.view.setTint(0xff9090);
      ctx.fx.explosion(e.x, e.y, 2, 0xb04aff);
      ctx.fx.label(e.x, e.y, '“FORMA FINAL”', '#ff7070');
      game.toast('Fase 3 — Forma Final: fuja dos círculos vermelhos!', 'warn');
    }
    this.emitBar(e);
  }
}
