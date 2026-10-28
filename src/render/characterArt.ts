import * as Phaser from 'phaser';
import type { HumanoidLook, ItemVisual } from '../core/types';
import { C, PB, shade } from './pixel';

/* Personagens em camadas. Ordem de desenho (de frente):
 *   capa (atrás) → pernas → corpo/pele → peitoral → luvas → rosto → barba → cabelo → elmo
 * Cada peça de equipamento substitui apenas a sua camada. As camadas são compostas numa
 * única textura por combinação de visual (cache), com 6 quadros:
 *   0-2 = de frente (parado, passo A, passo B) · 3-5 = de costas.
 * Armas e escudos são sprites separados porque giram durante os ataques. */

export const HUM_W = 24;
export const HUM_H = 32;
export const HUM_FOOT_Y = 30;
const OUT = C('#1b1a24');

type Facing = 'S' | 'N';

function p(pb: PB, x: number, y: number, w: number, h: number, hex: string): void {
  pb.rect(x, y, w, h, C(hex));
}

function drawCapeBack(pb: PB, cape: ItemVisual, step: number): void {
  const c = cape.color;
  const sway = step === 1 ? -1 : step === 2 ? 1 : 0;
  pb.poly(
    [
      [7, 14],
      [17, 14],
      [19 + sway, 28],
      [5 + sway, 28],
    ],
    (x) => C(x < 10 ? shade(c, -0.1) : x > 14 ? shade(c, -0.35) : shade(c, -0.2)),
  );
}

function drawCapeFront(pb: PB, cape: ItemVisual, step: number): void {
  // de costas a capa cobre o corpo
  const c = cape.color;
  const sway = step === 1 ? -1 : step === 2 ? 1 : 0;
  pb.poly(
    [
      [8, 14],
      [16, 14],
      [17 + sway, 25],
      [7 + sway, 25],
    ],
    (x, y) => C(y === 24 ? shade(c, -0.3) : x < 10 ? shade(c, 0.12) : x > 14 ? shade(c, -0.18) : c),
  );
  p(pb, 8, 14, 8, 1, shade(c, 0.25));
}

function drawLegs(pb: PB, legs: ItemVisual | null | undefined, step: number, skin: string): void {
  const lUp = step === 1 ? 1 : 0;
  const rUp = step === 2 ? 1 : 0;
  const style = legs?.style ?? 'pants';
  const pants = legs?.color ?? '#4a4036';
  const boots = legs?.color2 ?? '#3a2616';
  if (style === 'bones') {
    p(pb, 10, 22 - lUp, 1, 6, skin);
    p(pb, 13, 22 - rUp, 1, 6, skin);
    p(pb, 9, 27 - lUp, 3, 2, skin);
    p(pb, 12, 27 - rUp, 3, 2, skin);
    return;
  }
  // pernas
  p(pb, 9, 22 - lUp, 3, 6, pants);
  p(pb, 12, 22 - rUp, 3, 6, shade(pants, -0.15));
  p(pb, 9, 22 - lUp, 1, 5, shade(pants, 0.15));
  if (style === 'greaves') {
    p(pb, 9, 24 - lUp, 3, 3, pants);
    p(pb, 12, 24 - rUp, 3, 3, shade(pants, -0.18));
    pb.set(10, 24 - lUp, C(shade(pants, 0.4)));
    pb.set(13, 24 - rUp, C(shade(pants, 0.25)));
  }
  // botas
  p(pb, 8, 27 - lUp, 4, 2, boots);
  p(pb, 12, 27 - rUp, 4, 2, shade(boots, -0.15));
  pb.set(8, 27 - lUp, C(shade(boots, 0.2)));
}

