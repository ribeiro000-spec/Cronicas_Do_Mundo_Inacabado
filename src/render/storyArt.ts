/* Ilustrações da introdução, desenhadas em pixel art por código (240×135, exibidas
 * ampliadas). Cada cena aceita um tempo t para pequenas animações (estrelas, vaga-lumes,
 * fumaça, fragmentos flutuando). */

export const STORY_W = 240;
export const STORY_H = 135;

export type StoryScene = 'mundo' | 'costuras' | 'guerreiro' | 'maga' | 'arqueira' | 'clerigo' | 'eldenor';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export function hash(a: number, b = 0, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i, seed);
  const b = hash(i + 1, seed);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Desenho por pixels em um buffer próprio (rápido e nítido). */
export class Pix {
  data: Uint8ClampedArray;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: [number, number, number], a = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a >= 1) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
    } else {
      this.data[i] += (c[0] - this.data[i]) * a;
      this.data[i + 1] += (c[1] - this.data[i + 1]) * a;
      this.data[i + 2] += (c[2] - this.data[i + 2]) * a;
    }
    this.data[i + 3] = 255;
  }
  rect(x: number, y: number, w: number, h: number, c: [number, number, number], a = 1): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.set(xx, yy, c, a);
  }
  /** Gradiente vertical em faixas com pontilhado (dithering). */
  sky(stops: [number, string][], y0 = 0, y1 = this.h): void {
    const cols = stops.map(([t, c]) => [t, rgb(c)] as [number, [number, number, number]]);
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      let k = 0;
      while (k < cols.length - 2 && t > cols[k + 1][0]) k++;
      const [ta, ca] = cols[k];
      const [tb, cb] = cols[k + 1];
      const f = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
      for (let x = 0; x < this.w; x++) {
        const steps = 6;
        const q = Math.floor(f * steps + bayer(x, y)) / steps;
        this.set(x, y, [ca[0] + (cb[0] - ca[0]) * q, ca[1] + (cb[1] - ca[1]) * q, ca[2] + (cb[2] - ca[2]) * q]);
      }
    }
  }
  /** Relevo (montanhas/colinas): preenche abaixo de uma linha de ruído. */
  ridge(base: number, amp: number, freq: number, seed: number, color: string, x0 = 0, x1 = this.w): number[] {
    const c = rgb(color);
    const tops: number[] = [];
    for (let x = x0; x < x1; x++) {
      const n = noise1(x * freq, seed) * 0.65 + noise1(x * freq * 2.7, seed + 7) * 0.35;
      const top = Math.round(base - n * amp);
      tops[x] = top;
      for (let y = top; y < this.h; y++) this.set(x, y, c);
    }
    return tops;
  }
  disc(cx: number, cy: number, r: number, color: string, a = 1): void {
    const c = rgb(color);
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c, a);
  }
  /** Halo de luz pontilhado. */
  glow(cx: number, cy: number, r: number, color: string, strength = 0.5): void {
    const c = rgb(color);
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const a = (1 - d) ** 2 * strength;
        if (a > bayer(x, y) * 0.6) this.set(x, y, c, Math.min(1, a * 1.4));
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, color: string, a = 1): void {
    const c = rgb(color);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, a);
  }
  stars(n: number, seed: number, t: number, yMax: number): void {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(hash(i, seed) * this.w);
      const y = Math.floor(hash(i, seed + 1) * yMax);
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash(i, seed + 2) * 3) + i);
      this.set(x, y, [255, 250, 230], 0.35 + tw * 0.65);
      if (hash(i, seed + 3) > 0.9 && tw > 0.7) {
        this.set(x + 1, y, [255, 250, 230], 0.5);
        this.set(x - 1, y, [255, 250, 230], 0.5);
        this.set(x, y + 1, [255, 250, 230], 0.5);
        this.set(x, y - 1, [255, 250, 230], 0.5);
      }
    }
  }
  /** Árvore em silhueta (pinheiro ou copa redonda). */
  tree(x: number, ground: number, hgt: number, color: string, pine: boolean): void {
    const c = rgb(color);
    if (pine) {
      for (let y = 0; y < hgt; y++) {
        const w = Math.floor((y / hgt) * hgt * 0.38) + 1;
        for (let xx = -w; xx <= w; xx++) this.set(x + xx, ground - hgt + y, c);
      }
    } else {
      this.rect(x - 1, ground - hgt * 0.45, 2, hgt * 0.45, c);
      this.disc(x, ground - hgt * 0.62, hgt * 0.36, color);
      this.disc(x - hgt * 0.22, ground - hgt * 0.5, hgt * 0.26, color);
      this.disc(x + hgt * 0.22, ground - hgt * 0.5, hgt * 0.26, color);
    }
  }
  /** Casa em silhueta com janela acesa. */
  house(x: number, ground: number, w: number, hgt: number, wall: string, roof: string, lit: boolean): void {
    this.rect(x, ground - hgt, w, hgt, rgb(wall));
    const r = rgb(roof);
    const rh = Math.round(w * 0.5);
    for (let i = 0; i < rh; i++) this.rect(x - 2 + i, ground - hgt - i, w + 4 - i * 2, 1, r);
    if (lit) {
      this.rect(x + Math.round(w * 0.25), ground - hgt * 0.65, 3, 3, rgb('#ffd27a'));
      this.glow(x + Math.round(w * 0.25) + 1, ground - hgt * 0.65 + 1, 6, '#ffb84a', 0.35);
    }
    this.rect(x + Math.round(w * 0.62), ground - Math.round(hgt * 0.55), 3, Math.round(hgt * 0.55), rgb('#1a1220'));
  }
  /** Figura humana em silhueta. */
  figure(x: number, ground: number, color: string, a = 1): void {
    const c = rgb(color);
    this.rect(x - 1, ground - 12, 3, 3, c, a);
    this.rect(x - 2, ground - 9, 5, 5, c, a);
    this.rect(x - 2, ground - 4, 2, 4, c, a);
    this.rect(x + 1, ground - 4, 2, 4, c, a);
  }
  put(ctx: CanvasRenderingContext2D): void {
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
  }
}

