import * as Phaser from 'phaser';
import type { HumanoidLook, ItemVisual } from '../core/types';
import { C, PB, bayer, blob, dither, hash, ints, noise2, ramp, selout, shadeInt, thick } from './art/paint';

/* Personagens em camadas, em alta resolução (48×64 por quadro).
 * Ordem de desenho (de frente):
 *   cabelo longo/capa (atrás) → pernas → braço de trás → corpo → peitoral → braço da frente
 *   → luvas → rosto → barba → cabelo → chapéu/elmo
 * Cada peça de equipamento substitui só a sua camada. As camadas viram uma textura com
 * 6 quadros: 0-2 de frente (parado, passo A, passo B) · 3-5 de costas.
 * Armas e escudos são sprites separados porque giram durante os ataques. */

export const HUM_W = 48;
export const HUM_H = 64;
export const HUM_FOOT_Y = 60;
/** posição da mão da arma, relativa ao ponto de apoio (pés), em pixels de arte */
export const HAND_MAIN = { x: 11, y: -18 };
export const HAND_OFF = { x: -11, y: -18 };

type Facing = 'S' | 'N';
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

/* ---------------------------------------------------------------- pernas e pés */

function legs(pb: PB, look: HumanoidLook, step: number): void {
  const lUp = step === 1 ? 2 : 0;
  const rUp = step === 2 ? 2 : 0;
  const lFwd = step === 1 ? -1 : step === 2 ? 1 : 0;
  const style = look.legs?.style ?? 'pants';
  if (style === 'bones' || look.body === 'skeleton') {
    const bone = pal(look.skin, 5, 0.4);
    for (const [x, up, f] of [[19, lUp, lFwd], [28, rUp, -lFwd]] as [number, number, number][]) {
      part(pb, x + f, 46 - up, 2, 9, bone, 0.6);
      oval(pb, x + 1 + f, 50 - up, 2, 1.5, bone, 0.7);
      part(pb, x - 1 + f, 55 - up, 5, 3, bone, 0.6);
    }
    return;
  }
  const pants = pal(look.legs?.color ?? '#4a4036');
  const boots = pal(look.legs?.color2 ?? '#3a2616');
  for (const [x, up, f, back] of [[17, lUp, lFwd, false], [26, rUp, -lFwd, true]] as [number, number, number, boolean][]) {
    const light = back ? 0.42 : 0.6;
    part(pb, x + f, 45 - up, 6, 10, pants, light, (_px, py) => (py === 49 - up ? -0.1 : 0));
    if (style === 'greaves') {
      part(pb, x + f, 48 - up, 6, 7, pants, light + 0.12, (px, py) => ((px + py) % 5 === 0 ? 0.15 : 0));
      oval(pb, x + 3 + f, 48 - up, 3, 2, pants, light + 0.2);
    }
    // bota
    part(pb, x - 1 + f, 54 - up, 8, 6, boots, light, (_px, py, s) => (py === 54 - up ? 0.18 : 0) + (s > 0.85 ? -0.1 : 0));
    pb.rect(x - 1 + f, 59 - up, 8, 1, boots[0]);
    pb.set(x + f, 55 - up, boots[5]);
  }
}

/* ---------------------------------------------------------------- tronco e braços */

function armSwing(facing: Facing, step: number): [number, number] {
  // [deslocamento braço esquerdo, direito] — balanço oposto ao das pernas
  if (step === 0) return [0, 0];
  const a = step === 1 ? 2 : -2;
  return facing === 'S' ? [-a, a] : [a, -a];
}

function arm(pb: PB, x: number, y: number, sleeveLen: number, skin: Pal, sleeve: Pal | null, light: number, gloves: Pal | null): void {
  // braço de 4 px de largura, mão arredondada
  part(pb, x, y, 4, 13, skin, light);
  if (sleeve) part(pb, x - (sleeveLen > 8 ? 1 : 0), y, sleeveLen > 8 ? 6 : 5, sleeveLen, sleeve, light, (_px, py) => (py === y + sleeveLen - 1 ? -0.15 : 0));
  oval(pb, x + 2, y + 14, 2.4, 2.4, gloves ?? skin, light + 0.05);
  if (gloves) part(pb, x - 0.5 | 0, y + 10, 5, 3, gloves, light + 0.05);
}