function drawBody(pb: PB, look: HumanoidLook, facing: Facing, step: number): void {
  const skin = look.skin;
  const dark = shade(skin, -0.18);
  const armL = facing === 'S' ? (step === 2 ? -1 : 0) : step === 1 ? -1 : 0;
  const armR = facing === 'S' ? (step === 1 ? -1 : 0) : step === 2 ? -1 : 0;
  // braços
  p(pb, 6, 15 + armL, 2, 7, skin);
  p(pb, 16, 15 + armR, 2, 7, dark);
  // pescoço e tronco base
  p(pb, 11, 13, 2, 2, dark);
  p(pb, 8, 14, 8, 8, skin);
  // cabeça arredondada
  p(pb, 7, 5, 10, 8, skin);
  p(pb, 8, 4, 8, 1, skin);
  p(pb, 8, 13, 8, 1, skin);
  p(pb, 15, 5, 2, 8, dark);
  if (look.body === 'skeleton') {
    for (const y of [15, 17, 19]) p(pb, 9, y, 6, 1, '#4a4438');
    p(pb, 11, 14, 2, 8, shade(skin, -0.1));
  }
}

function drawChest(pb: PB, look: HumanoidLook, facing: Facing, step: number): void {
  const ch = look.chest;
  if (!ch) return;
  const c = ch.color;
  const c2 = ch.color2 ?? shade(c, 0.35);
  const lt = shade(c, 0.18);
  const dk = shade(c, -0.25);
  const armL = facing === 'S' ? (step === 2 ? -1 : 0) : step === 1 ? -1 : 0;
  const armR = facing === 'S' ? (step === 1 ? -1 : 0) : step === 2 ? -1 : 0;
  const style = ch.style;
  if (style === 'bones') return;
  if (style === 'vest') {
    p(pb, 8, 14, 2, 8, c);
    p(pb, 14, 14, 2, 8, dk);
    p(pb, 8, 21, 8, 1, '#3a2616');
    return;
  }
  // tronco
  pb.rect(8, 14, 8, 8, (x) => C(x < 10 ? lt : x > 13 ? dk : c));
  // mangas (braço superior)
  const sleeve = style === 'robe' ? 6 : style === 'plate' ? 3 : 4;
  p(pb, 6, 15 + armL, 2, sleeve, lt);
  p(pb, 16, 15 + armR, 2, sleeve, dk);
  if (style === 'chain') {
    for (let y = 14; y < 22; y++) for (let x = 8; x < 16; x++) if ((x + y) % 2 === 0) pb.set(x, y, C(shade(c, -0.12)));
    if (facing === 'S') p(pb, 10, 15, 4, 7, c2);
  }
  if (style === 'plate') {
    p(pb, 5, 14, 4, 3, lt);
    p(pb, 15, 14, 4, 3, dk);
    p(pb, 8, 17, 8, 1, c2);
    if (facing === 'S') pb.set(10, 15, C(shade(c, 0.5)));
  }
  if (style === 'leather') {
    if (facing === 'S') pb.line(9, 14, 14, 20, C(lt));
    p(pb, 8, 21, 8, 1, '#3a2616');
    if (facing === 'S') pb.set(11, 21, C('#d0a640'));
  } else if (style === 'tunic' || style === 'chain') {
    p(pb, 8, 21, 8, 1, '#5a3a22');
  }
  if (style === 'robe') {
    // saia longa
    pb.poly(
      [
        [8, 21],
        [16, 21],
        [17, 28],
        [7, 28],
      ],
      (x) => C(x < 10 ? lt : x > 13 ? dk : c),
    );
    p(pb, 7, 27, 11, 1, c2);
    if (facing === 'S') p(pb, 11, 15, 2, 12, c2);
    p(pb, 8, 21, 8, 1, shade(c2, -0.2));
  }
  if (facing === 'S' && style !== 'robe') p(pb, 10, 14, 4, 1, shade(c, 0.35));
}

function drawGloves(pb: PB, gl: ItemVisual | null | undefined, facing: Facing, step: number): void {
  if (!gl) return;
  const armL = facing === 'S' ? (step === 2 ? -1 : 0) : step === 1 ? -1 : 0;
  const armR = facing === 'S' ? (step === 1 ? -1 : 0) : step === 2 ? -1 : 0;
  p(pb, 6, 20 + armL, 2, 2, gl.color);
  p(pb, 16, 20 + armR, 2, 2, shade(gl.color, -0.2));
}

