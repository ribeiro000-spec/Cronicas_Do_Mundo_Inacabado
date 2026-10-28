import { C, PB, bayer, blob, dither, groundShadow, hash, ints, noise2, ramp, selout, thick } from './paint';
import { cylinder, fill, glow } from './shapes';
import type { ArtPiece } from './props';

/* Casas em enxaimel e a fonte da praça, em alta resolução. */

type P2 = [number, number];

const ROOFS = [
  ints(ramp('#3f64a8', 7, 0.5, 16)),
  ints(ramp('#b04a3a', 7, 0.5, 16)),
  ints(ramp('#86603c', 7, 0.5, 16)),
];
const PLASTER = [ints(ramp('#ecdfc2', 6, 0.38, 12)), ints(ramp('#dccdb0', 6, 0.38, 12))];
const BEAM = ints(ramp('#6b4a2b', 6, 0.45, 12));
const STONE = ints(ramp('#9b958a', 7, 0.5, 14));
const MOSS = ints(ramp('#5f8a3e', 5, 0.45, 18));
const WOOD = ints(ramp('#8e5e34', 7, 0.5, 16));
const IRON = ints(ramp('#4a4e5a', 5, 0.45, 10));
const FLOWERS = [C('#e8434a'), C('#f4d24a'), C('#ee8ab4'), C('#f6f2e6')];

/** Resolve (a, b) tal que p = p0 + a·(pA − p0) + b·(pB − p0). */
function solve(p: P2, p0: P2, pA: P2, pB: P2): [number, number] {
  const ax = pA[0] - p0[0];
  const ay = pA[1] - p0[1];
  const bx = pB[0] - p0[0];
  const by = pB[1] - p0[1];
  const det = ax * by - ay * bx;
  const px = p[0] - p0[0];
  const py = p[1] - p0[1];
  return [(px * by - py * bx) / det, (ax * py - ay * px) / det];
}

function inQuad(x: number, y: number, q: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i];
    const [xj, yj] = q[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bbox(q: P2[]): [number, number, number, number] {
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  return [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))];
}

/** Plano de telhado com telhas em fiadas desencontradas, sombra entre fiadas e musgo. */
function roofPlane(pb: PB, q: P2[], eaveA: P2, eaveB: P2, ridge: P2, pal: number[], light: number, seed: number): void {
  const [x0, y0, x1, y1] = bbox(q);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inQuad(x + 0.5, y + 0.5, q)) continue;
      const [a, b] = solve([x + 0.5, y + 0.5], eaveA, eaveB, ridge);
      const rows = 9;
      const r = Math.floor(b * rows);
      const fb = b * rows - r;
      const cols = 14;
      const ca = a * cols + (r % 2) * 0.5;
      const c = Math.floor(ca);
      const fa = ca - c;
      let t = light + (hash(c, r, seed) - 0.5) * 0.22;
      if (fb < 0.22) t -= 0.3; // sombra da fiada de cima
      else if (fb > 0.8) t += 0.1;
      if (fa < 0.08) t -= 0.16;
      t -= b * 0.08;
      if (noise2(x * 0.08, y * 0.12, seed + 3) > 0.76 && bayer(x, y) < 0.6) {
        pb.set(x, y, dither(0.45, x, y, MOSS));
        continue;
      }
      pb.set(x, y, dither(t, x, y, pal));
    }
}

/** Parede em enxaimel: base de pedra, reboco texturizado e vigas de madeira. */
function wallFace(pb: PB, p0: P2, p1: P2, h: number, light: number, plaster: number[], seed: number, decor: (s: number, t: number, x: number, y: number) => number | null): void {
  const [ax, ay] = p0;
  const [bx, by] = p1;
  for (let x = Math.floor(Math.min(ax, bx)); x < Math.ceil(Math.max(ax, bx)); x++) {
    const s = (x + 0.5 - ax) / (bx - ax);
    if (s < 0 || s > 1) continue;
    const yb = ay + s * (by - ay);
    for (let y = Math.floor(yb - h); y < Math.ceil(yb); y++) {
      const t = (yb - (y + 0.5)) / h;
      if (t < 0 || t > 1) continue;
      const d = decor(s, t, x, y);
      if (d !== null) {
        pb.set(x, y, d);
        continue;
      }
      // fundação de pedra
      if (t < 0.17) {
        const rows = 2;
        const rr = Math.floor((t / 0.17) * rows);
        const cs = s * 9 + (rr % 2) * 0.5;
        const fs = cs - Math.floor(cs);
        const ft = (t / 0.17) * rows - rr;
        if (fs < 0.08 || ft < 0.14) pb.set(x, y, STONE[0]);
        else pb.set(x, y, dither(light - 0.05 + (hash(Math.floor(cs), rr, seed) - 0.5) * 0.3 + (ft > 0.75 ? 0.12 : 0), x, y, STONE));
        continue;
      }
      // vigas
      const beamS = [0, 0.33, 0.66, 1].some((b) => Math.abs(s - b) < 0.028);
      const beamT = Math.abs(t - 0.6) < 0.035 || t > 0.95 || Math.abs(t - 0.19) < 0.025;
      const brace = (s < 0.33 && Math.abs((s / 0.33) * 0.41 - (t - 0.19)) < 0.03 && t < 0.6) || (s > 0.66 && Math.abs(((1 - s) / 0.34) * 0.41 - (t - 0.19)) < 0.03 && t < 0.6);
      if (beamS || beamT || brace) {
        pb.set(x, y, dither(light - 0.08 + (noise2(x * 0.5, y * 0.5, seed) - 0.5) * 0.2, x, y, BEAM));
        continue;
      }
      const grain = (noise2(x * 0.3, y * 0.3, seed + 1) - 0.5) * 0.18 + (hash(x, y, seed + 2) > 0.97 ? -0.15 : 0);
      pb.set(x, y, dither(light + grain - (1 - t) * 0.05, x, y, plaster));
    }
  }
}