function torso(pb: PB, look: HumanoidLook, facing: Facing, step: number): void {
  const skin = pal(look.skin);
  const ch = look.chest;
  const style = ch?.style ?? 'none';
  const c1 = pal(ch?.color ?? look.skin);
  const c2 = pal(ch?.color2 ?? (ch ? ramp(ch.color, 3, 0.6, 10)[2] : look.skin));
  const glovesPal = look.gloves ? pal(look.gloves.color) : null;
  const [sl, sr] = armSwing(facing, step);
  const sleeveLen = style === 'robe' ? 12 : style === 'plate' ? 6 : style === 'chain' ? 10 : style === 'vest' || style === 'none' || style === 'bones' ? 0 : 7;
  const sleeve = sleeveLen ? c1 : null;
  const skeleton = look.body === 'skeleton';

  // braço de trás (lado direito na tela, em sombra)
  if (!skeleton) arm(pb, 33, 31 + sr, sleeveLen, skin, sleeve, 0.4, glovesPal);
  else part(pb, 34, 31 + sr, 2, 13, skin, 0.45);

  // pescoço
  part(pb, 21, 27, 6, 4, skin, 0.4);

  if (skeleton) {
    // caixa torácica
    part(pb, 23, 30, 2, 16, skin, 0.55);
    for (let i = 0; i < 4; i++) {
      line(pb, 17, 32 + i * 3, 22, 31 + i * 3, skin[3]);
      line(pb, 25, 31 + i * 3, 30, 32 + i * 3, skin[2]);
    }
    oval(pb, 24, 45, 6, 2.5, skin, 0.55);
  } else {
    // tronco base
    part(pb, 15, 30, 18, 16, style === 'none' || style === 'vest' ? skin : c1, 0.6, (px, _py, s, t) => {
      // cintura mais estreita
      if ((s < 0.06 || s > 0.94) && t > 0.6) return -0.3;
      return (noise2(px * 0.4, t * 9, 3) - 0.5) * 0.06;
    });
    // ombros arredondados
    oval(pb, 16.5, 32, 3, 2.5, style === 'none' || style === 'vest' ? skin : c1, 0.66);
    oval(pb, 31.5, 32, 3, 2.5, style === 'none' || style === 'vest' ? skin : c1, 0.4);
  }

  switch (style) {
    case 'tunic':
      if (facing === 'S') {
        // gola em V
        for (let i = 0; i < 4; i++) {
          pb.set(22 - i + 3, 30 + i, skin[3]);
          pb.set(22 + i - 1, 30 + i, skin[3]);
        }
        line(pb, 21, 30, 24, 34, c1[1]);
        line(pb, 27, 30, 24, 34, c1[1]);
      }
      // barra levemente aberta
      part(pb, 14, 44, 20, 3, c1, 0.5, (px) => (px % 4 === 0 ? -0.15 : 0));
      // cinto
      part(pb, 15, 42, 18, 2, pal('#5a3a22'), 0.55);
      if (facing === 'S') part(pb, 23, 42, 3, 2, pal('#d8b04a'), 0.75);
      break;
    case 'leather':
      // costuras e alças
      for (let y = 31; y < 42; y += 2) pb.set(facing === 'S' ? 20 : 27, y, c1[4]);
      if (facing === 'S') {
        line(pb, 17, 30, 27, 41, c1[1]);
        line(pb, 18, 30, 28, 41, c1[4]);
      }
      part(pb, 15, 41, 18, 3, pal('#3a2616'), 0.5);
      if (facing === 'S') {
        part(pb, 22, 41, 4, 3, pal('#c8a040'), 0.8);
        part(pb, 28, 42, 4, 4, pal('#5a3a22'), 0.5); // bolsa
      }
      oval(pb, 16, 31, 3.4, 2.4, c1, 0.75);
      oval(pb, 32, 31, 3.4, 2.4, c1, 0.42);
      break;
    case 'chain':
      for (let y = 30; y < 46; y++)
        for (let x = 15; x < 33; x++) if (pb.alpha(x, y) > 0 && (x + y) % 2 === 0) pb.set(x, y, shadeInt(pb.get(x, y), (x + y) % 4 === 0 ? 0.25 : -0.2));
      if (facing === 'S') {
        part(pb, 20, 31, 8, 15, c2, 0.62); // tabardo
        part(pb, 22, 35, 4, 4, pal('#e0c860'), 0.8);
      } else part(pb, 20, 31, 8, 15, c2, 0.45);
      part(pb, 15, 43, 18, 2, pal('#4a3020'), 0.5);
      break;
    case 'plate': {
      // peitoral com quina central e reflexo
      part(pb, 16, 30, 16, 13, c1, 0.66, (px, py, s) => (Math.abs(s - 0.5) < 0.04 ? 0.25 : 0) + (px < 20 && py < 35 ? 0.15 : 0));
      // ombreiras grandes
      oval(pb, 14.5, 32, 5, 3.6, c1, 0.78);
      oval(pb, 33.5, 32, 5, 3.6, c1, 0.4);
      line(pb, 11, 33, 18, 33, c2[2]);
      line(pb, 30, 33, 37, 33, c2[1]);
      // faixa e saiote de placas
      part(pb, 15, 42, 18, 2, c2, 0.6);
      for (let i = 0; i < 3; i++) part(pb, 15 + i * 6, 44, 6, 3, c1, 0.6 - i * 0.12, (_px, py) => (py === 46 ? -0.2 : 0));
      for (const [x, y] of [[18, 31], [29, 31], [18, 40], [29, 40]]) pb.set(x, y, c2[5]);
      break;
    }
    case 'robe':
      // saia longa
      for (let y = 44; y < 58; y++) {
        const k = (y - 44) / 14;
        const x0 = Math.round(15 - k * 3);
        const x1 = Math.round(33 + k * 3);
        for (let x = x0; x < x1; x++) {
          const s = (x - x0) / (x1 - x0);
          let v = 0.6 - (s - 0.35) * 0.6 + (Math.sin(x * 1.2 + k * 2) > 0.85 ? -0.15 : 0);
          if (y > 55) v = 0.45;
          pb.set(x, y, dither(v, x, y, c1));
        }
      }
      for (let x = 12; x < 37; x++) if (pb.alpha(x, 56) > 0) pb.set(x, 56, dither(0.65, x, 56, c2));
      if (facing === 'S') {
        part(pb, 22, 31, 4, 26, c2, 0.62);
        line(pb, 20, 30, 24, 35, c1[1]);
        line(pb, 28, 30, 24, 35, c1[1]);
      }
      part(pb, 15, 42, 18, 2, c2, 0.5);
      break;
    case 'vest':
      part(pb, 15, 30, 5, 15, c1, 0.6);
      part(pb, 28, 30, 5, 15, c1, 0.4);
      part(pb, 15, 43, 18, 2, pal('#3a2616'), 0.5);
      break;
  }

  // braço da frente
  if (!skeleton) arm(pb, 11, 31 + sl, sleeveLen, skin, sleeve, 0.7, glovesPal);
  else part(pb, 12, 31 + sl, 2, 13, skin, 0.7);
  if (style === 'robe' && !skeleton) {
    // manga larga
    part(pb, 10, 31 + sl, 6, 12, c1, 0.7, (_px, py) => (py === 42 + sl ? -0.2 : 0));
    part(pb, 32, 31 + sr, 6, 12, c1, 0.42);
    part(pb, 10, 42 + sl, 6, 1, c2, 0.7);
  }
}

