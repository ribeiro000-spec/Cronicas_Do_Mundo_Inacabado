import { C, PB, blob, bayer, dither, groundShadow, hash, innerShade, ints, noise2, ramp, selout, sphereLight, thick } from './paint';
import { cylinder, fill, flat, glow, isoPrism, planks, stones } from './shapes';

/* Objetos do cenário em alta resolução: vegetação, rochas, ruínas e mobília.
 * Cada função devolve o buffer e a âncora (ponto que toca o chão). */

export interface ArtPiece {
  pb: PB;
  ax: number;
  ay: number;
  /** posição da chaminé (fumaça) em pixels do buffer */
  smoke?: { x: number; y: number };
}

function finish(pb: PB, ax: number, ay: number, srx = 0, sry = 0, outline = true, shadowAlpha = 90): ArtPiece {
  if (outline) selout(pb);
  if (srx > 0) groundShadow(pb, ax, ay, srx, sry, shadowAlpha);
  return { pb, ax, ay };
}

/* ---------------------------------------------------------------- paletas */

const LEAVES = [
  ints(ramp('#5fa63f', 7, 0.55, 26)),
  ints(ramp('#7aa83a', 7, 0.55, 26)),
  ints(ramp('#4a9a4c', 7, 0.55, 26)),
];
const PINE = [ints(ramp('#3f7f52', 7, 0.55, 22)), ints(ramp('#4a8a4a', 7, 0.55, 22))];
const DARK = [ints(ramp('#2f6450', 7, 0.55, 22)), ints(ramp('#3a5e3e', 7, 0.55, 22))];
const BARK = ints(ramp('#6b4a2e', 6, 0.5, 14));
const BARK_DARK = ints(ramp('#4c3a2c', 6, 0.5, 14));
const STONE = ints(ramp('#9b958a', 7, 0.5, 14));
const STONE_W = ints(ramp('#a99d8a', 7, 0.5, 14));
const MOSS = ints(ramp('#5f8a3e', 5, 0.45, 18));
const WOOD = ints(ramp('#9a6a3c', 7, 0.5, 16));
const WOOD_D = ints(ramp('#6e4a2c', 6, 0.5, 14));
const IRON = ints(ramp('#5a5e6a', 6, 0.5, 12));
const STRAW = ints(ramp('#d9b65a', 6, 0.45, 16));
const CANVAS = ints(ramp('#cdb88e', 6, 0.42, 12));

/* ---------------------------------------------------------------- árvores */

function trunk(pb: PB, cx: number, yTop: number, yBot: number, w: number, pal = BARK, roots = true): void {
  for (let y = Math.floor(yTop); y <= yBot; y++) {
    const flare = roots ? Math.max(0, (y - (yBot - 7)) / 7) ** 2 * 5 : 0;
    const hw = w / 2 + flare;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const dx = (x + 0.5 - cx) / hw;
      if (Math.abs(dx) > 1) continue;
      let t = 0.6 - dx * 0.4 + (noise2(x * 0.9, y * 0.12, 5) - 0.5) * 0.35;
      if (Math.abs(((x - cx) * 0.9 + noise2(0, y * 0.2, 6) * 2) % 3) < 0.6) t -= 0.25; // estrias da casca
      pb.set(x, y, dither(t, x, y, pal));
    }
  }
}

/** Copa feita de dezenas de tufos sombreados, do fundo para a frente. */
function canopy(pb: PB, cx: number, cy: number, rx: number, ry: number, pal: number[], seed: number, count: number, rmin: number, rmax: number): void {
  // silhueta escura de base para fechar buracos
  blob(pb, cx, cy + ry * 0.12, rx * 0.86, ry * 0.8, [pal[0], pal[1], pal[1]], seed, 0.25);
  const tufts: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = hash(i, seed, 1) * Math.PI * 2;
    const d = Math.sqrt(hash(i, seed, 2));
    const r = rmin + hash(i, seed, 3) * (rmax - rmin);
    tufts.push([cx + Math.cos(a) * d * (rx - r * 0.6), cy + Math.sin(a) * d * (ry - r * 0.6), r]);
  }
  tufts.sort((p, q) => p[1] - q[1]);
  for (const [x, y, r] of tufts) {
    // tufos do alto/esquerda mais iluminados, de baixo/direita mais escuros
    const bias = -((y - cy) / ry) * 0.18 - ((x - cx) / rx) * 0.12;
    blob(pb, x, y, r, r * 0.86, pal, seed + Math.floor(x * 7 + y), 0.32, bias);
  }
  // reflexos de luz em folhas
  for (let i = 0; i < count * 0.6; i++) {
    const x = Math.round(cx - rx * 0.6 + hash(i, seed, 9) * rx);
    const y = Math.round(cy - ry * 0.7 + hash(i, seed, 10) * ry * 0.9);
    if (pb.alpha(x, y) > 0 && pb.alpha(x, y + 1) > 0) pb.set(x, y, pal[pal.length - 1]);
  }
}

function oak(v: number): ArtPiece {
  const pb = new PB(88, 104);
  trunk(pb, 44, 54, 92, 10);
  // galhos aparecendo entre a copa
  thick(pb, 44, 66, 30, 52, 3, (x, y) => dither(0.4, x, y, BARK));
  thick(pb, 45, 62, 60, 50, 3, (x, y) => dither(0.35, x, y, BARK));
  const s = 1 - v * 0.06;
  canopy(pb, 44, 40, 40 * s, 34 * s, LEAVES[v % 3], 100 + v * 13, 34, 8, 13);
  innerShade(pb, -0.12);
  return finish(pb, 44, 92, 22, 8);
}