function drawFace(pb: PB, look: HumanoidLook): void {
  const eye = look.eyes ?? '#1a1a2a';
  p(pb, 9, 9, 1, 2, eye);
  p(pb, 14, 9, 1, 2, eye);
  if (look.body === 'skeleton') {
    p(pb, 8, 8, 3, 3, '#2a2420');
    p(pb, 13, 8, 3, 3, '#2a2420');
    pb.set(9, 9, C(eye));
    pb.set(14, 9, C(eye));
    p(pb, 10, 12, 4, 1, '#4a4438');
    return;
  }
  pb.set(8, 11, C(shade(look.skin, -0.08)));
  if (look.beard) {
    p(pb, 8, 11, 8, 2, look.beard);
    p(pb, 9, 13, 6, 1, look.beard);
    p(pb, 10, 14, 4, 1, shade(look.beard, -0.15));
    pb.set(11, 11, C(shade(look.skin, -0.3)));
    pb.set(12, 11, C(shade(look.skin, -0.3)));
  }
}

function drawHair(pb: PB, look: HumanoidLook, facing: Facing): void {
  const style = look.hairStyle;
  if (style === 'careca' || look.body === 'skeleton') return;
  const h = look.hair;
  const lt = shade(h, 0.2);
  const dk = shade(h, -0.25);
  if (facing === 'N') {
    p(pb, 7, 4, 10, 9, h);
    p(pb, 8, 3, 8, 1, lt);
    p(pb, 15, 5, 2, 8, dk);
    if (style === 'longo') p(pb, 7, 12, 10, 4, dk);
    if (style === 'rabo') p(pb, 11, 12, 2, 5, dk);
    return;
  }
  p(pb, 8, 3, 8, 2, lt);
  p(pb, 7, 4, 10, 3, h);
  p(pb, 7, 7, 1, 3, h);
  p(pb, 16, 7, 1, 3, dk);
  p(pb, 8, 7, 3, 1, h);
  p(pb, 13, 7, 2, 1, dk);
  if (style === 'longo') {
    p(pb, 6, 6, 2, 10, h);
    p(pb, 16, 6, 2, 10, dk);
  }
  if (style === 'rabo') {
    p(pb, 17, 6, 2, 3, dk);
    p(pb, 18, 9, 1, 5, dk);
  }
}

function drawHead(pb: PB, head: ItemVisual | null | undefined, facing: Facing): void {
  if (!head) return;
  const c = head.color;
  const lt = shade(c, 0.2);
  const dk = shade(c, -0.25);
  switch (head.style) {
    case 'hood':
      if (facing === 'S') {
        pb.rect(6, 2, 12, 9, (x, y) => (x >= 9 && x <= 14 && y >= 7 ? null : C(x < 9 ? lt : x > 14 ? dk : c)));
        p(pb, 6, 11, 2, 4, dk);
        p(pb, 16, 11, 2, 4, dk);
        p(pb, 8, 2, 8, 1, lt);
      } else {
        p(pb, 6, 2, 12, 11, c);
        p(pb, 8, 13, 8, 2, dk);
        p(pb, 8, 2, 8, 1, lt);
        p(pb, 11, 4, 2, 8, dk);
      }
      break;
    case 'helm':
      p(pb, 6, 3, 12, facing === 'S' ? 5 : 9, c);
      p(pb, 7, 2, 10, 1, lt);
      p(pb, 6, 8, 12, 1, dk);
      p(pb, 6, 3, 2, 5, lt);
      if (facing === 'S') {
        p(pb, 11, 8, 2, 3, dk);
        p(pb, 6, 9, 1, 4, c);
        p(pb, 17, 9, 1, 4, dk);
      }
      break;
    case 'wizard': {
      pb.poly(
        [
          [12, -1],
          [16, 6],
          [8, 6],
        ],
        (x) => C(x < 12 ? lt : c),
      );
      p(pb, 4, 6, 16, 2, c);
      p(pb, 5, 7, 14, 1, dk);
      p(pb, 8, 5, 8, 1, head.color2 ?? '#d8b54a');
      break;
    }
    case 'circlet':
      p(pb, 7, 6, 10, 1, c);
      if (facing === 'S') pb.set(11, 6, C('#7cc7ff'));
      break;
    case 'bandana':
      p(pb, 7, 4, 10, 2, c);
      p(pb, 8, 3, 8, 1, lt);
      if (facing === 'S') p(pb, 17, 5, 2, 2, dk);
      break;
  }
}