function windowDecor(s0: number, s1: number, t0: number, t1: number, shutters: boolean) {
  return (s: number, t: number, x: number, y: number): number | null => {
    const ws = (s - s0) / (s1 - s0);
    const wt = (t - t0) / (t1 - t0);
    if (shutters && wt >= 0 && wt <= 1 && ((ws >= -0.42 && ws < -0.04) || (ws > 1.04 && ws <= 1.42))) {
      const slat = Math.floor(wt * 8) % 2;
      return dither(0.5 + (slat ? 0.1 : -0.08), x, y, ints(ramp('#3f6a5a', 5, 0.4, 12)));
    }
    if (ws < -0.06 || ws > 1.06 || wt < -0.08 || wt > 1.08) return null;
    if (ws < 0.06 || ws > 0.94 || wt < 0.06 || wt > 0.94 || Math.abs(ws - 0.5) < 0.05 || Math.abs(wt - 0.55) < 0.05) return dither(0.55, x, y, WOOD);
    const pal = [C('#b0601e'), C('#e89a38'), C('#ffcf6e'), C('#fff0c0')];
    return dither(0.85 - wt * 0.5 + (ws < 0.3 && wt < 0.4 ? 0.2 : 0), x, y, pal);
  };
}

function doorDecor(s0: number, s1: number, t1: number) {
  return (s: number, t: number, x: number, y: number): number | null => {
    const ds = (s - s0) / (s1 - s0);
    const dt = (t - 0.17) / (t1 - 0.17);
    if (ds < -0.1 || ds > 1.1 || dt < 0 || dt > 1.08) return null;
    if (ds < 0.04 || ds > 0.96 || dt > 0.95) return dither(0.4, x, y, BEAM);
    if (Math.abs(dt - 0.25) < 0.04 || Math.abs(dt - 0.75) < 0.04) return ds < 0.45 ? dither(0.5, x, y, IRON) : dither(0.35, x, y, WOOD);
    if (Math.abs(ds - 0.8) < 0.06 && Math.abs(dt - 0.5) < 0.05) return C('#e0b84a');
    const plank = Math.floor(ds * 4);
    return dither(0.4 + (hash(plank, 1, 9) - 0.5) * 0.15 + ((ds * 4) % 1 < 0.12 ? -0.2 : 0), x, y, WOOD);
  };
}