function pine(v: number): ArtPiece {
  const pb = new PB(60, 112);
  trunk(pb, 30, 82, 100, 7, BARK_DARK);
  const pal = PINE[v % 2];
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const apex = 4 + i * 15;
    const base = 26 + i * 16;
    const hw = 9 + i * 4.8;
    for (let y = apex; y <= base; y++) {
      const k = (y - apex) / (base - apex);
      const jag = (hash(y, i, v * 3 + 40) - 0.5) * 4 + (y % 3 === 0 ? 2 : 0);
      const half = hw * k + jag * k;
      for (let x = Math.floor(30 - half); x <= Math.ceil(30 + half); x++) {
        const dx = (x + 0.5 - 30) / Math.max(1, half);
        let t = 0.58 - dx * 0.38 - k * 0.22 + (noise2(x * 0.5, y * 0.5, i + v * 9) - 0.5) * 0.3;
        if ((x + y * 2) % 7 === 0) t -= 0.18; // agulhas
        if (k > 0.85 && bayer(x, y) > 0.6) t -= 0.25;
        pb.set(x, y, dither(t, x, y, pal));
      }
    }
  }
  innerShade(pb, -0.14);
  return finish(pb, 30, 100, 16, 6);
}

function darkTree(v: number): ArtPiece {
  const pb = new PB(96, 116);
  trunk(pb, 48, 62, 104, 12, BARK_DARK);
  thick(pb, 48, 70, 30, 58, 4, (x, y) => dither(0.3, x, y, BARK_DARK));
  thick(pb, 49, 68, 68, 56, 4, (x, y) => dither(0.25, x, y, BARK_DARK));
  canopy(pb, 48, 44, 44, 38, DARK[v % 2], 300 + v * 17, 40, 9, 14);
  // musgo pendurado
  for (let k = 0; k < 9; k++) {
    const x = 14 + Math.floor(hash(k, v, 77) * 68);
    let y0 = 0;
    for (let y = 90; y > 0; y--)
      if (pb.alpha(x, y) > 0) {
        y0 = y;
        break;
      }
    if (!y0) continue;
    const len = 4 + Math.floor(hash(k, v, 78) * 9);
    for (let i = 1; i <= len; i++) pb.set(x + (i > 5 ? 1 : 0), y0 + i, i < len - 1 ? MOSS[1] : MOSS[2]);
  }
  innerShade(pb, -0.12);
  return finish(pb, 48, 104, 26, 9);
}

/* ---------------------------------------------------------------- arbustos, pedras e plantas */

function bush(v: number): ArtPiece {
  const pb = new PB(44, 34);
  const pal = LEAVES[(v + 1) % 3];
  blob(pb, 22, 20, 18, 11, pal, 500 + v, 0.3);
  blob(pb, 13, 17, 9, 8, pal, 510 + v, 0.3, 0.08);
  blob(pb, 30, 15, 9, 8, pal, 520 + v, 0.3, 0.12);
  if (v % 2) {
    for (const [x, y] of [[12, 14], [24, 11], [31, 19], [18, 22], [27, 24]]) {
      pb.rect(x, y, 2, 2, C('#d8343a'));
      pb.set(x, y, C('#ff8a80'));
    }
  }
  return finish(pb, 22, 29, 18, 5);
}

function rock(v: number): ArtPiece {
  const pb = new PB(34, 26);
  blob(pb, 17, 14, 13, 9, v % 2 ? STONE_W : STONE, 600 + v, 0.22, 0.05);
  // musgo no topo
  for (let x = 8; x < 26; x++)
    for (let y = 5; y < 10; y++) if (pb.alpha(x, y) > 0 && noise2(x * 0.4, y * 0.6, 601 + v) > 0.55) pb.set(x, y, dither(0.5, x, y, MOSS));
  thick(pb, 14, 10, 17, 17, 1, STONE[1]);
  return finish(pb, 17, 21, 14, 4);
}

function rockBig(v: number): ArtPiece {
  const pb = new PB(84, 62);
  blob(pb, 32, 36, 24, 18, STONE, 610 + v, 0.2);
  blob(pb, 56, 38, 17, 13, STONE_W, 620 + v, 0.2, -0.04);
  blob(pb, 44, 22, 16, 14, STONE, 630 + v, 0.2, 0.08);
  for (let x = 20; x < 64; x++)
    for (let y = 8; y < 30; y++) if (pb.alpha(x, y) > 0 && noise2(x * 0.25, y * 0.4, 640 + v) > 0.6) pb.set(x, y, dither(0.55, x, y, MOSS));
  thick(pb, 40, 20, 46, 34, 1, STONE[1]);
  thick(pb, 28, 34, 34, 46, 1, STONE[1]);
  return finish(pb, 42, 48, 34, 9);
}

function flowers(v: number): ArtPiece {
  const pb = new PB(32, 22);
  const cols = [
    ['#f4d24a', '#c98a1e'],
    ['#ee8ab4', '#a84470'],
    ['#f6f2e6', '#b8b2a6'],
    ['#9cc4ff', '#4a6ad0'],
  ][v % 4];
  for (let k = 0; k < 7; k++) {
    const x = 4 + Math.floor(hash(k, v, 5) * 22);
    const y = 6 + Math.floor(hash(k, v, 6) * 10);
    thick(pb, x + 1, y + 2, x + 1 + (k % 2 ? 1 : -1), y + 6, 1, C(k % 2 ? '#3f7a2a' : '#4f8f32'));
    pb.set(x, y, C(cols[0]));
    pb.set(x + 2, y, C(cols[0]));
    pb.set(x + 1, y - 1, C(cols[0]));
    pb.set(x + 1, y + 1, C(cols[1]));
    pb.set(x + 1, y, C('#ffe9a0'));
  }
  return finish(pb, 16, 18, 0, 0, false);
}

function tuft(v: number): ArtPiece {
  const pb = new PB(28, 22);
  const pal = LEAVES[v % 2];
  for (let k = 0; k < 9; k++) {
    const x = 5 + k * 2 + (hash(k, v, 8) > 0.5 ? 1 : 0);
    const h = 5 + Math.floor(hash(k, v, 9) * 9);
    const lean = (hash(k, v, 10) - 0.5) * 6;
    for (let i = 0; i < h; i++) {
      const t = i / h;
      pb.set(Math.round(x + lean * t * t), 20 - i, dither(0.25 + t * 0.7, x, i, pal));
    }
  }
  return finish(pb, 14, 20, 0, 0, false);
}

