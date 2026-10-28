import { C, PB, hash, shade } from './pixel';

/* Arte procedural do cenário: tiles isométricos (32×16), objetos e pontos de interesse.
 * Cada função devolve um buffer de pixels + a âncora (ponto que toca o chão no centro do tile). */

export interface ArtPiece {
  pb: PB;
  ax: number;
  ay: number;
}

const OUT = C('#1b1a24');
const SHADOW = C('#000000', 70);

/* ================================================================ tiles */

const inD = (x: number, y: number) => Math.abs(x + 0.5 - 16) / 16 + Math.abs(y + 0.5 - 8) / 8 < 1;
const edgeDist = (x: number, y: number) => 1 - (Math.abs(x + 0.5 - 16) / 16 + Math.abs(y + 0.5 - 8) / 8);

function tileBuf(fn: (x: number, y: number) => string | null): PB {
  const pb = new PB(32, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++)
      if (inD(x, y)) {
        const c = fn(x, y);
        if (c) pb.set(x, y, C(c));
      }
  return pb;
}

function pal(n: number, p: string[]): string {
  return p[Math.min(p.length - 1, Math.floor(n * p.length))];
}

const GRASS = ['#4a8530', '#538f35', '#5c993b', '#64a342', '#6fae49'];

function grass(v: number, palette = GRASS, extra?: (pb: PB) => void): PB {
  const pb = tileBuf((x, y) => {
    const n = hash(x >> 1, y, v * 7 + 1) * 0.55 + hash(x, y, v * 13 + 2) * 0.45;
    return pal(n, palette);
  });
  for (let k = 0; k < 7; k++) {
    const x = 3 + Math.floor(hash(k, v, 3) * 26);
    const y = 3 + Math.floor(hash(k, v, 4) * 11);
    if (inD(x, y) && inD(x, y - 1) && inD(x + 1, y)) {
      pb.set(x, y, C(shade(palette[3], 0.18)));
      pb.set(x, y - 1, C(shade(palette[4], 0.25)));
      pb.set(x + 1, y, C(shade(palette[0], -0.15)));
    }
  }
  extra?.(pb);
  return pb;
}

export function drawTile(key: string, v: number, frame = 0): PB {
  switch (key) {
    case 'grass':
      return grass(v);
    case 'grass_lush':
      return grass(v, ['#3e7b2d', '#458632', '#4d9137', '#569b3e', '#60a645'], (pb) => {
        const flowers = ['#f4f1e8', '#f2d04a', '#e88ab0', '#9fc3ff'];
        for (let k = 0; k < 3; k++) {
          const x = 5 + Math.floor(hash(k, v, 21) * 22);
          const y = 4 + Math.floor(hash(k, v, 22) * 8);
          if (inD(x, y)) pb.set(x, y, C(flowers[Math.floor(hash(k, v, 23) * 4)]));
        }
      });
    case 'forest_floor':
      return tileBuf((x, y) => {
        const n = hash(x >> 1, y >> 1, v + 31) * 0.6 + hash(x, y, v + 32) * 0.4;
        if (hash(x, y, v + 33) > 0.94) return hash(x, y, v + 34) > 0.5 ? '#6e5a32' : '#5b4a2a';
        return pal(n, ['#284826', '#2e5229', '#345c2e', '#3a6633']);
      });
    case 'path':
      return tileBuf((x, y) => {
        const e = edgeDist(x, y);
        if (e < 0.16 && hash(x, y, v + 41) < 0.55 - e * 2) return pal(hash(x, y, 9), GRASS);
        if (hash(x, y, v + 42) > 0.95) return '#d4bd92';
        if (hash(x - 1, y - 1, v + 42) > 0.95) return '#7e6343';
        const n = hash(x >> 1, y, v + 43) * 0.5 + hash(x, y, v + 44) * 0.5;
        return pal(n, ['#977750', '#a3825a', '#ae8d63', '#b9986d']);
      });
    case 'cobble':
      return tileBuf((x, y) => {
        const a = x - 2 * y + 64;
        const b = x + 2 * y;
        const ma = a % 8;
        const mb = b % 8;
        if (ma === 0 || mb === 0) return '#5d5950';
        const h = hash(Math.floor(a / 8), Math.floor(b / 8), 5);
        const base = h < 0.33 ? '#9f998d' : h < 0.66 ? '#aaa497' : '#938d82';
        if (ma === 1 || mb === 1) return shade(base, 0.14);
        if (ma === 7 || mb === 7) return shade(base, -0.14);
        return base;
      });
    case 'sand':
      return tileBuf((x, y) => {
        if (hash(x, y, v + 51) > 0.93) return '#b9a370';
        return pal(hash(x >> 1, y, v + 52), ['#d0bb83', '#d8c48e', '#e0cd99', '#e7d6a5']);
      });
    case 'water':
    case 'deep_water': {
      const deep = key === 'deep_water';
      const base = deep ? '#2b62a5' : '#3a81c3';
      const wave = deep ? '#3d7ec0' : '#62a8e0';
      return tileBuf((x, y) => {
        const X = x + frame * 2;
        if ((y % 8 === 3 && X % 16 < 3) || (y % 8 === 7 && (X + 8) % 16 < 3)) return wave;
        if (!deep && hash(x, y, v * 5 + frame + 61) > 0.985) return '#d4ecff';
        return hash(x >> 2, y >> 1, v + 62) > 0.6 ? shade(base, -0.06) : base;
      });
    }
    case 'farm':
      return tileBuf((x, y) => {
        const a = (x - 2 * y + 64) % 6;
        if (a === 0 || a === 1) return '#4e331b';
        if (a === 2) return '#6a4628';
        if (hash(x, y, v + 71) > 0.93) return '#5f8a34';
        return hash(x >> 1, y, v + 72) > 0.5 ? '#7a5431' : '#835b35';
      });
    case 'ruin_floor':
      return tileBuf((x, y) => {
        const a = x - 2 * y + 64;
        const b = x + 2 * y;
        if (a % 16 === 0 || b % 16 === 0) return '#635d53';
        const h = hash(Math.floor(a / 16), Math.floor(b / 16), 81);
        if (hash(x >> 1, y >> 1, v + 82) > 0.86) return '#5f7a46';
        if (hash(x, y, v + 83) > 0.97) return '#5a544b';
        const base = h < 0.33 ? '#958e80' : h < 0.66 ? '#8a8376' : '#9f988a';
        if (a % 16 === 1 || b % 16 === 1) return shade(base, 0.12);
        return base;
      });
    case 'rocky':
      return tileBuf((x, y) => {
        if (hash(x, y, v + 91) > 0.95) return '#aaa395';
        if (hash(x - 1, y - 1, v + 91) > 0.95) return '#5c5446';
        return pal(hash(x >> 1, y, v + 92), ['#776c56', '#80755e', '#8a7e66', '#93876e']);
      });
    case 'bridge':
      // tábuas perpendiculares à estrada (que segue o eixo x do mundo)
      return tileBuf((x, y) => {
        const b = x + 2 * y;
        const a = x - 2 * y + 64;
        const m = b % 8;
        if (m === 0) return '#2e1c0e';
        const h = hash(Math.floor(b / 8), 0, v + 101);
        const base = h < 0.33 ? '#a9743f' : h < 0.66 ? '#9b6a38' : '#b47e48';
        if (m === 1) return shade(base, 0.22);
        if (m === 7) return shade(base, -0.25);
        // pregos nas pontas das tábuas
        if ((m === 3 || m === 5) && (a % 32 === 3 || a % 32 === 28)) return '#3a3a46';
        return (x + y) % 5 === 0 ? shade(base, -0.06) : base;
      });
    default:
      return tileBuf(() => '#ff00ff');
  }
}

