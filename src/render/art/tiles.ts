import { C, PB, bayer, dither, hash, ints, pfbm, pnoise, ramp } from './paint';

/* Tiles isométricos em alta resolução (64×32) e as bordas de transição entre terrenos.
 *
 * Cada pixel do losango é convertido em coordenadas locais do mundo (u, v) ∈ [0,1].
 * As texturas usam ruído periódico em (u, v), então a textura de um tile continua
 * exatamente na do vizinho — é isso que permite misturar bordas sem costura. */

export const TILE_W = 64;
export const TILE_H = 32;

/** Ordem de sobreposição: o terreno com número maior “invade” a borda do menor. */
export const TERRAIN_PRIORITY: Record<string, number> = {
  deep_water: 0,
  water: 1,
  sand: 2,
  farm: 3,
  path: 4,
  ruin_floor: 5,
  cobble: 6,
  rocky: 7,
  forest_floor: 8,
  grass: 9,
  grass_lush: 10,
  bridge: -1,
};

export const EDGE_VARIANTS = 2;

function uv(px: number, py: number): [number, number] {
  const a = (px + 0.5 - 32) / 32;
  const b = (py + 0.5) / 16;
  return [(a + b) / 2, (b - a) / 2];
}

export function insideTile(px: number, py: number): boolean {
  return Math.abs(px + 0.5 - 32) / 32 + Math.abs(py + 0.5 - 16) / 16 < 1;
}

/* ---------------------------------------------------------------- paletas */

const P = {
  grass: ints(ramp('#5d9e3b', 7, 0.5, 22)),
  lush: ints(ramp('#4c9437', 7, 0.5, 22)),
  forest: ints(ramp('#3f5f30', 7, 0.5, 20)),
  forestBrown: ints(ramp('#5a4a2c', 5, 0.45, 14)),
  dirt: ints(ramp('#a8845a', 7, 0.42, 16)),
  stone: ints(ramp('#9a948a', 7, 0.45, 14)),
  stoneWarm: ints(ramp('#a39686', 7, 0.45, 14)),
  stoneCool: ints(ramp('#8d929a', 7, 0.45, 14)),
  sand: ints(ramp('#d9c38c', 6, 0.36, 12)),
  water: ints(ramp('#3b83c4', 7, 0.45, 12)),
  deep: ints(ramp('#2a5c9c', 7, 0.45, 12)),
  soil: ints(ramp('#7b5434', 6, 0.45, 14)),
  ruin: ints(ramp('#8f897d', 7, 0.45, 14)),
  moss: ints(ramp('#5f7d3e', 5, 0.4, 18)),
  rocky: ints(ramp('#857963', 7, 0.45, 14)),
  wood: ints(ramp('#a8743f', 7, 0.45, 16)),
};

const FLOWER = [C('#f6f2e6'), C('#f4d24a'), C('#ec90b4'), C('#9cc4ff'), C('#ff8a5a')];

/* ---------------------------------------------------------------- texturas base */