function sceneMundo(p: Pix, t: number): void {
  const W = p.w;
  const H = p.h;
  p.sky([[0, '#16142e'], [0.35, '#35295a'], [0.62, '#8a4a6a'], [0.8, '#e8955a'], [1, '#ffd08a']], 0, 96);
  p.stars(50, 3, t, 50);
  p.disc(92, 92, 17, '#ffd27a');
  p.glow(92, 92, 40, '#ffb060', 0.45);
  p.ridge(86, 26, 0.035, 11, '#5a3f70');
  p.ridge(98, 18, 0.05, 23, '#3a2a52');
  const near = p.ridge(112, 12, 0.07, 31, '#211a36');
  // castelo distante numa colina
  const cx = 52;
  const g = near[cx] ?? 104;
  p.rect(cx - 8, g - 16, 16, 16, rgb('#211a36'));
  p.rect(cx - 12, g - 22, 5, 22, rgb('#211a36'));
  p.rect(cx + 7, g - 26, 5, 26, rgb('#211a36'));
  for (let i = 0; i < 4; i++) p.rect(cx - 12 + i * 6, g - 25 - (i % 2) * 3, 2, 3, rgb('#211a36'));
  p.rect(cx + 8, g - 20, 2, 2, rgb('#ffd27a'));
  p.sky([[0, '#1d2a22'], [1, '#0f1712']], 118, H);
  // a borda do mundo: depois de um rasgo, só pergaminho e esboços
  const paper = rgb('#e8dcb5');
  const gridC = rgb('#cbbd94');
  const sketch = '#8a7a5a';
  for (let y = 0; y < H; y++) {
    const edge = 168 + noise1(y * 0.12, 5) * 18 - y * 0.12;
    for (let x = Math.floor(edge); x < W; x++) {
      const d = x - edge;
      if (d < 3 && bayer(x, y) > d / 3) continue;
      const isGrid = x % 10 === 0 || y % 10 === 0;
      p.set(x, y, isGrid ? gridC : paper);
    }
    // sombra do rasgo
    p.set(Math.floor(edge) - 1, y, rgb('#2a1a10'), 0.6);
  }
  // esboços das montanhas continuando no papel
  for (let x = 160; x < W; x++) {
    const n = noise1(x * 0.035, 11) * 0.65 + noise1(x * 0.035 * 2.7, 18) * 0.35;
    const y = Math.round(86 - n * 26);
    const edge = 168 + noise1(y * 0.12, 5) * 18 - y * 0.12;
    if (x > edge + 2 && x % 2 === 0) p.set(x, y, rgb(sketch));
    const n2 = noise1(x * 0.07, 31);
    const y2 = Math.round(112 - n2 * 12);
    const e2 = 168 + noise1(y2 * 0.12, 5) * 18 - y2 * 0.12;
    if (x > e2 + 2 && x % 3 !== 0) p.set(x, y2, rgb(sketch));
  }
  // fragmentos soltos flutuando
  const cols = ['#5a3f70', '#ffd27a', '#3a2a52', '#8a4a6a', '#1d2a22'];
  for (let i = 0; i < 16; i++) {
    const baseY = hash(i, 9) * H;
    const sp = 2 + hash(i, 10) * 5;
    const x = 168 + ((hash(i, 11) * 40 + t * sp) % 70);
    const y = baseY - Math.sin(t * 0.8 + i) * 3 - ((t * sp * 0.3) % 20);
    const s = 1 + Math.floor(hash(i, 12) * 3);
    p.rect(x, y, s, s, rgb(cols[i % cols.length]), 1 - (x - 168) / 75);
  }
  // pena escrevendo
  const qx = 222;
  const qy = 26 + Math.sin(t * 2) * 2;
  p.line(qx, qy, qx - 12, qy + 18, '#5a4630');
  for (let i = 0; i < 8; i++) p.line(qx - i * 0.6, qy + i * 1.2, qx + 6 - i * 0.9, qy - 4 + i * 1.6, '#f8f2e0');
}