/* ================================================================ helpers de objetos */

function finish(pb: PB, ax: number, ay: number, shadowRx = 0, shadowRy = 0, outline = true): ArtPiece {
  if (outline) pb.outline(OUT);
  if (shadowRx > 0) {
    for (let y = Math.floor(ay - shadowRy); y <= ay + shadowRy; y++)
      for (let x = Math.floor(ax - shadowRx); x <= ax + shadowRx; x++) {
        const dx = (x + 0.5 - ax) / shadowRx;
        const dy = (y + 0.5 - ay) / shadowRy;
        if (dx * dx + dy * dy <= 1 && pb.alpha(x, y) === 0) pb.set(x, y, SHADOW);
      }
  }
  return { pb, ax, ay };
}

/** Caixa isométrica: centro no chão (cx, cy), meia-largura hw, altura h. */
function isoBox(pb: PB, cx: number, cy: number, hw: number, h: number, top: string, left: string, right: string, hh = hw / 2): void {
  const T: [number, number] = [cx, cy - hh];
  const R: [number, number] = [cx + hw, cy];
  const B: [number, number] = [cx, cy + hh];
  const L: [number, number] = [cx - hw, cy];
  const up = (p: [number, number]): [number, number] => [p[0], p[1] - h];
  pb.poly([L, B, up(B), up(L)], C(left));
  pb.poly([B, R, up(R), up(B)], C(right));
  pb.poly([up(T), up(R), up(B), up(L)], C(top));
}

function canopy(pb: PB, blobs: [number, number, number, number][], colors: string[], seed: number, lightX: number, lightY: number, size: number): void {
  for (const [cx, cy, rx, ry] of blobs) {
    pb.ellipse(cx, cy, rx, ry, (x, y) => {
      const t = ((x - lightX) * 0.55 + (y - lightY)) / size + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.45;
      const i = t < -0.5 ? 0 : t < -0.12 ? 1 : t < 0.28 ? 2 : 3;
      return C(colors[i]);
    });
  }
}

function trunk(pb: PB, x: number, y0: number, y1: number, w = 4, col = '#6b4528'): void {
  for (let y = y0; y <= y1; y++) {
    for (let k = 0; k < w; k++) {
      const c = k === 0 ? shade(col, 0.2) : k === w - 1 ? shade(col, -0.3) : col;
      pb.set(x + k, y, C(c));
    }
  }
  pb.set(x - 1, y1, C(shade(col, -0.1)));
  pb.set(x + w, y1, C(shade(col, -0.35)));
}

/* ================================================================ objetos */

const LEAF_SETS = [
  ['#9ad65e', '#6fb441', '#4c9031', '#336c25'],
  ['#a7d860', '#7dbb45', '#559736', '#3a7027'],
  ['#8fcf6a', '#5fa947', '#3f8636', '#2a6128'],
];