function mushroom(): ArtPiece {
  const pb = new PB(26, 24);
  const cap = ints(ramp('#c8382f', 5, 0.45, 14));
  const stem = ints(ramp('#e9dfc4', 4, 0.3, 10));
  fill(pb, 11, 11, 4, 9, (x, y, s) => dither(0.7 - s * 0.5, x, y, stem));
  blob(pb, 13, 10, 8, 5, cap, 701, 0.05, 0.05);
  for (const [x, y] of [[10, 8], [15, 7], [13, 10], [17, 10]]) pb.rect(x, y, 2, 1, C('#fff4e6'));
  fill(pb, 3, 16, 2, 5, (x, y, s) => dither(0.7 - s * 0.5, x, y, stem));
  blob(pb, 4, 15, 4, 3, cap, 702, 0.05);
  pb.set(3, 14, C('#fff4e6'));
  return finish(pb, 13, 20, 8, 3);
}

function reeds(v: number): ArtPiece {
  const pb = new PB(28, 42);
  for (let k = 0; k < 6; k++) {
    const x = 5 + k * 3 + (k % 2);
    const h = 18 + Math.floor(hash(k, v, 12) * 14);
    const lean = (hash(k, v, 13) - 0.5) * 5;
    for (let i = 0; i < h; i++) {
      const t = i / h;
      pb.set(Math.round(x + lean * t), 39 - i, dither(0.3 + t * 0.45, x, i, LEAVES[2]));
    }
    if (k % 2 === 0) {
      const tx = Math.round(x + lean * 0.85);
      for (let i = 0; i < 6; i++) {
        pb.set(tx, 39 - h + 2 + i, C(i < 2 ? '#8a5a32' : '#6b4226'));
        pb.set(tx + 1, 39 - h + 2 + i, C('#55331c'));
      }
    }
  }
  return finish(pb, 14, 39, 0, 0, false);
}

function lily(v: number): ArtPiece {
  const pb = new PB(30, 18);
  const pal = ints(ramp('#3f8a3a', 5, 0.4, 16));
  for (let y = 0; y < 18; y++)
    for (let x = 0; x < 30; x++) {
      const dx = (x + 0.5 - 15) / 12;
      const dy = (y + 0.5 - 9) / 6;
      if (dx * dx + dy * dy > 1) continue;
      const ang = Math.atan2(dy, dx);
      if (ang > -0.25 && ang < 0.25) continue; // fenda
      pb.set(x, y, dither(0.55 - dy * 0.2 + (Math.abs(Math.sin(ang * 4)) < 0.1 ? -0.2 : 0), x, y, pal));
    }
  if (v % 2 === 0) {
    const pet = ints(ramp('#f2a6c4', 4, 0.35, 10));
    blob(pb, 11, 7, 4, 3, pet, 801, 0.1, 0.1);
    pb.set(11, 6, C('#ffe28a'));
  }
  return finish(pb, 15, 9, 0, 0, true);
}

function pebblesDecor(v: number): ArtPiece {
  const pb = new PB(30, 16);
  for (let k = 0; k < 5; k++) {
    const x = 4 + hash(k, v, 21) * 20;
    const y = 4 + hash(k, v, 22) * 8;
    blob(pb, x, y, 2 + hash(k, v, 23) * 2, 1.6 + hash(k, v, 24), STONE, 900 + k, 0.1, 0.05);
  }
  return finish(pb, 15, 10, 0, 0, true);
}

function leavesDecor(v: number): ArtPiece {
  const pb = new PB(32, 18);
  const cols = [C('#c46a2a'), C('#d99a3c'), C('#8a4a22'), C('#a8b03a')];
  for (let k = 0; k < 9; k++) {
    const x = 3 + Math.floor(hash(k, v, 31) * 26);
    const y = 3 + Math.floor(hash(k, v, 32) * 12);
    const c = cols[Math.floor(hash(k, v, 33) * cols.length)];
    pb.set(x, y, c);
    pb.set(x + 1, y, c);
    pb.set(x + 1, y + 1, c);
    pb.set(x + 2, y + 1, C('#5a3418'));
  }
  return finish(pb, 16, 10, 0, 0, false);
}

/* ---------------------------------------------------------------- mobília da vila */

function fence(dir: 1 | -1): ArtPiece {
  const pb = new PB(72, 48);
  const cx = 36;
  const cy = 34;
  const p0: [number, number] = [cx - 16 * dir, cy - 8];
  const p1: [number, number] = [cx + 16 * dir, cy + 8];
  for (const h of [7, 15]) {
    thick(pb, p0[0], p0[1] - h, p1[0], p1[1] - h, 3, (x, y, t) => dither(0.55 - t * 0.1, x, y, WOOD));
    thick(pb, p0[0], p0[1] - h + 2, p1[0], p1[1] - h + 2, 1, WOOD[1]);
  }
  for (const t of [0, 0.5, 1]) {
    const x = Math.round(p0[0] + (p1[0] - p0[0]) * t);
    const y = Math.round(p0[1] + (p1[1] - p0[1]) * t);
    fill(pb, x - 2, y - 20, 4, 21, (px, py, s) => dither(0.65 - s * 0.45, px, py, WOOD));
    fill(pb, x - 2, y - 21, 4, 2, (px, py) => dither(0.85, px, py, WOOD));
  }
  return finish(pb, cx, cy, 0, 0);
}

