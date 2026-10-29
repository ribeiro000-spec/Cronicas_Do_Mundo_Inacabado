import type { HumanoidLook, ItemVisual } from '../../core/types';
import { C, PB, dither, ints, noise2, ramp, selout, shadeInt } from './paint';

/* Personagens no estilo “chibi” de RPG de ação isométrico (≈3 cabeças de altura),
 * desenhados em 2× (quadro de 48×64, pés em y=60).
 *
 * Duas vistas em 3/4, espelhadas para o outro lado — cobrem as 4 diagonais do isométrico:
 *   'S' = de frente, olhando para baixo e para a direita
 *   'N' = de costas, olhando para cima e para a direita
 * Cada vista tem 9 quadros: 0 parado · 1-6 caminhada · 7 golpe · 8 magia.
 * A mão da arma fica do lado para onde o personagem olha; a posição de cada mão em cada
 * quadro está em HANDS (a arma, que é um sprite separado, é presa nela). */

export type Facing = 'S' | 'N';
export const HUM_W = 48;
export const HUM_H = 64;
export const HUM_FOOT_Y = 60;
export const FRAMES_PER_FACING = 9;
export const FRAME_IDLE = 0;
export const FRAME_ATTACK = 7;
export const FRAME_CAST = 8;

type Pal = number[];
type Pt = [number, number];

const CX = 24; // centro horizontal do corpo

/* ---------------------------------------------------------------- poses */

interface Pose {
  /** deslocamento horizontal e elevação de cada pé (perna esquerda/direita na tela) */
  legL: [number, number];
  legR: [number, number];
  /** sobe/desce o corpo (respiração, passada) */
  bob: number;
  /** inclinação do tronco e cabeça para a frente */
  lean: number;
  /** ombro → cotovelo → mão (coordenadas absolutas no quadro, antes do bob) */
  main: [Pt, Pt, Pt];
  off: [Pt, Pt, Pt];
}

const SH_MAIN: Pt = [29, 33];
const SH_OFF: Pt = [18, 33];

function armRest(sh: Pt, side: 1 | -1, swing: number): [Pt, Pt, Pt] {
  return [sh, [sh[0] + side * 1 + swing * 0.5, 38], [sh[0] + side * 2 + swing, 43]];
}

const WALK_D = [2, 1, -1, -2, -1, 1];
const WALK_LIFT_R = [0, 0, 0, 0, 2, 1];
const WALK_LIFT_L = [0, 2, 1, 0, 0, 0];
const WALK_BOB = [0, -1, 0, 0, -1, 0];

export const POSES: Pose[] = [
  // 0 parado
  { legL: [0, 0], legR: [0, 0], bob: 0, lean: 0, main: armRest(SH_MAIN, 1, 0), off: armRest(SH_OFF, -1, 0) },
  // 1-6 caminhada (perna direita da tela vai à frente enquanto o braço da arma vai para trás)
  ...WALK_D.map(
    (d, k): Pose => ({
      legL: [-d, WALK_LIFT_L[k]],
      legR: [d, WALK_LIFT_R[k]],
      bob: WALK_BOB[k],
      lean: 0,
      main: armRest(SH_MAIN, 1, -Math.sign(d)),
      off: armRest(SH_OFF, -1, Math.sign(d)),
    }),
  ),
  // 7 golpe: braço da arma estendido à frente, corpo inclinado, passada aberta
  {
    legL: [-2, 0],
    legR: [2, 0],
    bob: 0,
    lean: 1,
    main: [SH_MAIN, [33, 34], [36, 35]],
    off: [SH_OFF, [16, 37], [14, 40]],
  },
  // 8 magia: braço erguido
  {
    legL: [-1, 0],
    legR: [1, 0],
    bob: -1,
    lean: 0,
    main: [SH_MAIN, [33, 29], [36, 24]],
    off: [SH_OFF, [17, 37], [19, 41]],
  },
];

/** Posição de cada mão (relativa aos pés) por quadro da vista. */
export const HANDS = POSES.map((p) => ({
  main: { x: p.main[2][0] + p.lean - CX, y: p.main[2][1] + p.bob - HUM_FOOT_Y },
  off: { x: p.off[2][0] - CX, y: p.off[2][1] + p.bob - HUM_FOOT_Y },
}));

/* ---------------------------------------------------------------- pincéis */

const palCache = new Map<string, Pal>();
export function pal(hex: string, n = 6, spread = 0.46): Pal {
  const k = `${hex}|${n}|${spread}`;
  let p = palCache.get(k);
  if (!p) {
    p = ints(ramp(hex, n, spread, 16));
    palCache.set(k, p);
  }
  return p;
}