/* ---------------------------------------------------------------- cabeça */

function head(pb: PB, look: HumanoidLook, facing: Facing): void {
  const skin = pal(look.skin);
  const skeleton = look.body === 'skeleton';
  // orelhas
  if (look.ears === 'pointy') {
    pb.poly(
      [
        [14, 16],
        [6, 11],
        [14, 22],
      ],
      (x, y) => dither(0.6 - (y - 11) * 0.02, x, y, skin),
    );
    pb.poly(
      [
        [34, 16],
        [42, 11],
        [34, 22],
      ],
      (x, y) => dither(0.35, x, y, skin),
    );
  } else if (!skeleton) {
    oval(pb, 13.5, 19, 2, 3, skin, 0.6);
    oval(pb, 34.5, 19, 2, 3, skin, 0.35);
  }
  oval(pb, 24, 17.5, 11, 10.5, skin, skeleton ? 0.66 : 0.64);
  if (skeleton) {
    // mandíbula
    part(pb, 18, 24, 12, 4, skin, 0.55);
    for (let x = 19; x < 29; x += 2) pb.set(x, 25, skin[1]);
  }
  if (facing === 'N') return;

  const eye = C(look.eyes ?? '#1d1a2c');
  if (skeleton) {
    oval(pb, 19.5, 19, 3, 3, pal('#2a2420', 3, 0.3), 0.4);
    oval(pb, 28.5, 19, 3, 3, pal('#2a2420', 3, 0.3), 0.4);
    pb.rect(19, 18, 2, 2, eye);
    pb.rect(28, 18, 2, 2, eye);
    pb.set(24, 22, skin[1]);
    pb.set(23, 23, skin[1]);
    return;
  }
  // olhos grandes com brilho
  for (const ex of [18, 28]) {
    pb.rect(ex, 18, 3, 4, eye);
    pb.set(ex, 18, C('#ffffff'));
    pb.set(ex + 2, 21, shadeInt(eye, 0.35));
  }
  // sobrancelhas
  const brow = C(look.hair === '#000000' ? '#3a2a20' : look.hair);
  pb.rect(17, 16, 4, 1, shadeInt(brow, -0.2));
  pb.rect(27, 16, 4, 1, shadeInt(brow, -0.2));
  // nariz, boca e bochechas
  pb.set(24, 22, skin[2]);
  pb.rect(23, 24, 3, 1, C('#8a3a32'));
  pb.set(16, 22, C('#e89a8a', 160));
  pb.set(31, 22, C('#e89a8a', 140));
}

