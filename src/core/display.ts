/* Resolução de desenho. O canvas é desenhado em pixels reais do aparelho (até 2× por
 * pixel CSS) e exibido no tamanho da janela: o movimento da câmera fica mais fino e a
 * arte em alta definição aparece nítida, sem o navegador esticar a imagem. */

export const display = {
  /** pixels do canvas por pixel CSS */
  dpr: 1,
};

export function computeDpr(hiRes: boolean): number {
  if (!hiRes) return 1;
  const raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(2, Math.round(raw * 2) / 2));
}