export function drawObject(key: string, v: number): ArtPiece {
  switch (key) {
    case 'oak': {
      const pb = new PB(34, 44);
      const s = 1 - v * 0.08;
      trunk(pb, 15, 27, 39, 4);
      canopy(
        pb,
        [
          [17, 15, 11 * s, 9 * s],
          [9, 21, 7 * s, 6 * s],
          [25, 21, 7 * s, 6 * s],
          [17, 24, 9 * s, 6 * s],
          [12, 11, 6 * s, 5 * s],
          [22, 10, 6 * s, 5 * s],
        ],
        LEAF_SETS[v % 3],
        v * 11 + 3,
        10,
        8,
        16,
      );
      return finish(pb, 17, 39, 10, 4);
    }
    case 'pine': {
      const pb = new PB(26, 48);
      trunk(pb, 11, 36, 43, 4, '#5a3a22');
      const cols = v % 2 ? ['#5fa070', '#3f8052', '#2c6440', '#1d4a2f'] : ['#69a868', '#468a4c', '#30693a', '#20502b'];
      for (let i = 0; i < 4; i++) {
        const apex = 3 + i * 8;
        const base = 15 + i * 8;
        const hw = 5 + i * 2.6;
        pb.poly(
          [
            [13, apex],
            [13 + hw, base],
            [13 - hw, base],
          ],
          (x, y) => {
            const t = (x - 13) / (hw + 1) + (y - base) / 20 + (hash(x, y >> 1, 77 + v) - 0.5) * 0.5;
            return C(cols[t < -0.55 ? 0 : t < -0.05 ? 1 : t < 0.35 ? 2 : 3]);
          },
        );
      }
      return finish(pb, 13, 43, 8, 3);
    }
    case 'dark_tree': {
      const pb = new PB(40, 52);
      trunk(pb, 17, 32, 47, 5, '#4a3424');
      const cols = v % 2 ? ['#4f8f6a', '#356f50', '#24553c', '#173a2a'] : ['#5a8a5a', '#3b6b44', '#2a5134', '#1a3824'];
      canopy(
        pb,
        [
          [20, 17, 13, 11],
          [10, 25, 8, 7],
          [30, 25, 8, 7],
          [20, 28, 11, 7],
          [14, 11, 7, 6],
          [26, 10, 7, 6],
        ],
        cols,
        v * 5 + 9,
        12,
        8,
        18,
      );
      return finish(pb, 20, 47, 12, 5);
    }
    case 'bush': {
      const pb = new PB(20, 16);
      canopy(pb, [[10, 9, 8, 5], [6, 8, 4, 4], [14, 7, 4, 4]], LEAF_SETS[(v + 1) % 3], v + 41, 5, 4, 8);
      if (v % 2) for (const [x, y] of [[6, 7], [12, 6], [9, 10]]) pb.set(x, y, C('#e2463c'));
      return finish(pb, 10, 13, 8, 3);
    }
    case 'rock': {
      const pb = new PB(16, 12);
      pb.ellipse(8, 7, 6.5, 4.5, (x, y) => C(y < 5 ? '#b3ada2' : x > 9 ? '#6d6860' : '#8f897f'));
      pb.set(5, 4, C('#d0cbc0'));
      pb.set(6, 4, C('#d0cbc0'));
      return finish(pb, 8, 9, 7, 2.5);
    }
    case 'rock_big': {
      const pb = new PB(40, 30);
      const rock = (cx: number, cy: number, rx: number, ry: number) =>
        pb.ellipse(cx, cy, rx, ry, (x, y) => C(y < cy - ry * 0.35 ? '#b0aa9e' : x > cx + rx * 0.3 ? '#625d55' : '#878177'));
      rock(16, 18, 11, 8);
      rock(26, 19, 8, 6);
      rock(21, 12, 7, 6);
      return finish(pb, 20, 22, 16, 5);
    }
    case 'flowers': {
      const pb = new PB(14, 10);
      const colors = [['#f2d04a', '#e8a33a'], ['#e88ab0', '#c4507a'], ['#f4f1e8', '#c9c4b8'], ['#9fc3ff', '#5a7fd8']][v % 4];
      for (let k = 0; k < 5; k++) {
        const x = 2 + Math.floor(hash(k, v, 5) * 10);
        const y = 3 + Math.floor(hash(k, v, 6) * 5);
        pb.set(x, y + 1, C('#3f7a2a'));
        pb.set(x, y, C(colors[0]));
        pb.set(x + 1, y, C(colors[1]));
      }
      return finish(pb, 7, 8, 0, 0, false);
    }
    case 'tuft': {
      const pb = new PB(12, 9);
      const c = v % 2 ? ['#7fbf55', '#4f8f32'] : ['#6aa84a', '#3f7a2a'];
      for (let k = 0; k < 5; k++) {
        const x = 2 + k * 2;
        const h = 3 + Math.floor(hash(k, v, 9) * 4);
        for (let y = 0; y < h; y++) pb.set(x + (y > 2 ? (k % 2 ? 1 : -1) : 0), 8 - y, C(y > h - 2 ? c[0] : c[1]));
      }
      return finish(pb, 6, 8, 0, 0, false);
    }
    case 'mushroom': {
      const pb = new PB(12, 10);
      pb.rect(5, 5, 2, 4, C('#efe6cf'));
      pb.ellipse(6, 4, 4.5, 2.5, C('#c8382f'));
      pb.set(4, 3, C('#ffffff'));
      pb.set(7, 3, C('#ffffff'));
      pb.rect(1, 7, 1, 2, C('#efe6cf'));
      pb.ellipse(1.5, 6.5, 2, 1.2, C('#c8382f'));
      return finish(pb, 6, 9, 4, 1.5);
    }
    case 'reeds': {
      const pb = new PB(12, 18);
      for (let k = 0; k < 4; k++) {
        const x = 2 + k * 2 + (k % 2);
        const h = 9 + Math.floor(hash(k, v, 12) * 6);
        for (let y = 0; y < h; y++) pb.set(x, 16 - y, C(y > h - 4 ? '#6e4a2a' : '#5a8a3a'));
      }
      return finish(pb, 6, 16, 0, 0, false);
    }
    case 'lily': {
      const pb = new PB(14, 8);
      pb.ellipse(7, 4, 5.5, 2.6, C('#3f8a3a'));
      pb.set(7, 3, C('#2a6a2a'));
      pb.set(8, 4, C('#2a6a2a'));
      if (v % 2 === 0) {
        pb.set(5, 3, C('#f0a0c0'));
        pb.set(6, 3, C('#ffd0e0'));
      }
      return finish(pb, 7, 4, 0, 0, false);
    }
    case 'house_blue':
    case 'house_red':
    case 'house_brown':
      return drawHouse(key === 'house_blue' ? 0 : key === 'house_red' ? 1 : 2, v);
    case 'fountain':
      return drawFountain();
    case 'well': {
      const pb = new PB(22, 34);
      const cx = 11;
      const cy = 28;
      pb.ellipse(cx, cy, 8, 4, C('#6f6a62'));
      pb.rect(cx - 8, cy - 7, 17, 7, (x) => C(x < cx ? '#9a958b' : '#7a756c'));
      pb.ellipse(cx, cy - 7, 8, 4, C('#a8a297'));
      pb.ellipse(cx, cy - 7, 5.5, 2.5, C('#2a4f7a'));
      pb.rect(cx - 8, cy - 22, 2, 15, C('#6b4528'));
      pb.rect(cx + 7, cy - 22, 2, 15, C('#4e321d'));
      pb.poly([[cx - 10, cy - 21], [cx, cy - 27], [cx + 11, cy - 21], [cx, cy - 18]], (x) => C(x < cx ? '#a8433a' : '#87352a'));
      pb.line(cx - 6, cy - 16, cx + 6, cy - 16, C('#8a5c36'));
      return finish(pb, cx, cy, 9, 3);
    }
    case 'fence_x':
    case 'fence_y': {
      const pb = new PB(36, 24);
      const dir = key === 'fence_x' ? 1 : -1;
      const cx = 18;
      const cy = 17;
      const p0: [number, number] = [cx - 8 * dir, cy - 4];
      const p1: [number, number] = [cx + 8 * dir, cy + 4];
      for (const t of [0, 0.5, 1]) {
        const x = Math.round(p0[0] + (p1[0] - p0[0]) * t);
        const y = Math.round(p0[1] + (p1[1] - p0[1]) * t);
        pb.rect(x, y - 9, 2, 10, (xx) => C(xx === x ? '#9a6a3a' : '#6b4528'));
      }
      for (const h of [3, 7]) pb.line(p0[0], p0[1] - h, p1[0], p1[1] - h, C('#8a5c36'));
      for (const h of [4, 8]) pb.line(p0[0], p0[1] - h, p1[0], p1[1] - h, C('#5e3e22'));
      return finish(pb, cx, cy, 0, 0);
    }
    case 'lamp': {
      const pb = new PB(10, 30);
      pb.rect(4, 8, 2, 20, C('#3a3a46'));
      pb.rect(3, 27, 4, 2, C('#2a2a34'));
      pb.rect(2, 2, 6, 7, C('#2a2a34'));
      pb.rect(3, 3, 4, 5, C('#ffd56a'));
      pb.set(4, 4, C('#fff3c0'));
      pb.rect(1, 1, 8, 1, C('#3a3a46'));
      return finish(pb, 5, 28, 3, 1.5);
    }
    case 'stall': {
      const pb = new PB(34, 32);
      const cx = 17;
      const cy = 26;
      isoBox(pb, cx, cy, 12, 7, '#a0703f', '#8a5c36', '#6b4528');
      for (const [dx, dy] of [[-11, 0], [11, 0], [0, -5]]) pb.rect(cx + dx, cy + dy - 20, 1, 15, C('#5e3e22'));
      pb.poly([[cx - 15, cy - 16], [cx, cy - 25], [cx + 15, cy - 16], [cx, cy - 8]], (x, y) => C(Math.floor((x + y * 0.5) / 3) % 2 ? '#d8433a' : '#f2e8d8'));
      for (const [x, y, c] of [[cx - 5, cy - 9, '#d8333b'], [cx - 2, cy - 10, '#2f6fd1'], [cx + 3, cy - 9, '#e0b84a'], [cx + 6, cy - 8, '#6fd06f']] as [number, number, string][]) {
        pb.rect(x, y, 2, 3, C(c));
      }
      return finish(pb, cx, cy, 13, 4);
    }
    case 'crate': {
      const pb = new PB(18, 18);
      isoBox(pb, 9, 14, 7, 8, '#b98a52', '#9a6e3e', '#7a5530');
      pb.line(2, 10, 9, 13, C('#6b4528'));
      pb.line(9, 13, 16, 10, C('#5a3a20'));
      return finish(pb, 9, 14, 7, 3);
    }
    case 'barrel': {
      const pb = new PB(14, 18);
      pb.rect(2, 4, 10, 11, (x) => C(x < 5 ? '#9a6e3e' : x > 9 ? '#5e3e22' : '#7a5530'));
      pb.ellipse(7, 4, 5, 2, C('#a87a48'));
      pb.ellipse(7, 15, 5, 2, C('#5e3e22'));
      for (const y of [6, 12]) pb.rect(2, y, 10, 1, C('#3a3a46'));
      return finish(pb, 7, 15, 5, 2);
    }
    case 'hay': {
      const pb = new PB(18, 16);
      isoBox(pb, 9, 12, 7, 7, '#e8c86a', '#d0aa4a', '#b08a3a');
      for (let k = 0; k < 6; k++) pb.set(3 + k * 2, 6 + (k % 3), C('#f4e090'));
      return finish(pb, 9, 12, 7, 3);
    }
    case 'cart_broken': {
      const pb = new PB(30, 22);
      pb.poly([[4, 10], [20, 6], [27, 10], [11, 15]], C('#9a6e3e'));
      pb.poly([[4, 10], [11, 15], [11, 18], [4, 13]], C('#7a5530'));
      pb.poly([[11, 15], [27, 10], [27, 13], [11, 18]], C('#5e3e22'));
      pb.ellipse(9, 16, 3.5, 4, C('#4a3020'));
      pb.ellipse(9, 16, 1.5, 2, C('#8a5c36'));
      pb.poly([[20, 16], [26, 18], [24, 20], [19, 18]], C('#4a3020'));
      return finish(pb, 15, 15, 12, 3);
    }
    case 'pillar':
    case 'pillar_broken': {
      const broken = key === 'pillar_broken';
      const pb = new PB(16, 44);
      const top = broken ? 18 + Math.floor(v * 4) : 6;
      pb.rect(3, 38, 10, 4, C('#7f796d'));
      pb.rect(4, top + 3, 8, 36 - top, (x) => C(x < 6 ? '#c2bcae' : x > 9 ? '#837d70' : '#a49d8f'));
      for (let y = top + 6; y < 38; y += 4) pb.set(7, y, C('#8f897c'));
      if (!broken) pb.rect(2, top, 12, 3, C('#b3ad9f'));
      else for (let x = 4; x < 12; x++) if (hash(x, v, 7) > 0.45) pb.set(x, top + 3, 0);
      if (hash(v, 2, 3) > 0.4) for (let k = 0; k < 6; k++) pb.set(4 + Math.floor(hash(k, v, 8) * 7), 30 + Math.floor(hash(k, v, 9) * 8), C('#5f7a46'));
      return finish(pb, 8, 41, 7, 2.5);
    }
    case 'ruin_wall': {
      const pb = new PB(34, 34);
      const cx = 17;
      const cy = 26;
      isoBox(pb, cx, cy, 14, 16 + (v % 3) * 3, '#a49d8f', '#958e80', '#77716a', 4);
      for (let y = 0; y < 34; y++)
        for (let x = 0; x < 34; x++) {
          if (pb.alpha(x, y) === 0) continue;
          if ((y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 3) % 6 === 0) && hash(x, y, 4) > 0.3) pb.set(x, y, C('#6d675d'));
        }
      for (let x = 0; x < 34; x++) {
        const cut = Math.floor(hash(x >> 2, v, 11) * 7);
        for (let y = 0; y < 34 && cut > 0; y++) {
          if (pb.alpha(x, y) > 0) {
            for (let k = 0; k < cut; k++) pb.set(x, y + k, 0);
            break;
          }
        }
      }
      return finish(pb, cx, cy, 14, 4);
    }
    case 'tombstone': {
      const pb = new PB(12, 16);
      pb.rect(2, 4, 8, 10, (x) => C(x < 5 ? '#a9a397' : '#7d776d'));
      pb.ellipse(6, 4, 4, 3, C('#a9a397'));
      pb.rect(5, 6, 2, 5, C('#5d584f'));
      pb.rect(4, 7, 4, 1, C('#5d584f'));
      return finish(pb, 6, 13, 5, 2);
    }
    case 'campfire': {
      const pb = new PB(18, 16);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        pb.ellipse(9 + Math.cos(a) * 6, 11 + Math.sin(a) * 3, 1.6, 1.2, C('#8a857c'));
      }
      pb.line(4, 12, 13, 9, C('#5e3e22'));
      pb.line(5, 9, 13, 12, C('#6b4528'));
      pb.ellipse(9, 8, 3, 5, C('#e8722a'));
      pb.ellipse(9, 9, 2, 3, C('#ffd56a'));
      return finish(pb, 9, 11, 0, 0);
    }
    case 'log': {
      const pb = new PB(24, 14);
      pb.poly([[3, 6], [17, 3], [20, 7], [6, 10]], (_x, y) => C(y < 6 ? '#8a5c36' : '#6b4528'));
      pb.ellipse(19, 5, 2.5, 3, C('#c8a070'));
      pb.set(19, 5, C('#8a5c36'));
      return finish(pb, 12, 9, 9, 2.5);
    }
    case 'stump': {
      const pb = new PB(14, 12);
      pb.rect(3, 4, 8, 5, (x) => C(x < 6 ? '#7a5530' : '#5a3a22'));
      pb.ellipse(7, 4, 4, 2, C('#c8a070'));
      pb.set(7, 4, C('#8a5c36'));
      return finish(pb, 7, 9, 5, 2);
    }
    case 'tent': {
      const pb = new PB(50, 34);
      const cx = 25;
      const cy = 24;
      pb.poly([[cx - 22, cy], [cx - 6, cy - 22], [cx + 4, cy + 6]], C('#d4bd92'));
      pb.poly([[cx + 4, cy + 6], [cx - 6, cy - 22], [cx + 20, cy - 4], [cx + 22, cy]], C('#a8906a'));
      pb.poly([[cx - 2, cy + 3], [cx - 6, cy - 12], [cx + 3, cy + 5]], C('#3a2a1a'));
      pb.line(cx - 6, cy - 22, cx - 6, cy - 26, C('#5e3e22'));
      return finish(pb, cx, cy, 20, 6);
    }
    case 'signpost': {
      const pb = new PB(16, 26);
      pb.rect(7, 6, 2, 18, C('#6b4528'));
      pb.poly([[2, 5], [13, 3], [15, 6], [13, 9], [2, 11]], C('#a0703f'));
      pb.line(4, 7, 11, 6, C('#5a3a20'));
      return finish(pb, 8, 23, 4, 1.5);
    }
    case 'crops': {
      const pb = new PB(20, 12);
      const ripe = v % 2 === 0;
      for (let k = 0; k < 4; k++) {
        const x = 3 + k * 4;
        const y = 9 - (k % 2);
        pb.rect(x, y - 3, 1, 4, C('#4f8f32'));
        pb.set(x - 1, y - 2, C('#6aa84a'));
        pb.set(x + 1, y - 3, C('#6aa84a'));
        if (ripe) pb.set(x, y - 4, C('#e8c86a'));
      }
      return finish(pb, 10, 8, 0, 0, false);
    }
    case 'statue': {
      const pb = new PB(18, 40);
      pb.rect(3, 32, 12, 6, (x) => C(x < 8 ? '#a49d8f' : '#7f796d'));
      pb.poly([[9, 6], [14, 14], [13, 32], [5, 32], [4, 14]], (x) => C(x < 8 ? '#bdb7a9' : '#8f897c'));
      pb.ellipse(9, 7, 3.5, 4, C('#b3ad9f'));
      pb.rect(7, 7, 4, 2, C('#5d584f'));
      for (let k = 0; k < 8; k++) pb.set(4 + Math.floor(hash(k, 3, 5) * 10), 24 + Math.floor(hash(k, 4, 5) * 12), C('#5f7a46'));
      return finish(pb, 9, 36, 7, 2.5);
    }
    default: {
      const pb = new PB(8, 8);
      pb.rect(0, 0, 8, 8, C('#ff00ff'));
      return { pb, ax: 4, ay: 7 };
    }
  }
}

