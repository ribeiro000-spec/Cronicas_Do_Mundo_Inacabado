/* Parâmetros de balanceamento e de motor. O GDD deixa vários valores em aberto
 * (curva de XP, pontos por nível, fórmulas): ficam todos aqui para ajustar e testar. */

export const BALANCE = {
  /** pontos de atributo ganhos por nível */
  attrPointsPerLevel: 4,
  /** pontos de habilidade ganhos por nível */
  skillPointsPerLevel: 1,
  /** pontos de habilidade iniciais */
  startingSkillPoints: 1,
  /** nível máximo de maestria de uma habilidade (GDD: até cinco) */
  maxMastery: 5,
  /** penalidade de morte sobre o XP salvo do nível atual (GDD: 20%) */
  deathXpPenalty: 0.2,
  /** acima deste valor um atributo rende metade (retornos decrescentes) */
  attrSoftCap: 30,
  /** tamanho do inventário (espaços) */
  inventorySize: 36,
  /** preço de venda = preço × fator */
  sellFactor: 0.4,
  /** tempo para reaparecer um grupo de inimigos derrotado (s) */
  respawnSeconds: 120,
  /** ervas voltam a crescer depois de (s de jogo) */
  herbRegrowSeconds: 300,
  /** intervalo do salvamento automático fora de combate (s) */
  autosaveSeconds: 120,
  /** segundos sem dano/agressão para sair de combate */
  combatTimeout: 4,
};

/** XP necessário para passar do nível `level` para o próximo. */
export function xpToNext(level: number): number {
  return Math.floor(80 * Math.pow(level, 1.6) + 20);
}

export const ENGINE = {
  /** raio de chunks carregados ao redor do jogador (1 = 3×3, 2 = 5×5) */
  chunkRadius: 1,
  /** chunks extras pré-carregados na direção do movimento */
  prefetchAhead: 1,
  /** chunks fora deste raio são descarregados */
  unloadRadius: 2,
  /** raio (tiles) revelado no mapa ao redor do jogador */
  revealRadius: 9,
  /** tamanho da célula de névoa do mapa (tiles) */
  fogCell: 4,
  /** distância para mostrar o botão de interação (tiles) */
  interactRange: 1.6,
};

export const SAVE_SCHEMA = 2;
export const GAME_VERSION = '0.2.0';
