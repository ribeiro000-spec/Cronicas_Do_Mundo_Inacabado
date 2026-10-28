/* Grade de colisão do mundo inteiro, preenchida conforme os chunks carregam.
 * Tiles de chunks ainda não carregados contam como sólidos, então nada atravessa
 * para fora da área conhecida. */
export class CollisionGrid {
  /** 0 = desconhecido, 1 = livre, 2 = sólido (água etc.) */
  private ground: Uint8Array;
  /** quantos objetos sólidos ocupam o tile */
  private objs: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.ground = new Uint8Array(w * h);
    this.objs = new Uint8Array(w * h);
  }

  setGround(tx: number, ty: number, solid: boolean): void {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.ground[ty * this.w + tx] = solid ? 2 : 1;
  }

  clearGround(tx: number, ty: number): void {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.ground[ty * this.w + tx] = 0;
  }

  addObject(tx: number, ty: number, w: number, h: number, delta: 1 | -1): void {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const i = y * this.w + x;
        this.objs[i] = Math.max(0, this.objs[i] + delta);
      }
    }
  }

  hasObject(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.objs[ty * this.w + tx] > 0;
  }

  known(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.ground[ty * this.w + tx] !== 0;
  }

  solid(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    const i = ty * this.w + tx;
    return this.ground[i] !== 1 || this.objs[i] > 0;
  }

  /** Um círculo de raio r em (x, y) encosta em algo sólido? */
  blocked(x: number, y: number, r: number): boolean {
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r);
    const y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.solid(tx, ty)) continue;
        // distância do centro ao retângulo do tile
        const cx = Math.max(tx, Math.min(x, tx + 1));
        const cy = Math.max(ty, Math.min(y, ty + 1));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  /** Linha de visão grosseira (amostragem), usada por IA e mira. */
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / 0.35);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
      if (this.ground[ty * this.w + tx] !== 1) {
        // água não bloqueia a visão, só o desconhecido
        if (this.ground[ty * this.w + tx] === 0) return false;
        continue;
      }
      if (this.objs[ty * this.w + tx] > 0 && !(tx === Math.floor(x1) && ty === Math.floor(y1))) {
        // objetos baixos não bloqueiam a visão de longe; árvores e casas bloqueiam projéteis via colisão
        if (d > 3) return false;
      }
    }
    return true;
  }

  /** Procura o tile livre mais próximo (para teleportes e invocações). */
  nearestFree(x: number, y: number, r = 0.3, maxRadius = 6): { x: number; y: number } | null {
    if (!this.blocked(x, y, r)) return { x, y };
    for (let rad = 0.5; rad <= maxRadius; rad += 0.5) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / (4 + rad * 4)) {
        const nx = x + Math.cos(a) * rad;
        const ny = y + Math.sin(a) * rad;
        if (!this.blocked(nx, ny, r)) return { x: nx, y: ny };
      }
    }
    return null;
  }
}
