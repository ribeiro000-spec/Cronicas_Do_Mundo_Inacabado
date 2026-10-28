import { C, PB, hash } from '../pixel';

/* Ferramentas de pintura para a arte em alta resolução (2× a resolução lógica do mundo):
 * rampas de cor com desvio de matiz, dithering ordenado (Bayer), sombreamento esférico,
 * contorno seletivo (escurece a cor vizinha em vez de usar preto) e luz de borda. */

export const ART = 2; // pixels de arte por unidade lógica

/* ---------------------------------------------------------------- cor */

export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Rampa de n tons, do mais escuro ao mais claro, passando pela cor base no meio.
 * Sombras puxam para azul/roxo e luzes para amarelo — o truque clássico de pixel art.
 */
export function ramp(base: string, n = 5, spread = 0.42, hueShift = 18): string[] {
  const [r, g, b] = hexRgb(base);
  const [h, s, l] = rgbHsl(r, g, b);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1 .. 1
    const lt = l + t * spread * (t < 0 ? l : 1 - l) * 1.25;
    // matiz: escuro → em direção a 240 (azul); claro → em direção a 60 (amarelo)
    const target = t < 0 ? 240 : 60;
    let dh = target - h;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    const hh = h + Math.sign(dh) * Math.min(Math.abs(dh), Math.abs(t) * hueShift);
    const ss = s * (1 + (t < 0 ? -0.05 : -0.18) * Math.abs(t)) + (t < 0 ? 0.04 : 0);
    out.push(hslHex(hh, ss, lt));
  }
  return out;
}

export const ints = (pal: string[], a = 255): number[] => pal.map((p) => C(p, a));

export function intRgb(c: number): [number, number, number, number] {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
}

export function rgbInt(r: number, g: number, b: number, a = 255): number {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return ((cl(a) << 24) | (cl(b) << 16) | (cl(g) << 8) | cl(r)) >>> 0;
}

/** Escurece (f<0) ou clareia (f>0) uma cor inteira, com desvio de matiz. */
export function shadeInt(c: number, f: number): number {
  const [r, g, b, a] = intRgb(c);
  if (f >= 0) return rgbInt(r + (255 - r) * f, g + (255 - g) * f, b + (225 - b) * f * 0.85, a);
  const k = 1 + f;
  return rgbInt(r * k * 0.9, g * k * 0.94, b * k + 18 * -f, a);
}

export function mixInt(a: number, b: number, t: number): number {
  const [r1, g1, b1, a1] = intRgb(a);
  const [r2, g2, b2, a2] = intRgb(b);
  return rgbInt(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t, a1 + (a2 - a1) * t);
}

/* ---------------------------------------------------------------- dithering */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function bayer(x: number, y: number): number {
  return BAYER[(y & 3) * 4 + (x & 3)];
}

/** Escolhe um tom da rampa para t ∈ [0,1], com dithering entre tons vizinhos. */
export function dither(t: number, x: number, y: number, pal: number[]): number {
  const n = pal.length;
  const f = Math.max(0, Math.min(0.9999, t)) * (n - 1);
  const i = Math.floor(f);
  const frac = f - i;
  // só faz dithering na faixa central da transição — evita “areia” excessiva
  const th = 0.25 + bayer(x, y) * 0.5;
  return pal[Math.min(n - 1, frac > th ? i + 1 : i)];
}

/* ---------------------------------------------------------------- ruído */