export function drawHumanoidFrame(look: HumanoidLook, facing: Facing, step: number): PB {
  const pb = new PB(HUM_W, HUM_H);
  if (facing === 'S' && look.cape) drawCapeBack(pb, look.cape, step);
  drawLegs(pb, look.legs, step, look.skin);
  drawBody(pb, look, facing, step);
  drawChest(pb, look, facing, step);
  drawGloves(pb, look.gloves, facing, step);
  if (facing === 'S') drawFace(pb, look);
  drawHair(pb, look, facing);
  drawHead(pb, look.head, facing);
  if (facing === 'N' && look.cape) drawCapeFront(pb, look.cape, step);
  pb.outline(OUT);
  return pb;
}

/* ---------------------------------------------------------------- armas e mão secundária */

export interface WeaponArt {
  pb: PB;
  gripX: number;
  gripY: number;
}

export function drawWeapon(v: ItemVisual): WeaponArt {
  const c = v.color;
  const c2 = v.color2 ?? '#6b4a2b';
  switch (v.style) {
    case 'sword': {
      const pb = new PB(7, 20);
      p(pb, 3, 1, 1, 12, shade(c, 0.3));
      p(pb, 4, 1, 1, 12, shade(c, -0.15));
      pb.set(3, 0, C(shade(c, 0.4)));
      p(pb, 1, 13, 5, 1, '#c8a957');
      p(pb, 3, 14, 2, 4, c2);
      p(pb, 3, 18, 2, 1, '#c8a957');
      pb.outline(OUT);
      return { pb, gripX: 4, gripY: 16 };
    }
    case 'dagger': {
      const pb = new PB(6, 12);
      p(pb, 2, 1, 2, 6, c);
      pb.set(2, 1, C(shade(c, 0.4)));
      p(pb, 1, 7, 4, 1, '#c8a957');
      p(pb, 2, 8, 2, 3, c2);
      pb.outline(OUT);
      return { pb, gripX: 3, gripY: 9 };
    }
    case 'axe': {
      const pb = new PB(12, 24);
      p(pb, 5, 2, 2, 21, c2);
      pb.poly(
        [
          [7, 1],
          [11, 0],
          [11, 10],
          [7, 8],
        ],
        (x) => C(x > 9 ? shade(c, 0.3) : c),
      );
      pb.poly(
        [
          [5, 2],
          [2, 3],
          [2, 7],
          [5, 6],
        ],
        C(shade(c, -0.2)),
      );
      pb.outline(OUT);
      return { pb, gripX: 6, gripY: 19 };
    }
    case 'mace': {
      const pb = new PB(9, 18);
      p(pb, 4, 6, 2, 11, c2);
      pb.ellipse(4.5, 4, 3.4, 3.4, (x) => C(x < 4 ? shade(c, 0.25) : c));
      for (const [x, y] of [[4, 0], [0, 4], [8, 4]]) pb.set(x, y, C(shade(c, -0.2)));
      pb.outline(OUT);
      return { pb, gripX: 5, gripY: 14 };
    }
    case 'bow': {
      const pb = new PB(9, 24);
      for (let y = 1; y < 23; y++) {
        const t = (y - 12) / 11;
        const x = Math.round(2 + (1 - t * t) * 4);
        pb.set(x, y, C(c));
        pb.set(x + 1, y, C(shade(c, -0.25)));
      }
      pb.line(2, 1, 2, 22, C(c2));
      p(pb, 6, 10, 2, 4, '#3a2616');
      pb.outline(OUT);
      return { pb, gripX: 6, gripY: 12 };
    }
    case 'staff': {
      const pb = new PB(9, 30);
      p(pb, 4, 6, 1, 23, c);
      p(pb, 5, 6, 1, 23, shade(c, -0.25));
      pb.ellipse(4.5, 3.5, 3.2, 3.2, (x, y) => C(x < 4 && y < 3 ? '#ffffff' : c2));
      p(pb, 3, 6, 3, 1, '#c8a957');
      pb.outline(OUT);
      return { pb, gripX: 5, gripY: 22 };
    }
    case 'shield_round': {
      const pb = new PB(12, 12);
      pb.ellipse(6, 6, 5.5, 5.5, C(v.color2 ?? '#9aa0aa'));
      pb.ellipse(6, 6, 4.3, 4.3, (x) => C(x < 6 ? shade(c, 0.15) : c));
      pb.ellipse(6, 6, 1.4, 1.4, C(v.color2 ?? '#9aa0aa'));
      pb.outline(OUT);
      return { pb, gripX: 6, gripY: 6 };
    }
    case 'shield_kite': {
      const pb = new PB(12, 15);
      pb.poly(
        [
          [1, 1],
          [11, 1],
          [11, 7],
          [6, 14],
          [1, 7],
        ],
        (x) => C(x < 6 ? shade(c, 0.15) : c),
      );
      pb.rect(5, 2, 2, 9, C(v.color2 ?? '#3b5e9c'));
      pb.rect(2, 4, 8, 2, C(v.color2 ?? '#3b5e9c'));
      pb.outline(OUT);
      return { pb, gripX: 6, gripY: 6 };
    }
    case 'orb': {
      const pb = new PB(8, 8);
      pb.ellipse(4, 4, 3.5, 3.5, C(c, 210));
      pb.ellipse(3.5, 3.5, 1.5, 1.5, C(v.color2 ?? '#ffffff'));
      return { pb, gripX: 4, gripY: 4 };
    }
    default: {
      const pb = new PB(4, 4);
      return { pb, gripX: 2, gripY: 2 };
    }
  }
}

