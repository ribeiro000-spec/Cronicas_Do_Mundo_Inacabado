import { C, PB, dither, hash, ints, noise2, ramp, selout, shadeInt } from './paint';

/* Criaturas esculpidas com formas orgânicas (elipses e “cápsulas” afinando), vistas de
 * lado em 3/4, olhando para a direita (espelhadas para a esquerda).
 * Quadros: 0 parado · 1-4 andando · 5 ataque (lobo, javali, aranha).
 * O slime tem 0 parado + 1-4 pulinhos; a sentinela tem 3 quadros flutuando. */

type Pal = number[];

const palCache = new Map<string, Pal>();
function pal(hex: string, n = 6, spread = 0.5): Pal {
  const k = `${hex}|${n}|${spread}`;
  let p = palCache.get(k);
  if (!p) {
    p = ints(ramp(hex, n, spread, 18));
    palCache.set(k, p);
  }
  return p;
}

/** Elipse com volume (luz do alto à esquerda). */
function ell(pb: PB, cx: number, cy: number, rx: number, ry: number, p: Pal, light = 0.58, rot = 0): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const R = Math.max(rx, ry) + 1;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      const dx = (px * c + py * s) / rx;
      const dy = (-px * s + py * c) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      // normal aproximada no espaço da tela
      const nx = (px / Math.max(rx, ry)) * 1.1;
      const ny = (py / Math.max(rx, ry)) * 1.1;
      const v = light - nx * 0.32 - ny * 0.36 + (1 - d) * 0.08;
      pb.set(x, y, dither(v, x, y, p));
    }
}

/** Cápsula afinando (membros, pescoço, focinho, cauda). */
function cap(pb: PB, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, p: Pal, light = 0.58): void {
  const minX = Math.floor(Math.min(x0 - r0, x1 - r1)) - 1;
  const maxX = Math.ceil(Math.max(x0 + r0, x1 + r1)) + 1;
  const minY = Math.floor(Math.min(y0 - r0, y1 - r1)) - 1;
  const maxY = Math.ceil(Math.max(y0 + r0, y1 + r1)) + 1;
  const vx = x1 - x0;
  const vy = y1 - y0;
  const L2 = vx * vx + vy * vy || 1;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / L2));
      const cx = x0 + vx * t;
      const cy = y0 + vy * t;
      const r = r0 + (r1 - r0) * t;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const v = light - (dx / r) * 0.3 - (dy / r) * 0.32;
      pb.set(x, y, dither(v, x, y, p));
    }
}

/** Corrente de cápsulas por uma lista de pontos [x, y, raio]. */
function chain(pb: PB, pts: [number, number, number][], p: Pal, light = 0.58): void {
  for (let i = 0; i + 1 < pts.length; i++) cap(pb, pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], p, light);
}

function tri(pb: PB, pts: [number, number][], p: Pal, light: number): void {
  pb.poly(pts, (x, y) => dither(light - (y - pts[1][1]) * 0.015, x, y, p));
}

/** Pelagem: tracinhos claros e escuros dentro da área já pintada. */
function fur(pb: PB, x0: number, y0: number, x1: number, y1: number, p: Pal, seed: number, n = 60): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(x0 + hash(i, seed, 1) * (x1 - x0));
    const y = Math.floor(y0 + hash(i, seed, 2) * (y1 - y0));
    if (pb.alpha(x, y) === 0 || pb.alpha(x + 1, y + 1) === 0) continue;
    const dark = hash(i, seed, 3) > 0.45;
    pb.set(x, y, dark ? p[1] : p[4]);
    pb.set(x + 1, y + 1, dark ? p[1] : p[4]);
  }
}

function translucent(pb: PB, a = 210): void {
  for (let i = 0; i < pb.data.length; i++) {
    const c = pb.data[i];
    if (c >>> 24) pb.data[i] = ((c & 0x00ffffff) | (a << 24)) >>> 0;
  }
}

/* ---------------------------------------------------------------- passada */

/** Deslocamento e elevação de cada pata no quadro (0 parado, 1-4 andando, 5 ataque). */
function gait(frame: number, phase: number, amp: number): { dx: number; lift: number } {
  if (frame === 0) return { dx: 0, lift: 0 };
  if (frame === 5) return { dx: phase === 0 || phase === 1 ? amp : -amp * 0.5, lift: 0 };
  const a = ((frame - 1) / 4) * Math.PI * 2 + phase * Math.PI;
  return { dx: Math.sin(a) * amp, lift: Math.max(0, Math.cos(a)) * 2.5 };
}

/* ---------------------------------------------------------------- lobo */

