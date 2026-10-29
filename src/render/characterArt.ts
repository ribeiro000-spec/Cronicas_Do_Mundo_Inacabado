import * as Phaser from 'phaser';
import type { HumanoidLook, ItemVisual } from '../core/types';
import { C, PB, bayer, blob, dither, ints, ramp, selout, thick } from './art/paint';
import { CREATURE_FRAMES, drawCreature, type CreatureShape } from './art/creatures';
import { FRAMES_PER_FACING, HANDS, HUM_FOOT_Y, HUM_H, HUM_W, drawFist, drawHumanoidPose, type Facing } from './art/humanoid';

/* Personagens em camadas, em alta resolução (48×64 por quadro). Cada peça de equipamento
 * substitui só a sua camada. A textura de um personagem tem 2 vistas × 9 quadros
 * (ver art/humanoid.ts). Armas e escudos são sprites separados porque giram nos ataques. */

export { FRAMES_PER_FACING, HANDS, HUM_FOOT_Y, HUM_H, HUM_W };
export { FRAME_ATTACK, FRAME_CAST } from './art/humanoid';
/** posição das mãos com o personagem parado, relativa aos pés, em pixels de arte */
export const HAND_MAIN = HANDS[0].main;
export const HAND_OFF = HANDS[0].off;

type Pal = number[];

const palCache = new Map<string, Pal>();
function pal(hex: string, n = 6, spread = 0.46): Pal {
  const k = `${hex}|${n}|${spread}`;
  let p = palCache.get(k);
  if (!p) {
    p = ints(ramp(hex, n, spread, 16));
    palCache.set(k, p);
  }
  return p;
}

/** Retângulo sombreado: claro à esquerda/em cima, escuro à direita/embaixo. */
function part(pb: PB, x: number, y: number, w: number, h: number, p: Pal, light = 0.62, fn?: (px: number, py: number, s: number, t: number) => number): void {
  for (let py = y; py < y + h; py++)
    for (let px = x; px < x + w; px++) {
      const s = (px + 0.5 - x) / w;
      const t = (py + 0.5 - y) / h;
      let v = light - (s - 0.35) * 0.55 - t * 0.12;
      if (fn) v += fn(px, py, s, t);
      pb.set(px, py, dither(v, px, py, p));
    }
}

/** Elipse sombreada (cabeça, ombreiras…). */
function oval(pb: PB, cx: number, cy: number, rx: number, ry: number, p: Pal, light = 0.62): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const v = light - dx * 0.32 - dy * 0.14 - (dx * dx + dy * dy) * 0.12;
      pb.set(x, y, dither(v, x, y, p));
    }
}

function line(pb: PB, x0: number, y0: number, x1: number, y1: number, c: number): void {
  thick(pb, x0, y0, x1, y1, 1, c);
}

/* ---------------------------------------------------------------- humanoides
 * O desenho dos humanoides fica em art/humanoid.ts (estilo chibi em 3/4). */

/** Compatibilidade: quadro de uma vista ('S'/'N') — step 0 parado, 1-6 caminhada, 7 golpe, 8 magia. */
export function drawHumanoidFrame(look: HumanoidLook, facing: Facing, step: number): PB {
  return drawHumanoidPose(look, facing, step);
}

/* ---------------------------------------------------------------- armas */

export interface WeaponArt {
  pb: PB;
  gripX: number;
  gripY: number;
}