const ROOFS = [
  { base: '#3f64a8', light: '#5a82c6', dark: '#2b4a82' },
  { base: '#b04a3a', light: '#c9654e', dark: '#86352a' },
  { base: '#7b5a3a', light: '#97744c', dark: '#5c412a' },
];

function drawHouse(roofIdx: number, v: number): ArtPiece {
  const W = 104;
  const H = 112;
  const pb = new PB(W, H);
  const cx = 52;
  const cy = 84;
  const hw = 48;
  const hh = 24;
  const wh = 24 + (v % 2) * 3;
  const rh = 26;
  type P = [number, number];
  const T: P = [cx, cy - hh];
  const R: P = [cx + hw, cy];
  const B: P = [cx, cy + hh];
  const L: P = [cx - hw, cy];
  const up = (p: P, h: number): P => [p[0], p[1] - h];
  const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const roof = ROOFS[roofIdx];
  const plaster = v % 3 === 2 ? '#d9cdb2' : '#eadcbf';

  // paredes
  pb.poly([L, B, up(B, wh), up(L, wh)], (x, y) => {
    const fromBottom = (L[1] + (x - L[0]) * 0.5) - y;
    return C(fromBottom < 4 ? '#8d887e' : plaster);
  });
  pb.poly([B, R, up(R, wh), up(B, wh)], (x, y) => {
    const fromBottom = (B[1] - (x - B[0]) * 0.5) - y;
    return C(fromBottom < 4 ? '#6f6a62' : shade(plaster, -0.2));
  });
  // vigas de madeira
  const beam = C('#6b4a2b');
  for (const t of [0, 0.34, 0.67, 1]) {
    const a = lerp(L, B, t);
    const b = up(a, wh);
    pb.line(a[0], a[1] - 4, b[0], b[1], beam);
    const c = lerp(B, R, t);
    pb.line(c[0], c[1] - 4, c[0], c[1] - wh, beam);
  }
  pb.line(...up(L, wh * 0.55), ...up(B, wh * 0.55), beam);
  pb.line(...up(B, wh * 0.55), ...up(R, wh * 0.55), beam);
  // porta (parede da esquerda)
  for (let t = 0.48; t <= 0.62; t += 0.005) {
    const a = lerp(L, B, t);
    for (let k = 1; k < 15; k++) pb.set(a[0], a[1] - k, C(k > 13 ? '#3a2616' : t < 0.5 || t > 0.6 ? '#3a2616' : '#6b4528'));
  }
  // janelas (parede da direita)
  for (const t0 of [0.22, 0.62]) {
    for (let t = t0; t <= t0 + 0.12; t += 0.005) {
      const a = lerp(B, R, t);
      for (let k = 10; k < 18; k++) {
        const edge = t < t0 + 0.012 || t > t0 + 0.108 || k === 10 || k === 17;
        const mid = Math.abs(t - (t0 + 0.06)) < 0.006 || k === 14;
        pb.set(a[0], a[1] - k, C(edge || mid ? '#4a3020' : '#f5d27a'));
      }
    }
  }
  // janela na parede esquerda
  for (let t = 0.16; t <= 0.28; t += 0.005) {
    const a = lerp(L, B, t);
    for (let k = 10; k < 18; k++) {
      const edge = t < 0.172 || t > 0.268 || k === 10 || k === 17;
      pb.set(a[0], a[1] - k, C(edge ? '#4a3020' : '#ffe29a'));
    }
  }
  // telhado de duas águas com beiral
  const Tw = up(T, wh);
  const Rw = up(R, wh);
  const Bw = up(B, wh);
  const Lw = up(L, wh);
  const Lr: P = [Lw[0] - 5, Lw[1] + 2];
  const Br: P = [Bw[0], Bw[1] + 4];
  const Rr: P = [Rw[0] + 5, Rw[1] + 2];
  const Tr: P = [Tw[0], Tw[1] - 1];
  const M1 = up(lerp(Lr, Tr, 0.5), rh);
  const M2 = up(lerp(Br, Rr, 0.5), rh);
  const M2w = up(lerp(Bw, Rw, 0.5), rh - 3);
  const shingles = (base: string, x: number, y: number) => {
    const row = Math.floor((y - 0.5 * x) / 3);
    const brk = Math.floor((x + row * 3) / 5);
    if ((y - 0.5 * x) % 3 < 1) return C(shade(base, -0.22));
    return C(hash(brk, row, roofIdx) > 0.8 ? shade(base, 0.08) : base);
  };
  pb.poly([Tr, Rr, M2, M1], (x, y) => shingles(roof.base, x, y));
  pb.poly([Bw, Rw, M2w], (x, y) => C(y > M2w[1] + 6 && (x + y) % 9 === 0 ? '#6b4a2b' : shade(plaster, -0.12)));
  pb.poly([Lr, Br, M2, M1], (x, y) => shingles(roof.light, x, y));
  pb.line(...M1, ...M2, C(shade(roof.light, 0.25)));
  pb.line(...Lr, ...Br, C(roof.dark));
  // chaminé
  const ch = lerp(M1, Tr, 0.45);
  pb.rect(ch[0] + 8, ch[1] - 10, 6, 12, (x) => C(x < ch[0] + 11 ? '#a49d8f' : '#77716a'));
  pb.rect(ch[0] + 7, ch[1] - 11, 8, 2, C('#5d584f'));
  return finish(pb, cx, cy, 0, 0);
}

