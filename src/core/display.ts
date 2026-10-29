/* Resolução de desenho. O canvas é desenhado em pixels reais do aparelho (até 2× por
 * pixel CSS) e exibido no tamanho da janela: o movimento da câmera fica mais fino e a
 * arte em alta definição aparece nítida, sem o navegador esticar a imagem. */

export const display = {
  /** pixels do canvas por pixel CSS */
  dpr: 1,
  /** pixels do canvas por unidade lógica do mundo (zoom da câmera) */
  zoom: 2,
};

/** Alinha uma coordenada do mundo à grade de pixels reais da tela (sem tremer ao mover). */
export function snapPx(v: number): number {
  const z = display.zoom;
  return Math.round(v * z) / z;
}

export function computeDpr(hiRes: boolean): number {
  if (!hiRes) return 1;
  const raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(2, Math.round(raw * 2) / 2));
}