/** Cor do terreno no ponto (u, v) do tile; px/py dão o grão fino. */
export function terrainColor(key: string, u: number, v: number, px: number, py: number, variant: number, frame = 0): number {
  switch (key) {
    case 'grass':
    case 'grass_lush': {
      const pal = key === 'grass' ? P.grass : P.lush;
      let t = 0.5 + (pfbm(u, v, 3, 11) - 0.5) * 0.7 + (pnoise(u, v, 12, 12 + variant) - 0.5) * 0.35;
      // tufos: manchas mais claras e mais escuras de capim
      const tuft = pnoise(u, v, 24, 40 + variant);
      if (tuft > 0.72) t += 0.18;
      else if (tuft < 0.22) t -= 0.16;
      return dither(t, px, py, pal);
    }
    case 'forest_floor': {
      const m = pfbm(u, v, 3, 21);
      if (m < 0.36) return dither(0.35 + (pnoise(u, v, 16, 23 + variant) - 0.5) * 0.6, px, py, P.forestBrown);
      const t = 0.42 + (pnoise(u, v, 12, 22 + variant) - 0.5) * 0.6 + (m - 0.5) * 0.4;
      return dither(t, px, py, P.forest);
    }
    case 'path': {
      let t = 0.52 + (pfbm(u, v, 3, 31) - 0.5) * 0.5 + (pnoise(u, v, 16, 32 + variant) - 0.5) * 0.3;
      if (hash(px, py, 33 + variant) > 0.97) t -= 0.3;
      return dither(t, px, py, P.dirt);
    }
    case 'sand': {
      const rip = Math.sin((u * 3 + v * 1 + pnoise(u, v, 4, 41) * 0.6) * Math.PI * 2);
      let t = 0.55 + rip * 0.12 + (pnoise(u, v, 16, 42 + variant) - 0.5) * 0.3;
      if (hash(px, py, 43 + variant) > 0.975) t -= 0.35;
      return dither(t, px, py, P.sand);
    }
    case 'water':
    case 'deep_water': {
      const deep = key === 'deep_water';
      const pal = deep ? P.deep : P.water;
      const ph = (frame / 4) * Math.PI * 2;
      let t = (deep ? 0.4 : 0.52) + (pfbm(u, v, 2, 51) - 0.5) * 0.45;
      const w1 = Math.sin((u * 2 + v * 3) * Math.PI * 2 + ph + pnoise(u, v, 4, 52) * 4);
      const w2 = Math.sin((u * 4 - v * 2) * Math.PI * 2 - ph * 1.3 + pnoise(u, v, 4, 53) * 3);
      if (w1 > 0.86 && w2 > -0.2) t += 0.32;
      else if (w1 < -0.9) t -= 0.12;
      if (!deep && hash(px, py, 54 + frame) > 0.992) return C('#e8f6ff');
      return dither(t, px, py, pal);
    }
    case 'farm': {
      const row = (u * 5) % 1;
      let t = 0.5 + (pnoise(u, v, 12, 61 + variant) - 0.5) * 0.35;
      if (row < 0.22) t -= 0.32;
      else if (row < 0.32) t -= 0.12;
      else if (row > 0.78) t += 0.18;
      return dither(t, px, py, P.soil);
    }
    case 'cobble':
      return cobbleV(u, v, px, py, variant, 4, hash(Math.floor(u * 4), Math.floor(v * 4), 72) > 0.6 ? P.stoneWarm : P.stone, 71);
    case 'ruin_floor': {
      const slab = cobble(u, v, px, py, variant, 2, P.ruin, 81, 0.035);
      const moss = pfbm(u, v, 3, 82);
      if (moss > 0.64 && bayer(px, py) < (moss - 0.6) * 4) return dither(0.4 + (moss - 0.6), px, py, P.moss);
      return slab;
    }
    case 'rocky': {
      let t = 0.5 + (pfbm(u, v, 3, 91) - 0.5) * 0.55 + (pnoise(u, v, 16, 92 + variant) - 0.5) * 0.35;
      const crack = Math.abs(pnoise(u, v, 6, 93) - 0.5);
      if (crack < 0.018) t -= 0.4;
      return dither(t, px, py, P.rocky);
    }
    case 'bridge': {
      const n = 5;
      const fu = (u * n) % 1;
      const idx = Math.floor(u * n);
      if (fu < 0.09) return P.wood[0];
      let t = 0.42 + (hash(idx, variant, 101) - 0.5) * 0.3 + Math.sin((v * 18 + hash(idx, 0, 102) * 6) * Math.PI) * 0.06;
      if (fu < 0.18) t += 0.2;
      else if (fu > 0.9) t -= 0.18;
      if ((v < 0.12 || v > 0.88) && Math.abs(fu - 0.5) < 0.08) return C('#3b3a46');
      return dither(t, px, py, P.wood);
    }
  }
  return C('#ff00ff');
}