export function drawWeapon(v: ItemVisual): WeaponArt {
  const metal = pal(v.color, 6, 0.5);
  const grip = pal(v.color2 ?? '#6b4a2b', 5, 0.45);
  const gold = pal('#d8b04a', 5, 0.45);
  let pb: PB;
  let gx = 0;
  let gy = 0;
  switch (v.style) {
    case 'sword': {
      pb = new PB(16, 42);
      for (let y = 2; y < 28; y++) {
        pb.set(6, y, metal[5]);
        pb.set(7, y, metal[4]);
        pb.set(8, y, metal[2]);
        pb.set(9, y, metal[1]);
        if (y > 4 && y < 25) pb.set(7, y, metal[3]); // sulco
      }
      pb.rect(7, 0, 2, 2, metal[5]);
      pb.set(6, 1, metal[4]);
      part(pb, 1, 28, 14, 3, gold, 0.7);
      for (let y = 31; y < 38; y++) part(pb, 6, y, 4, 1, grip, (y % 2 ? 0.6 : 0.4));
      oval(pb, 8, 39, 2.6, 2.6, gold, 0.8);
      pb.set(7, 38, C('#ff6a6a'));
      gx = 8;
      gy = 34;
      break;
    }
    case 'dagger': {
      pb = new PB(12, 26);
      for (let y = 1; y < 14; y++) {
        const w = y < 4 ? 1 : 2;
        part(pb, 6 - w, y, w * 2, 1, metal, 0.6);
      }
      pb.set(5, 1, metal[5]);
      part(pb, 1, 14, 10, 2, gold, 0.7);
      for (let y = 16; y < 23; y++) part(pb, 4, y, 4, 1, grip, y % 2 ? 0.6 : 0.4);
      oval(pb, 6, 24, 2, 1.6, gold, 0.8);
      gx = 6;
      gy = 19;
      break;
    }
    case 'axe': {
      pb = new PB(26, 50);
      for (let y = 4; y < 48; y++) part(pb, 11, y, 4, 1, grip, 0.55 + Math.sin(y * 0.8) * 0.05);
      // lâmina em crescente
      for (let y = 2; y < 22; y++)
        for (let x = 14; x < 26; x++) {
          const dx = (x + 0.5 - 12) / 13;
          const dy = (y + 0.5 - 11) / 10;
          const d = dx * dx + dy * dy;
          if (d > 1 || x < 15) continue;
          pb.set(x, y, dither(d > 0.8 ? 0.9 : 0.5 - dy * 0.2, x, y, metal));
        }
      for (let y = 6; y < 16; y++) for (let x = 4; x < 11; x++) if (Math.abs(y - 11) < (11 - x) * 0.6) pb.set(x, y, dither(0.35, x, y, metal));
      part(pb, 10, 8, 6, 6, metal, 0.4);
      gx = 13;
      gy = 40;
      break;
    }
    case 'mace': {
      pb = new PB(20, 38);
      for (let y = 12; y < 36; y++) part(pb, 8, y, 4, 1, grip, y % 3 ? 0.55 : 0.4);
      oval(pb, 10, 8, 7, 7, metal, 0.6);
      for (const [x, y] of [[10, 0], [2, 8], [18, 8], [4, 2], [16, 2], [10, 16]]) part(pb, x - 1, y, 2, 2, metal, 0.75);
      oval(pb, 10, 36, 2.4, 1.6, gold, 0.7);
      gx = 10;
      gy = 28;
      break;
    }
    case 'bow': {
      pb = new PB(20, 50);
      for (let y = 1; y < 49; y++) {
        const t = (y - 25) / 24;
        const x = 3 + (1 - t * t) * 10 - Math.abs(t) ** 6 * 3;
        part(pb, Math.round(x), y, 3, 1, metal, 0.55 - t * 0.1);
      }
      line(pb, 3, 2, 3, 47, C(v.color2 ?? '#e8e0c8'));
      part(pb, 12, 21, 4, 8, pal('#3a2616'), 0.5);
      gx = 14;
      gy = 25;
      break;
    }
    case 'staff': {
      pb = new PB(20, 62);
      for (let y = 12; y < 60; y++) part(pb, 8, y, 4, 1, metal, 0.55 + (y % 7 === 0 ? -0.2 : 0));
      // garras segurando a gema
      line(pb, 6, 12, 4, 5, metal[2]);
      line(pb, 13, 12, 15, 5, metal[1]);
      const gem = pal(v.color2 ?? '#7cc7ff', 5, 0.5);
      oval(pb, 10, 7, 5, 5.5, gem, 0.75);
      pb.rect(8, 4, 2, 2, C('#ffffff'));
      part(pb, 7, 12, 6, 2, gold, 0.75);
      gx = 10;
      gy = 46;
      break;
    }
    case 'shield_round': {
      pb = new PB(26, 26);
      const rim = pal(v.color2 ?? '#9aa0aa');
      oval(pb, 13, 13, 12, 12, rim, 0.6);
      oval(pb, 13, 13, 10, 10, metal, 0.6);
      for (let x = 5; x < 22; x += 4) line(pb, x, 4, x, 22, metal[1]);
      oval(pb, 13, 13, 3.2, 3.2, rim, 0.85);
      for (let a = 0; a < 6.28; a += 0.8) pb.set(Math.round(13 + Math.cos(a) * 11), Math.round(13 + Math.sin(a) * 11), rim[5]);
      gx = 13;
      gy = 13;
      break;
    }
    case 'shield_kite': {
      pb = new PB(26, 32);
      const em = pal(v.color2 ?? '#3b5e9c');
      pb.poly(
        [
          [2, 2],
          [24, 2],
          [24, 14],
          [13, 31],
          [2, 14],
        ],
        (x, y) => dither(0.66 - (x - 2) * 0.02 - y * 0.005, x, y, metal),
      );
      pb.poly(
        [
          [5, 5],
          [21, 5],
          [21, 14],
          [13, 27],
          [5, 14],
        ],
        (x, y) => dither(0.6 - (x - 5) * 0.02, x, y, em),
      );
      part(pb, 11, 6, 4, 17, metal, 0.8);
      part(pb, 6, 11, 14, 3, metal, 0.8);
      gx = 13;
      gy = 13;
      break;
    }
    case 'orb': {
      pb = new PB(18, 18);
      oval(pb, 9, 9, 7.5, 7.5, metal, 0.7);
      pb.rect(5, 5, 3, 2, C(v.color2 ?? '#ffffff'));
      gx = 9;
      gy = 9;
      break;
    }
    default:
      pb = new PB(4, 4);
      gx = 2;
      gy = 2;
  }
  selout(pb, -0.65);
  return { pb, gripX: gx, gripY: gy };
}