function beard(pb: PB, color: string): void {
  const p = pal(color);
  for (let y = 21; y < 31; y++)
    for (let x = 15; x < 34; x++) {
      const dx = (x + 0.5 - 24) / 9.5;
      const dy = (y + 0.5 - 21) / 10;
      if (dx * dx + dy * dy > 1 || (y < 25 && Math.abs(x - 24) < 3 && y > 22)) continue;
      if (y === 24 && x > 21 && x < 27) continue; // boca
      pb.set(x, y, dither(0.6 - dx * 0.3 + (x % 2 ? 0.05 : -0.05), x, y, p));
    }
  // bigode
  pb.rect(19, 23, 4, 1, p[1]);
  pb.rect(26, 23, 4, 1, p[1]);
}

function hair(pb: PB, look: HumanoidLook, facing: Facing, layer: 'back' | 'front'): void {
  const style = look.hairStyle;
  if (style === 'careca' || look.body === 'skeleton') return;
  const p = pal(look.hair, 6, 0.5);
  const strand = (x: number, y: number, s: number) => (Math.sin(x * 1.3 + y * 0.2) > 0.75 ? -0.12 : 0) + (s < 0.3 ? 0.08 : 0);
  if (layer === 'back') {
    if (facing === 'S' && style === 'longo') {
      part(pb, 12, 16, 24, 20, p, 0.4, (x, y, s) => strand(x, y, s) - (y > 32 ? 0.1 : 0));
    }
    if (facing === 'S' && style === 'rabo') {
      for (let y = 14; y < 34; y++) {
        const x = 35 + Math.sin(y * 0.3) * 1.5;
        part(pb, Math.round(x), y, 4, 1, p, 0.4);
      }
    }
    return;
  }
  if (facing === 'N') {
    oval(pb, 24, 16.5, 11.5, 11, p, 0.55);
    for (let y = 8; y < 28; y++) for (let x = 13; x < 36; x++) if (pb.alpha(x, y) > 0 && Math.sin(x * 1.4 + y * 0.15) > 0.8) pb.set(x, y, p[1]);
    if (style === 'longo') part(pb, 13, 24, 22, 13, p, 0.5, (x, y, s) => strand(x, y, s));
    if (style === 'rabo') {
      oval(pb, 24, 27, 2.5, 2, pal('#c84a3a'), 0.6);
      for (let y = 28; y < 40; y++) part(pb, 22 + Math.round(Math.sin(y * 0.4)), y, 5, 1, p, 0.55);
    }
    // brilho
    for (let x = 17; x < 25; x++) pb.set(x, 10 + Math.round(Math.abs(x - 21) * 0.3), p[5]);
    return;
  }
  // frente: calota + franja
  for (let y = 5; y < 17; y++)
    for (let x = 12; x < 37; x++) {
      const dx = (x + 0.5 - 24) / 12;
      const dy = (y + 0.5 - 15) / 10;
      if (dx * dx + dy * dy > 1) continue;
      // franja serrilhada
      if (y > 13 && (x + Math.floor(x / 3)) % 3 === 0 && Math.abs(dx) < 0.7) continue;
      pb.set(x, y, dither(0.6 - dx * 0.3 - dy * 0.15 + strand(x, y, (x - 12) / 25), x, y, p));
    }
  // mechas laterais
  part(pb, 12, 14, 3, style === 'curto' ? 6 : 12, p, 0.62);
  part(pb, 33, 14, 3, style === 'curto' ? 6 : 12, p, 0.38);
  // brilho em arco
  for (let x = 16; x < 27; x++) pb.set(x, 8 + Math.round(Math.abs(x - 21) * 0.25), p[5]);
}