/** Calçamento de pedras arredondadas e irregulares (Voronoi periódico), com bisel e musgo. */
function cobbleV(u: number, v: number, px: number, py: number, variant: number, n: number, pal: number[], seed: number): number {
  let d1 = 9;
  let d2 = 9;
  let best = 0;
  let bx = 0;
  let by = 0;
  const gu = u * n;
  const gv = v * n;
  const cu = Math.floor(gu);
  const cv = Math.floor(gv);
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const ci = cu + i;
      const cj = cv + j;
      const wi = ((ci % n) + n) % n;
      const wj = ((cj % n) + n) % n;
      const fx = ci + 0.2 + hash(wi, wj, seed) * 0.6;
      const fy = cj + 0.2 + hash(wi, wj, seed + 1) * 0.6;
      // distância medida na tela (losango 2:1), para pedras redondas na projeção
      const du = gu - fx;
      const dv = gv - fy;
      const sx = du - dv;
      const sy = (du + dv) * 0.5;
      const d = Math.hypot(sx, sy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        best = hash(wi, wj, seed + 2);
        bx = sx;
        by = sy;
      } else if (d < d2) d2 = d;
    }
  const edge = d2 - d1;
  if (edge < 0.09) {
    const mossy = pnoise(u, v, 6, seed + 3) > 0.6;
    return mossy && edge > 0.03 ? P.moss[1 + (bayer(px, py) > 0.5 ? 1 : 0)] : pal[0];
  }
  // bisel: a parte de cima/esquerda de cada pedra recebe luz
  let t = 0.48 + (best - 0.5) * 0.32 - (bx * 0.35 + by * 0.6) * 0.55;
  if (edge < 0.16) t -= 0.14;
  t += (pnoise(u, v, 16, seed + 4 + variant) - 0.5) * 0.14;
  if (hash(px, py, seed + 5 + variant) > 0.985) t -= 0.25;
  return dither(t, px, py, pal);
}

/** Pedras em fiadas desencontradas, com bisel, argamassa e musgo. */
function cobble(u: number, v: number, px: number, py: number, variant: number, n: number, pal: number[], seed: number, mortar = 0.06): number {
  const row = Math.floor(v * n);
  const off = (row % 2) * 0.5;
  const cu = u * n + off;
  const col = Math.floor(cu);
  const fu = cu - col;
  const fv = v * n - row;
  const id = hash(((col % n) + n) % n, ((row % n) + n) % n, seed);
  const m = mortar + (pnoise(u, v, 8, seed + 1) - 0.5) * 0.04;
  if (fu < m || fv < m) {
    const mossy = pnoise(u, v, 6, seed + 2) > 0.62;
    return mossy ? P.moss[1 + (bayer(px, py) > 0.5 ? 1 : 0)] : pal[0];
  }
  // bisel: claro em cima/esquerda, escuro em baixo/direita
  let t = 0.45 + (id - 0.5) * 0.35;
  const eu = Math.min(fu - m, 1 - fu);
  const ev = Math.min(fv - m, 1 - fv);
  if (fu - m < 0.12 || fv - m < 0.12) t += 0.22;
  else if (1 - fu < 0.12 || 1 - fv < 0.12) t -= 0.22;
  t += (pnoise(u, v, 16, seed + 3 + variant) - 0.5) * 0.18;
  if (eu > 0.2 && ev > 0.2 && hash(px, py, seed + 4 + variant) > 0.985) t -= 0.3;
  return dither(t, px, py, pal);
}

/* ---------------------------------------------------------------- detalhes por cima */

function grassBlades(pb: PB, pal: number[], variant: number, count: number, seed: number): void {
  for (let k = 0; k < count; k++) {
    const x = 4 + Math.floor(hash(k, variant, seed) * 56);
    const y = 4 + Math.floor(hash(k, variant, seed + 1) * 24);
    if (!insideTile(x, y) || !insideTile(x, y - 3)) continue;
    const h = 2 + Math.floor(hash(k, variant, seed + 2) * 3);
    const lean = hash(k, variant, seed + 3) > 0.5 ? 1 : -1;
    pb.set(x, y, pal[1]);
    for (let i = 1; i <= h; i++) pb.set(x + (i > 2 ? lean : 0), y - i, pal[Math.min(pal.length - 1, 3 + i)]);
  }
}

