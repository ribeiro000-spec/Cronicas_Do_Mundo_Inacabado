import { C, PB, bayer, dither, hash, noise2 } from './paint';

/* Formas isométricas texturizadas reaproveitadas por objetos e construções. */

export type FaceFn = (x: number, y: number, s: number, t: number) => number | null;

/**
 * Prisma isométrico com o centro da base em (cx, cy).
 * hw/hh = meia-largura/meia-altura do losango da base, h = altura.
 * Cada face recebe coordenadas locais (s ao longo da face, t de baixo para cima / profundidade).
 */
export function isoPrism(pb: PB, cx: number, cy: number, hw: number, hh: number, h: number, top: FaceFn, left: FaceFn, right: FaceFn): void {
  const Lx = cx - hw;
  const Ly = cy;
  const Bx = cx;
  const By = cy + hh;
  const Rx = cx + hw;
  const Ry = cy;
  // face esquerda: L → B
  for (let x = Math.floor(Lx); x < Math.ceil(Bx); x++) {
    const s = (x + 0.5 - Lx) / (Bx - Lx);
    if (s < 0 || s > 1) continue;
    const yb = Ly + s * (By - Ly);
    for (let y = Math.floor(yb - h); y < Math.ceil(yb); y++) {
      const t = (yb - (y + 0.5)) / h;
      if (t < 0 || t > 1) continue;
      const c = left(x, y, s, t);
      if (c !== null) pb.set(x, y, c);
    }
  }
  // face direita: B → R
  for (let x = Math.floor(Bx); x < Math.ceil(Rx); x++) {
    const s = (x + 0.5 - Bx) / (Rx - Bx);
    if (s < 0 || s > 1) continue;
    const yb = By + s * (Ry - By);
    for (let y = Math.floor(yb - h); y < Math.ceil(yb); y++) {
      const t = (yb - (y + 0.5)) / h;
      if (t < 0 || t > 1) continue;
      const c = right(x, y, s, t);
      if (c !== null) pb.set(x, y, c);
    }
  }
  // topo: losango deslocado para cima
  const ty = cy - h;
  for (let y = Math.floor(ty - hh); y < Math.ceil(ty + hh); y++)
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) {
      const dx = (x + 0.5 - cx) / hw;
      const dy = (y + 0.5 - ty) / hh;
      if (Math.abs(dx) + Math.abs(dy) > 1) continue;
      const u = (dx + dy) / 2 + 0.5;
      const v = (dy - dx) / 2 + 0.5;
      const c = top(x, y, u, v);
      if (c !== null) pb.set(x, y, c);
    }
}

/** Face de tábuas: faixas ao longo de s, com veios e frestas. */
export function planks(pal: number[], n: number, seed: number, vertical = false, light = 0): FaceFn {
  return (x, y, s, t) => {
    const k = vertical ? s : t;
    const along = vertical ? t : s;
    const f = (k * n) % 1;
    const idx = Math.floor(k * n);
    if (f < 0.08) return pal[0];
    let tt = 0.42 + light + (hash(idx, seed, 3) - 0.5) * 0.25 + Math.sin((along * 9 + hash(idx, seed, 4) * 7) * Math.PI) * 0.05;
    if (f < 0.2) tt += 0.15;
    if (f > 0.88) tt -= 0.14;
    if (hash(x, y, seed) > 0.985) tt -= 0.25;
    return dither(tt, x, y, pal);
  };
}

/** Face de blocos de pedra em fiadas. */
export function stones(pal: number[], rows: number, cols: number, seed: number, light = 0, mossPal?: number[]): FaceFn {
  return (x, y, s, t) => {
    const r = Math.floor(t * rows);
    const off = (r % 2) * 0.5;
    const cs = s * cols + off;
    const c = Math.floor(cs);
    const fs = cs - c;
    const ft = t * rows - r;
    if (fs < 0.07 || ft < 0.1) return pal[0];
    let tt = 0.45 + light + (hash(c, r, seed) - 0.5) * 0.3;
    if (ft > 0.8) tt += 0.16;
    else if (fs > 0.9) tt -= 0.14;
    tt += (noise2(x * 0.3, y * 0.3, seed) - 0.5) * 0.2;
    if (mossPal && t < 0.35 && noise2(x * 0.15, y * 0.2, seed + 9) > 0.58 + t) return dither(0.45, x, y, mossPal);
    return dither(tt, x, y, pal);
  };
}

/** Preenchimento liso com leve ruído e luz (lado esquerdo claro, direito escuro). */
export function flat(pal: number[], base: number, seed: number, grain = 0.18): FaceFn {
  return (x, y) => dither(base + (noise2(x * 0.25, y * 0.25, seed) - 0.5) * grain, x, y, pal);
}

/** Retângulo com função de cor por pixel. */
export function fill(pb: PB, x0: number, y0: number, w: number, h: number, fn: (x: number, y: number, s: number, t: number) => number | null): void {
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++)
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
      const c = fn(x, y, (x + 0.5 - x0) / w, (y + 0.5 - y0) / h);
      if (c !== null) pb.set(x, y, c);
    }
}

/** Cilindro vertical (barril, coluna, tronco): sombreado pela posição horizontal. */
export function cylinder(pb: PB, cx: number, yTop: number, yBot: number, r: number, pal: number[], seed = 0, ry = r * 0.45, topPal?: number[]): void {
  for (let y = Math.floor(yTop); y <= Math.ceil(yBot + ry); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = (x + 0.5 - cx) / r;
      if (Math.abs(dx) > 1) continue;
      const bottom = yBot + Math.sqrt(1 - dx * dx) * ry;
      if (y > bottom) continue;
      const lit = 0.62 - dx * 0.42 - Math.abs(dx) ** 4 * 0.25 + (noise2(x * 0.4, y * 0.15, seed) - 0.5) * 0.18;
      pb.set(x, y, dither(lit, x, y, pal));
    }
  const tp = topPal ?? pal;
  for (let y = Math.floor(yTop - ry); y <= Math.ceil(yTop + ry); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - yTop) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const lit = 0.7 - dy * 0.15 - dx * 0.15 + (noise2(x * 0.5, y * 0.5, seed + 3) - 0.5) * 0.15;
      pb.set(x, y, dither(lit, x, y, tp));
    }
}

/** Brilho de vidro/janela com reflexo. */
export function glow(pb: PB, x: number, y: number, w: number, h: number, warm = true): void {
  const pal = warm ? [C('#c8782a'), C('#f0a640'), C('#ffd27a'), C('#fff0bf')] : [C('#2a4f7a'), C('#3f78b0'), C('#7cb6e8'), C('#d8f0ff')];
  fill(pb, x, y, w, h, (px, py, s, t) => dither(0.95 - t * 0.6 - Math.abs(s - 0.5) * 0.3, px, py, pal));
}

export function dot(pb: PB, x: number, y: number, c: number): void {
  pb.set(x, y, c);
}

export { bayer };