function headgear(pb: PB, g: ItemVisual | null | undefined, facing: Facing, eyes?: string): void {
  if (!g) return;
  const p = pal(g.color);
  switch (g.style) {
    case 'hood': {
      for (let y = 3; y < 33; y++)
        for (let x = 10; x < 39; x++) {
          const dx = (x + 0.5 - 24) / 14;
          const dy = (y + 0.5 - 17) / 14;
          if (dx * dx + dy * dy > 1) continue;
          // abertura do rosto
          if (facing === 'S' && Math.abs(x + 0.5 - 24) < 9 - Math.max(0, 13 - y) * 0.4 && y > 12 && y < 29) continue;
          const v = 0.62 - dx * 0.35 - dy * 0.1 + (Math.sin(x * 0.9 + y * 0.2) > 0.85 ? -0.1 : 0);
          pb.set(x, y, dither(v, x, y, p));
        }
      if (facing === 'S') {
        // sombra do capuz na testa
        for (let x = 16; x < 33; x++) {
          pb.set(x, 13, C('#140e18', 150));
          pb.set(x, 14, C('#140e18', 90));
        }
      } else part(pb, 22, 3, 4, 3, p, 0.5);
      break;
    }
    case 'helm': {
      for (let y = 4; y < 26; y++)
        for (let x = 11; x < 38; x++) {
          const dx = (x + 0.5 - 24) / 13;
          const dy = (y + 0.5 - 16) / 12;
          if (dx * dx + dy * dy > 1) continue;
          let v = 0.62 - dx * 0.4 - dy * 0.15;
          if (x > 15 && x < 19 && y > 6 && y < 15) v += 0.3; // reflexo
          pb.set(x, y, dither(v, x, y, p));
        }
      if (facing === 'S') {
        // viseira com fresta
        part(pb, 14, 17, 20, 2, pal('#141018', 3, 0.2), 0.3);
        if (eyes) {
          pb.rect(18, 17, 3, 2, C(eyes));
          pb.rect(27, 17, 3, 2, C(eyes));
        }
        part(pb, 23, 17, 2, 9, p, 0.7); // proteção do nariz
        part(pb, 13, 19, 4, 9, p, 0.6);
        part(pb, 31, 19, 4, 9, p, 0.35);
      }
      // crista
      part(pb, 23, 2, 3, 10, p, 0.8);
      for (const [x, y] of [[14, 14], [33, 14], [24, 6]]) pb.set(x, y, p[5]);
      break;
    }
    case 'wizard': {
      const p2 = pal(g.color2 ?? '#d8b54a');
      for (let y = -2; y < 12; y++) {
        const k = (y + 2) / 14;
        const half = 2 + k * 8;
        const bend = (1 - k) * 4;
        for (let x = Math.floor(24 - half + bend); x <= Math.ceil(24 + half + bend); x++) {
          if (y < 0) continue;
          const s = (x - (24 - half + bend)) / (half * 2);
          pb.set(x, y, dither(0.62 - (s - 0.35) * 0.6, x, y, p));
        }
      }
      part(pb, 6, 11, 36, 4, p, 0.55, (_x, y) => (y === 14 ? -0.2 : 0));
      part(pb, 15, 9, 18, 2, p2, 0.7);
      pb.set(27, 4, C('#fff2a0'));
      pb.set(26, 5, C('#fff2a0'));
      break;
    }
    case 'circlet':
      part(pb, 13, 12, 22, 2, p, 0.75);
      if (facing === 'S') {
        oval(pb, 24, 12.5, 2, 2, pal('#5ab4f0'), 0.8);
      }
      break;
    case 'bandana':
      part(pb, 13, 8, 22, 5, p, 0.6, (x) => (x % 5 === 0 ? 0.1 : 0));
      if (facing === 'S') {
        part(pb, 34, 11, 4, 3, p, 0.4);
        part(pb, 36, 13, 3, 5, p, 0.35);
      } else part(pb, 22, 12, 4, 7, p, 0.45);
      break;
  }
}