/* ---------------------------------------------------------------- criaturas */

function drawSlime(color: string, frame: number): PB {
  const pb = new PB(22, 18);
  const squash = frame === 1;
  const rx = squash ? 9 : 7.5;
  const ry = squash ? 5 : 6.5;
  const cy = 16 - ry;
  pb.ellipse(11, cy, rx, ry, (x, y) => C(y > cy + ry * 0.45 ? shade(color, -0.3) : x < 9 && y < cy ? shade(color, 0.3) : color));
  pb.rect(8, Math.round(cy - 1), 1, 2, C('#1b1a24'));
  pb.rect(13, Math.round(cy - 1), 1, 2, C('#1b1a24'));
  pb.set(7, Math.round(cy - ry * 0.55), C('#ffffff'));
  pb.set(8, Math.round(cy - ry * 0.55), C('#ffffff'));
  pb.outline(OUT);
  return pb;
}

function drawQuadruped(kind: 'wolf' | 'boar', color: string, frame: number): PB {
  const pb = new PB(32, 22);
  const dk = shade(color, -0.3);
  const lt = shade(color, 0.25);
  const boar = kind === 'boar';
  const legPhase = frame === 0 ? [0, 0, 0, 0] : frame === 1 ? [1, -1, -1, 1] : [-1, 1, 1, -1];
  const legY = boar ? 15 : 14;
  const legH = boar ? 4 : 6;
  const legs = boar ? [9, 12, 19, 22] : [8, 11, 18, 21];
  legs.forEach((x, i) => {
    p(pb, x + legPhase[i], legY, 2, legH, i % 2 ? dk : color);
  });
  if (boar) {
    pb.ellipse(15, 12, 10, 5.5, (_x, y) => C(y < 9 ? dk : y > 14 ? shade(color, -0.12) : color));
    pb.ellipse(25, 13, 4.5, 3.8, C(color));
    p(pb, 28, 13, 3, 3, shade(color, 0.1));
    p(pb, 29, 12, 2, 2, '#efe6cf');
    pb.set(25, 11, C('#1b1a24'));
    for (let x = 8; x < 22; x += 2) pb.set(x, 6 + (x % 4 === 0 ? 0 : 1), C(shade(color, -0.5)));
    p(pb, 22, 8, 2, 2, dk);
  } else {
    pb.ellipse(14, 11, 9, 4.2, (_x, y) => C(y < 9 ? dk : y > 12 ? lt : color));
    pb.ellipse(23, 8, 4.2, 3.4, C(color));
    p(pb, 26, 8, 4, 2, color);
    p(pb, 26, 10, 3, 1, lt);
    pb.set(29, 8, C('#1b1a24'));
    pb.poly([[20, 6], [22, 1], [23, 6]], C(dk));
    pb.poly([[23, 5], [25, 1], [25, 6]], C(dk));
    pb.set(23, 7, C('#ffd23a'));
    pb.line(5, 9, 1, 5 + frame, C(dk));
    pb.line(5, 10, 2, 7 + frame, C(color));
  }
  pb.outline(OUT);
  return pb;
}