/** Retângulo com luz vinda do alto à esquerda. */
function box(pb: PB, x: number, y: number, w: number, h: number, p: Pal, light = 0.6, fn?: (px: number, py: number, s: number, t: number) => number): void {
  for (let py = Math.round(y); py < Math.round(y + h); py++)
    for (let px = Math.round(x); px < Math.round(x + w); px++) {
      const s = (px + 0.5 - x) / w;
      const t = (py + 0.5 - y) / h;
      let v = light - (s - 0.4) * 0.5 - t * 0.1;
      if (fn) v += fn(px, py, s, t);
      pb.set(px, py, dither(v, px, py, p));
    }
}

/** Elipse com volume (luz esférica). */
function ell(pb: PB, cx: number, cy: number, rx: number, ry: number, p: Pal, light = 0.62, skip?: (x: number, y: number) => boolean): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1 || skip?.(x, y)) continue;
      const v = light - dx * 0.3 - dy * 0.18 - d * 0.1;
      pb.set(x, y, dither(v, x, y, p));
    }
}

/** Membro: linha grossa com sombreado lateral (braços, pernas). */
function limb(pb: PB, pts: Pt[], w: number, p: Pal, light = 0.6): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let oy = -w / 2; oy < w / 2; oy++)
        for (let ox = -w / 2; ox < w / 2; ox++) {
          const px = Math.round(x + ox);
          const py = Math.round(y + oy);
          const s = (ox + w / 2 + 0.5) / w;
          pb.set(px, py, dither(light - (s - 0.4) * 0.5, px, py, p));
        }
    }
  }
}

function px(pb: PB, x: number, y: number, c: number): void {
  pb.set(Math.round(x), Math.round(y), c);
}

/* ---------------------------------------------------------------- partes */

interface Ctx {
  look: HumanoidLook;
  f: Facing;
  pose: Pose;
  skin: Pal;
  skeleton: boolean;
  /** deslocamento vertical do corpo (bob) */
  b: number;
  /** inclinação */
  l: number;
}

function legs(pb: PB, c: Ctx): void {
  const { look, pose } = c;
  const style = look.legs?.style ?? 'pants';
  const bones = style === 'bones' || c.skeleton;
  const pants = bones ? c.skin : pal(look.legs?.color ?? '#4a4036');
  const boots = bones ? c.skin : pal(look.legs?.color2 ?? '#3a2616');
  // perna de trás primeiro (mais escura). De frente, a da direita da tela fica atrás.
  const order: ['L' | 'R', number, [number, number]][] =
    c.f === 'S'
      ? [
          ['R', 25, pose.legR],
          ['L', 20, pose.legL],
        ]
      : [
          ['L', 20, pose.legL],
          ['R', 25, pose.legR],
        ];
  order.forEach(([, x0, [dx, lift]], i) => {
    const back = i === 0;
    const light = back ? 0.4 : 0.62;
    const hipY = 45 + c.b;
    const footY = 59 - lift;
    const kx = x0 + dx * 0.5;
    const fx = x0 + dx;
    if (bones) {
      limb(pb, [[x0 + 1, hipY], [kx + 1, 51 - lift * 0.5], [fx + 1, footY - 2]], 2, pants, light);
      ell(pb, kx + 1.5, 51 - lift * 0.5, 1.6, 1.4, pants, light + 0.1);
      box(pb, fx - 1, footY - 2, 5, 2, pants, light);
      return;
    }
    // coxa/canela
    limb(pb, [[x0 + 1.5, hipY], [kx + 1.5, 51 - lift * 0.5], [fx + 1.5, footY - 3]], 4, pants, light);
    if (style === 'greaves') {
      limb(pb, [[kx + 1.5, 51 - lift * 0.5], [fx + 1.5, footY - 3]], 4, pants, light + 0.18);
      ell(pb, kx + 2, 50.5 - lift * 0.5, 2.4, 1.6, pants, light + 0.28);
    }
    // bota: biqueira para o lado em que o personagem olha
    const toe = c.f === 'S' ? 2 : 1;
    box(pb, fx - 1, footY - 4, 5, 3, boots, light, (_x, y) => (y === Math.round(footY - 4) ? 0.15 : 0));
    box(pb, fx - 1, footY - 1, 5 + toe, 2, boots, light - 0.05);
    px(pb, fx + 3 + toe - 1, footY - 1, boots[Math.min(5, Math.round(light * 5) + 1)]);
  });
}

