import type { ItemDef, SkillDef } from '../core/types';
import { SCHOOLS } from '../data/skills';
import { C, PB, shade } from './pixel';

/* Ícones 16×16 em pixel art para a interface (itens e habilidades), gerados sob demanda. */

const cache = new Map<string, string>();
const OUT = C('#141320');

function url(pb: PB): string {
  return pb.toCanvas().toDataURL();
}

function drawItemIcon(kind: string, c: string, c2: string): PB {
  const pb = new PB(16, 16);
  const lt = shade(c, 0.3);
  const dk = shade(c, -0.3);
  const r = (x: number, y: number, w: number, h: number, col: string) => pb.rect(x, y, w, h, C(col));
  switch (kind) {
    case 'sword':
      for (let i = 0; i < 9; i++) {
        pb.set(4 + i, 11 - i, C(lt));
        pb.set(5 + i, 11 - i, C(c));
        pb.set(5 + i, 12 - i, C(dk));
      }
      pb.line(2, 10, 6, 14, C('#c8a957'));
      pb.line(2, 13, 4, 11, C(c2));
      pb.set(1, 14, C(c2));
      break;
    case 'dagger':
      for (let i = 0; i < 6; i++) {
        pb.set(6 + i, 9 - i, C(lt));
        pb.set(7 + i, 9 - i, C(c));
      }
      pb.line(4, 9, 7, 12, C('#c8a957'));
      pb.line(3, 12, 5, 10, C(c2));
      break;
    case 'axe':
      pb.line(3, 14, 11, 4, C(c2));
      pb.line(4, 14, 12, 4, C(shade(c2, -0.2)));
      pb.poly([[9, 2], [15, 3], [13, 9], [10, 6]], C(c));
      pb.line(15, 3, 13, 9, C(lt));
      break;
    case 'mace':
      pb.line(3, 14, 9, 7, C(c2));
      pb.ellipse(11, 5, 3.6, 3.6, C(c));
      pb.set(10, 4, C(lt));
      for (const [x, y] of [[11, 0], [15, 5], [11, 9], [7, 3]]) pb.set(x, y, C(dk));
      break;
    case 'bow':
      for (let y = 1; y < 15; y++) {
        const t = (y - 8) / 7;
        pb.set(Math.round(4 + (1 - t * t) * 6), y, C(c));
      }
      pb.line(4, 1, 4, 14, C(c2));
      break;
    case 'staff':
      pb.line(3, 14, 11, 5, C(c));
      pb.line(4, 14, 12, 5, C(shade(c, -0.25)));
      pb.ellipse(12.5, 3.5, 2.8, 2.8, C(c2));
      pb.set(12, 2, C('#ffffff'));
      break;
    case 'shield':
      pb.poly([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], (x) => C(x < 8 ? shade(c, 0.12) : c));
      r(7, 3, 2, 10, c2);
      r(3, 6, 10, 2, c2);
      break;
    case 'orb':
      pb.ellipse(8, 8, 5.5, 5.5, C(c));
      pb.ellipse(6.5, 6.5, 2, 2, C(c2));
      break;
    case 'hood':
      pb.ellipse(8, 8, 6, 6.5, C(c));
      pb.ellipse(8, 10, 3.2, 3.5, C('#2a2230'));
      r(3, 13, 10, 2, dk);
      break;
    case 'helm':
      pb.ellipse(8, 8, 6, 5.5, C(c));
      r(2, 9, 12, 2, dk);
      r(7, 9, 2, 5, dk);
      pb.set(5, 5, C(lt));
      break;
    case 'hat':
      pb.poly([[8, 1], [12, 11], [4, 11]], C(c));
      r(1, 11, 14, 2, c);
      r(5, 10, 6, 1, c2);
      break;
    case 'chest':
      pb.poly([[3, 3], [6, 2], [10, 2], [13, 3], [13, 14], [3, 14]], (x) => C(x < 6 ? lt : x > 10 ? dk : c));
      r(3, 11, 10, 1, c2);
      r(7, 3, 2, 3, shade(c, -0.4));
      break;
    case 'robe':
      pb.poly([[4, 2], [12, 2], [14, 15], [2, 15]], (x) => C(x < 6 ? lt : x > 10 ? dk : c));
      r(7, 2, 2, 13, c2);
      break;
    case 'legs':
      r(4, 2, 8, 3, c);
      r(4, 5, 3, 8, c);
      r(9, 5, 3, 8, dk);
      r(3, 12, 4, 2, '#3a2616');
      r(9, 12, 4, 2, '#3a2616');
      break;
    case 'boots':
      r(4, 3, 3, 8, c);
      r(9, 3, 3, 8, dk);
      r(3, 11, 5, 3, c);
      r(9, 11, 5, 3, dk);
      break;
    case 'gloves':
      pb.ellipse(6, 9, 3.5, 4.5, C(c));
      pb.ellipse(11, 7, 3, 4, C(dk));
      r(4, 12, 5, 2, shade(c, -0.15));
      break;
    case 'cape':
      pb.poly([[4, 2], [12, 2], [14, 15], [8, 13], [2, 15]], (x) => C(x < 7 ? lt : c));
      r(4, 2, 8, 1, '#c8a957');
      break;
    case 'ring':
      pb.ellipse(8, 9, 5, 5, C(c));
      pb.ellipse(8, 9, 3, 3, 0);
      pb.ellipse(8, 4, 2.4, 2.4, C(c2));
      break;
    case 'amulet':
      pb.line(3, 2, 8, 9, C(c));
      pb.line(13, 2, 8, 9, C(c));
      pb.ellipse(8, 11, 3, 3.5, C(c2));
      pb.set(7, 10, C('#ffffff'));
      break;
    case 'potion':
      r(6, 1, 4, 2, '#8a5c36');
      r(6, 3, 4, 2, '#dfe8f0');
      pb.ellipse(8, 10, 5.5, 5, C(c));
      pb.set(6, 8, C('#ffffff'));
      pb.set(6, 9, C(lt));
      break;
    case 'bread':
      pb.ellipse(8, 9, 6.5, 4.5, C(c));
      pb.ellipse(8, 8, 5, 3, C(lt));
      pb.line(5, 7, 7, 9, C(dk));
      pb.line(9, 7, 11, 9, C(dk));
      break;
    case 'herb':
      pb.line(8, 15, 8, 6, C('#3f8a3a'));
      pb.line(8, 12, 4, 9, C('#5aa84a'));
      pb.line(8, 10, 12, 7, C('#5aa84a'));
      pb.ellipse(8, 4, 2.5, 2.5, C(c));
      pb.ellipse(4, 8, 1.8, 1.8, C(c));
      pb.ellipse(12, 6, 1.8, 1.8, C(c));
      break;
    case 'gel':
      pb.ellipse(8, 10, 6, 4.5, C(c));
      pb.set(6, 8, C('#ffffff'));
      break;
    case 'pelt':
      pb.poly([[2, 4], [14, 3], [13, 13], [3, 14]], C(c));
      pb.line(4, 6, 12, 6, C(lt));
      pb.line(4, 10, 11, 11, C(dk));
      break;
    case 'tusk':
      for (let i = 0; i < 10; i++) pb.ellipse(4 + i, 12 - Math.sin(i / 3) * 6, 1.6 - i * 0.08, 1.6 - i * 0.08, C(i > 6 ? '#ffffff' : c));
      break;
    case 'silk':
      pb.ellipse(8, 8, 5.5, 5.5, C(c));
      pb.line(3, 6, 13, 10, C(shade(c, -0.2)));
      pb.line(3, 10, 13, 6, C(shade(c, -0.2)));
      break;
    case 'bone':
      pb.line(4, 12, 12, 4, C(c));
      pb.line(5, 12, 12, 5, C(c));
      pb.ellipse(3.5, 12.5, 2, 2, C(c));
      pb.ellipse(12.5, 3.5, 2, 2, C(c));
      break;
    case 'ore':
      pb.ellipse(8, 9, 6, 5, C(c));
      pb.set(6, 7, C(c2));
      pb.set(10, 9, C(c2));
      pb.set(8, 11, C(c2));
      break;
    case 'crystal':
      pb.poly([[8, 1], [13, 7], [8, 15], [3, 7]], (x) => C(x < 8 ? lt : c));
      break;
    case 'coin':
      pb.ellipse(8, 8, 5.5, 5.5, C(c));
      pb.ellipse(8, 8, 3.5, 3.5, C(dk));
      pb.set(8, 8, C(lt));
      break;
    case 'book':
      r(3, 2, 10, 12, c);
      r(4, 3, 8, 10, lt);
      r(5, 5, 6, 1, dk);
      r(5, 8, 6, 1, dk);
      break;
    case 'scroll':
      r(3, 3, 10, 10, c);
      r(2, 2, 12, 2, shade(c, -0.15));
      r(2, 12, 12, 2, shade(c, -0.15));
      r(5, 6, 6, 1, '#7a6a4a');
      r(5, 9, 5, 1, '#7a6a4a');
      break;
    case 'fragment':
      pb.poly([[9, 1], [12, 6], [8, 15], [4, 7]], (x) => C(x < 8 ? c2 : c));
      pb.set(8, 5, C('#ffffff'));
      break;
    case 'emblem':
      pb.poly([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], C(c));
      pb.poly([[8, 2], [14, 2], [14, 8], [8, 15]], C(shade(c, -0.35)));
      r(5, 5, 3, 3, c2);
      break;
    default:
      pb.ellipse(8, 8, 5, 5, C(c));
  }
  pb.outline(OUT);
  return pb;
}