function sceneCosturas(p: Pix, t: number): void {
  const W = p.w;
  const H = p.h;
  p.sky([[0, '#070a18'], [0.7, '#1a2046'], [1, '#2c2a58']], 0, 70);
  p.stars(70, 7, t, 64);
  p.ridge(70, 10, 0.06, 41, '#141a30');
  for (let i = 0; i < 26; i++) p.tree(i * 10 + (i % 3) * 3, 74, 10 + (i % 4) * 3, '#0e1424', true);
  p.sky([[0, '#18241e'], [1, '#0c1410']], 70, H);
  // estrada até o horizonte, cortada por uma costura que desloca o caminho
  const road = rgb('#6b5a44');
  const roadL = rgb('#8a7658');
  for (let y = 72; y < H; y++) {
    const k = (y - 72) / (H - 72);
    const w = 3 + k * 46;
    const shift = y < 96 ? 26 : 0;
    const cx = 120 + Math.sin(k * 3) * 10 + shift;
    for (let x = Math.floor(cx - w / 2); x < cx + w / 2; x++) p.set(x, y, Math.abs(x - cx) > w / 2 - 2 ? roadL : road);
  }
  // a costura brilhante
  const pulse = 0.6 + 0.4 * Math.sin(t * 3);
  for (let x = 0; x < W; x++) {
    const y = 96 + Math.round(Math.sin(x * 0.08) * 3 + (x - 120) * 0.04);
    p.set(x, y, rgb('#e0ccff'));
    p.set(x, y - 1, rgb('#b48cff'), 0.8);
    p.set(x, y + 1, rgb('#7a4ad0'), 0.6);
    if (x % 6 === 0) {
      p.line(x - 2, y - 3, x + 2, y + 3, '#e0ccff', 0.8);
    }
  }
  for (let x = 0; x < W; x += 3) {
    const y = 96 + Math.round(Math.sin(x * 0.08) * 3 + (x - 120) * 0.04);
    p.glow(x, y, 7, '#b48cff', 0.18 * pulse);
  }
  // ecos: a mesma figura repetida, cada vez mais apagada
  for (let i = 0; i < 4; i++) {
    const x = 150 + i * 14;
    const a = (0.85 - i * 0.2) * (0.7 + 0.3 * Math.sin(t * 2 + i));
    p.figure(x, 92 - i, '#7cf0ff', a);
    p.glow(x, 86 - i, 8, '#7cf0ff', 0.12 * a);
  }
  p.figure(84, 124, '#0a0a12');
}

