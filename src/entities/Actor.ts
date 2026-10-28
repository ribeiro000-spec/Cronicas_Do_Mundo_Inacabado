import { depthOf, toScreen, worldDirToScreen } from '../core/iso';
import type { CharacterView } from '../render/CharacterView';
import type { CollisionGrid } from '../world/CollisionGrid';

export type Team = 'player' | 'enemy' | 'ally';

let nextId = 1;

/* Base de tudo que se move e luta: posição no mundo (tiles), colisão deslizante,
 * estados (raiz, atordoado, lento, queimando) e empurrão. */
export abstract class Actor {
  readonly uid = nextId++;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  radius = 0.3;
  hp = 1;
  maxHp = 1;
  armor = 0;
  dead = false;
  /** direção para onde olha (mundo, normalizada) */
  fx = 1;
  fy = 0;
  // estados
  rootT = 0;
  stunT = 0;
  slowT = 0;
  slowF = 1;
  burnT = 0;
  burnDps = 0;
  invulnT = 0;
  knockX = 0;
  knockY = 0;
  abstract team: Team;
  abstract view: CharacterView;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get speedFactor(): number {
    if (this.stunT > 0 || this.rootT > 0) return 0;
    return this.slowT > 0 ? this.slowF : 1;
  }

  tickStatus(dt: number): number {
    if (this.rootT > 0) this.rootT -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    let burn = 0;
    if (this.burnT > 0) {
      this.burnT -= dt;
      burn = this.burnDps * dt;
    }
    return burn;
  }

  /** Move com colisão, deslizando nas paredes eixo a eixo. Devolve se conseguiu andar. */
  move(grid: CollisionGrid, dx: number, dy: number): boolean {
    let moved = false;
    // empurrão acumulado
    if (Math.abs(this.knockX) + Math.abs(this.knockY) > 0.001) {
      dx += this.knockX;
      dy += this.knockY;
      this.knockX *= 0.6;
      this.knockY *= 0.6;
      if (Math.abs(this.knockX) + Math.abs(this.knockY) < 0.01) this.knockX = this.knockY = 0;
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.2));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0 && !grid.blocked(this.x + sx, this.y, this.radius)) {
        this.x += sx;
        moved = true;
      }
      if (sy !== 0 && !grid.blocked(this.x, this.y + sy, this.radius)) {
        this.y += sy;
        moved = true;
      }
    }
    return moved;
  }

  faceTo(tx: number, ty: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    this.fx = dx / d;
    this.fy = dy / d;
    const s = worldDirToScreen(this.fx, this.fy);
    this.view.face(s.x, s.y);
  }

  faceDir(dx: number, dy: number): void {
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    this.fx = dx / d;
    this.fy = dy / d;
    const s = worldDirToScreen(this.fx, this.fy);
    this.view.face(s.x, s.y);
  }

  distTo(o: { x: number; y: number }): number {
    return Math.hypot(o.x - this.x, o.y - this.y);
  }

  syncView(): void {
    const s = toScreen(this.x, this.y);
    this.view.setPosition(s.x, s.y, depthOf(this.x, this.y));
  }

  knock(fromX: number, fromY: number, force: number): void {
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.knockX += (dx / d) * force;
    this.knockY += (dy / d) * force;
  }
}