function capeBack(pb: PB, cape: ItemVisual, step: number): void {
  const p = pal(cape.color);
  const sway = step === 1 ? -2 : step === 2 ? 2 : 0;
  for (let y = 29; y < 58; y++) {
    const k = (y - 29) / 29;
    const x0 = 14 - k * 5 + sway * k;
    const x1 = 34 + k * 5 + sway * k;
    for (let x = Math.floor(x0); x < x1; x++) {
      const fold = Math.sin((x - x0) * 0.7) * 0.08;
      pb.set(x, y, dither(0.32 + fold - k * 0.05, x, y, p));
    }
  }
}

function capeFront(pb: PB, cape: ItemVisual, step: number): void {
  const p = pal(cape.color);
  const sway = step === 1 ? -2 : step === 2 ? 2 : 0;
  for (let y = 28; y < 56; y++) {
    const k = (y - 28) / 28;
    const x0 = 13 - k * 3 + sway * k;
    const x1 = 35 + k * 3 + sway * k;
    for (let x = Math.floor(x0); x < x1; x++) {
      const s = (x - x0) / (x1 - x0);
      const fold = Math.sin(s * Math.PI * 4 + k) * 0.1;
      let v = 0.6 - (s - 0.3) * 0.5 + fold;
      if (y > 53) v -= 0.2;
      if (y > 54 && (x + y) % 3 === 0) continue; // barra puída
      pb.set(x, y, dither(v, x, y, p));
    }
  }
  part(pb, 15, 27, 18, 3, p, 0.7);
  pb.rect(23, 28, 2, 2, C('#d8b04a'));
}

export function drawHumanoidFrame(look: HumanoidLook, facing: Facing, step: number): PB {
  const pb = new PB(HUM_W, HUM_H);
  if (facing === 'S' && look.cape) capeBack(pb, look.cape, step);
  hair(pb, look, facing, 'back');
  legs(pb, look, step);
  torso(pb, look, facing, step);
  head(pb, look, facing);
  if (facing === 'S' && look.beard) beard(pb, look.beard);
  hair(pb, look, facing, 'front');
  headgear(pb, look.head, facing, look.head?.style === 'helm' ? look.eyes : undefined);
  if (facing === 'N' && look.cape) capeFront(pb, look.cape, step);
  selout(pb, -0.66);
  return pb;
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

/* ---------------------------------------------------------------- criaturas */

function slime(color: string, frame: number): PB {
  const pb = new PB(46, 38);
  const p = pal(color, 6, 0.5);
  const squash = frame === 1;
  const rx = squash ? 19 : 16;
  const ry = squash ? 11 : 14;
  const cy = 35 - ry;
  for (let y = 0; y < 38; y++)
    for (let x = 0; x < 46; x++) {
      const dx = (x + 0.5 - 23) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1 || y > 35) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      let v = 0.55 - dx * 0.25 - dy * 0.25 + (d > 0.85 ? -0.15 : 0);
      if (dy > 0.55) v -= 0.18;
      pb.set(x, y, dither(v, x, y, p));
    }
  // bolhas internas
  for (const [x, y, r] of [[30, cy + 3, 2], [17, cy + 6, 1.5], [26, cy + 8, 1.2]] as [number, number, number][]) oval(pb, x, y, r, r, p, 0.85);
  // brilho
  oval(pb, 15, cy - ry * 0.5, 3.5, 2, pal('#ffffff', 3, 0.1), 0.9);
  // olhos e boca
  for (const ex of [17, 27]) {
    pb.rect(ex, cy - 2, 3, 4, C('#1b1a24'));
    pb.set(ex, cy - 2, C('#ffffff'));
  }
  line(pb, 21, cy + 4, 25, cy + 4, C('#1b1a24'));
  selout(pb, -0.6);
  return pb;
}