function lamp(): ArtPiece {
  const pb = new PB(24, 64);
  fill(pb, 10, 16, 4, 44, (x, y, s) => dither(0.6 - s * 0.45, x, y, IRON));
  isoPrism(pb, 12, 62, 6, 3, 4, flat(IRON, 0.6, 1), flat(IRON, 0.45, 2), flat(IRON, 0.25, 3));
  // lanterna
  fill(pb, 5, 4, 14, 14, (x, y, s, t) => (s < 0.15 || s > 0.85 || t < 0.12 || t > 0.88 ? dither(0.4 - s * 0.2, x, y, IRON) : null));
  glow(pb, 7, 6, 10, 10, true);
  fill(pb, 11, 6, 2, 10, () => IRON[1]);
  fill(pb, 3, 2, 18, 3, (x, y, s) => dither(0.65 - s * 0.4, x, y, IRON));
  pb.rect(11, 0, 2, 2, IRON[3]);
  return finish(pb, 12, 62, 6, 2);
}

function stall(): ArtPiece {
  const pb = new PB(76, 72);
  const cx = 38;
  const cy = 60;
  isoPrism(pb, cx, cy, 26, 13, 14, planks(WOOD, 4, 3, false, 0.15), planks(WOOD, 3, 4, false, 0), planks(WOOD, 3, 5, false, -0.15));
  // mercadorias
  const goods: [number, number, string][] = [
    [cx - 12, cy - 22, '#d8333b'],
    [cx - 5, cy - 24, '#3f78d0'],
    [cx + 3, cy - 22, '#e0b84a'],
    [cx + 10, cy - 20, '#6fd06f'],
    [cx - 2, cy - 18, '#c06aff'],
  ];
  for (const [x, y, c] of goods) blob(pb, x, y, 3, 3, ints(ramp(c, 4, 0.4, 10)), x + y, 0.05, 0.1);
  // postes e toldo listrado
  for (const [dx, dy] of [[-24, 0], [24, 0], [0, -11]]) fill(pb, cx + dx - 1, cy + dy - 46, 2, 34, (x, y) => dither(0.3, x, y, WOOD_D));
  const red = ints(ramp('#c83a32', 5, 0.4, 14));
  const white = ints(ramp('#efe6d6', 5, 0.3, 10));
  for (let y = 4; y < 34; y++)
    for (let x = 4; x < 72; x++) {
      const dx = (x + 0.5 - cx) / 32;
      const dy = (y + 0.5 - (cy - 44)) / 16;
      if (Math.abs(dx) + Math.abs(dy) > 1) continue;
      const stripe = Math.floor((x + y * 0.5) / 6) % 2;
      const lit = 0.65 - dy * 0.25;
      pb.set(x, y, dither(lit, x, y, stripe ? red : white));
    }
  // franja do toldo
  for (let x = 8; x < 68; x += 3) {
    const y = cy - 44 + 16 - Math.abs(x + 0.5 - cx) / 2 + 1;
    pb.rect(x, Math.round(y), 2, 3, x % 6 ? red[2] : white[2]);
  }
  return finish(pb, cx, cy, 28, 8);
}

function crate(): ArtPiece {
  const pb = new PB(40, 40);
  const corner = (fn: ReturnType<typeof planks>) => (x: number, y: number, s: number, t: number) => (s < 0.1 || s > 0.9 || t < 0.08 || t > 0.92 ? dither(0.55 - s * 0.2, x, y, IRON) : fn(x, y, s, t));
  isoPrism(pb, 20, 34, 15, 7.5, 16, planks(WOOD, 3, 7, false, 0.18), corner(planks(WOOD, 3, 8, false, 0)), corner(planks(WOOD, 3, 9, false, -0.18)));
  return finish(pb, 20, 34, 16, 5);
}

function barrel(): ArtPiece {
  const pb = new PB(32, 40);
  cylinder(pb, 16, 8, 34, 11, WOOD, 11, 4.5, ints(ramp('#b88a52', 5, 0.4, 12)));
  for (const y of [13, 28]) fill(pb, 5, y, 22, 2, (x, py, s) => dither(0.65 - Math.abs(s - 0.35) * 0.9, x, py, IRON));
  for (let x = 7; x < 26; x += 4) fill(pb, x, 10, 1, 24, () => WOOD[1]);
  return finish(pb, 16, 36, 12, 4);
}

function hay(): ArtPiece {
  const pb = new PB(40, 36);
  isoPrism(
    pb,
    20,
    30,
    15,
    7.5,
    14,
    (x, y) => dither(0.75 + (hash(x, y, 4) - 0.5) * 0.3, x, y, STRAW),
    (x, y, s) => dither(0.55 + (Math.sin(y * 1.7 + x * 0.3) * 0.15) - s * 0.05, x, y, STRAW),
    (x, y, s) => dither(0.32 + Math.sin(y * 1.7 - x * 0.3) * 0.12 - s * 0.05, x, y, STRAW),
  );
  thick(pb, 9, 20, 20, 25, 1, C('#7a4a22'));
  thick(pb, 20, 25, 31, 20, 1, C('#5a3418'));
  return finish(pb, 20, 30, 16, 5);
}

function cartBroken(): ArtPiece {
  const pb = new PB(64, 48);
  const bed = planks(WOOD, 4, 13, true, 0.1);
  isoPrism(pb, 32, 34, 22, 9, 8, bed, planks(WOOD, 2, 14, false, 0), planks(WOOD, 2, 15, false, -0.2));
  // roda inclinada
  for (let y = 22; y < 46; y++)
    for (let x = 6; x < 26; x++) {
      const dx = (x + 0.5 - 16) / 8;
      const dy = (y + 0.5 - 34) / 10;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      if (d > 0.78) pb.set(x, y, dither(0.5 - dx * 0.3, x, y, WOOD_D));
      else if (d < 0.22 || Math.abs(Math.sin(Math.atan2(dy, dx) * 3)) < 0.18) pb.set(x, y, dither(0.35, x, y, WOOD_D));
    }
  // tábua quebrada
  thick(pb, 40, 40, 54, 44, 3, (x, y) => dither(0.4, x, y, WOOD));
  return finish(pb, 32, 38, 26, 7);
}