export function itemIcon(def: ItemDef): string {
  const key = `item:${def.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ic = def.icon ?? { kind: 'default', color: '#9aa0aa' };
  const u = url(drawItemIcon(ic.kind, ic.color, ic.color2 ?? shade(ic.color, 0.4)));
  cache.set(key, u);
  return u;
}

function drawSkillGlyph(pb: PB, kind: string): void {
  const w = C('#ffffff');
  const s = C('#e8f0ff');
  switch (kind) {
    case 'spin':
      for (let a = 0; a < 5.4; a += 0.1) pb.set(Math.round(8 + Math.cos(a) * 5), Math.round(8 + Math.sin(a) * 5), w);
      pb.poly([[12, 3], [14, 6], [10, 6]], w);
      break;
    case 'dash':
      for (const y of [5, 8, 11]) pb.line(2, y, 8, y, s);
      pb.poly([[8, 3], [14, 8], [8, 13]], w);
      break;
    case 'bolt':
      pb.ellipse(9, 7, 3.5, 3.5, w);
      pb.line(2, 13, 6, 9, s);
      pb.line(3, 14, 7, 10, s);
      break;
    case 'rune':
      for (let a = 0; a < 6.3; a += 0.1) pb.set(Math.round(8 + Math.cos(a) * 5.5), Math.round(8 + Math.sin(a) * 5.5), w);
      pb.poly([[8, 4], [11, 10], [5, 10]], 0);
      pb.line(8, 4, 11, 10, w);
      pb.line(11, 10, 5, 10, w);
      pb.line(5, 10, 8, 4, w);
      break;
    case 'pierce':
      pb.line(2, 13, 13, 2, w);
      pb.poly([[13, 2], [9, 3], [12, 6]], w);
      pb.line(2, 11, 4, 13, s);
      break;
    case 'heal':
      pb.rect(7, 3, 2, 10, w);
      pb.rect(3, 7, 10, 2, w);
      break;
    case 'roots':
      for (const x of [4, 8, 12]) {
        pb.line(x, 14, x + 1, 9, w);
        pb.line(x + 1, 9, x, 5, s);
      }
      break;
    case 'summon':
      pb.ellipse(8, 9, 4.5, 3.5, w);
      pb.poly([[4, 6], [6, 2], [7, 6]], w);
      pb.poly([[9, 6], [11, 2], [12, 6]], w);
      break;
    case 'blink':
      pb.ellipse(8, 8, 4, 6, s);
      pb.ellipse(8, 8, 2, 4, 0);
      pb.set(4, 3, w);
      pb.set(12, 13, w);
      break;
    case 'barrier':
      pb.poly([[3, 3], [13, 3], [13, 8], [8, 14], [3, 8]], w);
      pb.poly([[5, 5], [11, 5], [11, 8], [8, 12], [5, 8]], 0);
      break;
    case 'bomb':
      pb.ellipse(7, 10, 4.5, 4.5, w);
      pb.line(10, 6, 13, 3, s);
      pb.set(13, 2, C('#ffd56a'));
      break;
    case 'quake':
      pb.line(2, 12, 6, 9, w);
      pb.line(6, 9, 8, 11, w);
      pb.line(8, 11, 13, 5, w);
      pb.rect(2, 13, 12, 1, s);
      break;
    case 'chain':
      pb.line(9, 1, 5, 8, w);
      pb.line(5, 8, 10, 8, w);
      pb.line(10, 8, 6, 15, w);
      break;
    case 'rain':
      for (const x of [3, 7, 11]) {
        pb.line(x, 2, x + 2, 9, w);
        pb.set(x + 2, 10, s);
      }
      pb.rect(2, 13, 12, 1, s);
      break;
    case 'frost':
      pb.line(8, 1, 8, 15, w);
      pb.line(1, 8, 15, 8, w);
      pb.line(3, 3, 13, 13, s);
      pb.line(13, 3, 3, 13, s);
      break;
    case 'turret':
      pb.poly([[8, 1], [12, 6], [8, 11], [4, 6]], w);
      pb.rect(4, 12, 8, 3, s);
      break;
    case 'fan':
      for (const a of [-0.6, 0, 0.6]) pb.line(8, 13, Math.round(8 + Math.sin(a) * 7), Math.round(13 - Math.cos(a) * 10), w);
      break;
    case 'hammer':
      pb.rect(3, 2, 10, 5, w);
      pb.rect(7, 7, 2, 8, s);
      break;
    case 'buff':
      pb.rect(6, 2, 4, 3, s);
      pb.ellipse(8, 10, 4.5, 4.5, w);
      pb.rect(7, 8, 2, 4, C('#d8333b'));
      break;
  }
}

/** Ícone da habilidade; tier 1–2 (evoluções) muda a borda e acende pontos de brilho. */
export function skillIcon(def: SkillDef, tier = 0): string {
  const key = `skill:${def.id}:${tier}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const col = SCHOOLS[def.school].color;
  const pb = new PB(18, 18);
  const ring = ['#c8a96a', '#d8e4f4', '#ffd24a'][tier];
  pb.ellipse(9, 9, 8.8, 8.8, C(tier === 2 ? '#ffe9a0' : ring));
  const inner = tier === 2 ? shade(col, 0.2) : col;
  pb.ellipse(9, 9, 7.6, 7.6, (x, y) => C(x + y < 16 ? shade(inner, 0.18) : shade(inner, -0.28)));
  const glyph = new PB(16, 16);
  drawSkillGlyph(glyph, def.kind);
  pb.blit(glyph, 1, 1);
  if (tier >= 1) for (const [x, y] of tier === 2 ? [[2, 3], [15, 3], [2, 15], [15, 15]] : [[15, 3], [2, 15]]) pb.rect(x, y, 2, 2, C('#ffffff'));
  pb.outline(OUT);
  const u = url(pb);
  cache.set(key, u);
  return u;
}