function pebbles(pb: PB, pal: number[], variant: number, count: number, seed: number): void {
  for (let k = 0; k < count; k++) {
    const x = 6 + Math.floor(hash(k, variant, seed) * 52);
    const y = 5 + Math.floor(hash(k, variant, seed + 1) * 22);
    if (!insideTile(x - 1, y) || !insideTile(x + 3, y + 2)) continue;
    const w = hash(k, variant, seed + 2) > 0.6 ? 3 : 2;
    pb.rect(x, y, w, 2, pal[4]);
    pb.set(x, y, pal[6]);
    pb.rect(x, y + 2, w, 1, pal[1]);
    pb.set(x + w, y + 1, pal[1]);
  }
}

export function drawTileHD(key: string, variant: number, frame = 0): PB {
  const pb = new PB(TILE_W, TILE_H);
  for (let py = 0; py < TILE_H; py++)
    for (let px = 0; px < TILE_W; px++) {
      if (!insideTile(px, py)) continue;
      const [u, v] = uv(px, py);
      pb.set(px, py, terrainColor(key, u, v, px, py, variant, frame));
    }
  switch (key) {
    case 'grass':
      grassBlades(pb, P.grass, variant, 22, 200);
      break;
    case 'grass_lush':
      grassBlades(pb, P.lush, variant, 30, 210);
      for (let k = 0; k < 4; k++) {
        const x = 8 + Math.floor(hash(k, variant, 220) * 48);
        const y = 6 + Math.floor(hash(k, variant, 221) * 20);
        if (!insideTile(x, y) || !insideTile(x + 1, y + 1)) continue;
        const c = FLOWER[Math.floor(hash(k, variant, 222) * FLOWER.length)];
        pb.set(x, y, c);
        pb.set(x + 1, y, c);
        pb.set(x, y + 1, c);
        pb.set(x + 1, y + 1, C('#f2c23a'));
      }
      break;
    case 'forest_floor':
      grassBlades(pb, P.forest, variant, 10, 230);
      for (let k = 0; k < 5; k++) {
        const x = 6 + Math.floor(hash(k, variant, 240) * 52);
        const y = 5 + Math.floor(hash(k, variant, 241) * 22);
        if (!insideTile(x, y) || !insideTile(x + 2, y + 1)) continue;
        const leaf = [C('#b8642a'), C('#d1913a'), C('#8a4a22')][k % 3];
        pb.set(x, y, leaf);
        pb.set(x + 1, y, leaf);
        pb.set(x + 1, y + 1, leaf);
      }
      break;
    case 'path':
      pebbles(pb, P.stone, variant, 5, 250);
      break;
    case 'rocky':
      pebbles(pb, P.stoneWarm, variant, 7, 260);
      break;
    case 'sand':
      if (variant % 2 === 0) pebbles(pb, P.sand, variant, 2, 270);
      break;
  }
  return pb;
}

/* ---------------------------------------------------------------- bordas de transição */

/** Direções: 0..3 lados (x-1, x+1, y-1, y+1); 4..7 cantos (−−, +−, −+, ++);
 *  8..11 pares de lados (cima, baixo, esquerda, direita na tela) — viram uma borda reta
 *  e escondem o “serrilhado” dos degraus da grade isométrica. */