function capeBehind(pb: PB, c: Ctx, cape: ItemVisual): void {
  // de frente, a capa aparece atrás do corpo, caindo para o lado de trás (esquerda)
  const p = pal(cape.color);
  const sway = c.pose === POSES[0] ? 0 : (c.pose.legR[0] > 0 ? -1 : 1);
  for (let y = 31 + c.b; y < 57; y++) {
    const k = (y - 31) / 26;
    const x0 = 18 - k * 6 + sway * k;
    const x1 = 30 + k * 2;
    for (let x = Math.floor(x0); x < x1; x++) {
      const s = (x - x0) / (x1 - x0);
      if (y > 55 && (x + y) % 3 === 0) continue;
      pb.set(x, y, dither(0.36 - s * 0.12 + Math.sin(x * 0.9 + k * 3) * 0.05, x, y, p));
    }
  }
}

function capeOver(pb: PB, c: Ctx, cape: ItemVisual): void {
  // de costas, a capa cobre as costas e esvoaça com a passada
  const p = pal(cape.color);
  const sway = c.pose.legR[0] > 0 ? 1 : c.pose.legR[0] < 0 ? -1 : 0;
  for (let y = 31 + c.b; y < 56; y++) {
    const k = (y - 31) / 25;
    const x0 = 17 - k * 4 + sway * k;
    const x1 = 31 + k * 4 + sway * k;
    for (let x = Math.floor(x0); x < x1; x++) {
      const s = (x - x0) / (x1 - x0);
      let v = 0.62 - (s - 0.35) * 0.5 + Math.sin(s * Math.PI * 3 + k * 2) * 0.09;
      if (y > 53) v -= 0.15;
      if (y > 54 && (x + y) % 3 === 0) continue;
      pb.set(x, y, dither(v, x, y, p));
    }
  }
  box(pb, 18, 31 + c.b, 12, 2, p, 0.72);
}