function backdropGuerreiro(p: Pix, t: number): void {
  p.sky([[0, '#2a1f3a'], [0.6, '#a0524a'], [1, '#f0a050']], 0, 92);
  p.disc(190, 80, 14, '#ffcf7a');
  p.ridge(92, 14, 0.05, 51, '#4a2f3a');
  p.sky([[0, '#4a3a2a'], [1, '#241a14']], 92, p.h);
  // estrada e carroça quebrada
  for (let y = 92; y < p.h; y++) {
    const k = (y - 92) / (p.h - 92);
    const w = 6 + k * 60;
    p.rect(170 - k * 60 - w / 2, y, w, 1, rgb('#7a6448'));
  }
  const wx = 40;
  const gy = 112;
  p.rect(wx, gy - 14, 34, 9, rgb('#3a2414'));
  p.line(wx, gy - 14, wx - 8, gy - 26, '#3a2414');
  p.line(wx + 34, gy - 14, wx + 40, gy - 24, '#3a2414');
  p.disc(wx + 6, gy - 4, 5, '#2a1a10');
  p.disc(wx + 6, gy - 4, 3, '#4a3424');
  p.rect(wx + 26, gy - 6, 9, 3, rgb('#2a1a10'));
  // fogueira
  const fx = 200;
  const fy = 118;
  p.glow(fx, fy - 4, 18, '#ff9a40', 0.5);
  for (let i = 0; i < 6; i++) {
    const h = 4 + ((Math.sin(t * 8 + i) + 1) * 3) | 0;
    p.rect(fx - 3 + i, fy - h, 1, h, rgb(i % 2 ? '#ffd27a' : '#ff7a2a'));
  }
}

function backdropMaga(p: Pix, t: number): void {
  p.sky([[0, '#0c1030'], [0.7, '#22306a'], [1, '#3a4a8a']], 0, 100);
  p.stars(60, 13, t, 70);
  p.ridge(100, 8, 0.05, 61, '#141c3a');
  // torres da Academia de Lúmen
  const towers: [number, number, number][] = [[30, 70, 12], [56, 50, 14], [190, 60, 13], [214, 82, 10]];
  for (const [x, top, w] of towers) {
    p.rect(x, top, w, 110 - top, rgb('#1a2246'));
    for (let i = 0; i < w / 2 + 2; i++) p.rect(x - 1 + i, top - i, w + 2 - i * 2, 1, rgb('#2a3466'));
    for (let wy = top + 8; wy < 100; wy += 10) {
      p.rect(x + Math.floor(w / 2) - 1, wy, 2, 3, rgb('#9ad0ff'));
      p.glow(x + w / 2, wy + 1, 5, '#7aa8ff', 0.25);
    }
  }
  p.sky([[0, '#1a1e3a'], [1, '#0c0e1e']], 108, p.h);
  // runas flutuantes
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 25 + Math.sin(t + i) * 4;
    const y = 30 + hash(i, 5) * 40 + Math.cos(t * 0.8 + i) * 4;
    p.glow(x, y, 6, '#b48cff', 0.35);
    p.rect(x - 1, y - 2, 3, 1, rgb('#e0ccff'));
    p.rect(x, y - 2, 1, 5, rgb('#e0ccff'));
  }
}

function backdropArqueira(p: Pix, t: number): void {
  p.sky([[0, '#1a3040'], [0.6, '#6a9a8a'], [1, '#e8d8a0']], 0, 100);
  for (let i = 0; i < 14; i++) p.tree(i * 19 - 4, 104, 50 + (i % 3) * 12, '#2a4a3a', i % 2 === 0);
  for (let i = 0; i < 10; i++) p.tree(i * 27 + 8, 112, 70 + (i % 2) * 14, '#16281e', false);
  // troncos altos em primeiro plano
  for (const x of [12, 228]) p.rect(x - 5, 0, 10, p.h, rgb('#0e1a12'));
  p.sky([[0, '#1e3022'], [1, '#0c140e']], 112, p.h);
  // sinos parados, pendurados nos galhos
  for (const [x, y] of [[60, 34], [160, 28], [118, 46]] as [number, number][]) {
    p.line(x, 0, x, y, '#5a4a30');
    p.disc(x, y + 3, 3, '#c8a957');
    p.rect(x - 3, y + 5, 7, 1, rgb('#8a6a2a'));
    p.glow(x, y + 3, 6, '#ffe08a', 0.18);
  }
  // névoa da manhã
  for (let x = 0; x < p.w; x++) {
    const y = 104 + Math.round(Math.sin(x * 0.05 + t * 0.5) * 2);
    for (let k = 0; k < 6; k++) if (bayer(x, y + k) < 0.5 - k * 0.07) p.set(x, y + k, [220, 235, 225], 0.35);
  }
}