function signpost(): ArtPiece {
  const pb = new PB(36, 58);
  fill(pb, 16, 12, 4, 44, (x, y, s) => dither(0.6 - s * 0.4, x, y, WOOD_D));
  const board = (y: number, dir: 1 | -1) => {
    for (let yy = 0; yy < 8; yy++)
      for (let xx = 0; xx < 24; xx++) {
        const tip = dir > 0 ? xx > 19 && Math.abs(yy - 3.5) > (23 - xx) : xx < 4 && Math.abs(yy - 3.5) > xx;
        if (tip) continue;
        const x = (dir > 0 ? 6 : 6) + xx;
        let t = 0.6 - yy * 0.04 + (hash(x, y + yy, 3) - 0.5) * 0.12;
        if (yy === 3 && xx > 5 && xx < 18 && xx % 3) t -= 0.35; // inscrição
        pb.set(x, y + yy, dither(t, x, y + yy, WOOD));
      }
  };
  board(10, 1);
  board(22, -1);
  return finish(pb, 18, 55, 8, 3);
}

function crops(v: number): ArtPiece {
  const pb = new PB(44, 28);
  const wheat = v % 2 === 0;
  const leaf = LEAVES[1];
  for (let k = 0; k < 6; k++) {
    const x = 5 + k * 6;
    const y = 22 - (k % 2) * 3;
    if (wheat) {
      for (let s = -1; s <= 1; s++) {
        thick(pb, x + s * 2, y, x + s * 3, y - 11, 1, leaf[2]);
        for (let i = 0; i < 4; i++) pb.set(x + s * 3, y - 11 - i, dither(0.6 + i * 0.08, x, i, STRAW));
      }
    } else {
      blob(pb, x + 2, y - 3, 4, 3, leaf, 1000 + k, 0.2, 0.05);
      pb.set(x + 2, y - 4, leaf[6]);
    }
  }
  return finish(pb, 22, 20, 0, 0, false);
}

/* ---------------------------------------------------------------- ruínas */

function pillar(broken: boolean, v: number): ArtPiece {
  const pb = new PB(36, 96);
  const top = broken ? 30 + Math.floor(v * 7) : 10;
  isoPrism(pb, 18, 92, 14, 6, 8, flat(STONE, 0.7, 1), stones(STONE, 1, 2, 3, 0), stones(STONE, 1, 2, 4, -0.18));
  // fuste estriado
  for (let y = top + 6; y < 86; y++)
    for (let x = 8; x < 28; x++) {
      const dx = (x + 0.5 - 18) / 10;
      let t = 0.62 - dx * 0.4 - Math.abs(dx) ** 4 * 0.2;
      if ((x - 8) % 4 === 0) t -= 0.18;
      if ((x - 8) % 4 === 1) t += 0.08;
      t += (noise2(x * 0.3, y * 0.08, 10 + v) - 0.5) * 0.18;
      pb.set(x, y, dither(t, x, y, STONE));
    }
  if (!broken) {
    isoPrism(pb, 18, top + 8, 13, 5, 6, flat(STONE, 0.78, 5), stones(STONE, 1, 3, 6, 0.05), stones(STONE, 1, 3, 7, -0.15));
  } else {
    // topo quebrado e serrilhado
    for (let x = 8; x < 28; x++) {
      const cut = Math.floor(hash(x >> 1, v, 13) * 8);
      for (let y = top + 6; y < top + 6 + cut; y++) pb.set(x, y, 0);
      pb.set(x, top + 6 + cut, STONE[5]);
    }
  }
  // hera
  for (let i = 0; i < 26; i++) {
    const x = 9 + Math.floor(hash(i, v, 14) * 18);
    const y = 50 + Math.floor(hash(i, v, 15) * 38);
    if (pb.alpha(x, y) > 0 && noise2(x * 0.2, y * 0.15, 16 + v) > 0.45) {
      pb.set(x, y, MOSS[2 + (i % 2)]);
      pb.set(x + 1, y + 1, MOSS[1]);
    }
  }
  return finish(pb, 18, 92, 15, 5);
}

function ruinWall(v: number): ArtPiece {
  const pb = new PB(72, 76);
  const h = 34 + (v % 3) * 6;
  isoPrism(pb, 36, 62, 30, 9, h, flat(STONE, 0.75, 20), stones(STONE, 6, 4, 21 + v, 0, MOSS), stones(STONE, 6, 3, 24 + v, -0.2, MOSS));
  // topo desmoronado
  for (let x = 0; x < 72; x++) {
    const cut = Math.floor(hash(x >> 2, v, 31) * 14 + noise2(x * 0.2, v, 32) * 6);
    let first = -1;
    for (let y = 0; y < 76; y++)
      if (pb.alpha(x, y) > 0) {
        first = y;
        break;
      }
    if (first < 0) continue;
    for (let y = first; y < first + cut; y++) pb.set(x, y, 0);
    if (pb.alpha(x, first + cut) > 0) pb.set(x, first + cut, STONE[5]);
  }
  return finish(pb, 36, 62, 32, 10);
}

function tombstone(): ArtPiece {
  const pb = new PB(28, 36);
  for (let y = 4; y < 30; y++)
    for (let x = 4; x < 24; x++) {
      const dx = (x + 0.5 - 14) / 10;
      const dy = (y + 0.5 - 12) / 8;
      if (y < 12 && dx * dx + dy * dy > 1) continue;
      let t = 0.62 - dx * 0.35 + (noise2(x * 0.4, y * 0.3, 41) - 0.5) * 0.2;
      if ((x === 13 || x === 14) && y > 9 && y < 22) t -= 0.35;
      if (y === 14 && x > 9 && x < 19) t -= 0.35;
      pb.set(x, y, dither(t, x, y, STONE));
    }
  for (let x = 4; x < 24; x++) for (let y = 24; y < 30; y++) if (noise2(x * 0.3, y * 0.4, 42) > 0.5) pb.set(x, y, dither(0.5, x, y, MOSS));
  return finish(pb, 14, 30, 11, 4);
}