export function drawWolf(color: string, frame: number, spirit = false): PB {
  const pb = new PB(76, 50);
  const p = pal(color, 6, 0.5);
  const dark = pal(ramp(color, 3, 0.55, 12)[0], 5, 0.4);
  const belly = pal(ramp(color, 3, 0.45, 10)[2], 5, 0.35);
  const atk = frame === 5;
  const bob = frame === 2 || frame === 4 ? -1 : 0;
  const G = 45; // chão
  // patas: [ombro/quadril x, y, fase, de trás?]
  const legs: { x: number; y: number; ph: number; far: boolean; hind: boolean }[] = [
    { x: 49, y: 29, ph: 1, far: true, hind: false },
    { x: 25, y: 28, ph: 0, far: true, hind: true },
    { x: 45, y: 30, ph: 0, far: false, hind: false },
    { x: 21, y: 29, ph: 1, far: false, hind: true },
  ];
  const drawLeg = (l: (typeof legs)[number]) => {
    const g = gait(frame, l.ph, 4);
    const lp = l.far ? dark : p;
    const light = l.far ? 0.42 : 0.6;
    const fx = l.x + (l.far ? 3 : 0) + g.dx;
    const fy = G - g.lift - (l.far ? 1 : 0);
    const sy = l.y + bob - (l.far ? 1 : 0);
    const sx = l.x + (l.far ? 3 : 0);
    if (l.hind) {
      // coxa grossa, jarrete para trás, canela fina
      chain(pb, [[sx, sy, 4.5], [sx + 2 + g.dx * 0.3, sy + 6, 3], [sx - 2 + g.dx * 0.7, sy + 11, 1.8], [fx, fy - 2, 1.6]], lp, light);
    } else {
      chain(pb, [[sx, sy, 3.6], [sx + 1 + g.dx * 0.5, sy + 8, 2], [fx + 1, fy - 2, 1.7]], lp, light);
    }
    ell(pb, fx + 1.5, fy - 1, 2.6, 1.6, lp, light - 0.05);
  };
  // patas de trás (lado longe)
  legs.filter((l) => l.far).forEach(drawLeg);
  // cauda espessa
  const tailSwing = frame === 0 ? 0 : Math.sin((frame / 4) * Math.PI * 2) * 2;
  chain(pb, [[16, 23 + bob, 3.5], [10, 25 + bob + tailSwing * 0.5, 4], [5, 30 + bob + tailSwing, 3], [3, 35 + bob + tailSwing, 1.5]], p, 0.52);
  // corpo: quadril, cintura, peito fundo
  ell(pb, 22, 25 + bob, 8.5, 7.5, p, 0.6);
  ell(pb, 33, 25 + bob, 10, 6.5, p, 0.62);
  ell(pb, 44, 25 + bob, 10, 8.5, p, 0.64);
  // barriga mais clara
  ell(pb, 38, 30 + bob, 9, 2.6, belly, 0.55);
  fur(pb, 14, 18 + bob, 54, 32 + bob, p, 7, 70);
  // linha do dorso escura
  for (let x = 16; x < 50; x++) {
    let y = 17;
    while (y < 35 && pb.alpha(x, y) === 0) y++;
    if (y < 35) pb.set(x, y + 1, p[1]);
  }
  // patas do lado de cá
  legs.filter((l) => !l.far).forEach(drawLeg);
  // pescoço e cabeça (abaixa no ataque)
  const hdx = atk ? 4 : 0;
  const hdy = atk ? 5 : 0;
  cap(pb, 46, 22 + bob, 6.5, 53 + hdx, 16 + bob + hdy, 5, p, 0.64);
  // juba
  fur(pb, 44, 12 + bob, 56, 26 + bob, p, 11, 26);
  const hx = 57 + hdx;
  const hy = 15 + bob + hdy;
  // orelhas (a de lá primeiro)
  tri(pb, [[hx, hy - 3], [hx + 3, hy - 11], [hx + 5, hy - 3]], dark, 0.45);
  tri(pb, [[hx - 4, hy - 3], [hx - 2, hy - 12], [hx + 1.5, hy - 3]], p, 0.62);
  ell(pb, hx, hy, 6, 5.2, p, 0.66);
  // focinho comprido e mandíbula (abre no ataque)
  cap(pb, hx + 3, hy + 1, 3.8, hx + 11, hy + 3, 2.2, p, 0.66);
  if (atk) {
    cap(pb, hx + 2, hy + 5, 2.4, hx + 9, hy + 9, 1.4, dark, 0.45);
    for (let x = hx + 4; x < hx + 10; x += 2) pb.set(x, hy + 5, C('#ffffff'));
  } else cap(pb, hx + 2, hy + 4, 2.4, hx + 9, hy + 5, 1.4, belly, 0.5);
  pb.rect(hx + 11, hy + 2, 2, 2, C('#1b1a24')); // nariz
  // olho
  const eye = C(spirit ? '#ffffff' : '#ffd23a');
  pb.rect(hx + 2, hy - 1, 2, 2, eye);
  pb.set(hx + 3, hy, C('#1b1a24'));
  pb.set(hx + 1, hy - 2, p[1]); // sobrancelha
  if (spirit) {
    // brilho de energia no contorno do dorso e fiapos sobre os ombros
    const glow = pal(color, 6, 0.35);
    for (let x = 14; x < 62; x++) {
      let y = 4;
      while (y < 34 && pb.alpha(x, y) === 0) y++;
      if (y < 34) {
        pb.set(x, y, glow[5]);
        if (x % 2 === 0) pb.set(x, y + 1, glow[4]);
      }
    }
    for (const [x, h] of [[40, 4], [46, 5], [34, 3]] as [number, number][]) {
      let y = 10;
      while (y < 30 && pb.alpha(x, y) === 0) y++;
      for (let i = 1; i <= h; i++) pb.set(x - Math.round(i * 0.6), y - i, glow[i > h - 2 ? 3 : 5]);
    }
  }
  selout(pb, -0.7);
  if (spirit) translucent(pb);
  return pb;
}