function quadruped(kind: 'wolf' | 'boar', color: string, frame: number, spirit = false): PB {
  const pb = new PB(68, 46);
  const p = pal(color, 6, 0.5);
  const belly = pal(ramp(color, 3, 0.5, 10)[2], 4, 0.3);
  const boar = kind === 'boar';
  const phase = frame === 0 ? [0, 0, 0, 0] : frame === 1 ? [2, -2, -2, 2] : [-2, 2, 2, -2];
  const legX = boar ? [18, 24, 40, 46] : [16, 22, 40, 46];
  const legY = boar ? 32 : 30;
  const legH = boar ? 9 : 13;
  // patas (de trás mais escuras)
  legX.forEach((x, i) => {
    const back = i % 2 === 1;
    part(pb, x + phase[i], legY, 4, legH, p, back ? 0.3 : 0.55);
    part(pb, x + phase[i] - 1, legY + legH - 2, 6, 2, pal('#2a2220', 3, 0.3), 0.4);
  });
  if (boar) {
    oval(pb, 32, 26, 21, 11, p, 0.58);
    part(pb, 14, 30, 36, 3, belly, 0.4);
    oval(pb, 52, 28, 9, 8, p, 0.6);
    oval(pb, 60, 30, 4, 4, pal(ramp(color, 3, 0.4, 8)[2]), 0.6);
    pb.rect(59, 29, 1, 2, C('#2a1a14'));
    pb.rect(61, 29, 1, 2, C('#2a1a14'));
    // presas
    line(pb, 57, 33, 61, 27, C('#f2ead2'));
    line(pb, 56, 33, 60, 27, C('#c8bea0'));
    pb.rect(51, 24, 2, 2, C('#1b1a24'));
    pb.set(51, 24, C('#ff9a6a'));
    // crina de cerdas
    for (let x = 14; x < 50; x += 2) line(pb, x, 16 + Math.abs(x - 34) * 0.08, x + 1, 12 + Math.abs(x - 34) * 0.12 + (x % 4 ? 1 : 0), p[0]);
    oval(pb, 47, 19, 3, 4, p, 0.4);
  } else {
    // corpo esguio com pelagem
    oval(pb, 30, 25, 17, 8.5, p, 0.6);
    for (let i = 0; i < 40; i++) {
      const x = 16 + Math.floor(hash(i, 1, 3) * 30);
      const y = 19 + Math.floor(hash(i, 1, 4) * 12);
      if (pb.alpha(x, y) > 0) line(pb, x, y, x + 2, y + 1, i % 3 ? p[1] : p[4]);
    }
    part(pb, 18, 30, 26, 3, belly, 0.6);
    // pescoço e cabeça
    oval(pb, 48, 20, 8, 7, p, 0.62);
    pb.poly(
      [
        [52, 18],
        [64, 21],
        [62, 25],
        [52, 25],
      ],
      (x, y) => dither(0.55 - (y - 18) * 0.03, x, y, p),
    );
    pb.rect(62, 21, 2, 2, C('#1b1a24'));
    // orelhas
    pb.poly(
      [
        [44, 15],
        [47, 5],
        [50, 15],
      ],
      (x, y) => dither(0.5, x, y, p),
    );
    pb.poly(
      [
        [49, 14],
        [53, 6],
        [54, 15],
      ],
      (x, y) => dither(0.35, x, y, p),
    );
    // olho
    pb.rect(53, 18, 2, 2, C(spirit ? '#ffffff' : '#ffd23a'));
    // dentes
    pb.set(57, 25, C('#ffffff'));
    pb.set(60, 25, C('#ffffff'));
    // cauda peluda
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      oval(pb, 14 - t * 10, 22 - t * 6 + (frame === 1 ? t * 2 : frame === 2 ? -t * 2 : 0), 3 - t * 1.2, 2.5 - t, p, 0.55 - t * 0.1);
    }
    // crina espiritual
    if (spirit) for (let x = 24; x < 50; x += 3) line(pb, x, 18, x - 3, 10 + (x % 6 ? 2 : 0), pal(color)[5]);
  }
  selout(pb, -0.6);
  if (spirit) {
    // translúcido
    for (let i = 0; i < pb.data.length; i++) {
      const c = pb.data[i];
      if (c >>> 24) pb.data[i] = ((c & 0x00ffffff) | (210 << 24)) >>> 0;
    }
  }
  return pb;
}