function statue(): ArtPiece {
  const pb = new PB(40, 88);
  isoPrism(pb, 20, 84, 15, 6, 14, flat(STONE, 0.75, 51), stones(STONE, 2, 2, 52, 0), stones(STONE, 2, 2, 53, -0.2));
  // figura encapuzada
  for (let y = 12; y < 66; y++)
    for (let x = 6; x < 34; x++) {
      const k = (y - 12) / 54;
      const half = 5 + k * 9 + (y < 22 ? Math.sqrt(Math.max(0, 1 - ((y - 17) / 6) ** 2)) * 1.5 : 0);
      const dx = (x + 0.5 - 20) / half;
      if (Math.abs(dx) > 1) continue;
      let t = 0.66 - dx * 0.38 + (noise2(x * 0.35, y * 0.2, 54) - 0.5) * 0.22;
      if (Math.abs(Math.sin((x - 20) * 0.9 + k * 3)) < 0.12 && k > 0.3) t -= 0.18; // dobras
      if (y > 15 && y < 21 && Math.abs(x - 20) < 3) t -= 0.45; // rosto na sombra
      pb.set(x, y, dither(t, x, y, STONE));
    }
  for (let i = 0; i < 30; i++) {
    const x = 8 + Math.floor(hash(i, 1, 55) * 24);
    const y = 40 + Math.floor(hash(i, 1, 56) * 40);
    if (pb.alpha(x, y) > 0) pb.set(x, y, MOSS[1 + (i % 3)]);
  }
  return finish(pb, 20, 84, 16, 5);
}

/* ---------------------------------------------------------------- acampamento */

function campfire(): ArtPiece {
  const pb = new PB(40, 34);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    blob(pb, 20 + Math.cos(a) * 13, 22 + Math.sin(a) * 6.5, 3.4, 2.6, STONE, 60 + k, 0.1);
  }
  thick(pb, 9, 24, 28, 18, 3, (x, y) => dither(0.4, x, y, WOOD_D));
  thick(pb, 11, 17, 30, 24, 3, (x, y) => dither(0.5, x, y, WOOD_D));
  blob(pb, 20, 21, 7, 3, ints(['#3a1a10', '#7a2a12', '#c8521e', '#f08a2a']), 61, 0.3, 0.2);
  return finish(pb, 20, 22, 0, 0);
}

function log(): ArtPiece {
  const pb = new PB(52, 30);
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 52; x++) {
      // cilindro deitado na diagonal
      const along = (x - 6) * 0.89 - (y - 18) * 0.45;
      const across = (x - 6) * 0.45 + (y - 18) * 0.89;
      if (along < 0 || along > 38 || Math.abs(across + 1) > 6) continue;
      const k = (across + 1) / 6;
      let t = 0.6 - k * 0.4 + (noise2(along * 0.4, across, 71) - 0.5) * 0.25;
      if (Math.abs(Math.sin(along * 0.9)) < 0.1) t -= 0.2;
      pb.set(x, y, dither(t, x, y, BARK));
    }
  // ponta com anéis
  const ex = 6 + 38 * 0.89;
  const ey = 18 - 38 * 0.45;
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 52; x++) {
      const dx = (x + 0.5 - ex) / 3.6;
      const dy = (y + 0.5 - ey) / 6.2;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      pb.set(x, y, d > 0.82 ? BARK[1] : Math.round(d * 4) % 2 ? C('#c8a070') : C('#a87e50'));
    }
  return finish(pb, 24, 22, 20, 5);
}

function stump(): ArtPiece {
  const pb = new PB(32, 28);
  cylinder(pb, 16, 10, 20, 10, BARK, 81, 4, ints(['#8a6440', '#b48a5c', '#d2aa78', '#e4c08c']));
  for (let r = 2; r < 9; r += 3)
    for (let a = 0; a < Math.PI * 2; a += 0.15) pb.set(Math.round(16 + Math.cos(a) * r), Math.round(10 + Math.sin(a) * r * 0.4), C('#9a7048'));
  // raízes
  thick(pb, 6, 22, 2, 25, 2, BARK[1]);
  thick(pb, 26, 22, 30, 25, 2, BARK[0]);
  return finish(pb, 16, 23, 13, 4);
}

function tent(): ArtPiece {
  const pb = new PB(104, 76);
  const cx = 52;
  const cy = 56;
  const apexL: [number, number] = [cx - 16, cy - 46];
  const apexR: [number, number] = [cx + 14, cy - 40];
  // lado esquerdo (iluminado)
  pb.poly(
    [
      [cx - 46, cy],
      apexL,
      apexR,
      [cx + 6, cy + 14],
    ],
    (x, y) => dither(0.66 + (Math.floor((x - y * 0.6) / 9) % 2 ? 0.05 : -0.05) - (y - cy + 46) * 0.002, x, y, CANVAS),
  );
  // lado direito (sombra)
  pb.poly(
    [
      [cx + 6, cy + 14],
      apexR,
      [cx + 46, cy - 4],
      [cx + 46, cy],
    ],
    (x, y) => dither(0.3 + (Math.floor((x + y * 0.4) / 9) % 2 ? 0.04 : -0.04), x, y, CANVAS),
  );
  // entrada escura
  pb.poly(
    [
      [cx - 14, cy + 7],
      [cx - 2, cy - 22],
      [cx + 4, cy + 11],
    ],
    (x, y) => dither(0.15 + (y - cy) * 0.004, x, y, ints(['#1a1410', '#2c2218', '#3a2c1e'])),
  );
  thick(pb, apexL[0], apexL[1], apexR[0], apexR[1], 2, WOOD_D[2]);
  thick(pb, apexL[0], apexL[1] - 4, apexL[0], apexL[1] + 2, 2, WOOD_D[1]);
  thick(pb, apexR[0], apexR[1], cx + 52, cy + 4, 1, C('#d8c8a0'));
  return finish(pb, cx, cy, 44, 12);
}

/* ---------------------------------------------------------------- poço */

