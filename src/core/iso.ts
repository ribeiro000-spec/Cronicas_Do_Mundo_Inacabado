/* Projeção isométrica 2:1.
 * Coordenadas do mundo em tiles (x, y), contínuas. Tela em pixels "de arte" (antes do zoom).
 *   tela.x = (x - y) * TW/2
 *   tela.y = (x + y) * TH/2
 */
export const TW = 32;
export const TH = 16;
const HW = TW / 2;
const HH = TH / 2;

export function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * HW, y: (x + y) * HH };
}

export function toWorld(sx: number, sy: number): { x: number; y: number } {
  const a = sx / HW;
  const b = sy / HH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Converte uma direção da tela (joystick: direita = +x, baixo = +y) em direção do mundo
 *  com o mesmo tamanho (0..1) — a velocidade é constante no mundo, como manda a perspectiva. */
export function screenDirToWorld(dx: number, dy: number): { x: number; y: number } {
  const mag = Math.min(1, Math.hypot(dx, dy));
  if (mag < 1e-6) return { x: 0, y: 0 };
  const w = toWorld(dx, dy);
  const len = Math.hypot(w.x, w.y) || 1;
  return { x: (w.x / len) * mag, y: (w.y / len) * mag };
}

/** Direção do mundo → direção na tela (para virar o sprite). */
export function worldDirToScreen(dx: number, dy: number): { x: number; y: number } {
  return { x: (dx - dy) * HW, y: (dx + dy) * HH };
}

/** Profundidade de desenho: quem está mais "embaixo" na tela fica na frente. */
export function depthOf(x: number, y: number): number {
  return (x + y) * HH;
}
