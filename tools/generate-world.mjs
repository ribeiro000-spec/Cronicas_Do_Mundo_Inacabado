#!/usr/bin/env node
/**
 * Gerador do mundo de Avarra (recorte do Ato I: Campos de Orvalho e arredores).
 *
 * Produz, a partir de uma semente fixa (sempre o mesmo mundo):
 *   public/data/world/manifest.json        → metadados, pontos de interesse, áreas, mapa-resumo
 *   public/data/world/chunks/<cx>_<cy>.json → um arquivo por chunk de 16×16 tiles
 *
 * O jogo baixa só o manifesto no início e depois apenas os chunks em volta do jogador.
 * Rode com:  npm run world
 *
 * Quando o mapa passar a ser desenhado no Tiled, troque este gerador por um script que
 * leia o .tmx/.tmj e escreva os chunks no MESMO formato — o jogo não precisa mudar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/worldDefs.json'), 'utf8'));
const OUT = path.join(ROOT, 'public/data/world');

const SEED = 20261028;
const CS = defs.chunkSize;
const WC = 12;
const HC = 12;
const W = WC * CS;
const H = HC * CS;

const T = Object.fromEntries(defs.tiles.map((t) => [t.key, t.id]));
const O = Object.fromEntries(defs.objects.map((o) => [o.key, o]));
const OBJ_BY_ID = Object.fromEntries(defs.objects.map((o) => [o.id, o]));
const TILE_SOLID = defs.tiles.map((t) => t.solid);

// ---------------------------------------------------------------- aleatoriedade
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, scale, seed) {
  const gx = x / scale;
  const gy = y / scale;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, scale, seed, oct = 3) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += valueNoise(x, y, scale, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 0.5;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- geometria
const idx = (x, y) => y * W + x;
const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distPoly(px, py, pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, distSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return m;
}

// ---------------------------------------------------------------- lugares do Ato I
const P = {
  village: { x: 96, y: 100 },
  vale: { x: 46, y: 138 },
  ruins: { x: 166, y: 44 },
  ruinsEntry: { x: 150, y: 70 },
  caravan: { x: 142, y: 104 },
  camp: { x: 157, y: 121 },
  clearing: { x: 70, y: 35 },
  lake: { x: 134, y: 166 },
};

const RIVER = [
  [124, -2], [121, 18], [127, 40], [121, 62], [124, 84], [127, 100], [129, 122], [131, 146], [133, 160],
];
const ROADS = [
  { pts: [[100, 100], [114, 100], [126, 101], [142, 104]], w: 1.25 },
  { pts: [[142, 104], [150, 92], [150, 72], [158, 58], [163, 50]], w: 1.15 },
  { pts: [[92, 104], [78, 118], [60, 130], [48, 137]], w: 1.15 },
  { pts: [[96, 94], [94, 74], [82, 52], [70, 37]], w: 1.15 },
  { pts: [[96, 106], [102, 128], [112, 146]], w: 1.1 },
  { pts: [[142, 104], [150, 112], [156, 119]], w: 0.95 },
];

// ---------------------------------------------------------------- terreno
const ground = new Uint8Array(W * H).fill(T.grass);
const forestness = new Float32Array(W * H);
const road = new Uint8Array(W * H); // 1 = estrada, 2 = margem
const keepClear = new Uint8Array(W * H);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const n1 = fbm(x, y, 24, SEED + 1);
    const n2 = fbm(x, y, 9, SEED + 2);

    // floresta ao norte e a oeste, com bolsões
    let f = (62 - y) / 26 + (n1 - 0.5) * 1.3;
    f = Math.max(f, (24 - x) / 14 + (n1 - 0.5));
    if (n1 > 0.7) f = Math.max(f, (n1 - 0.62) * 4);
    if (dist(x, y, P.clearing.x, P.clearing.y) < 7) f = Math.min(f, 0.2);
    if (dist(x, y, P.village.x, P.village.y) < 24) f = Math.min(f, 0.1);
    if (dist(x, y, P.vale.x, P.vale.y) < 18) f = Math.min(f, 0.1);
    forestness[i] = f;

    let g = n2 > 0.56 ? T.grass_lush : T.grass;
    if (f > 0.55) g = T.forest_floor;

    // ruínas: terreno pedregoso e lajes
    const dr = dist(x, y, P.ruins.x, P.ruins.y);
    if (x > 136 && y < 86 && dr < 30 + (n1 - 0.5) * 14) {
      g = T.rocky;
      forestness[i] = Math.min(f, 0.3);
      if (dr < 12.5 || (dr < 24 && n2 > 0.62)) g = T.ruin_floor;
    }

    // lago ao sul
    const le = Math.hypot((x - P.lake.x) / 21, (y - P.lake.y) / 16) + (n2 - 0.5) * 0.18;
    if (le < 1.32) {
      g = T.sand;
      forestness[i] = -1;
    }
    if (le < 1) g = T.water;
    if (le < 0.68) g = T.deep_water;

    // rio
    const rv = distPoly(x, y, RIVER) + (n2 - 0.5) * 1.2;
    if (rv < 1.7) g = rv < 0.75 ? T.deep_water : T.water;
    if (rv < 3) forestness[i] = Math.min(forestness[i], 0.35);

    ground[i] = g;
  }
}

// estradas (pontes onde cruzam água)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    let best = Infinity;
    let bw = 1;
    for (const r of ROADS) {
      const d = distPoly(x + 0.5, y + 0.5, r.pts);
      if (d < best) {
        best = d;
        bw = r.w;
      }
    }
    if (best < bw) {
      road[i] = 1;
      const isWater = ground[i] === T.water || ground[i] === T.deep_water;
      if (isWater) ground[i] = T.bridge;
      else ground[i] = dist(x, y, P.village.x, P.village.y) < 17 ? T.cobble : T.path;
    } else if (best < bw + 2.2) {
      road[i] = 2;
    }
  }
}
// ponte larga o bastante: completa tiles de água vizinhos ao longo da estrada
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = idx(x, y);
    if (ground[i] !== T.bridge) continue;
    for (const [dx, dy] of [[0, 1], [0, -1]]) {
      const j = idx(x + dx, y + dy);
      if ((ground[j] === T.water || ground[j] === T.deep_water) && road[j] === 2) ground[j] = T.bridge;
    }
  }
}

// praça de Eldenor
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = dist(x + 0.5, y + 0.5, P.village.x, P.village.y);
    if (d < 7.6) {
      ground[idx(x, y)] = T.cobble;
      road[idx(x, y)] = 1;
    }
  }
}

// lavouras de Valedouro
const FARMS = [
  [33, 125, 8, 6],
  [52, 141, 6, 7],
  [35, 144, 7, 6],
  [56, 118, 6, 5],
];
for (const [fx, fy, fw, fh] of FARMS) {
  for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) if (!road[idx(x, y)]) ground[idx(x, y)] = T.farm;
}

// borda do mundo: mata fechada
const EDGE = 3;

// ---------------------------------------------------------------- objetos
const objects = []; // {id, x, y, removed}
const occ = new Int32Array(W * H).fill(-1);

function footprintFree(key, ax, ay, opts = {}) {
  const def = O[key];
  for (let y = ay; y < ay + def.h; y++) {
    for (let x = ax; x < ax + def.w; x++) {
      if (!inB(x, y)) return false;
      const i = idx(x, y);
      if (occ[i] !== -1) return false;
      const g = ground[i];
      if (!opts.onWater && TILE_SOLID[g]) return false;
      if (opts.onWater && g !== T.water) return false;
      if (!opts.allowRoad && road[i] === 1) return false;
      if (!opts.allowRoad && opts.avoidMargin && road[i] === 2) return false;
      if (!opts.ignoreClear && keepClear[i]) return false;
      if (ground[i] === T.bridge) return false;
    }
  }
  return true;
}
function place(key, ax, ay, opts = {}) {
  ax = Math.round(ax);
  ay = Math.round(ay);
  if (!footprintFree(key, ax, ay, opts)) return false;
  const def = O[key];
  const n = objects.length;
  objects.push({ id: def.id, x: ax, y: ay, removed: false });
  for (let y = ay; y < ay + def.h; y++) for (let x = ax; x < ax + def.w; x++) occ[idx(x, y)] = n;
  return true;
}
function removeObjectAt(x, y) {
  const n = occ[idx(x, y)];
  if (n < 0) return;
  const o = objects[n];
  const def = OBJ_BY_ID[o.id];
  o.removed = true;
  for (let yy = o.y; yy < o.y + def.h; yy++) for (let xx = o.x; xx < o.x + def.w; xx++) occ[idx(xx, yy)] = -1;
}
function clearCircle(cx, cy, r) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if (inB(x, y) && dist(x + 0.5, y + 0.5, cx, cy) <= r) keepClear[idx(x, y)] = 1;
}

// ---------------------------------------------------------------- pontos de interesse
const pois = [];
function poi(p) {
  pois.push(p);
  return p;
}

// NPCs
poi({ id: 'prefeito_aldren', type: 'npc', x: 96.5, y: 95.6 });
poi({ id: 'mercadora_nira', type: 'npc', x: 101.6, y: 97.2 });
poi({ id: 'ferreiro_doran', type: 'npc', x: 90.4, y: 100.5 });
poi({ id: 'emissaria_sera', type: 'npc', x: 100.8, y: 103.6 });
poi({ id: 'irmao_tobias', type: 'npc', x: 92.2, y: 103.8 });
poi({ id: 'cartografa_ilsa', type: 'npc', x: 96.5, y: 106.2 });
poi({ id: 'cacador_bram', type: 'npc', x: 97.8, y: 86.5 });
poi({ id: 'fazendeira_lia', type: 'npc', x: 47.5, y: 135.5 });
poi({ id: 'guarda_eldenor', type: 'npc', x: 107.5, y: 98.6 });
poi({ id: 'aldeao_marta', type: 'npc', x: 92.5, y: 96.5, wander: 3 });
poi({ id: 'aldeao_pip', type: 'npc', x: 99.5, y: 100.8, wander: 3 });
poi({ id: 'aldeao_velho', type: 'npc', x: 44.5, y: 141.5, wander: 2 });

// pontos de viagem rápida
poi({ id: 'ws_eldenor', type: 'waystone', x: 102.5, y: 92.5, name: 'Pedra-guia de Eldenor' });
poi({ id: 'ws_valedouro', type: 'waystone', x: 52.5, y: 135.5, name: 'Pedra-guia de Valedouro' });
poi({ id: 'ws_clareira', type: 'waystone', x: 73.5, y: 36.5, name: 'Clareira do Sino' });
poi({ id: 'ws_estrada', type: 'waystone', x: 133.5, y: 98.5, name: 'Ponte do Leste' });
poi({ id: 'ws_ruinas', type: 'waystone', x: 147.5, y: 72.5, name: 'Portal das Ruínas' });
poi({ id: 'ws_lago', type: 'waystone', x: 111.5, y: 150.5, name: 'Margem do Lago' });

// baús
const chests = [
  ['ch_doc1', 146.5, 107.5, 'doc'],
  ['ch_doc2', 160.5, 124.5, 'doc'],
  ['ch_doc3', 79.5, 49.5, 'doc'],
  ['ch_map_floresta', 58.5, 28.5, 'map'],
  ['ch_map_sul', 121.5, 147.5, 'map'],
  ['ch_ruinas_1', 175.5, 37.5, 'rare'],
  ['ch_ruinas_2', 156.5, 53.5, 'common'],
  ['ch_lago', 106.5, 160.5, 'common'],
  ['ch_vale', 34.5, 152.5, 'common'],
  ['ch_norte', 108.5, 26.5, 'rare'],
  ['ch_oeste', 30.5, 98.5, 'common'],
  ['ch_ponte', 118.5, 92.5, 'common'],
];
for (const [id, x, y, kind] of chests) poi({ id, type: 'chest', x, y, kind });

// missão / especiais
poi({ id: 'carga_caravana', type: 'cargo', x: 141.5, y: 106.5, name: 'Carga da caravana' });
poi({ id: 'altar_fragmento', type: 'altar', x: 158.5, y: 58.5, name: 'Altar partido' });
poi({ id: 'boss_cavaleiro', type: 'boss', x: 166.5, y: 44.5, enemy: 'cavaleiro_sem_brasao' });

// ervas
let herbN = 0;
for (let tries = 0; tries < 4000 && herbN < 14; tries++) {
  const near = herbN < 9 ? P.vale : P.village;
  const ang = rand() * Math.PI * 2;
  const r = (herbN < 9 ? 6 : 20) + rand() * 14;
  const x = Math.floor(near.x + Math.cos(ang) * r);
  const y = Math.floor(near.y + Math.sin(ang) * r);
  if (!inB(x, y)) continue;
  const g = ground[idx(x, y)];
  if (!(g === T.grass || g === T.grass_lush)) continue;
  if (road[idx(x, y)]) continue;
  if (pois.some((p) => dist(p.x, p.y, x + 0.5, y + 0.5) < 4)) continue;
  poi({ id: `erva_${herbN}`, type: 'herb', x: x + 0.5, y: y + 0.5 });
  herbN++;
}

for (const p of pois) clearCircle(p.x, p.y, p.type === 'boss' ? 8 : p.type === 'npc' ? 1.6 : 1.8);
clearCircle(P.ruins.x, P.ruins.y, 9);

// ---------------------------------------------------------------- vila de Eldenor
place('fountain', 95, 99, { allowRoad: true, ignoreClear: true });
const houseKeys = ['house_blue', 'house_red', 'house_brown'];
let houseN = 0;
const houseCenters = [];
for (let ring = 10; ring <= 15 && houseN < 11; ring += 1.5) {
  for (let a = 0; a < Math.PI * 2 && houseN < 11; a += Math.PI / 7) {
    const cx = P.village.x + Math.cos(a + ring) * ring;
    const cy = P.village.y + Math.sin(a + ring) * ring;
    if (houseCenters.some(([hx, hy]) => dist(hx, hy, cx, cy) < 5)) continue;
    if (place(houseKeys[houseN % 3], cx - 1.5, cy - 1.5, { avoidMargin: true })) {
      houseCenters.push([cx, cy]);
      houseN++;
    }
  }
}
// casas de Valedouro
for (const [hx, hy, k] of [[40, 133, 'house_brown'], [51, 129, 'house_red'], [43, 145, 'house_blue']]) {
  for (let t = 0; t < 12; t++) if (place(k, hx + randInt(-2, 2), hy + randInt(-2, 2), { avoidMargin: true })) break;
}
// postes de luz em volta da praça
for (let k = 0; k < 8; k++) {
  const a = (k / 8) * Math.PI * 2 + 0.2;
  place('lamp', P.village.x + Math.cos(a) * 8.3, P.village.y + Math.sin(a) * 8.3, { allowRoad: true });
}
// barracas, caixas e barris
place('stall', 102, 95, { allowRoad: true, ignoreClear: true });
place('stall', 103, 97, { allowRoad: true, ignoreClear: true });
place('crate', 89, 99, { allowRoad: true, ignoreClear: true });
place('barrel', 89, 102, { allowRoad: true, ignoreClear: true });
place('well', 92, 92, { allowRoad: true });
place('signpost', 106, 102, { allowRoad: false });
for (const [hx, hy] of houseCenters) {
  for (let t = 0; t < 3; t++) place(pick(['crate', 'barrel', 'flowers', 'flowers']), hx + randInt(-3, 3), hy + randInt(-3, 3));
}
// cercas e plantações
for (const [fx, fy, fw, fh] of FARMS) {
  for (let x = fx; x < fx + fw; x++) {
    place('fence_x', x, fy - 1);
    place('fence_x', x, fy + fh);
  }
  for (let y = fy; y < fy + fh; y++) {
    place('fence_y', fx - 1, y);
    place('fence_y', fx + fw, y);
  }
  for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) if ((x + y) % 2 === 0) place('crops', x, y);
  place('hay', fx + fw + 1, fy + 1);
}

// ---------------------------------------------------------------- estrada, caravana e acampamento
place('cart_broken', 143, 102, { ignoreClear: true });
place('cart_broken', 139, 107, { ignoreClear: true });
for (let k = 0; k < 7; k++) place(pick(['crate', 'barrel', 'crate']), P.caravan.x + randInt(-4, 4), P.caravan.y + randInt(-4, 4));
for (const [tx, ty] of [[153, 117], [160, 118], [155, 124], [161, 126]]) place('tent', tx, ty);
place('campfire', 157, 121, { ignoreClear: true });
for (let k = 0; k < 6; k++) place(pick(['crate', 'barrel', 'log']), P.camp.x + randInt(-6, 6), P.camp.y + randInt(-6, 6));
place('campfire', 71, 40);
place('log', 69, 41);

// ---------------------------------------------------------------- ruínas
for (let k = 0; k < 14; k++) {
  const a = (k / 14) * Math.PI * 2;
  place(k % 3 === 2 ? 'pillar_broken' : 'pillar', P.ruins.x + Math.cos(a) * 10.5, P.ruins.y + Math.sin(a) * 10.5, { allowRoad: true, ignoreClear: true });
}
for (let k = 0; k < 140; k++) {
  const a = rand() * Math.PI * 2;
  const r = 11 + rand() * 18;
  const x = P.ruins.x + Math.cos(a) * r;
  const y = P.ruins.y + Math.sin(a) * r;
  const roll = rand();
  const key = roll < 0.35 ? 'ruin_wall' : roll < 0.55 ? 'pillar_broken' : roll < 0.7 ? 'tombstone' : roll < 0.8 ? 'pillar' : roll < 0.86 ? 'statue' : roll < 0.95 ? 'rock' : 'rock_big';
  place(key, x, y, { avoidMargin: true });
}

// ---------------------------------------------------------------- vegetação
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const g = ground[i];
    if (TILE_SOLID[g] || g === T.bridge || g === T.farm || g === T.cobble) continue;
    const edge = x < EDGE || y < EDGE || x >= W - EDGE || y >= H - EDGE;
    const r = rand();
    const f = forestness[i];
    if (edge) {
      place(r < 0.5 ? 'pine' : 'dark_tree', x, y, { allowRoad: true, ignoreClear: true });
      continue;
    }
    if (road[i] === 1) continue;
    if (g === T.sand) {
      if (r < 0.015) place('rock', x, y);
      continue;
    }
    if (g === T.rocky || g === T.ruin_floor) {
      if (r < 0.02) place('rock', x, y, { avoidMargin: true });
      else if (r < 0.03) place('stump', x, y, { avoidMargin: true });
      else if (r < 0.07) place('tuft', x, y);
      continue;
    }
    if (f > 0.55) {
      if (r < 0.42) place(rand() < 0.55 ? 'dark_tree' : 'pine', x, y, { avoidMargin: true });
      else if (r < 0.48) place('bush', x, y, { avoidMargin: true });
      else if (r < 0.56) place('mushroom', x, y);
      else if (r < 0.6) place(rand() < 0.5 ? 'log' : 'stump', x, y, { avoidMargin: true });
      else if (r < 0.7) place('tuft', x, y);
      continue;
    }
    const cluster = fbm(x, y, 7, SEED + 7);
    const treeP = f > 0.3 ? 0.14 : cluster > 0.68 ? 0.3 : 0.018;
    if (r < treeP) place(rand() < 0.75 ? 'oak' : 'pine', x, y, { avoidMargin: true });
    else if (r < treeP + 0.02) place('bush', x, y, { avoidMargin: true });
    else if (r < treeP + 0.03) place('rock', x, y, { avoidMargin: true });
    else if (r < treeP + 0.09) place('flowers', x, y);
    else if (r < treeP + 0.17) place('tuft', x, y);
  }
}
// juncos e vitórias-régias junto à água
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = idx(x, y);
    const g = ground[i];
    const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ground[idx(x + dx, y + dy)] === T.water);
    if (!TILE_SOLID[g] && nearWater && rand() < 0.25) place('reeds', x, y);
    if (g === T.water && rand() < 0.05) place('lily', x, y, { onWater: true });
  }
}

// ---------------------------------------------------------------- conectividade
// Garante que todo ponto de interesse é alcançável a pé a partir da praça:
// procura o caminho mais barato (atravessar objeto custa caro) e remove os objetos no caminho.
const START = { x: 96, y: 97 };
function solidAt(x, y, ignoreObjects) {
  if (!inB(x, y)) return true;
  if (TILE_SOLID[ground[idx(x, y)]]) return true;
  if (ignoreObjects) return false;
  const n = occ[idx(x, y)];
  return n >= 0 && OBJ_BY_ID[objects[n].id].solid;
}
function carveTo(tx, ty) {
  tx = Math.floor(tx);
  ty = Math.floor(ty);
  const N = W * H;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = [];
  const push = (c, i) => {
    heap.push([c, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const s = idx(START.x, START.y);
  cost[s] = 0;
  push(0, s);
  const goal = idx(tx, ty);
  while (heap.length) {
    const [c, i] = pop();
    if (c > cost[i]) continue;
    if (i === goal) break;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (solidAt(nx, ny, true)) continue;
      const j = idx(nx, ny);
      const step = solidAt(nx, ny, false) ? 30 : 1;
      if (c + step < cost[j]) {
        cost[j] = c + step;
        prev[j] = i;
        push(c + step, j);
      }
    }
  }
  if (!isFinite(cost[goal])) return false;
  let removed = 0;
  for (let i = goal; i !== -1; i = prev[i]) {
    const x = i % W;
    const y = (i / W) | 0;
    if (solidAt(x, y, false)) {
      removeObjectAt(x, y);
      removed++;
    }
  }
  return removed;
}
let carved = 0;
const unreachable = [];
for (const p of pois) {
  const r = carveTo(p.x, p.y);
  if (r === false) unreachable.push(p.id);
  else carved += r;
}

// ---------------------------------------------------------------- inimigos por chunk
const spawns = new Map(); // chunkKey -> []
function addSpawn(e, x, y, n, lv) {
  const cx = Math.floor(x / CS);
  const cy = Math.floor(y / CS);
  const key = `${cx}_${cy}`;
  if (!spawns.has(key)) spawns.set(key, []);
  const list = spawns.get(key);
  list.push({ id: `${key}_${list.length}`, e, x: +x.toFixed(1), y: +y.toFixed(1), n, lv });
}
function freeTileNear(x, y, r) {
  for (let t = 0; t < 60; t++) {
    const tx = Math.floor(x + (rand() * 2 - 1) * r);
    const ty = Math.floor(y + (rand() * 2 - 1) * r);
    if (!solidAt(tx, ty, false) && !road[idx(tx, ty)] && !keepClear[idx(tx, ty)]) return [tx + 0.5, ty + 0.5];
  }
  return null;
}
// grupos fixos para a missão da caravana e o acampamento
addSpawn('bandido', 147.5, 100.5, 3, 3);
addSpawn('bandido', 155.5, 115.5, 2, 4);
addSpawn('bandido_arqueiro', 160.5, 120.5, 2, 4);
addSpawn('esqueleto', 158.5, 62.5, 3, 5);
addSpawn('esqueleto', 172.5, 52.5, 3, 6);

const TABLES = {
  campos: [['slime', 2, 4], ['slime', 3, 4], ['javali', 1, 2], ['goblin', 2, 3]],
  floresta: [['lobo', 2, 4], ['lobo', 3, 4], ['aranha', 1, 3], ['lobo', 2, 3]],
  ruinas: [['esqueleto', 2, 3], ['goblin_arqueiro', 1, 2], ['goblin', 2, 3], ['esqueleto', 2, 4]],
  lago: [['slime', 2, 4], ['goblin', 2, 3]],
  bandidos: [['bandido', 2, 3]],
};
for (let cy = 0; cy < HC; cy++) {
  for (let cx = 0; cx < WC; cx++) {
    const mx = cx * CS + CS / 2;
    const my = cy * CS + CS / 2;
    if (dist(mx, my, P.village.x, P.village.y) < 22) continue;
    if (dist(mx, my, P.vale.x, P.vale.y) < 14) continue;
    if (dist(mx, my, P.caravan.x, P.caravan.y) < 9 || dist(mx, my, P.camp.x, P.camp.y) < 9) continue;
    const counts = {};
    for (let y = cy * CS; y < cy * CS + CS; y++)
      for (let x = cx * CS; x < cx * CS + CS; x++) counts[ground[idx(x, y)]] = (counts[ground[idx(x, y)]] || 0) + 1;
    const tot = CS * CS;
    const frac = (...ids) => ids.reduce((s, id) => s + (counts[id] || 0), 0) / tot;
    if (frac(T.water, T.deep_water) > 0.6) continue;
    let biome = 'campos';
    if (frac(T.forest_floor) > 0.4) biome = 'floresta';
    else if (frac(T.rocky, T.ruin_floor) > 0.35) biome = 'ruinas';
    else if (frac(T.water, T.deep_water, T.sand) > 0.25) biome = 'lago';
    const lvBase = 1 + Math.floor(dist(mx, my, P.village.x, P.village.y) / 24);
    const groups = rand() < 0.55 ? 1 : 2;
    for (let g = 0; g < groups; g++) {
      const [e, a, b] = pick(TABLES[biome]);
      const pos = freeTileNear(mx, my, CS / 2 - 1);
      if (!pos) continue;
      addSpawn(e, pos[0], pos[1], randInt(a, b), Math.min(8, lvBase + (e === 'aranha' || e === 'esqueleto' ? 1 : 0)));
    }
  }
}

// ---------------------------------------------------------------- áreas e fragmentos de mapa
const areas = [
  { id: 'acampamento', name: 'Acampamento dos Saqueadores', x: 157, y: 121, r: 8 },
  { id: 'eldenor', name: 'Vila de Eldenor', x: 96, y: 100, r: 15 },
  { id: 'valedouro', name: 'Valedouro', x: 46, y: 138, r: 14 },
  { id: 'estrada', name: 'Estrada das Caravanas', x: 139, y: 103, r: 10 },
  { id: 'ruinas', name: 'Ruínas Antigas', x: 162, y: 50, r: 27 },
  { id: 'lago', name: 'Lago de Orvalho', x: 133, y: 165, r: 26 },
  { id: 'clareira', name: 'Clareira do Sino', x: 72, y: 37, r: 9 },
  { id: 'floresta', name: 'Floresta dos Sinos Mudos', x: 70, y: 22, r: 48 },
  { id: 'floresta_oeste', name: 'Floresta dos Sinos Mudos', x: 6, y: 96, r: 26 },
];
const mapFragments = [
  { id: 'frag_leste', name: 'Mapa da Estrada Leste', rect: [128, 30, 190, 132] },
  { id: 'frag_floresta', name: 'Mapa da Floresta dos Sinos Mudos', rect: [4, 4, 124, 60] },
  { id: 'frag_sul', name: 'Mapa do Lago de Orvalho', rect: [96, 136, 188, 188] },
  { id: 'frag_vale', name: 'Mapa de Valedouro', rect: [20, 110, 80, 160] },
];

// ---------------------------------------------------------------- saída
const overviewPalette = [...defs.tiles.map((t) => t.map)];
const PAL_TREE = overviewPalette.push('#2a5a2c') - 1;
const PAL_BUILD = overviewPalette.push('#b65a3f') - 1;
const PAL_STONE = overviewPalette.push('#a39b8b') - 1;
const PAL_ROCK = overviewPalette.push('#6c6c6c') - 1;
const overview = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  let c = ground[i];
  const n = occ[i];
  if (n >= 0) {
    const k = OBJ_BY_ID[objects[n].id].key;
    if (['oak', 'pine', 'dark_tree'].includes(k)) c = PAL_TREE;
    else if (k.startsWith('house') || k === 'stall' || k === 'tent') c = PAL_BUILD;
    else if (['pillar', 'pillar_broken', 'ruin_wall', 'statue', 'fountain', 'well'].includes(k)) c = PAL_STONE;
    else if (k === 'rock' || k === 'rock_big') c = PAL_ROCK;
  }
  overview[i] = c;
}

fs.rmSync(path.join(OUT, 'chunks'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'chunks'), { recursive: true });

let fnv = 2166136261;
const mix = (s) => {
  for (let i = 0; i < s.length; i++) fnv = Math.imul(fnv ^ s.charCodeAt(i), 16777619);
};

let totalBytes = 0;
let objCount = 0;
for (let cy = 0; cy < HC; cy++) {
  for (let cx = 0; cx < WC; cx++) {
    const g = new Uint8Array(CS * CS);
    for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) g[y * CS + x] = ground[idx(cx * CS + x, cy * CS + y)];
    const o = objects
      .filter((ob) => !ob.removed && Math.floor(ob.x / CS) === cx && Math.floor(ob.y / CS) === cy)
      .map((ob) => [ob.id, ob.x - cx * CS, ob.y - cy * CS]);
    objCount += o.length;
    const data = { cx, cy, g: Buffer.from(g).toString('base64'), o, s: spawns.get(`${cx}_${cy}`) || [] };
    const json = JSON.stringify(data);
    mix(json);
    totalBytes += json.length;
    fs.writeFileSync(path.join(OUT, 'chunks', `${cx}_${cy}.json`), json);
  }
}

const manifest = {
  format: 'cronicas-world',
  version: (fnv >>> 0).toString(36),
  seed: SEED,
  tileW: defs.tileW,
  tileH: defs.tileH,
  chunkSize: CS,
  widthChunks: WC,
  heightChunks: HC,
  width: W,
  height: H,
  spawn: { x: 96.5, y: 97.5 },
  areas,
  defaultArea: 'Campos de Orvalho',
  pois,
  mapFragments,
  overviewPalette,
  overview: Buffer.from(overview).toString('base64'),
  // Para trocar a arte procedural por atlas desenhados à mão, preencha por exemplo:
  // "art": { "tiles": "assets/atlases/tiles", "objects": "assets/atlases/objects" }
  // (cada caminho aponta para <nome>.png + <nome>.json no formato JSON Hash do TexturePacker)
  art: {},
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));

console.log(`Mundo gerado: ${W}×${H} tiles, ${WC * HC} chunks, ${objCount} objetos, ${pois.length} pontos de interesse.`);
console.log(`Chunks: ${(totalBytes / 1024).toFixed(0)} KB no total · manifesto ${(JSON.stringify(manifest).length / 1024).toFixed(0)} KB · versão ${manifest.version}`);
console.log(`Objetos removidos para abrir caminhos: ${carved}`);
if (unreachable.length) console.warn('ATENÇÃO — inalcançáveis:', unreachable.join(', '));