function well(): ArtPiece {
  const pb = new PB(48, 76);
  const cx = 24;
  const cy = 64;
  cylinder(pb, cx, cy - 16, cy, 17, STONE, 91, 8);
  // pedras do poço
  for (let y = cy - 16; y < cy + 6; y++)
    for (let x = cx - 17; x < cx + 17; x++) if (pb.alpha(x, y) > 0 && ((y - cy) % 5 === 0 || ((x + Math.floor((y - cy) / 5) * 4) % 8 === 0 && y > cy - 15))) pb.set(x, y, STONE[1]);
  for (let y = cy - 24; y < cy - 8; y++)
    for (let x = cx - 17; x < cx + 17; x++) {
      const dx = (x + 0.5 - cx) / 12;
      const dy = (y + 0.5 - (cy - 16)) / 5.5;
      if (dx * dx + dy * dy <= 1) pb.set(x, y, dither(0.3 - dy * 0.15 + (hash(x, y, 92) > 0.92 ? 0.4 : 0), x, y, ints(ramp('#2a4f7a', 5, 0.4, 10))));
    }
  // estrutura e telhadinho
  fill(pb, cx - 17, cy - 50, 4, 34, (x, y, s) => dither(0.6 - s * 0.4, x, y, WOOD));
  fill(pb, cx + 13, cy - 50, 4, 34, (x, y, s) => dither(0.4 - s * 0.3, x, y, WOOD));
  thick(pb, cx - 14, cy - 34, cx + 14, cy - 34, 2, WOOD_D[2]);
  const roof = ints(ramp('#a8433a', 5, 0.42, 14));
  pb.poly(
    [
      [cx - 23, cy - 46],
      [cx, cy - 60],
      [cx + 23, cy - 46],
      [cx, cy - 38],
    ],
    (x, y) => dither((x < cx ? 0.7 : 0.38) + ((y + Math.abs(x - cx) * 0.5) % 4 < 1 ? -0.2 : 0), x, y, roof),
  );
  thick(pb, cx + 2, cy - 34, cx + 2, cy - 24, 1, C('#8a7a5a'));
  fill(pb, cx - 1, cy - 25, 6, 5, (x, y, s) => dither(0.55 - s * 0.3, x, y, WOOD));
  return finish(pb, cx, cy, 20, 6);
}

/* ---------------------------------------------------------------- pontos de interesse */