function torso(pb: PB, c: Ctx): void {
  const { look, f } = c;
  const ch = look.chest;
  const style = ch?.style ?? 'none';
  const b = c.b;
  const l = c.l;
  const skin = c.skin;
  const c1 = pal(ch?.color ?? look.skin);
  const c2 = pal(ch?.color2 ?? (ch ? ramp(ch.color, 3, 0.6, 10)[2] : look.skin));
  const belt = pal('#4a3020');
  const gold = pal('#d8b04a');
  const front = f === 'S';

  if (c.skeleton || style === 'bones') {
    // coluna, costelas e bacia
    box(pb, 23 + l, 32 + b, 2, 12, skin, 0.6);
    for (let i = 0; i < 4; i++) {
      const y = 33 + b + i * 3;
      limb(pb, [[19 + l, y + 1], [23 + l, y]], 1, skin, 0.7);
      limb(pb, [[25 + l, y], [29 + l, y + 1]], 1, skin, 0.45);
    }
    ell(pb, 24 + l * 0.5, 45 + b, 5, 2, skin, 0.55);
    return;
  }

  const bodyPal = style === 'none' || style === 'vest' ? skin : c1;
  // tronco: ombros arredondados, cintura um pouco mais fina
  for (let y = 31 + b; y < 46 + b; y++) {
    const t = (y - 31 - b) / 15;
    const half = t < 0.15 ? 5 + t * 6 : t < 0.7 ? 6 : 6 - (t - 0.7) * 3;
    const cx = CX + (t < 0.7 ? l : l * 0.5);
    for (let x = Math.floor(cx - half); x < cx + half; x++) {
      const s = (x + 0.5 - (cx - half)) / (half * 2);
      let v = 0.66 - (s - 0.35) * 0.55 - t * 0.08;
      v += (noise2(x * 0.5, y * 0.5, 3) - 0.5) * 0.05;
      pb.set(x, y, dither(v, x, y, bodyPal));
    }
  }
  // quadril/cinto
  const beltY = 43 + b;

  switch (style) {
    case 'tunic':
      if (front) {
        // gola em V e linha do peito voltada para a direita (3/4)
        for (let i = 0; i < 4; i++) {
          px(pb, 25 + l - i * 0.5, 31 + b + i, skin[3]);
          px(pb, 26 + l + i * 0.5, 31 + b + i, skin[2]);
        }
        px(pb, 25.5 + l, 35 + b, c1[1]);
      } else box(pb, 21 + l, 31 + b, 6, 1, c1, 0.4);
      box(pb, 18, beltY, 12, 2, belt, 0.55);
      if (front) box(pb, 26, beltY, 2, 2, gold, 0.85);
      // barra da túnica
      for (let x = 17; x < 31; x++) for (let y = beltY + 2; y < beltY + 4; y++) pb.set(x, y, dither(0.5 - (x - 17) * 0.02 + (x % 3 === 0 ? -0.1 : 0), x, y, c1));
      break;
    case 'leather':
      if (front) {
        // alça diagonal e fivela
        limb(pb, [[19 + l, 32 + b], [28 + l, 41 + b]], 1, c2, 0.3);
        box(pb, 22 + l, 36 + b, 2, 2, gold, 0.9);
      } else limb(pb, [[28 + l, 32 + b], [19 + l, 41 + b]], 1, c2, 0.3);
      for (let y = 33 + b; y < 42 + b; y += 2) px(pb, (front ? 26 : 22) + l, y, c1[4]);
      box(pb, 18, beltY, 12, 2, belt, 0.55);
      if (front) {
        box(pb, 25, beltY, 2, 2, gold, 0.85);
        box(pb, 19, beltY + 1, 3, 3, pal('#6a4428'), 0.55); // bolsa
      }
      break;
    case 'chain':
      for (let y = 31 + b; y < 46 + b; y++)
        for (let x = 17; x < 31; x++) if (pb.alpha(x, y) > 0 && (x + y) % 2 === 0) pb.set(x, y, shadeInt(pb.get(x, y), (x + y) % 4 === 0 ? 0.22 : -0.2));
      // tabardo
      box(pb, (front ? 23 : 21) + l, 32 + b, 5, 14, c2, front ? 0.66 : 0.45);
      if (front) box(pb, 24 + l, 35 + b, 3, 3, gold, 0.85);
      box(pb, 18, beltY, 12, 2, belt, 0.5);
      break;
    case 'plate':
      // peitoral com reflexo
      for (let y = 32 + b; y < 43 + b; y++)
        for (let x = 19 + l; x < 30 + l; x++) {
          if (pb.alpha(x, y) === 0) continue;
          const s = (x - 19 - l) / 11;
          let v = 0.7 - (s - 0.35) * 0.6;
          if (front && x === 26 + l) v += 0.25;
          if (x < 22 + l && y < 36 + b) v += 0.15;
          pb.set(x, y, dither(v, x, y, c1));
        }
      box(pb, 18, beltY, 12, 2, c2, 0.6);
      // saiote de placas
      for (let i = 0; i < 3; i++) box(pb, 18 + i * 4, beltY + 2, 4, 3, c1, 0.62 - i * 0.12, (_x, y) => (y === beltY + 4 ? -0.2 : 0));
      break;
    case 'robe':
      // túnica longa até os tornozelos, abrindo embaixo
      for (let y = beltY; y < 58; y++) {
        const k = (y - beltY) / (58 - beltY);
        const x0 = 18 - k * 3;
        const x1 = 30 + k * 3;
        for (let x = Math.floor(x0); x < x1; x++) {
          const s = (x - x0) / (x1 - x0);
          let v = 0.62 - (s - 0.35) * 0.55 + (Math.sin(x * 1.3 + k * 2) > 0.8 ? -0.12 : 0);
          if (y > 55) v -= 0.12;
          pb.set(x, y, dither(v, x, y, c1));
        }
      }
      for (let x = 14; x < 34; x++) if (pb.alpha(x, 56) > 0) pb.set(x, 56, dither(0.7, x, 56, c2));
      if (front) {
        box(pb, 25 + l, 32 + b, 3, 26 - b, c2, 0.7);
        for (let i = 0; i < 3; i++) px(pb, 25 + l - i * 0.6, 31 + b + i, c1[1]);
      }
      box(pb, 18, beltY, 12, 2, c2, 0.55);
      break;
    case 'vest':
      box(pb, 18 + l, 32 + b, 4, 12, c1, 0.62);
      box(pb, 26 + l, 32 + b, 4, 12, c1, 0.42);
      box(pb, 18, beltY, 12, 2, belt, 0.5);
      break;
    default:
      box(pb, 18, beltY, 12, 2, belt, 0.5);
  }
}