/* ---------------------------------------------------------------- javali */

export function drawBoar(color: string, frame: number): PB {
  const pb = new PB(76, 50);
  const p = pal(color, 6, 0.5);
  const dark = pal(ramp(color, 3, 0.55, 12)[0], 5, 0.4);
  const hoof = pal('#2a2220', 4, 0.3);
  const atk = frame === 5;
  const bob = frame === 2 || frame === 4 ? -1 : 0;
  const G = 45;
  const legs: { x: number; ph: number; far: boolean }[] = [
    { x: 49, ph: 1, far: true },
    { x: 23, ph: 0, far: true },
    { x: 45, ph: 0, far: false },
    { x: 19, ph: 1, far: false },
  ];
  const leg = (l: (typeof legs)[number]) => {
    const g = gait(frame, l.ph, 3);
    const lp = l.far ? dark : p;
    const light = l.far ? 0.4 : 0.58;
    const x = l.x + (l.far ? 3 : 0);
    const fy = G - g.lift - (l.far ? 1 : 0);
    chain(pb, [[x, 32 + bob - (l.far ? 1 : 0), 3.8], [x + g.dx * 0.6, 38 + bob, 2.4], [x + g.dx, fy - 2, 2]], lp, light);
    ell(pb, x + g.dx + 0.5, fy - 1, 2.4, 1.5, hoof, 0.4);
  };
  legs.filter((l) => l.far).forEach(leg);
  // rabinho enrolado
  chain(pb, [[13, 25 + bob, 1.4], [10, 23 + bob, 1.2], [9, 26 + bob, 1]], p, 0.45);
  // corpo em barril com corcova alta nos ombros
  ell(pb, 30, 28 + bob, 17, 11, p, 0.6);
  ell(pb, 44, 25 + bob, 11, 11.5, p, 0.64);
  ell(pb, 34, 35 + bob, 13, 3, dark, 0.5);
  fur(pb, 14, 16 + bob, 56, 38 + bob, p, 21, 90);
  // crina de cerdas no dorso
  for (let x = 18; x < 52; x += 3) {
    let y = 12;
    while (y < 36 && pb.alpha(x, y) === 0) y++;
    if (y >= 36) continue;
    const h = 2 + (x > 34 && x < 48 ? 2 : 0) + (x % 2 ? 0 : 1);
    cap(pb, x, y + 1, 0.8, x - 2, y - h, 0.4, dark, 0.45);
  }
  legs.filter((l) => !l.far).forEach(leg);
  // cabeça em cunha, abaixada no ataque
  const hdy = atk ? 3 : 0;
  const hdx = atk ? 3 : 0;
  const hx = 57 + hdx;
  const hy = 27 + bob + hdy;
  tri(pb, [[hx - 5, hy - 6], [hx - 3, hy - 13], [hx, hy - 6]], dark, 0.45); // orelha
  ell(pb, hx, hy, 8, 7.5, p, 0.64);
  cap(pb, hx + 4, hy + 2, 5, hx + 11, hy + 3, 4, p, 0.62);
  // disco do focinho
  ell(pb, hx + 12, hy + 3, 2.2, 3.4, pal(ramp(color, 3, 0.35, 8)[2], 4, 0.3), 0.7);
  pb.set(hx + 12, hy + 2, C('#2a1a14'));
  pb.set(hx + 12, hy + 5, C('#2a1a14'));
  // presas curvas
  const tusk = C('#f4ecd4');
  for (let i = 0; i < 6; i++) {
    pb.set(hx + 7 + i * 0.5, hy + 6 - i, tusk);
    pb.set(hx + 8 + i * 0.5, hy + 6 - i, shadeInt(tusk, -0.15));
  }
  // olho bravo
  pb.rect(hx + 1, hy - 3, 2, 2, C('#1b1a24'));
  pb.set(hx + 1, hy - 3, C(atk ? '#ff6a4a' : '#ffb07a'));
  for (let i = 0; i < 4; i++) pb.set(hx - 1 + i, hy - 5 + (i > 1 ? 1 : 0), dark[0]);
  selout(pb, -0.7);
  return pb;
}