export function drawHouseHD(roofIdx: number, v: number): ArtPiece {
  const W = 216;
  const H = 236;
  const pb = new PB(W, H);
  const cx = 108;
  const cy = 176;
  const hw = 96;
  const hh = 48;
  const wh = 54 + (v % 2) * 6;
  const rh = 56;
  const roof = ROOFS[roofIdx];
  const plaster = PLASTER[v % 2];
  const T: P2 = [cx, cy - hh];
  const R: P2 = [cx + hw, cy];
  const B: P2 = [cx, cy + hh];
  const L: P2 = [cx - hw, cy];
  const up = (p: P2, h: number): P2 => [p[0], p[1] - h];
  const lerp = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  // paredes
  const doorS = v % 2 ? 0.62 : 0.44;
  const leftDecor = (s: number, t: number, x: number, y: number) =>
    doorDecor(doorS, doorS + 0.17, 0.66)(s, t, x, y) ?? windowDecor(v % 2 ? 0.14 : 0.12, v % 2 ? 0.28 : 0.26, 0.3, 0.52, true)(s, t, x, y);
  const rightDecor = (s: number, t: number, x: number, y: number) =>
    windowDecor(0.14, 0.28, 0.28, 0.52, false)(s, t, x, y) ?? windowDecor(0.62, 0.76, 0.28, 0.52, v % 2 === 0)(s, t, x, y);
  wallFace(pb, L, B, wh, 0.66, plaster, 11 + v, leftDecor);
  wallFace(pb, B, R, wh, 0.36, plaster, 21 + v, rightDecor);

  // degrau de pedra na porta (laje isométrica)
  const ds = lerp(L, B, doorS + 0.085);
  for (let y = -5; y <= 5; y++)
    for (let x = -12; x <= 12; x++) {
      const dx = x / 12;
      const dy = y / 5;
      if (Math.abs(dx) + Math.abs(dy) > 1) continue;
      pb.set(Math.round(ds[0] - 4 + x), Math.round(ds[1] + 4 + y), dither(0.7 - dy * 0.15, x, y, STONE));
    }
  for (let x = -12; x <= 0; x++) pb.set(Math.round(ds[0] - 4 + x), Math.round(ds[1] + 4 + 5 + x * 0.4) , STONE[1]);

  // floreiras sob as janelas
  const box = (p0: P2, p1: P2, s0: number, s1: number, tAt: number, light: number) => {
    for (let s = s0 - 0.02; s <= s1 + 0.02; s += 0.004) {
      const p = lerp(p0, p1, s);
      const y = p[1] - wh * tAt;
      for (let k = 0; k < 5; k++) pb.set(Math.round(p[0]), Math.round(y + k), dither(light - k * 0.06, p[0], k, WOOD));
      if (hash(Math.round(p[0]), 3, 5) > 0.45) {
        const c = FLOWERS[Math.floor(hash(Math.round(p[0]), 4, 6) * FLOWERS.length)];
        pb.set(Math.round(p[0]), Math.round(y - 1), C('#3f7a2a'));
        pb.set(Math.round(p[0]), Math.round(y - 2 - (hash(Math.round(p[0]), 7, 7) > 0.5 ? 1 : 0)), c);
      }
    }
  };
  if (v % 2 === 0) box(B, R, 0.62, 0.76, 0.27, 0.45);
  box(L, B, v % 2 ? 0.14 : 0.12, v % 2 ? 0.28 : 0.26, 0.29, 0.6);

  // telhado
  const Tw = up(T, wh);
  const Rw = up(R, wh);
  const Bw = up(B, wh);
  const Lw = up(L, wh);
  const Lr: P2 = [Lw[0] - 10, Lw[1] + 5];
  const Br: P2 = [Bw[0], Bw[1] + 10];
  const Rr: P2 = [Rw[0] + 10, Rw[1] + 5];
  const Tr: P2 = [Tw[0], Tw[1] - 2];
  const M1 = up(lerp(Lr, Tr, 0.5), rh);
  const M2 = up(lerp(Br, Rr, 0.5), rh);
  const M2w = up(lerp(Bw, Rw, 0.5), rh - 6);
  // empena (parede triangular)
  {
    const tri: P2[] = [Bw, Rw, M2w];
    const [x0, y0, x1, y1] = bbox(tri);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!inQuad(x + 0.5, y + 0.5, tri)) continue;
        const vertical = Math.abs(x - M2w[0]) < 2;
        const horizontal = Math.abs(y - (Bw[1] - (x - Bw[0]) * 0.5) + 22) < 2;
        if (vertical || horizontal) pb.set(x, y, dither(0.32, x, y, BEAM));
        else pb.set(x, y, dither(0.3 + (noise2(x * 0.3, y * 0.3, 31) - 0.5) * 0.15, x, y, plaster));
      }
    // janelinha redonda
    const wc: P2 = [M2w[0] - 2, M2w[1] + 26];
    for (let y = -6; y <= 6; y++)
      for (let x = -6; x <= 6; x++) {
        const d = Math.hypot(x, y);
        if (d > 6) continue;
        pb.set(wc[0] + x, wc[1] + y, d > 4.5 || Math.abs(x) < 1 || Math.abs(y) < 1 ? dither(0.35, x, y, WOOD) : dither(0.75 - y * 0.03, x, y, [C('#b0601e'), C('#e89a38'), C('#ffcf6e')]));
      }
  }
  roofPlane(pb, [Tr, Rr, M2, M1], Tr, Rr, M1, roof, 0.3, 40 + roofIdx);
  roofPlane(pb, [Lr, Br, M2, M1], Lr, Br, M1, roof, 0.62, 50 + roofIdx);
  // beiral e cumeeira
  thick(pb, Lr[0], Lr[1], Br[0], Br[1], 2, (x, y) => dither(0.2, x, y, roof));
  thick(pb, M1[0], M1[1], M2[0], M2[1], 3, (x, y, t) => dither(0.85 - t * 0.2, x, y, roof));

  // chaminé de pedra apoiada no plano do telhado (perto da cumeeira)
  const onRoof = (a: number, b: number): P2 => [Lr[0] + a * (Br[0] - Lr[0]) + b * (M1[0] - Lr[0]), Lr[1] + a * (Br[1] - Lr[1]) + b * (M1[1] - Lr[1])];
  const base = onRoof(0.3, 0.78);
  const chx = Math.round(base[0] - 7);
  const chy = Math.round(base[1] + 4);
  fill(pb, chx, chy - 30, 14, 34, (x, y, s, t) => {
    const r = Math.floor(t * 6);
    const c = Math.floor(s * 2 + (r % 2) * 0.5);
    if ((t * 6) % 1 < 0.15 || (s * 2 + (r % 2) * 0.5) % 1 < 0.1) return STONE[0];
    return dither((s < 0.5 ? 0.66 : 0.36) + (hash(c, r, 61) - 0.5) * 0.2, x, y, STONE);
  });
  fill(pb, chx - 2, chy - 33, 18, 4, (x, y, s) => dither(0.7 - s * 0.4, x, y, STONE));
  pb.rect(chx + 2, chy - 33, 10, 1, C('#1e1a20'));

  // placa pendurada (variante 1)
  if (v % 2) {
    const p = lerp(L, B, 0.3);
    const sx = Math.round(p[0]);
    const sy = Math.round(p[1] - wh * 0.78);
    thick(pb, sx, sy, sx - 16, sy - 4, 2, (x, y) => dither(0.3, x, y, IRON));
    fill(pb, sx - 18, sy - 2, 12, 9, (x, y, s, t) => (s < 0.1 || s > 0.9 || t < 0.12 || t > 0.88 ? dither(0.35, x, y, WOOD) : dither(0.6, x, y, ints(ramp('#c8a040', 4, 0.4, 14)))));
  }

  selout(pb, -0.6);
  groundShadow(pb, cx + 6, cy + 4, hw + 6, hh + 4, 70);
  return { pb, ax: cx, ay: cy, smoke: { x: chx + 7, y: chy - 34 } };
}