function drawFountain(): ArtPiece {
  const pb = new PB(72, 54);
  const cx = 36;
  const cy = 40;
  pb.ellipse(cx, cy + 1, 29, 14, C('#77716a'));
  pb.ellipse(cx, cy - 4, 29, 14, (x) => C(x < cx ? '#bdb7a9' : '#a49d8f'));
  pb.ellipse(cx, cy - 5, 24, 11, (x, y) => {
    if ((x * 3 + y * 7) % 23 === 0) return C('#d4ecff');
    return C(y < cy - 9 ? '#5aa5e6' : '#3f88cc');
  });
  pb.rect(cx - 3, cy - 26, 7, 20, (x) => C(x < cx ? '#c2bcae' : '#8f897c'));
  pb.ellipse(cx, cy - 26, 9, 4, (x) => C(x < cx ? '#bdb7a9' : '#a49d8f'));
  pb.ellipse(cx, cy - 27, 6.5, 2.5, C('#5aa5e6'));
  pb.rect(cx - 1, cy - 34, 3, 7, C('#bfe3ff'));
  pb.set(cx, cy - 35, C('#ffffff'));
  for (const [dx, dy] of [[-7, -22], [7, -22], [-9, -16], [9, -16], [-10, -11], [10, -11]]) pb.set(cx + dx, cy + dy, C('#bfe3ff'));
  return finish(pb, cx, cy, 0, 0);
}