function arm(pb: PB, c: Ctx, which: 'main' | 'off'): void {
  const { look } = c;
  const pts = c.pose[which].map(([x, y]) => [x + (which === 'main' ? c.l : 0), y + c.b] as Pt);
  const style = look.chest?.style ?? 'none';
  const skin = c.skin;
  const light = which === 'off' ? 0.66 : 0.5;
  if (c.skeleton) {
    limb(pb, pts, 2, skin, light);
    ell(pb, pts[2][0], pts[2][1], 1.6, 1.6, skin, light + 0.1);
    return;
  }
  const sleeveLong = style === 'robe' || style === 'chain' || style === 'leather' || style === 'tunic';
  const sleeve = style === 'none' || style === 'vest' ? null : pal(look.chest!.color);
  // traço escuro entre o braço e o tronco (separa as formas, como no pixel art feito à mão)
  const inner = which === 'main' ? -2 : 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n + inner);
      const y = Math.round(y0 + ((y1 - y0) * k) / n);
      if (y < pts[0][1] + 2) continue;
      const under = pb.get(x, y);
      if (under >>> 24) pb.set(x, y, shadeInt(under, -0.45));
    }
  }
  // braço inteiro em pele, manga por cima
  limb(pb, pts, 3, skin, light);
  if (sleeve) {
    if (sleeveLong) {
      const mid: Pt = [pts[1][0] + (pts[2][0] - pts[1][0]) * 0.55, pts[1][1] + (pts[2][1] - pts[1][1]) * 0.55];
      limb(pb, [pts[0], pts[1], mid], style === 'robe' ? 4 : 3, sleeve, light);
      if (style === 'robe') ell(pb, mid[0], mid[1], 2.4, 1.8, sleeve, light - 0.05);
    } else limb(pb, [pts[0], pts[1]], 3, sleeve, light);
  }
  if (style === 'plate') ell(pb, pts[0][0] + (which === 'main' ? 1 : -1), pts[0][1] + 1, 4, 3, pal(look.chest!.color), light + 0.15);
  // mão (ou luva)
  const hand = look.gloves ? pal(look.gloves.color) : skin;
  if (look.gloves) limb(pb, [[pts[1][0] + (pts[2][0] - pts[1][0]) * 0.6, pts[1][1] + (pts[2][1] - pts[1][1]) * 0.6], pts[2]], 3, hand, light);
  ell(pb, pts[2][0], pts[2][1], 1.8, 1.8, hand, light + 0.1);
}

/** Cabeça vista de frente (3/4 para a direita). */
function headFront(pb: PB, c: Ctx): void {
  const { look } = c;
  const skin = c.skin;
  const hx = CX + c.l;
  const hy = 21 + c.b;
  if (c.skeleton) {
    ell(pb, hx, hy, 8, 8, skin, 0.68);
    ell(pb, hx + 2, hy + 6, 5, 3, skin, 0.6);
    // órbitas e brilho dos olhos
    const sock = pal('#2a2420', 3, 0.3);
    ell(pb, hx + 0.5, hy + 1, 2.4, 2.6, sock, 0.3);
    ell(pb, hx + 5.5, hy + 1, 1.8, 2.6, sock, 0.3);
    const eye = C(look.eyes ?? '#7cf0ff');
    pb.rect(Math.round(hx), Math.round(hy + 1), 2, 2, eye);
    pb.rect(Math.round(hx + 5), Math.round(hy + 1), 1, 2, eye);
    px(pb, hx + 3, hy + 4, skin[1]);
    for (let x = hx; x < hx + 7; x += 2) px(pb, x, hy + 7, skin[1]);
    return;
  }
  // orelha (lado de trás da cabeça, à esquerda)
  if (look.ears === 'pointy') {
    pb.poly(
      [
        [hx - 6, hy - 1],
        [hx - 15, hy - 6],
        [hx - 6, hy + 4],
      ],
      (x, y) => dither(0.62 - (hx - 6 - x) * 0.02 - (y - hy) * 0.02, x, y, skin),
    );
    px(pb, hx - 9, hy - 2, skin[1]);
    pb.poly(
      [
        [hx + 8, hy - 1],
        [hx + 13, hy - 5],
        [hx + 8, hy + 3],
      ],
      (x, y) => dither(0.4, x, y, skin),
    );
  } else {
    ell(pb, hx - 7, hy + 2, 1.8, 2.5, skin, 0.6);
    px(pb, hx - 7, hy + 2, skin[1]);
  }
  // crânio + rosto (o queixo puxa para a direita)
  ell(pb, hx, hy, 8.5, 8.2, skin, 0.66);
  ell(pb, hx + 2.5, hy + 5, 5.5, 3.6, skin, 0.62);

  // olhos de anime: o de perto maior, o de longe junto à borda
  const iris = C(look.eyes ?? '#3a2a4a');
  const dark = C('#1a1424');
  const eyes: [number, number][] = [
    [hx + 0, 2],
    [hx + 5, 2],
  ];
  for (const [ex, w] of eyes) {
    const x = Math.round(ex);
    const y = Math.round(hy + 1);
    pb.rect(x, y, w, 1, dark); // cílio
    pb.rect(x, y + 1, w, 2, iris);
    px(pb, x + w - 1, y + 1, C('#ffffff'));
    pb.rect(x, y + 3, w, 1, shadeInt(iris, 0.35));
  }
  // sobrancelhas
  const brow = shadeInt(C(look.hair === '#000000' ? '#3a2a20' : look.hair), -0.25);
  pb.rect(Math.round(hx - 1), Math.round(hy - 1), 3, 1, brow);
  pb.rect(Math.round(hx + 5), Math.round(hy - 1), 2, 1, brow);
  // nariz, boca e bochecha
  px(pb, hx + 4, hy + 4, skin[2]);
  pb.rect(Math.round(hx + 3), Math.round(hy + 6), 2, 1, C('#8a3a32'));
  px(pb, hx - 2, hy + 4, C('#f0a090', 150));
  px(pb, hx + 7, hy + 4, C('#f0a090', 120));
}