export function drawPoiHD(key: string): ArtPiece {
  switch (key) {
    case 'chest_closed':
    case 'chest_open': {
      const open = key === 'chest_open';
      const pb = new PB(44, 44);
      const band = (fn: ReturnType<typeof planks>) => (x: number, y: number, s: number, t: number) =>
        Math.abs(s - 0.2) < 0.06 || Math.abs(s - 0.8) < 0.06 || t > 0.86 ? dither(0.7 - s * 0.3, x, y, ints(ramp('#c8a040', 5, 0.42, 16))) : fn(x, y, s, t);
      isoPrism(pb, 22, 38, 17, 8.5, 13, planks(WOOD, 3, 30, false, 0.1), band(planks(WOOD, 3, 31, false, 0)), band(planks(WOOD, 3, 32, false, -0.2)));
      if (open) {
        // tampa aberta para trás
        pb.poly(
          [
            [5, 20],
            [22, 12],
            [22, 0],
            [5, 8],
          ],
          (x, y) => dither(0.45 - (y % 4 === 0 ? 0.15 : 0), x, y, WOOD),
        );
        for (let y = 12; y < 30; y++)
          for (let x = 6; x < 39; x++) {
            const dx = (x + 0.5 - 22) / 16;
            const dy = (y + 0.5 - 25) / 8;
            if (Math.abs(dx) + Math.abs(dy) <= 1) pb.set(x, y, dy < -0.2 ? C('#2a1a10') : dither(0.6 + dy * 0.3, x, y, ints(['#a8741a', '#e0a83a', '#ffd86a', '#fff2b8'])));
          }
      } else {
        isoPrism(pb, 22, 25, 17, 8.5, 5, (x, y, _u, v) => dither(0.72 - v * 0.1, x, y, WOOD), band(planks(WOOD, 1, 33, false, 0.05)), band(planks(WOOD, 1, 34, false, -0.15)));
        fill(pb, 20, 28, 4, 5, (x, y, s) => dither(0.85 - s * 0.4, x, y, ints(ramp('#e0b84a', 4, 0.4, 14))));
        pb.set(21, 30, C('#3a2814'));
      }
      return finish(pb, 22, 38, 18, 6);
    }
    case 'waystone_off':
    case 'waystone_on': {
      const on = key === 'waystone_on';
      const pb = new PB(44, 84);
      isoPrism(pb, 22, 78, 18, 8, 6, flat(STONE, 0.75, 101), stones(STONE, 1, 3, 102, 0), stones(STONE, 1, 3, 103, -0.2));
      for (let y = 16; y < 72; y++) {
        const k = (y - 16) / 56;
        const half = 5 + k * 6;
        for (let x = Math.floor(22 - half); x <= Math.ceil(22 + half); x++) {
          const dx = (x + 0.5 - 22) / half;
          if (Math.abs(dx) > 1) continue;
          let t = (dx < 0 ? 0.7 : 0.38) + (noise2(x * 0.4, y * 0.2, 104) - 0.5) * 0.2;
          if (Math.abs(dx) < 0.08) t += 0.1;
          pb.set(x, y, dither(t, x, y, STONE));
        }
      }
      // ponta
      for (let y = 8; y < 17; y++) for (let x = 22 - (y - 8) * 0.6; x <= 22 + (y - 8) * 0.6; x++) pb.set(Math.round(x), y, dither(x < 22 ? 0.75 : 0.42, Math.round(x), y, STONE));
      // runas
      const rune = on ? [C('#5ad8f0'), C('#9cf6ff'), C('#e8ffff')] : [C('#3a4250'), C('#4a5466'), C('#5a6478')];
      const glyphs = [[0, 0], [1, 1], [-1, 1], [0, 2], [0, 4], [-1, 5], [1, 5], [0, 7], [-1, 9], [1, 9], [0, 10], [0, 12], [-1, 13], [1, 14]];
      for (const [gx, gy] of glyphs) {
        pb.rect(20 + gx * 2, 26 + gy * 3, 2, 2, rune[1]);
        pb.set(20 + gx * 2, 26 + gy * 3, rune[2]);
      }
      if (on) {
        blob(pb, 22, 4, 4, 5, ints(['#2aa8d0', '#5ad8f0', '#9cf6ff', '#e8ffff']), 105, 0.05, 0.2);
      }
      return finish(pb, 22, 78, 20, 7);
    }
    case 'herb': {
      const pb = new PB(30, 30);
      const leaf = LEAVES[2];
      const pet = ints(['#3a8ac8', '#5ab4f0', '#9cdcff', '#e6f8ff']);
      for (const [x, h] of [[9, 14], [15, 18], [21, 13]]) {
        thick(pb, x, 26, x + (x - 15) * 0.2, 26 - h, 1, leaf[2]);
        blob(pb, x - 3, 26 - h * 0.45, 3, 1.5, leaf, x, 0.1, 0.1);
        blob(pb, x + (x - 15) * 0.2, 26 - h, 3, 2.6, pet, x * 3, 0.1, 0.15);
      }
      return finish(pb, 15, 26, 9, 3);
    }
    case 'altar':
    case 'altar_dim': {
      const dim = key === 'altar_dim';
      const pb = new PB(76, 64);
      isoPrism(pb, 38, 50, 30, 13, 16, flat(STONE, 0.72, 111), stones(STONE, 2, 4, 112, 0, MOSS), stones(STONE, 2, 3, 113, -0.2, MOSS));
      const crack = dim ? [C('#3a3446'), C('#4a4458')] : [C('#9a5aff'), C('#e0c8ff')];
      const pts: [number, number][] = [[14, 32], [24, 36], [30, 30], [40, 34], [48, 27], [58, 30]];
      for (let i = 0; i < pts.length - 1; i++) thick(pb, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 2, crack[0]);
      for (let i = 0; i < pts.length - 1; i++) thick(pb, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1, crack[1]);
      return finish(pb, 38, 50, 32, 11);
    }
    case 'cargo': {
      const pb = new PB(64, 56);
      isoPrism(pb, 24, 46, 16, 8, 18, planks(WOOD, 3, 121, false, 0.15), planks(WOOD, 3, 122, false, 0), planks(WOOD, 3, 123, false, -0.2));
      isoPrism(pb, 44, 42, 12, 6, 14, planks(WOOD, 3, 124, false, 0.1), planks(WOOD, 2, 125, false, -0.05), planks(WOOD, 2, 126, false, -0.25));
      cylinder(pb, 32, 18, 28, 8, WOOD, 127, 3.4);
      // pano rasgado
      pb.poly(
        [
          [10, 30],
          [26, 22],
          [34, 30],
          [18, 40],
        ],
        (x, y) => dither(0.6 - (y - 22) * 0.02, x, y, ints(ramp('#5a7aa8', 5, 0.4, 14))),
      );
      return finish(pb, 30, 46, 28, 9);
    }
    case 'mark_quest':
    case 'mark_turnin': {
      const q = key === 'mark_turnin';
      const pb = new PB(22, 30);
      const pal = q ? ints(ramp('#5ab4f0', 5, 0.4, 12)) : ints(ramp('#f2c22a', 5, 0.4, 14));
      blob(pb, 11, 11, 9, 10, pal, q ? 7 : 8, 0.02, 0.1);
      const dark = C('#2a2214');
      if (q) {
        for (const [x, y] of [[8, 6], [9, 5], [10, 5], [11, 5], [12, 5], [13, 6], [14, 7], [14, 8], [13, 9], [12, 10], [11, 11], [11, 12], [11, 15], [11, 16]]) pb.rect(x - 1, y, 2, 1, dark);
      } else {
        pb.rect(10, 4, 3, 9, dark);
        pb.rect(10, 15, 3, 3, dark);
      }
      pb.poly(
        [
          [7, 19],
          [15, 19],
          [11, 28],
        ],
        pal[2],
      );
      selout(pb);
      return { pb, ax: 11, ay: 28 };
    }
  }
  const pb = new PB(8, 8);
  pb.rect(0, 0, 8, 8, C('#ff00ff'));
  return { pb, ax: 4, ay: 7 };
}

/* ---------------------------------------------------------------- índice */

export function drawPropHD(key: string, v: number): ArtPiece | null {
  switch (key) {
    case 'oak':
      return oak(v);
    case 'pine':
      return pine(v);
    case 'dark_tree':
      return darkTree(v);
    case 'bush':
      return bush(v);
    case 'rock':
      return rock(v);
    case 'rock_big':
      return rockBig(v);
    case 'flowers':
      return flowers(v);
    case 'tuft':
      return tuft(v);
    case 'mushroom':
      return mushroom();
    case 'reeds':
      return reeds(v);
    case 'lily':
      return lily(v);
    case 'pebbles':
      return pebblesDecor(v);
    case 'leaves':
      return leavesDecor(v);
    case 'fence_x':
      return fence(1);
    case 'fence_y':
      return fence(-1);
    case 'lamp':
      return lamp();
    case 'stall':
      return stall();
    case 'crate':
      return crate();
    case 'barrel':
      return barrel();
    case 'hay':
      return hay();
    case 'cart_broken':
      return cartBroken();
    case 'signpost':
      return signpost();
    case 'crops':
      return crops(v);
    case 'pillar':
      return pillar(false, v);
    case 'pillar_broken':
      return pillar(true, v);
    case 'ruin_wall':
      return ruinWall(v);
    case 'tombstone':
      return tombstone();
    case 'statue':
      return statue();
    case 'campfire':
      return campfire();
    case 'log':
      return log();
    case 'stump':
      return stump();
    case 'tent':
      return tent();
    case 'well':
      return well();
  }
  return null;
}

export { sphereLight };
