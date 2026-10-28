import * as Phaser from 'phaser';
import { depthOf, toScreen, worldDirToScreen } from '../core/iso';
import type { Actor } from './Actor';
import type { ProjectileSpec, WorldCtx } from './ctx';

export class Projectile {
  x: number;
  y: number;
  dx: number;
  dy: number;
  traveled = 0;
  dead = false;
  hit = new Set<number>();
  sprite: Phaser.GameObjects.Image;
  private lobT = 0;
  private lobDur = 0;
  private sx0 = 0;
  private sy0 = 0;

  constructor(
    scene: Phaser.Scene,
    public spec: ProjectileSpec,
  ) {
    this.x = spec.x;
    this.y = spec.y;
    this.dx = spec.dx;
    this.dy = spec.dy;
    this.sprite = scene.add.image(0, 0, 'fx', spec.frame).setOrigin(0.5, 0.5);
    if (spec.tint !== undefined) this.sprite.setTint(spec.tint);
    if (spec.lob) {
      const d = Math.hypot(spec.lob.tx - spec.x, spec.lob.ty - spec.y);
      this.lobDur = Math.max(0.25, d / spec.speed);
      this.sx0 = spec.x;
      this.sy0 = spec.y;
    }
    this.place();
  }

  private place(height = 12): void {
    const s = toScreen(this.x, this.y);
    this.sprite.setPosition(s.x, s.y - height);
    this.sprite.setDepth(depthOf(this.x, this.y) + 4);
    if (!this.spec.lob) {
      const d = worldDirToScreen(this.dx, this.dy);
      this.sprite.setRotation(Math.atan2(d.y, d.x));
    }
  }

  update(ctx: WorldCtx, dt: number): void {
    if (this.dead) return;
    const sp = this.spec;
    if (sp.lob) {
      this.lobT += dt;
      const t = Math.min(1, this.lobT / this.lobDur);
      this.x = this.sx0 + (sp.lob.tx - this.sx0) * t;
      this.y = this.sy0 + (sp.lob.ty - this.sy0) * t;
      this.place(10 + Math.sin(t * Math.PI) * 26);
      this.sprite.rotation += dt * 10;
      if (t >= 1) this.explode(ctx);
      return;
    }
    // perseguição suave
    if (sp.homing && !sp.homing.dead) {
      const hx = sp.homing.x - this.x;
      const hy = sp.homing.y - this.y;
      const hd = Math.hypot(hx, hy) || 1;
      const k = Math.min(1, dt * 6);
      this.dx = this.dx * (1 - k) + (hx / hd) * k;
      this.dy = this.dy * (1 - k) + (hy / hd) * k;
      const n = Math.hypot(this.dx, this.dy) || 1;
      this.dx /= n;
      this.dy /= n;
    }
    const step = sp.speed * dt;
    const n = Math.max(1, Math.ceil(step / 0.25));
    for (let i = 0; i < n && !this.dead; i++) {
      this.x += (this.dx * step) / n;
      this.y += (this.dy * step) / n;
      this.traveled += step / n;
      // água não bloqueia projéteis; objetos sólidos e áreas desconhecidas, sim
      const tx = Math.floor(this.x);
      const ty = Math.floor(this.y);
      if (ctx.grid.hasObject(tx, ty) || !ctx.grid.known(tx, ty)) {
        this.kill(ctx, true);
        return;
      }
      for (const t of this.targets(ctx)) {
        if (t.dead || this.hit.has(t.uid)) continue;
        if (Math.hypot(t.x - this.x, t.y - this.y) < t.radius + 0.25) {
          this.hit.add(t.uid);
          ctx.hitActor(t, sp.dmg, { ...(sp.onHit ?? {}), crit: sp.crit, source: sp.source ?? null, knock: sp.onHit?.knock ?? 0.12 });
          if (!sp.pierce) {
            this.kill(ctx, true);
            return;
          }
        }
      }
    }
    if (this.traveled >= sp.range) this.kill(ctx, false);
    else this.place();
  }

  private targets(ctx: WorldCtx): Actor[] {
    if (this.spec.team === 'enemy') {
      const list: Actor[] = [ctx.player];
      for (const e of ctx.enemies) if (e.team === 'ally') list.push(e);
      return list;
    }
    return ctx.enemies.filter((e) => e.team === 'enemy');
  }

  private explode(ctx: WorldCtx): void {
    const lob = this.spec.lob!;
    ctx.fx.explosion(this.x, this.y, lob.radius);
    for (const e of this.targets(ctx)) {
      if (Math.hypot(e.x - this.x, e.y - this.y) < lob.radius + e.radius) {
        ctx.hitActor(e, this.spec.dmg, { kind: 'fire', burn: lob.burn, knock: 0.35, source: this.spec.source ?? null, crit: this.spec.crit });
      }
    }
    this.kill(ctx, false);
  }

  kill(ctx: WorldCtx, impact: boolean): void {
    if (this.dead) return;
    this.dead = true;
    if (impact) ctx.fx.burst(this.x, this.y, this.spec.tint ?? 0xffffff, 4, 'dot', 8, 12);
    this.sprite.destroy();
  }
}