function backdropClerigo(p: Pix, t: number): void {
  p.sky([[0, '#2a2a4a'], [0.5, '#c88a6a'], [1, '#ffe0a0']], 0, 100);
  p.glow(120, 100, 60, '#fff0c0', 0.4);
  p.ridge(100, 12, 0.04, 71, '#6a5a6a');
  p.sky([[0, '#6a7a4a'], [1, '#2a3420']], 100, p.h);
  // o Último Marco: obelisco com luz
  const x = 176;
  for (let y = 40; y < 108; y++) {
    const w = 4 + Math.floor((y - 40) * 0.09);
    p.rect(x - w, y, w * 2, 1, rgb(y < 48 ? '#d8d0c0' : '#8a8478'));
    p.set(x - w, y, rgb('#5a5448'));
  }
  p.rect(x - 10, 106, 20, 4, rgb('#5a5448'));
  const beam = 0.5 + 0.5 * Math.sin(t * 1.5);
  for (let y = 0; y < 42; y++) p.rect(x - 1, y, 3, 1, rgb('#fff6d8'), 0.25 + beam * 0.35 * (y / 42));
  p.glow(x, 40, 14, '#fff0b0', 0.5);
  // runas do juramento
  for (let i = 0; i < 4; i++) p.rect(x - 1, 58 + i * 11, 2, 5, rgb('#ffe08a'));
}

function sceneEldenor(p: Pix, t: number): void {
  p.sky([[0, '#1c1a3a'], [0.5, '#5a3a6a'], [0.85, '#e0805a'], [1, '#ffc87a']], 0, 92);
  p.stars(30, 17, t, 36);
  p.ridge(88, 14, 0.04, 81, '#3a2c4a');
  p.ridge(98, 8, 0.07, 83, '#2a2238');
  p.sky([[0, '#2c3a26'], [1, '#141c12']], 98, p.h);
  // casas
  const houses: [number, number, number, string][] = [
    [22, 22, 16, '#7a2f2f'], [52, 26, 20, '#2f4a7a'], [84, 20, 14, '#7a4a2a'], [140, 24, 18, '#2f6a4a'], [172, 28, 22, '#7a2f2f'], [208, 20, 15, '#4a3a6a'],
  ];
  for (const [x, w, hh, roof] of houses) {
    p.house(x, 104, w, hh, '#3a2e2a', roof, true);
    // fumaça da chaminé
    for (let i = 0; i < 5; i++) {
      const sy = 104 - hh - w * 0.4 - i * 4 - ((t * 6) % 4);
      p.set(x + w - 5 + Math.sin(t + i) * 1.5, sy, [200, 196, 210], 0.5 - i * 0.08);
    }
  }
  // estrada até a vila
  for (let y = 104; y < p.h; y++) {
    const k = (y - 104) / (p.h - 104);
    const w = 10 + k * 50;
    p.rect(120 - w / 2, y, w, 1, rgb('#7a6448'));
  }
  // postes de luz
  for (const x of [100, 146]) {
    p.rect(x, 96, 1, 12, rgb('#1a1410'));
    p.rect(x - 1, 95, 3, 2, rgb('#ffd27a'));
    p.glow(x, 96, 10, '#ffb84a', 0.4);
  }
  // vaga-lumes
  for (let i = 0; i < 12; i++) {
    const x = (hash(i, 21) * p.w + Math.sin(t * 0.7 + i) * 6) % p.w;
    const y = 100 + hash(i, 22) * 30 + Math.cos(t + i * 2) * 3;
    const a = 0.5 + 0.5 * Math.sin(t * 3 + i);
    p.set(x, y, [216, 255, 122], a);
  }
}

const BACKDROPS: Record<string, (p: Pix, t: number) => void> = {
  guerreiro: backdropGuerreiro,
  maga: backdropMaga,
  arqueira: backdropArqueira,
  clerigo: backdropClerigo,
};

/** Desenha uma cena no canvas (240×135). `figure` é o personagem por cima do cenário. */
export function drawStoryScene(ctx: CanvasRenderingContext2D, scene: StoryScene, t: number, figure?: HTMLCanvasElement | null): void {
  const p = new Pix(STORY_W, STORY_H);
  if (scene === 'mundo') sceneMundo(p, t);
  else if (scene === 'costuras') sceneCosturas(p, t);
  else if (scene === 'eldenor') sceneEldenor(p, t);
  else (BACKDROPS[scene] ?? backdropGuerreiro)(p, t);
  p.put(ctx);
  if (figure && scene !== 'mundo' && scene !== 'costuras' && scene !== 'eldenor') {
    ctx.imageSmoothingEnabled = false;
    // sombra no chão e o personagem
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(120, 126, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(figure, Math.round(120 - figure.width / 2), Math.round(127 - 66 * (figure.height / 76)));
  }
}