/* ================================================================ pontos de interesse */

export function drawPoi(key: string): ArtPiece {
  switch (key) {
    case 'chest_closed':
    case 'chest_open': {
      const open = key === 'chest_open';
      const pb = new PB(20, 20);
      isoBox(pb, 10, 16, 8, 7, '#9a6e3e', '#8a5c36', '#6b4528');
      pb.line(2, 12, 10, 16, C('#d0a640'));
      pb.line(10, 16, 18, 12, C('#a8842a'));
      if (open) {
        pb.poly([[2, 9], [10, 5], [10, 0], [2, 4]], C('#7a5530'));
        pb.diamond(10, 9, 7, 3.5, C('#2a1a10'));
        pb.rect(8, 8, 3, 1, C('#ffd56a'));
      } else {
        isoBox(pb, 10, 9, 8, 3, '#b98a52', '#a07040', '#7a5530');
        pb.rect(9, 11, 2, 3, C('#ffd56a'));
      }
      return finish(pb, 10, 16, 8, 3);
    }
    case 'waystone_off':
    case 'waystone_on': {
      const on = key === 'waystone_on';
      const pb = new PB(20, 40);
      pb.ellipse(10, 35, 9, 4, C('#7f796d'));
      pb.poly([[5, 35], [7, 10], [10, 6], [13, 10], [15, 35]], (x) => C(x < 10 ? '#a8a297' : '#7f796d'));
      const rune = on ? '#7cf0ff' : '#4a5a6a';
      for (const [x, y] of [[9, 16], [10, 17], [11, 16], [10, 19], [9, 21], [11, 21], [10, 23], [10, 26]]) pb.set(x, y, C(rune));
      if (on) {
        pb.poly([[10, 0], [13, 4], [10, 8], [7, 4]], (x) => C(x < 10 ? '#c8f8ff' : '#5ad8f0'));
      }
      return finish(pb, 10, 35, 9, 3.5);
    }
    case 'herb': {
      const pb = new PB(14, 14);
      for (const [x, y] of [[4, 8], [7, 6], [10, 8]]) {
        pb.line(x, 12, x, y + 1, C('#3f8a3a'));
        pb.set(x - 1, y + 3, C('#5aa84a'));
        pb.set(x + 1, y + 2, C('#5aa84a'));
        pb.rect(x - 1, y - 1, 3, 2, C('#7fd8ff'));
        pb.set(x, y - 1, C('#e8fbff'));
      }
      return finish(pb, 7, 12, 4, 1.5);
    }
    case 'altar':
    case 'altar_dim': {
      const dim = key === 'altar_dim';
      const pb = new PB(36, 30);
      isoBox(pb, 18, 22, 14, 9, '#a49d8f', '#8f897c', '#6d675d');
      const glow = dim ? '#5a5466' : '#c58bff';
      pb.line(8, 15, 16, 18, C(glow));
      pb.line(16, 18, 22, 14, C(glow));
      pb.line(22, 14, 28, 16, C(glow));
      if (!dim) pb.rect(15, 9, 5, 3, C('#e9d6ff'));
      return finish(pb, 18, 22, 14, 4);
    }
    case 'cargo': {
      const pb = new PB(30, 26);
      isoBox(pb, 12, 21, 8, 9, '#b98a52', '#9a6e3e', '#7a5530');
      isoBox(pb, 21, 18, 6, 7, '#a87a48', '#8a5c36', '#6b4528');
      isoBox(pb, 15, 12, 5, 6, '#c8986a', '#a07040', '#7a5530');
      pb.rect(16, 3, 1, 3, C('#fff3c0'));
      pb.rect(15, 4, 3, 1, C('#fff3c0'));
      return finish(pb, 15, 21, 12, 4);
    }
    case 'mark_quest':
    case 'mark_turnin': {
      const pb = new PB(11, 15);
      const q = key === 'mark_turnin';
      pb.ellipse(5.5, 6, 5, 6, C('#2a2214'));
      pb.ellipse(5.5, 6, 4, 5, C(q ? '#8ad8ff' : '#ffd23a'));
      const glyph = q
        ? [[4, 3], [5, 2], [6, 2], [7, 3], [7, 4], [6, 5], [5, 6], [5, 7], [5, 9]]
        : [[5, 2], [6, 2], [5, 3], [6, 3], [5, 4], [6, 4], [5, 5], [6, 5], [5, 6], [5, 9], [6, 9]];
      for (const [x, y] of glyph) pb.set(x, y, C('#2a2214'));
      pb.poly([[4, 11], [7, 11], [5.5, 14]], C('#2a2214'));
      return { pb, ax: 5, ay: 14 };
    }
    default:
      return drawObject('none', 0);
  }
}