export function drawFountainHD(): ArtPiece {
  const pb = new PB(148, 112);
  const cx = 74;
  const cy = 82;
  const stone = STONE;
  const waterPal = ints(ramp('#3f8ad0', 6, 0.45, 12));
  // borda externa (cilindro baixo)
  cylinder(pb, cx, cy - 12, cy, 60, stone, 71, 28);
  // blocos da borda
  for (let y = cy - 40; y < cy + 30; y++)
    for (let x = cx - 60; x < cx + 60; x++) {
      if (pb.alpha(x, y) === 0) continue;
      const ang = Math.atan2((y - cy + 12) / 28, (x - cx) / 60);
      if (Math.abs(Math.sin(ang * 8)) < 0.07) pb.set(x, y, stone[1]);
    }
  // água
  for (let y = cy - 40; y < cy + 10; y++)
    for (let x = cx - 52; x < cx + 52; x++) {
      const dx = (x + 0.5 - cx) / 51;
      const dy = (y + 0.5 - (cy - 12)) / 23;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      let t = 0.5 - dy * 0.15 + (noise2(x * 0.15, y * 0.25, 72) - 0.5) * 0.2;
      const ring = Math.sin(d * 22);
      if (ring > 0.85) t += 0.22;
      if (d > 0.9) t -= 0.18;
      pb.set(x, y, dither(t, x, y, waterPal));
    }
  // coluna central e bacia superior
  cylinder(pb, cx, cy - 52, cy - 14, 7, stone, 73, 3);
  cylinder(pb, cx, cy - 56, cy - 50, 20, stone, 74, 8);
  for (let y = cy - 64; y < cy - 48; y++)
    for (let x = cx - 18; x < cx + 18; x++) {
      const dx = (x + 0.5 - cx) / 16;
      const dy = (y + 0.5 - (cy - 56)) / 6.5;
      if (dx * dx + dy * dy <= 1) pb.set(x, y, dither(0.6 - dy * 0.2 + (bayer(x, y) > 0.9 ? 0.3 : 0), x, y, waterPal));
    }
  // bico e jato
  cylinder(pb, cx, cy - 72, cy - 58, 3, stone, 75, 1.4);
  blob(pb, cx, cy - 76, 4, 4, waterPal, 76, 0.1, 0.3);
  // fios de água caindo
  for (const dx of [-17, -9, 9, 17]) {
    for (let y = cy - 52; y < cy - 24; y++) {
      const x = cx + dx + Math.sign(dx) * (y - cy + 52) * 0.25;
      pb.set(Math.round(x), y, (y + dx) % 4 ? waterPal[4] : waterPal[5]);
    }
  }
  selout(pb, -0.55);
  groundShadow(pb, cx + 4, cy + 4, 62, 28, 60);
  return { pb, ax: cx, ay: cy };
}

export { glow };
