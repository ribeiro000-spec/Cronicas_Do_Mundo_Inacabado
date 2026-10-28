/* Pequena biblioteca de desenho em pixels. Toda a arte do protótipo é gerada com ela,
 * no próprio navegador, em resolução nativa (1 pixel de arte = 1 pixel do buffer).
 * Depois o Phaser amplia com zoom inteiro e filtro "pixelado". */

const colorCache = new Map<string, number>();

/** '#rrggbb' → inteiro ABGR (ordem de bytes do ImageData em little-endian). */
export function C(hex: string, alpha = 255): number {
  const key = hex + alpha;
  const hit = colorCache.get(key);
  if (hit !== undefined) return hit;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const v = ((alpha & 255) << 24) | (b << 16) | (g << 8) | r;
  colorCache.set(key, v >>> 0);
  return v >>> 0;
}

export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Clareia (f>0) ou escurece (f<0) com leve desvio de matiz, como em paletas de pixel art. */
export function shade(hex: string, f: number): string {
  const [r, g, b] = rgb(hex);
  if (f >= 0) return toHex(r + (255 - r) * f, g + (255 - g) * f, b + (235 - b) * f * 0.9);
  const k = 1 + f;
  return toHex(r * k * 0.95, g * k * 0.97, b * k + 8 * -f);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Ruído determinístico 0..1 por coordenada inteira. */
export function hash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type ColorArg = number | ((x: number, y: number) => number | null);

export class PB {
  readonly data: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint32Array(w * h);
  }

  set(x: number, y: number, c: number): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }

  alpha(x: number, y: number): number {
    return this.get(x, y) >>> 24;
  }

  private paint(x: number, y: number, c: ColorArg): void {
    const v = typeof c === 'number' ? c : c(x, y);
    if (v !== null) this.set(x, y, v);
  }

  rect(x: number, y: number, w: number, h: number, c: ColorArg): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.paint(xx, yy, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 |= 0;
    y0 |= 0;
    x1 |= 0;
    y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Elipse preenchida (centro e raios em pixels, aceita meio pixel). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: ColorArg): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.paint(x, y, c);
      }
    }
  }

  /** Losango isométrico centrado (meia-largura hw, meia-altura hh). */
  diamond(cx: number, cy: number, hw: number, hh: number, c: ColorArg): void {
    for (let y = Math.floor(cy - hh); y < Math.ceil(cy + hh); y++) {
      for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) {
        if (Math.abs(x + 0.5 - cx) / hw + Math.abs(y + 0.5 - cy) / hh < 1) this.paint(x, y, c);
      }
    }
  }

  /** Polígono convexo ou côncavo (regra par-ímpar), amostrando o centro do pixel. */
  poly(pts: [number, number][], c: ColorArg): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if (y0 === y1) continue;
        if ((sy >= Math.min(y0, y1)) && (sy < Math.max(y0, y1))) xs.push(x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x < Math.ceil(xs[k + 1] - 0.5); x++) this.paint(x, y, c);
      }
    }
  }

  /** Contorno escuro em volta das áreas opacas — o “traço” típico de pixel art. */
  outline(c: number, diagonal = false): void {
    const src = this.data.slice();
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[y * this.w + x] >>> 24);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (at(x, y) > 0) continue;
        let n = at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1);
        if (!n && diagonal) n = at(x + 1, y + 1) || at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1);
        if (n) this.data[y * this.w + x] = c;
      }
    }
  }

  /** Copia outro buffer por cima (pixels transparentes não sobrescrevem). */
  blit(src: PB, ox: number, oy: number, flipX = false): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const v = src.data[y * src.w + (flipX ? src.w - 1 - x : x)];
        if (v >>> 24) this.set(ox + x, oy + y, v);
      }
    }
  }

  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.data);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

/** Empacotador simples em prateleiras: junta vários buffers numa única textura (atlas). */
export class AtlasBuilder {
  private items: { name: string; pb: PB; x: number; y: number }[] = [];
  private shelfX = 0;
  private shelfY = 0;
  private shelfH = 0;
  height = 0;

  constructor(readonly width = 1024) {}

  add(name: string, pb: PB): void {
    if (this.shelfX + pb.w + 1 > this.width) {
      this.shelfY += this.shelfH + 1;
      this.shelfX = 0;
      this.shelfH = 0;
    }
    this.items.push({ name, pb, x: this.shelfX, y: this.shelfY });
    this.shelfX += pb.w + 1;
    this.shelfH = Math.max(this.shelfH, pb.h);
    this.height = this.shelfY + this.shelfH;
  }

  build(): { canvas: HTMLCanvasElement; frames: { name: string; x: number; y: number; w: number; h: number }[] } {
    const h = Math.max(1, 1 << Math.ceil(Math.log2(this.height + 1)));
    const big = new PB(this.width, h);
    for (const it of this.items) big.blit(it.pb, it.x, it.y);
    return { canvas: big.toCanvas(), frames: this.items.map((i) => ({ name: i.name, x: i.x, y: i.y, w: i.pb.w, h: i.pb.h })) };
  }
}