export const EDGE_DIRS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function edgeDist(dir: number, u: number, v: number): { d: number; along: number } {
  switch (dir) {
    case 0:
      return { d: u, along: v };
    case 1:
      return { d: 1 - u, along: v };
    case 2:
      return { d: v, along: u };
    case 3:
      return { d: 1 - v, along: u };
    case 4:
      return { d: Math.hypot(u, v), along: Math.atan2(v, u) };
    case 5:
      return { d: Math.hypot(1 - u, v), along: Math.atan2(v, 1 - u) };
    case 6:
      return { d: Math.hypot(u, 1 - v), along: Math.atan2(1 - v, u) };
    case 7:
      return { d: Math.hypot(1 - u, 1 - v), along: Math.atan2(1 - v, 1 - u) };
    case 8:
      return { d: (u + v) / 2, along: (u - v + 1) / 2 };
    case 9:
      return { d: (2 - u - v) / 2, along: (u - v + 1) / 2 };
    case 10:
      return { d: (u + 1 - v) / 2, along: (u + v) / 2 };
    default:
      return { d: (1 - u + v) / 2, along: (u + v) / 2 };
  }
}

const WATERY = new Set(['water', 'deep_water']);

/**
 * Faixa de transição: a textura do terreno “de cima” avança sobre o tile atual a partir
 * do lado compartilhado, com contorno irregular, sombra de profundidade e espuma na água.
 */
export function drawEdge(upper: string, dir: number, variant: number, lowerIsWater: boolean): PB {
  const pb = new PB(TILE_W, TILE_H);
  const corner = dir >= 4 && dir < 8;
  const pair = dir >= 8;
  const base = pair ? 0.5 : corner ? 0.26 : upper === 'water' ? 0.22 : 0.2;
  for (let py = 0; py < TILE_H; py++)
    for (let px = 0; px < TILE_W; px++) {
      if (!insideTile(px, py)) continue;
      const [u, v] = uv(px, py);
      const { d, along } = edgeDist(dir, u, v);
      const a = corner ? along / (Math.PI / 2) : along;
      const wob = (pnoise(a, variant * 0.37, pair ? 3 : 6, 300 + dir) - 0.5) * (pair ? 0.14 : 0.18) + (pnoise(a, 0.5, 16, 310 + variant) - 0.5) * 0.07;
      const w = base + wob;
      if (d < w) {
        let c = terrainColor(upper, u, v, px, py, variant);
        // ponta do avanço um pouco mais clara (luz na borda)
        if (d > w - 0.025 && !WATERY.has(upper)) c = dither(0.8, px, py, [c, c, c]);
        pb.set(px, py, c);
      } else if (!WATERY.has(upper)) {
        if (lowerIsWater) {
          // margem: faixa úmida e espuma
          if (d < w + 0.05) pb.set(px, py, C('#14263a', 110));
          else if (d < w + 0.11 && bayer(px, py) < 0.6 - (d - w - 0.05) * 6) pb.set(px, py, C('#e6f4ff', 190));
        } else if (d < w + 0.045) {
          // sombra de profundidade do terreno de cima
          pb.set(px, py, C('#10101a', d < w + 0.022 ? 70 : bayer(px, py) < 0.5 ? 45 : 0));
        }
      }
    }
  // capim saindo da borda
  if (upper === 'grass' || upper === 'grass_lush' || upper === 'forest_floor') {
    const pal = upper === 'grass' ? P.grass : upper === 'grass_lush' ? P.lush : P.forest;
    for (let k = 0; k < 14; k++) {
      const x = 3 + Math.floor(hash(k, dir * 7 + variant, 330) * 58);
      const y = 3 + Math.floor(hash(k, dir * 7 + variant, 331) * 26);
      if (!insideTile(x, y) || !insideTile(x, y - 3)) continue;
      const [u, v] = uv(x, y);
      const { d } = edgeDist(dir, u, v);
      if (d > base + 0.14 || d < base - 0.04) continue;
      if (pb.alpha(x, y) < 250) continue;
      for (let i = 1; i <= 3; i++) pb.set(x, y - i, pal[3 + i]);
    }
  }
  return pb;
}

export function lowerIsWater(key: string): boolean {
  return WATERY.has(key);
}