export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Ruído periódico (repete a cada `period` unidades) — faz tiles vizinhos se encaixarem. */
export function pnoise(u: number, v: number, period: number, seed = 0): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const w = (i: number) => ((i % period) + period) % period;
  const a = hash(w(ix), w(iy), seed);
  const b = hash(w(ix + 1), w(iy), seed);
  const c = hash(w(ix), w(iy + 1), seed);
  const d = hash(w(ix + 1), w(iy + 1), seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function pfbm(u: number, v: number, period: number, seed = 0, oct = 3): number {
  let s = 0;
  let amp = 1;
  let norm = 0;
  let p = period;
  for (let i = 0; i < oct; i++) {
    s += pnoise(u, v, p, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return s / norm;
}

/* ---------------------------------------------------------------- luz */

const L = (() => {
  const v = [-0.55, -0.7, 0.55];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

/** Iluminação de uma esfera: dx, dy ∈ [-1,1] dentro do disco. Devolve 0..1. */
export function sphereLight(dx: number, dy: number): number {
  const d2 = dx * dx + dy * dy;
  if (d2 >= 1) return 0;
  const nz = Math.sqrt(1 - d2);
  const lam = dx * L[0] + dy * L[1] + nz * L[2];
  return Math.max(0, Math.min(1, lam * 0.85 + 0.15));
}

/** Bolha sombreada (folhagem, pedras, slimes…). */
export function blob(pb: PB, cx: number, cy: number, rx: number, ry: number, pal: number[], seed = 0, rough = 0.18, bias = 0): void {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const edge = 1 + (hash(x, y, seed) - 0.5) * rough;
      if (dx * dx + dy * dy > edge) continue;
      let t = sphereLight(Math.max(-0.99, Math.min(0.99, dx)), Math.max(-0.99, Math.min(0.99, dy)));
      t += (noise2(x * 0.35, y * 0.35, seed + 7) - 0.5) * 0.22 + bias;
      pb.set(x, y, dither(t, x, y, pal));
    }
  }
}

/* ---------------------------------------------------------------- contorno e acabamento */

/**
 * Contorno seletivo: pixels transparentes vizinhos de pixels opacos recebem uma versão
 * bem escura da cor vizinha. Fica mais suave e “HD” que contorno preto.
 */
export function selout(pb: PB, strength = -0.62, minAlpha = 200): void {
  const src = pb.data.slice();
  const w = pb.w;
  const h = pb.h;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] >>> 24 >= minAlpha) continue;
      if (src[y * w + x] >>> 24 > 0) continue;
      // prioriza vizinho de baixo/direita (lado da sombra) para o contorno
      const n = [at(x, y - 1), at(x - 1, y), at(x + 1, y), at(x, y + 1)].filter((c) => c >>> 24 >= minAlpha);
      if (!n.length) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const c of n) {
        const [cr, cg, cb] = intRgb(c);
        r += cr;
        g += cg;
        b += cb;
      }
      const avg = rgbInt(r / n.length, g / n.length, b / n.length);
      pb.data[y * w + x] = shadeInt(avg, strength);
    }
  }
}

/** Escurece levemente os pixels de borda do lado da sombra (baixo/direita) — dá volume. */
export function innerShade(pb: PB, f = -0.18): void {
  const src = pb.data.slice();
  const w = pb.w;
  const h = pb.h;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] >>> 24 >= 200;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!op(x, y)) continue;
      if (!op(x + 1, y) || !op(x, y + 1)) pb.data[y * w + x] = shadeInt(src[y * w + x], f);
      else if (!op(x - 1, y) || !op(x, y - 1)) pb.data[y * w + x] = shadeInt(src[y * w + x], -f * 0.6);
    }
}

/** Sombra suave elíptica no chão, desenhada só onde ainda não há pixel. */
export function groundShadow(pb: PB, cx: number, cy: number, rx: number, ry: number, alpha = 90): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1 || pb.alpha(x, y) > 0) continue;
      const a = alpha * (d < 0.55 ? 1 : 0.62);
      if (d > 0.82 && bayer(x, y) > 0.5) continue;
      pb.set(x, y, C('#0c0a14', Math.round(a)));
    }
}

/** Linha com espessura (pincel quadrado). */
export function thick(pb: PB, x0: number, y0: number, x1: number, y1: number, w: number, c: number | ((x: number, y: number, t: number) => number)): void {
  const d = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= d; i++) {
    const t = i / d;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (let oy = -w / 2; oy < w / 2; oy++)
      for (let ox = -w / 2; ox < w / 2; ox++) {
        const px = Math.round(x + ox);
        const py = Math.round(y + oy);
        pb.set(px, py, typeof c === 'number' ? c : c(px, py, t));
      }
  }
}

export { C, PB, hash };