function headBack(pb: PB, c: Ctx): void {
  const { look } = c;
  const skin = c.skin;
  const hx = CX + c.l;
  const hy = 21 + c.b;
  if (c.skeleton) {
    ell(pb, hx, hy, 8, 8, skin, 0.6);
    return;
  }
  ell(pb, hx, hy, 8.5, 8.2, skin, 0.55);
  // orelha à direita (o rosto está virado para cima/direita)
  if (look.ears === 'pointy') {
    pb.poly(
      [
        [hx + 6, hy - 1],
        [hx + 15, hy - 6],
        [hx + 6, hy + 4],
      ],
      (x, y) => dither(0.5, x, y, skin),
    );
  } else ell(pb, hx + 7.5, hy + 2, 1.8, 2.5, skin, 0.5);
}

function beard(pb: PB, c: Ctx, color: string): void {
  const p = pal(color);
  const hx = CX + c.l;
  const hy = 21 + c.b;
  for (let y = Math.round(hy + 4); y < hy + 11; y++)
    for (let x = Math.round(hx - 4); x < hx + 9; x++) {
      const dx = (x + 0.5 - (hx + 2.5)) / 6.5;
      const dy = (y + 0.5 - (hy + 4)) / 7;
      if (dx * dx + dy * dy > 1) continue;
      if (y === Math.round(hy + 6) && x >= hx + 2 && x <= hx + 5) continue; // boca
      pb.set(x, y, dither(0.6 - dx * 0.3 + (x % 2 ? 0.05 : -0.05), x, y, p));
    }
  pb.rect(Math.round(hx + 1), Math.round(hy + 5), 3, 1, p[1]);
  pb.rect(Math.round(hx + 5), Math.round(hy + 5), 2, 1, p[1]);
}

/** Cabelo (camada da frente). Pontas espetadas no estilo dos RPGs de ação clássicos. */
function hairFront(pb: PB, c: Ctx): void {
  const { look } = c;
  const style = look.hairStyle;
  if (style === 'careca' || c.skeleton) return;
  const p = pal(look.hair, 6, 0.5);
  const hx = CX + c.l;
  const hy = 21 + c.b;
  const front = c.f === 'S';
  const covered = !!look.head && (look.head.style === 'hood' || look.head.style === 'helm');
  if (covered) {
    // só a franja aparece por baixo do capuz/elmo
    if (front && look.head!.style === 'hood') for (let x = Math.round(hx - 1); x < hx + 7; x++) if ((x + 1) % 3) pb.set(x, Math.round(hy - 3), dither(0.6, x, hy - 3, p));
    return;
  }
  // calota do cabelo, um pouco maior que o crânio
  for (let y = Math.round(hy - 11); y < hy + 9; y++)
    for (let x = Math.round(hx - 11); x < hx + 11; x++) {
      const dx = (x + 0.5 - hx) / 9.6;
      const dy = (y + 0.5 - (hy - 1)) / 9.2;
      if (dx * dx + dy * dy > 1) continue;
      // linha do cabelo: de frente o rosto fica livre (direita, embaixo)
      if (front) {
        const fx = x + 0.5 - hx;
        const fy = y + 0.5 - hy;
        // franja serrilhada sobre a testa
        const bangs = -2 + ((Math.floor(x) * 7) % 3 === 0 ? 1.5 : 0) + (fx > 6 ? 1 : 0);
        if (fx > -4 && fy > bangs) continue;
        // atrás da orelha o cabelo desce até o pescoço (curto: deixa a orelha à mostra)
        if (fx <= -4 && fy > (style === 'curto' ? -1 : 6)) continue;
      } else if (y > hy + 6) continue;
      const strand = Math.sin(x * 1.5 + y * 0.35) > 0.7 ? -0.12 : 0;
      pb.set(x, y, dither(0.64 - dx * 0.3 - dy * 0.2 + strand, x, y, p));
    }
  // pontas espetadas no topo e atrás
  const spikes: [number, number, number, number][] = front
    ? [
        [-7, -8, -2.5, 3.5],
        [-2.5, -10.5, -2.0, 3],
        [2.5, -10, -1.6, 2.5],
      ]
    : [
        [-6, -9, -2.3, 3.5],
        [-1, -11, -1.9, 3.5],
        [4, -10, -1.4, 3],
        [-8.5, -3, -2.8, 2.5],
      ];
  if (style === 'longo' || style === 'rabo') spikes.length = 2;
  for (const [ox, oy, ang, len] of spikes) {
    const bx = hx + ox;
    const by = hy + oy;
    const tx = bx + Math.cos(ang) * len;
    const ty = by + Math.sin(ang) * len;
    pb.poly(
      [
        [bx - 2, by + 1.5],
        [tx, ty],
        [bx + 2.5, by + 1],
      ],
      (x, y) => dither(0.6 - (x - hx) * 0.025, x, y, p),
    );
  }
  // mechas laterais
  if (front) {
    if (style !== 'curto') box(pb, hx - 9, hy, 3, 8, p, 0.58);
    box(pb, hx + 7, hy - 2, 2, 4, p, 0.42);
  }
  if (style === 'longo') {
    if (front) box(pb, hx + 7, hy - 1, 2, 9, p, 0.4, (_x, y) => (y % 3 === 0 ? -0.1 : 0));
    else
      for (let y = Math.round(hy + 4); y < hy + 16; y++) {
        const k = (y - hy - 4) / 12;
        const half = 6 - k * 2.5;
        for (let x = Math.round(hx - half); x < hx + half; x++) pb.set(x, y, dither(0.6 - (x - hx) * 0.03 + (Math.sin(x * 1.6) > 0.7 ? -0.12 : 0), x, y, p));
      }
  }
  if (style === 'rabo' && !front) {
    ell(pb, hx, hy + 3, 2, 1.6, pal('#c84a3a'), 0.6);
    for (let y = Math.round(hy + 4); y < hy + 16; y++) box(pb, hx - 2 + Math.sin(y * 0.4), y, 4 - (y - hy - 4) * 0.15, 1, p, 0.6);
  }
  // brilho em arco
  for (let x = Math.round(hx - 5); x < hx + 2; x++) px(pb, x, hy - 8 + Math.abs(x - hx + 2) * 0.35, p[5]);
}