/* ---------------------------------------------------------------- criaturas
 * O desenho das criaturas fica em art/creatures.ts. */

export { CREATURE_FRAMES };

/* ---------------------------------------------------------------- registro de texturas */

function stableKey(o: unknown): string {
  const s = JSON.stringify(o);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function addStrip(tm: Phaser.Textures.TextureManager, key: string, frames: PB[]): void {
  const w = frames[0].w;
  const h = frames[0].h;
  const strip = new PB(w * frames.length, h);
  frames.forEach((f, i) => strip.blit(f, i * w, 0));
  const tex = tm.addCanvas(key, strip.toCanvas());
  if (!tex) return;
  frames.forEach((_, i) => tex.add(i, 0, i * w, 0, w, h));
}

export function humanoidFrames(look: HumanoidLook): PB[] {
  const out: PB[] = [];
  for (const f of ['S', 'N'] as const) for (let i = 0; i < FRAMES_PER_FACING; i++) out.push(drawHumanoidPose(look, f, i));
  return out;
}

/** Mão (ou luva) que fica por cima do cabo da arma. */
export function ensureFist(tm: Phaser.Textures.TextureManager, look: HumanoidLook): string {
  const key = 'fist_' + stableKey([look.skin, look.gloves?.color ?? '']);
  if (!tm.exists(key)) tm.addCanvas(key, drawFist(look).toCanvas());
  return key;
}

export function ensureHumanoid(tm: Phaser.Textures.TextureManager, look: HumanoidLook): string {
  const body = { ...look, main: undefined, off: undefined };
  const key = 'hum_' + stableKey(body);
  if (!tm.exists(key)) addStrip(tm, key, humanoidFrames(body));
  return key;
}

const weaponGrip = new Map<string, { gripX: number; gripY: number; w: number; h: number }>();

export function ensureWeapon(tm: Phaser.Textures.TextureManager, v: ItemVisual): { key: string; gripX: number; gripY: number; w: number; h: number } {
  const key = 'wpn_' + stableKey(v);
  if (!tm.exists(key)) {
    const art = drawWeapon(v);
    tm.addCanvas(key, art.pb.toCanvas());
    weaponGrip.set(key, { gripX: art.gripX, gripY: art.gripY, w: art.pb.w, h: art.pb.h });
  }
  return { key, ...weaponGrip.get(key)! };
}

export type CreatureArtKind = CreatureShape;

export function ensureCreature(tm: Phaser.Textures.TextureManager, kind: CreatureArtKind, color: string, spirit = false): string {
  const key = `cre2_${kind}_${color.replace('#', '')}${spirit ? '_s' : ''}`;
  if (tm.exists(key)) return key;
  const n = CREATURE_FRAMES[kind].count;
  addStrip(tm, key, Array.from({ length: n }, (_, f) => drawCreature(kind, color, f, spirit)));
  return key;
}

/* ---------------------------------------------------------------- retratos para a interface */

function toScaledCanvas(pb: PB, sx: number, sy: number, sw: number, sh: number, scale: number): HTMLCanvasElement {
  const src = pb.toCanvas();
  const cv = document.createElement('canvas');
  cv.width = sw * scale;
  cv.height = sh * scale;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
  return cv;
}

/** Retrato (cabeça e ombros) para a interface. `scale` em pixels por unidade lógica. */
export function portraitCanvas(look: HumanoidLook, scale = 3, crop = true): HTMLCanvasElement {
  const frame = drawHumanoidPose({ ...look, main: undefined, off: undefined }, 'S', 0);
  const s = Math.max(1, Math.round(scale / 2));
  // recorte de cabeça e ombros (a cabeça fica entre y≈2 e y≈32)
  return crop ? toScaledCanvas(frame, 8, 3, 32, 32, s) : toScaledCanvas(frame, 0, 0, HUM_W, HUM_H, s);
}

/** Personagem inteiro, com arma, para a tela de equipamento e criação. */
export function fullFigureCanvas(look: HumanoidLook, scale = 4): HTMLCanvasElement {
  const pb = new PB(HUM_W + 32, HUM_H + 12);
  const ox = 16;
  const oy = 6;
  if (look.off) {
    const off = drawWeapon(look.off);
    pb.blit(off.pb, ox + 24 + HAND_OFF.x - off.gripX, oy + HUM_FOOT_Y + HAND_OFF.y - off.gripY);
  }
  pb.blit(drawHumanoidPose(look, 'S', 0), ox, oy);
  if (look.main) {
    const w = drawWeapon(look.main);
    pb.blit(w.pb, ox + 24 + HAND_MAIN.x - w.gripX, oy + HUM_FOOT_Y + HAND_MAIN.y - w.gripY);
    const fist = drawFist(look);
    pb.blit(fist, ox + 24 + HAND_MAIN.x - 3, oy + HUM_FOOT_Y + HAND_MAIN.y - 3);
  }
  return toScaledCanvas(pb, 0, 0, pb.w, pb.h, Math.max(1, Math.round(scale / 2)));
}

export { bayer, blob };