function spider(color: string, frame: number): PB {
  const pb = new PB(60, 40);
  const p = pal(color, 6, 0.5);
  const leg = pal(ramp(color, 3, 0.5, 10)[0], 4, 0.35);
  for (let i = 0; i < 4; i++) {
    const off = frame === 1 ? (i % 2 ? 2 : -2) : frame === 2 ? (i % 2 ? -2 : 2) : 0;
    const bx = 22 + i * 5;
    // pata de trás (esquerda na tela)
    thick(pb, bx, 22, bx - 10 + off, 10, 2, leg[1]);
    thick(pb, bx - 10 + off, 10, bx - 15 + off, 34, 2, leg[2]);
    // pata da frente
    thick(pb, bx, 24, bx + 8 - off, 14, 2, leg[2]);
    thick(pb, bx + 8 - off, 14, bx + 13 - off, 36, 2, leg[3]);
  }
  oval(pb, 20, 20, 13, 10, p, 0.6);
  // padrão no abdômen
  for (const [x, y] of [[16, 15], [21, 13], [26, 15], [18, 21], [24, 21]]) part(pb, x, y, 3, 2, pal('#c84a3a'), 0.7);
  oval(pb, 38, 23, 8, 6, p, 0.5);
  for (const [x, y] of [[42, 20], [44, 22], [42, 24], [45, 20]]) pb.rect(x, y, 2, 1, C('#ff4a4a'));
  // quelíceras
  line(pb, 44, 27, 46, 31, p[0]);
  line(pb, 40, 28, 41, 32, p[0]);
  selout(pb, -0.6);
  return pb;
}

function totem(color: string, frame: number): PB {
  const pb = new PB(36, 60);
  const stone = pal('#8a8478', 6, 0.5);
  const gem = pal(color, 6, 0.5);
  // base de pedra
  for (let y = 44; y < 58; y++)
    for (let x = 6; x < 30; x++) {
      const dx = (x + 0.5 - 18) / 12;
      const dy = (y + 0.5 - 51) / 6.5;
      if (dx * dx + dy * dy > 1) continue;
      pb.set(x, y, dither(0.62 - dx * 0.35 - dy * 0.2, x, y, stone));
    }
  for (const x of [10, 18, 26]) pb.rect(x, 50, 2, 2, gem[4]);
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
  line(pb, 18, 9 + yo, 18, 39 + yo, gem[5]);
  selout(pb, -0.5);
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

export type CreatureArtKind = 'slime' | 'wolf' | 'boar' | 'spider' | 'totem';

export function ensureCreature(tm: Phaser.Textures.TextureManager, kind: CreatureArtKind, color: string, spirit = false): string {
  const key = `cre_${kind}_${color.replace('#', '')}${spirit ? '_s' : ''}`;
  if (tm.exists(key)) return key;
  let frames: PB[];
  if (kind === 'slime') frames = [slime(color, 0), slime(color, 1), slime(color, 0)];
  else if (kind === 'spider') frames = [0, 1, 2].map((f) => spider(color, f));
  else if (kind === 'totem') frames = [0, 1, 2].map((f) => totem(color, f));
  else frames = [0, 1, 2].map((f) => quadruped(kind, color, f, spirit));
  addStrip(tm, key, frames);
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
  const frame = drawHumanoidFrame(look, 'S', 0);
  const s = Math.max(1, Math.round(scale / 2));
  return crop ? toScaledCanvas(frame, 4, 0, 40, 38, s) : toScaledCanvas(frame, 0, 0, HUM_W, HUM_H, s);
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
  pb.blit(drawHumanoidFrame(look, 'S', 0), ox, oy);
  if (look.main) {
    const w = drawWeapon(look.main);
    pb.blit(w.pb, ox + 24 + HAND_MAIN.x - w.gripX, oy + HUM_FOOT_Y + HAND_MAIN.y - w.gripY);
  }
  return toScaledCanvas(pb, 0, 0, pb.w, pb.h, Math.max(1, Math.round(scale / 2)));
}

export { bayer, blob };