/** Cabelo que fica atrás do corpo (rabo de cavalo / cabelo longo de frente). */
function hairBack(pb: PB, c: Ctx): void {
  const { look } = c;
  if (c.skeleton || c.f !== 'S') return;
  if (look.head && (look.head.style === 'hood' || look.head.style === 'helm')) return;
  const p = pal(look.hair, 6, 0.5);
  const hx = CX + c.l;
  const hy = 21 + c.b;
  if (look.hairStyle === 'longo') {
    for (let y = Math.round(hy); y < hy + 18; y++) {
      const k = (y - hy) / 18;
      for (let x = Math.round(hx - 10 + k * 2); x < hx - 2; x++) pb.set(x, y, dither(0.42 + (Math.sin(x * 1.6 + y * 0.2) > 0.7 ? -0.1 : 0), x, y, p));
    }
  }
  if (look.hairStyle === 'rabo') {
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      ell(pb, hx - 9 - t * 4, hy - 2 + t * 13, 2.6 - t, 1.8, p, 0.48);
    }
  }
}

function headgear(pb: PB, c: Ctx): void {
  const g = c.look.head;
  if (!g) return;
  const p = pal(g.color);
  const hx = CX + c.l;
  const hy = 21 + c.b;
  const front = c.f === 'S';
  switch (g.style) {
    case 'hood': {
      for (let y = Math.round(hy - 12); y < hy + 12; y++)
        for (let x = Math.round(hx - 12); x < hx + 12; x++) {
          const dx = (x + 0.5 - hx) / 10.5;
          const dy = (y + 0.5 - (hy - 0.5)) / 10.5;
          if (dx * dx + dy * dy > 1) continue;
          // abertura do rosto
          if (front) {
            const ox = (x + 0.5 - (hx + 2.5)) / 6.5;
            const oy = (y + 0.5 - (hy + 3)) / 7;
            if (ox * ox + oy * oy < 1) continue;
          }
          const v = 0.64 - dx * 0.32 - dy * 0.12 + (Math.sin(x * 0.9 + y * 0.25) > 0.85 ? -0.1 : 0);
          pb.set(x, y, dither(v, x, y, p));
        }
      if (front) {
        // sombra do capuz na testa e caimento sobre os ombros
        for (let x = Math.round(hx - 3); x < hx + 9; x++) pb.set(x, Math.round(hy - 3), C('#140e18', 120));
        box(pb, hx - 11, hy + 6, 5, 6, p, 0.55);
      } else {
        // ponta do capuz
        pb.poly(
          [
            [hx - 4, hy - 8],
            [hx - 10, hy - 14],
            [hx + 1, hy - 10],
          ],
          (x, y) => dither(0.55, x, y, p),
        );
        box(pb, hx - 9, hy + 6, 18, 5, p, 0.5);
      }
      break;
    }
    case 'helm': {
      for (let y = Math.round(hy - 11); y < hy + 7; y++)
        for (let x = Math.round(hx - 11); x < hx + 11; x++) {
          const dx = (x + 0.5 - hx) / 10;
          const dy = (y + 0.5 - (hy - 1)) / 10;
          if (dx * dx + dy * dy > 1) continue;
          let v = 0.66 - dx * 0.38 - dy * 0.14;
          if (x < hx - 3 && x > hx - 7 && y < hy - 3 && y > hy - 9) v += 0.3; // reflexo
          pb.set(x, y, dither(v, x, y, p));
        }
      if (front) {
        // viseira com fresta (olhos acesos se houver)
        box(pb, hx - 2, hy, 11, 2, pal('#141018', 3, 0.2), 0.3);
        if (c.look.eyes) {
          pb.rect(Math.round(hx), Math.round(hy), 2, 2, C(c.look.eyes));
          pb.rect(Math.round(hx + 5), Math.round(hy), 2, 2, C(c.look.eyes));
        }
        box(pb, hx + 3, hy, 1, 6, p, 0.8); // protetor do nariz
        box(pb, hx - 9, hy + 1, 4, 6, p, 0.6); // proteção da bochecha
      } else {
        box(pb, hx - 9, hy + 1, 18, 5, p, 0.5);
      }
      // crista
      for (let i = 0; i < 9; i++) px(pb, hx - 4 + i * 0.6, hy - 12 + Math.abs(i - 4) * 0.2, p[5]);
      box(pb, hx - 1, hy - 14, 2, 4, pal('#b83a3a'), 0.7);
      break;
    }
    case 'wizard': {
      const p2 = pal(g.color2 ?? '#d8b54a');
      // aba larga
      ell(pb, hx + 1, hy - 6, 13, 3.4, p, 0.55);
      // cone torto para trás
      for (let y = Math.round(hy - 22); y < hy - 6; y++) {
        const k = (y - (hy - 22)) / 16;
        const half = 1.2 + k * 6.5;
        const bend = (1 - k) * (1 - k) * -7;
        for (let x = Math.floor(hx + bend - half); x <= hx + bend + half; x++) {
          const s = (x - (hx + bend - half)) / (half * 2);
          pb.set(x, y, dither(0.64 - (s - 0.35) * 0.6, x, y, p));
        }
      }
      box(pb, hx - 6, hy - 9, 13, 2, p2, 0.75);
      px(pb, hx + 2, hy - 15, C('#fff2a0'));
      px(pb, hx + 1, hy - 14, C('#fff2a0'));
      break;
    }
    case 'circlet':
      box(pb, hx - 8, hy - 4, 16, 1, p, 0.8);
      if (front) ell(pb, hx + 3, hy - 4, 1.6, 1.6, pal('#5ab4f0'), 0.85);
      break;
    case 'bandana':
      box(pb, hx - 9, hy - 7, 18, 3, p, 0.62, (x) => (x % 4 === 0 ? 0.1 : 0));
      if (front) {
        box(pb, hx - 12, hy - 6, 3, 2, p, 0.45);
        box(pb, hx - 13, hy - 4, 2, 4, p, 0.4);
      } else box(pb, hx - 2, hy - 4, 3, 7, p, 0.45);
      break;
  }
}