function drawSpider(color: string, frame: number): PB {
  const pb = new PB(28, 18);
  const leg = C(shade(color, -0.2));
  for (let i = 0; i < 4; i++) {
    const off = (frame === 1 ? (i % 2 ? 1 : -1) : frame === 2 ? (i % 2 ? -1 : 1) : 0);
    const bx = 10 + i * 3;
    pb.line(bx, 10, bx - 5 + off, 6, leg);
    pb.line(bx - 5 + off, 6, bx - 7 + off, 15, leg);
    pb.line(bx, 11, bx + 4 - off, 7, leg);
    pb.line(bx + 4 - off, 7, bx + 6 - off, 16, leg);
  }
  pb.ellipse(9, 9, 6, 4.5, (_x, y) => C(y < 7 ? shade(color, 0.2) : color));
  pb.ellipse(17, 10, 4, 3, C(shade(color, -0.1)));
  for (let k = 0; k < 3; k++) pb.set(7 + k * 2, 8, C('#c84a3a'));
  pb.set(19, 9, C('#ff4a4a'));
  pb.set(20, 10, C('#ff4a4a'));
  pb.outline(OUT);
  return pb;
}

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
  return [
    drawHumanoidFrame(look, 'S', 0),
    drawHumanoidFrame(look, 'S', 1),
    drawHumanoidFrame(look, 'S', 2),
    drawHumanoidFrame(look, 'N', 0),
    drawHumanoidFrame(look, 'N', 1),
    drawHumanoidFrame(look, 'N', 2),
  ];
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

export function ensureCreature(tm: Phaser.Textures.TextureManager, kind: 'slime' | 'wolf' | 'boar' | 'spider', color: string): string {
  const key = `cre_${kind}_${color.replace('#', '')}`;
  if (tm.exists(key)) return key;
  let frames: PB[];
  if (kind === 'slime') frames = [drawSlime(color, 0), drawSlime(color, 1), drawSlime(color, 0)];
  else if (kind === 'spider') frames = [0, 1, 2].map((f) => drawSpider(color, f));
  else frames = [0, 1, 2].map((f) => drawQuadruped(kind, color, f));
  addStrip(tm, key, frames);
  return key;
}

/** Retrato para a interface (canvas ampliado do quadro de frente). */
export function portraitCanvas(look: HumanoidLook, scale = 3, crop = true): HTMLCanvasElement {
  const frame = drawHumanoidFrame(look, 'S', 0);
  const src = frame.toCanvas();
  const sy = 0;
  const sh = crop ? 18 : HUM_H;
  const cv = document.createElement('canvas');
  cv.width = HUM_W * scale;
  cv.height = sh * scale;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, sy, HUM_W, sh, 0, 0, HUM_W * scale, sh * scale);
  return cv;
}

/** Personagem inteiro, com arma, para a tela de equipamento e criação. */
export function fullFigureCanvas(look: HumanoidLook, scale = 4): HTMLCanvasElement {
  const pb = new PB(HUM_W + 16, HUM_H + 6);
  if (look.off) {
    const off = drawWeapon(look.off);
    pb.blit(off.pb, 8 + 6 - off.gripX, 3 + 21 - off.gripY);
  }
  pb.blit(drawHumanoidFrame(look, 'S', 0), 8, 3);
  if (look.main) {
    const w = drawWeapon(look.main);
    pb.blit(w.pb, 8 + 17 - w.gripX, 3 + 21 - w.gripY);
  }
  const src = pb.toCanvas();
  const cv = document.createElement('canvas');
  cv.width = pb.w * scale;
  cv.height = pb.h * scale;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
}