/* ================================================================ efeitos */

export function drawFx(key: string): PB {
  switch (key) {
    case 'shadow': {
      const pb = new PB(16, 7);
      pb.ellipse(8, 3.5, 7.5, 3.2, C('#000000', 80));
      return pb;
    }
    case 'slash': {
      const pb = new PB(32, 32);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const dx = x + 0.5 - 16;
          const dy = y + 0.5 - 16;
          const r = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          if (a > -1.4 && a < 1.4 && r > 10 && r < 15 - Math.abs(a) * 2.2) pb.set(x, y, C(r > 12.5 ? '#ffffff' : '#cfe8ff', 230));
        }
      return pb;
    }
    case 'orb': {
      const pb = new PB(10, 10);
      pb.ellipse(5, 5, 4.6, 4.6, C('#5a8dff', 160));
      pb.ellipse(5, 5, 3, 3, C('#a8c8ff'));
      pb.ellipse(4.5, 4.5, 1.4, 1.4, C('#ffffff'));
      return pb;
    }
    case 'orb_red': {
      const pb = new PB(10, 10);
      pb.ellipse(5, 5, 4.6, 4.6, C('#ff4a4a', 160));
      pb.ellipse(5, 5, 3, 3, C('#ffa08a'));
      pb.ellipse(4.5, 4.5, 1.4, 1.4, C('#ffffff'));
      return pb;
    }
    case 'arrow': {
      const pb = new PB(14, 5);
      pb.rect(2, 2, 9, 1, C('#8a5c36'));
      pb.poly([[10, 0], [14, 2.5], [10, 5]], C('#c9ced6'));
      pb.rect(0, 1, 3, 1, C('#e8e0c8'));
      pb.rect(0, 3, 3, 1, C('#e8e0c8'));
      return pb;
    }
    case 'web': {
      const pb = new PB(10, 10);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI;
        pb.line(5 - Math.cos(a) * 4, 5 - Math.sin(a) * 4, 5 + Math.cos(a) * 4, 5 + Math.sin(a) * 4, C('#e8e8f0'));
      }
      pb.ellipse(5, 5, 2.5, 2.5, C('#c8c8d8', 180));
      return pb;
    }
    case 'spark': {
      const pb = new PB(4, 4);
      pb.rect(1, 0, 2, 4, C('#ffffff'));
      pb.rect(0, 1, 4, 2, C('#ffffff'));
      return pb;
    }
    case 'dot': {
      const pb = new PB(2, 2);
      pb.rect(0, 0, 2, 2, C('#ffffff'));
      return pb;
    }
    case 'ring': {
      const pb = new PB(64, 32);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 64; x++) {
          const d = Math.hypot((x + 0.5 - 32) / 32, (y + 0.5 - 16) / 16);
          if (d <= 1 && d > 0.88) pb.set(x, y, C('#ffffff'));
        }
      return pb;
    }
    case 'disk': {
      const pb = new PB(64, 32);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 64; x++) {
          const d = Math.hypot((x + 0.5 - 32) / 32, (y + 0.5 - 16) / 16);
          if (d <= 1) pb.set(x, y, C('#ffffff', d > 0.86 ? 230 : 90));
        }
      return pb;
    }
    case 'rune': {
      const pb = new PB(64, 32);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 64; x++) {
          const dx = (x + 0.5 - 32) / 32;
          const dy = (y + 0.5 - 16) / 16;
          const d = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          if ((d <= 1 && d > 0.9) || (d < 0.62 && d > 0.56) || (d < 0.9 && Math.abs(Math.sin(a * 3)) < 0.05)) pb.set(x, y, C('#ffffff'));
        }
      return pb;
    }
    case 'fire': {
      const pb = new PB(6, 8);
      pb.ellipse(3, 5, 2.8, 3, C('#e8722a'));
      pb.ellipse(3, 5.5, 1.6, 2, C('#ffd56a'));
      return pb;
    }
    case 'heal': {
      const pb = new PB(5, 5);
      pb.rect(2, 0, 1, 5, C('#7dff9a'));
      pb.rect(0, 2, 5, 1, C('#7dff9a'));
      return pb;
    }
    case 'leaf': {
      const pb = new PB(3, 2);
      pb.rect(0, 0, 2, 1, C('#7fbf55'));
      pb.set(1, 1, C('#4f8f32'));
      return pb;
    }
    case 'roots': {
      const pb = new PB(20, 18);
      for (let k = 0; k < 5; k++) {
        let x = 3 + k * 3.5;
        for (let y = 17; y > 4 + (k % 2) * 3; y--) {
          pb.set(Math.round(x), y, C(y < 8 ? '#6aa84a' : '#6b4528'));
          x += Math.sin(y * 0.8 + k) * 0.6;
        }
      }
      return pb;
    }
    case 'bubble': {
      const pb = new PB(28, 34);
      for (let y = 0; y < 34; y++)
        for (let x = 0; x < 28; x++) {
          const d = Math.hypot((x + 0.5 - 14) / 13.5, (y + 0.5 - 17) / 16.5);
          if (d <= 1) pb.set(x, y, C('#ffe9a0', d > 0.86 ? 220 : 50));
        }
      return pb;
    }
    case 'bomb': {
      const pb = new PB(7, 8);
      pb.ellipse(3.5, 4.5, 3, 3, C('#2a2a34'));
      pb.set(2, 3, C('#6a6a7a'));
      pb.rect(3, 0, 1, 2, C('#e8722a'));
      return pb;
    }
    case 'light': {
      // brilho radial suave (usado com mistura aditiva)
      const pb = new PB(48, 24);
      for (let y = 0; y < 24; y++)
        for (let x = 0; x < 48; x++) {
          const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 12) / 12);
          if (d < 1) pb.set(x, y, C('#ffffff', Math.round((1 - d) * (1 - d) * 255)));
        }
      return pb;
    }
    case 'shard': {
      const pb = new PB(8, 12);
      pb.poly([[4, 0], [7, 5], [4, 12], [1, 5]], (x) => C(x < 4 ? '#f0e0ff' : '#b48cff'));
      return pb;
    }
    default: {
      const pb = new PB(4, 4);
      pb.rect(0, 0, 4, 4, C('#ff00ff'));
      return pb;
    }
  }
}

/* ================================================================ fonte de números */

const GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  '!': ['010', '010', '010', '000', '010'],
  '?': ['111', '001', '011', '000', '010'],
  ' ': ['000', '000', '000', '000', '000'],
  X: ['101', '101', '010', '101', '101'],
  P: ['111', '101', '111', '100', '100'],
};
export const FONT_CHARS = '0123456789+-!? XP';

/** Fonte bitmap 3×5 com contorno (células 5×7), para números de dano. */
export function drawFont(): PB {
  const pb = new PB(5 * FONT_CHARS.length, 7);
  for (let i = 0; i < FONT_CHARS.length; i++) {
    const g = GLYPHS[FONT_CHARS[i]];
    const cell = new PB(5, 7);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (g[y][x] === '1') cell.set(x + 1, y + 1, C('#ffffff'));
    cell.outline(C('#1b1a24'), true);
    pb.blit(cell, i * 5, 0);
  }
  return pb;
}