/* ---------------------------------------------------------------- quadro completo */

export function drawHumanoidPose(look: HumanoidLook, f: Facing, frame: number): PB {
  const pb = new PB(HUM_W, HUM_H);
  const pose = POSES[frame] ?? POSES[0];
  const c: Ctx = { look, f, pose, skin: pal(look.skin, 6, 0.42), skeleton: look.body === 'skeleton', b: pose.bob, l: pose.lean };
  if (f === 'S') {
    if (look.cape) capeBehind(pb, c, look.cape);
    hairBack(pb, c);
    legs(pb, c);
    torso(pb, c);
    arm(pb, c, 'off');
    headFront(pb, c);
    if (look.beard) beard(pb, c, look.beard);
    hairFront(pb, c);
    headgear(pb, c);
    arm(pb, c, 'main');
  } else {
    legs(pb, c);
    torso(pb, c);
    arm(pb, c, 'off');
    arm(pb, c, 'main');
    if (look.cape) capeOver(pb, c, look.cape);
    headBack(pb, c);
    hairFront(pb, c);
    headgear(pb, c);
  }
  selout(pb, -0.72);
  return pb;
}

/** Mão desenhada por cima da arma (dá a impressão de que o personagem a segura). */
export function drawFist(look: HumanoidLook): PB {
  const pb = new PB(6, 6);
  const hand = look.gloves ? pal(look.gloves.color) : pal(look.skin, 6, 0.42);
  ell(pb, 3, 3, 1.8, 1.8, hand, 0.66);
  selout(pb, -0.72);
  return pb;
}