/* ---------------------------------------------------------------- aranha */

export function drawSpider(color: string, frame: number): PB {
  const pb = new PB(68, 46);
  const p = pal(color, 6, 0.5);
  const legP = pal(ramp(color, 3, 0.5, 10)[0], 5, 0.4);
  const atk = frame === 5;
  const G = 41;
  // 4 pares de patas em leque: as de trás alcançam para trás, as da frente para a frente
  const footX = [6, 20, 48, 62];
  const kneeX = [14, 25, 43, 54];
  const legPair = (far: boolean) => {
    for (let i = 0; i < 4; i++) {
      const ph = (i + (far ? 1 : 0)) % 2;
      const g = gait(frame, ph, 2.5);
      const bx = 35 + i * 1.5 + (far ? 1 : 0);
      const by = far ? 23 : 26;
      const reach = i === 3 && atk;
      const kx = kneeX[i] + (far ? 2 : 0) + g.dx * 0.5;
      const ky = (far ? 9 : 13) - g.lift + (reach ? -4 : 0);
      const fx = footX[i] + (far ? 3 : 0) + g.dx + (reach ? 4 : 0);
      const fy = G - g.lift - (far ? 4 : 0) - (reach ? 12 : 0);
      chain(pb, [[bx, by, 1.5], [kx, ky, 1.2], [fx, fy, 0.7]], legP, far ? 0.32 : 0.58);
      pb.set(Math.round(kx), Math.round(ky) - 1, legP[far ? 2 : 4]);
    }
  };
  legPair(true);
  // abdômen grande atrás, com desenho
  const ab = atk ? -1 : frame === 2 || frame === 4 ? 1 : 0;
  ell(pb, 21, 22 + ab, 13, 10.5, p, 0.6);
  for (const [x, y, w] of [[15, 16, 3], [20, 14, 4], [25, 16, 3], [18, 22, 3], [24, 22, 3]] as [number, number, number][]) {
    for (let i = 0; i < w; i++) pb.set(x + i, y + ab, C('#c84a3a'));
    pb.set(x + 1, y + 1 + ab, C('#8a2a2a'));
  }
  fur(pb, 10, 13 + ab, 33, 31 + ab, p, 31, 30);
  // cefalotórax e cabeça
  ell(pb, 37, 25, 8, 6.5, p, 0.58);
  ell(pb, 44, 25 + (atk ? -1 : 0), 5, 4.5, p, 0.62);
  // olhos vermelhos agrupados
  for (const [x, y] of [[45, 22], [47, 23], [45, 24], [48, 21], [43, 21]] as [number, number][]) pb.rect(x, y + (atk ? -1 : 0), 2, 1, C('#ff4a4a'));
  // quelíceras
  const fang = C('#e8dcc8');
  pb.set(48, 28 + (atk ? 1 : 0), fang);
  pb.set(49, 29 + (atk ? 2 : 0), fang);
  pb.set(46, 29 + (atk ? 1 : 0), fang);
  legPair(false);
  selout(pb, -0.7);
  return pb;
}

/* ---------------------------------------------------------------- slime */

export function drawSlime(color: string, frame: number): PB {
  const pb = new PB(46, 40);
  const p = pal(color, 6, 0.5);
  // 0 parado · 1 agachado · 2 esticado no ar · 3 caindo · 4 achatado
  const shapes: [number, number, number][] = [
    [16, 14, 0],
    [19, 11, 0],
    [13, 17, -5],
    [15, 15, -3],
    [20, 10, 0],
  ];
  const [rx, ry, lift] = shapes[frame] ?? shapes[0];
  const cy = 37 - ry + lift;
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 46; x++) {
      const dx = (x + 0.5 - 23) / rx;
      const dy = (y + 0.5 - cy) / ry;
      // base achatada
      if (dx * dx + dy * dy > 1 || y > 37 + lift) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      let v = 0.58 - dx * 0.25 - dy * 0.28 + (d > 0.86 ? -0.12 : 0);
      if (dy > 0.6) v -= 0.16;
      pb.set(x, y, dither(v, x, y, p));
    }
  // bolhas internas e núcleo
  for (const [x, y, r] of [[29, cy + 3, 2], [17, cy + 6, 1.4], [25, cy + 8, 1.1]] as [number, number, number][]) ell(pb, x, y, r, r, p, 0.88);
  // brilho
  ell(pb, 16, cy - ry * 0.45, 3.6, 2.2, pal('#ffffff', 3, 0.1), 0.95);
  pb.set(21, Math.round(cy - ry * 0.7), C('#ffffff'));
  // olhos e boca fofos
  const ey = Math.round(cy - 2);
  for (const ex of [18, 27]) {
    pb.rect(ex, ey, 3, 4, C('#1b1a24'));
    pb.set(ex + 1, ey, C('#ffffff'));
    pb.set(ex, ey + 1, C('#ffffff'));
  }
  pb.rect(22, ey + 5, 3, 1, C('#1b1a24'));
  pb.set(21, ey + 4, C('#1b1a24'));
  pb.set(25, ey + 4, C('#1b1a24'));
  pb.set(15, ey + 4, shadeInt(p[4], 0.3));
  pb.set(32, ey + 4, shadeInt(p[4], 0.2));
  selout(pb, -0.65);
  // um pouco translúcido nas bordas
  for (let i = 0; i < pb.data.length; i++) {
    const c = pb.data[i];
    if (c >>> 24 && noise2((i % 46) * 0.3, Math.floor(i / 46) * 0.3, 5) > 0.92) pb.data[i] = ((c & 0x00ffffff) | (225 << 24)) >>> 0;
  }
  return pb;
}

/* ---------------------------------------------------------------- sentinela astral */

export function drawTotem(color: string, frame: number): PB {
  const pb = new PB(36, 60);
  const stone = pal('#8a8478', 6, 0.5);
  const gem = pal(color, 6, 0.5);
  // pedra rúnica
  for (let y = 44; y < 58; y++)
    for (let x = 6; x < 30; x++) {
      const dx = (x + 0.5 - 18) / 12;
      const dy = (y + 0.5 - 51) / 6.5;
      if (dx * dx + dy * dy > 1) continue;
      pb.set(x, y, dither(0.62 - dx * 0.35 - dy * 0.2, x, y, stone));
    }
  for (const x of [10, 18, 26]) pb.rect(x, 50, 2, 2, gem[4 + (frame === 1 ? 1 : 0)]);
  // cristal flutuante
  const yo = frame === 1 ? -2 : frame === 2 ? 1 : 0;
  pb.poly(
    [
      [18, 6 + yo],
      [28, 22 + yo],
      [18, 42 + yo],
      [8, 22 + yo],
    ],
    (x, y) => dither((x < 18 ? 0.85 : 0.45) - Math.abs(y - 22 - yo) * 0.01, x, y, gem),
  );
  for (let y = 9; y < 40; y++) pb.set(18, y + yo, gem[5]);
  for (let i = 0; i < 4; i++) pb.set(13 + i, 18 + yo - i, C('#ffffff'));
  selout(pb, -0.5);
  return pb;
}

export type CreatureShape = 'slime' | 'wolf' | 'boar' | 'spider' | 'totem';

/** Quadros de cada criatura (0 parado, 1..walk andando, attack opcional). */
export const CREATURE_FRAMES: Record<CreatureShape, { count: number; walk: number; step: number; attack?: number; idleCycle?: number }> = {
  wolf: { count: 6, walk: 4, step: 0.085, attack: 5 },
  boar: { count: 6, walk: 4, step: 0.095, attack: 5 },
  spider: { count: 6, walk: 4, step: 0.07, attack: 5 },
  slime: { count: 5, walk: 4, step: 0.12 },
  totem: { count: 3, walk: 0, step: 1, idleCycle: 3 },
};

export function drawCreature(kind: CreatureShape, color: string, frame: number, spirit = false): PB {
  switch (kind) {
    case 'wolf':
      return drawWolf(color, frame, spirit);
    case 'boar':
      return drawBoar(color, frame);
    case 'spider':
      return drawSpider(color, frame);
    case 'slime':
      return drawSlime(color, frame);
    default:
      return drawTotem(color, frame);
  }
}
