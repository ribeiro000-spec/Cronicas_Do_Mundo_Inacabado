import type { SkillDef, SkillSchool } from '../core/types';

export const SCHOOLS: Record<SkillSchool, { name: string; color: string; desc: string }> = {
  marcial: { name: 'Combate Marcial', color: '#d8573a', desc: 'Golpes, combos e quebra de postura.' },
  arcana: { name: 'Arcana', color: '#5a8dff', desc: 'Projéteis, runas, raios e explosões.' },
  precisao: { name: 'Precisão', color: '#7fc24a', desc: 'Tiros especiais, mobilidade e críticos.' },
  natureza: { name: 'Natureza e Elementos', color: '#3fbf7f', desc: 'Cura, raízes, gelo e controle de terreno.' },
  invocacao: { name: 'Invocação', color: '#b46cff', desc: 'Espíritos e aliados temporários.' },
  sombras: { name: 'Sombras', color: '#8a6ab0', desc: 'Furtividade, emboscadas e lâminas espectrais.' },
  protecao: { name: 'Proteção', color: '#e0b84a', desc: 'Escudos, barreiras e luz sagrada.' },
  alquimia: { name: 'Alquimia e Artifícios', color: '#e07b2a', desc: 'Bombas, elixires e engenhocas.' },
};

/* Cada habilidade evolui nos níveis de maestria 3 e 5: muda de nome, de aparência e ganha
 * um efeito novo (mais projéteis, mais lobos, área maior…). */

const list: SkillDef[] = [
  // ------------------------------------------------------------ marcial
  {
    id: 'golpe_giratorio', name: 'Golpe Giratório', school: 'marcial', kind: 'spin',
    desc: 'Gira a arma e atinge todos os inimigos ao redor.', mp: 10, cd: 5, power: 1.5, scale: 'atk', radius: 1.9, req: { FOR: 8 },
    tiers: [
      { at: 3, name: 'Ciclone de Aço', desc: 'Dois giros seguidos, área maior e rajada de vento.' },
      { at: 5, name: 'Furacão de Lâminas', desc: 'Três giros que puxam os inimigos para o centro.' },
    ],
  },
  {
    id: 'investida', name: 'Investida', school: 'marcial', kind: 'dash',
    desc: 'Avança alguns passos, causando dano e atordoando quem estiver no caminho.', mp: 12, cd: 7, power: 1.2, scale: 'atk',
    range: 4.5, duration: 0.7, req: { FOR: 10, VIG: 8 },
    tiers: [
      { at: 3, name: 'Investida Trovejante', desc: 'Termina com uma onda de choque em volta.' },
      { at: 5, name: 'Carga do Colosso', desc: 'Vai mais longe e a onda de choque é enorme.' },
    ],
  },
  {
    id: 'fenda_sismica', name: 'Fenda Sísmica', school: 'marcial', kind: 'quake',
    desc: 'Golpeia o chão e abre uma fenda em linha que fere e deixa lento.', mp: 14, cd: 8, power: 1.6, scale: 'atk', range: 5,
    req: { FOR: 12 }, reqLevel: 2,
    tiers: [
      { at: 3, name: 'Terremoto', desc: 'Três fendas em leque.' },
      { at: 5, name: 'Ira da Montanha', desc: 'Fendas em todas as direções e atordoamento.' },
    ],
  },
  // ------------------------------------------------------------ arcana
  {
    id: 'projetil_arcano', name: 'Projétil Arcano', school: 'arcana', kind: 'bolt',
    desc: 'Dispara um orbe que persegue o inimigo mais próximo.', mp: 6, cd: 1.0, power: 1.4, scale: 'mag', range: 8, req: { INT: 8 },
    tiers: [
      { at: 3, name: 'Rajada Arcana', desc: 'Três orbes de uma vez.' },
      { at: 5, name: 'Cometa Arcano', desc: 'Um cometa enorme que explode em área.' },
    ],
  },
  {
    id: 'explosao_runica', name: 'Explosão Rúnica', school: 'arcana', kind: 'rune',
    desc: 'Inscreve uma runa sob o alvo que explode após um instante.', mp: 20, cd: 8, power: 2.3, scale: 'mag', radius: 2.1,
    range: 7, req: { INT: 14 }, reqLevel: 3,
    tiers: [
      { at: 3, name: 'Runas Gêmeas', desc: 'Duas runas explodem em sequência.' },
      { at: 5, name: 'Selo Arcano', desc: 'Uma runa gigante que atordoa tudo dentro dela.' },
    ],
  },
  {
    id: 'relampago', name: 'Relâmpago em Cadeia', school: 'arcana', kind: 'chain',
    desc: 'Um raio salta entre até 3 inimigos próximos.', mp: 14, cd: 5, power: 1.5, scale: 'mag', range: 7, req: { INT: 12 }, reqLevel: 2,
    tiers: [
      { at: 3, name: 'Arco Voltaico', desc: 'Salta entre 5 inimigos.' },
      { at: 5, name: 'Tempestade Elétrica', desc: 'Salta entre 7 inimigos e atordoa.' },
    ],
  },
  // ------------------------------------------------------------ precisão
  {
    id: 'flecha_perfurante', name: 'Flecha Perfurante', school: 'precisao', kind: 'pierce',
    desc: 'Um tiro que atravessa todos os inimigos em linha.', mp: 8, cd: 4, power: 1.8, scale: 'atk', range: 10, req: { DES: 10 },
    tiers: [
      { at: 3, name: 'Flecha Tripla', desc: 'Três flechas perfurantes em leque.' },
      { at: 5, name: 'Flecha do Trovão', desc: 'Cada acerto dispara um raio para outro inimigo.' },
    ],
  },
  {
    id: 'chuva_flechas', name: 'Chuva de Flechas', school: 'precisao', kind: 'rain',
    desc: 'Flechas caem do céu numa área durante alguns instantes.', mp: 16, cd: 9, power: 0.55, scale: 'atk', radius: 2.2, range: 8,
    duration: 1.6, req: { DES: 12 }, reqLevel: 2,
    tiers: [
      { at: 3, name: 'Chuva Incendiária', desc: 'Flechas em chamas que queimam.' },
      { at: 5, name: 'Tempestade de Flechas', desc: 'Área maior, mais tempo e mais flechas.' },
    ],
  },
  // ------------------------------------------------------------ natureza e elementos
  {
    id: 'cura_natural', name: 'Cura Natural', school: 'natureza', kind: 'heal',
    desc: 'Recupera vida imediatamente e um pouco mais nos segundos seguintes.', mp: 15, cd: 10, power: 1.0, scale: 'heal',
    duration: 4, req: { AFI: 6 },
    tiers: [
      { at: 3, name: 'Florescer', desc: 'Cura maior e regeneração mais longa.' },
      { at: 5, name: 'Bênção da Floresta', desc: 'Também reduz o dano recebido em 30% por 6 s.' },
    ],
  },
  {
    id: 'raizes', name: 'Raízes Agarradoras', school: 'natureza', kind: 'roots',
    desc: 'Raízes prendem os inimigos numa área por alguns segundos.', mp: 14, cd: 10, power: 0.6, scale: 'mag', radius: 2.5,
    range: 6, duration: 2.5, req: { AFI: 10 },
    tiers: [
      { at: 3, name: 'Raízes Espinhosas', desc: 'Espinhos ferem enquanto prendem.' },
      { at: 5, name: 'Garras da Terra', desc: 'Área maior, prende por mais tempo e causa muito dano.' },
    ],
  },
  {
    id: 'nova_gelida', name: 'Nova Gélida', school: 'natureza', kind: 'frost',
    desc: 'Uma explosão de gelo ao seu redor deixa os inimigos muito lentos.', mp: 16, cd: 9, power: 1.1, scale: 'mag', radius: 2.4,
    duration: 3, req: { AFI: 8, INT: 8 }, reqLevel: 2,
    tiers: [
      { at: 3, name: 'Inverno Eterno', desc: 'Congela os inimigos no lugar.' },
      { at: 5, name: 'Zero Absoluto', desc: 'Área maior e espinhos de gelo que estilhaçam.' },
    ],
  },
  // ------------------------------------------------------------ invocação
  {
    id: 'espirito_lobo', name: 'Espírito Lobo', school: 'invocacao', kind: 'summon',
    desc: 'Invoca um lobo espiritual que luta ao seu lado por 20 segundos.', mp: 25, cd: 25, power: 1.0, scale: 'mag',
    duration: 20, req: { VON: 12, AFI: 8 }, reqLevel: 2,
    tiers: [
      { at: 3, name: 'Matilha Espiritual', desc: 'Dois lobos violeta, mais fortes e rápidos.' },
      { at: 5, name: 'Alfa Celestial', desc: 'Um lobo alfa dourado gigante lidera a matilha.' },
    ],
  },
  {
    id: 'sentinela', name: 'Sentinela Astral', school: 'invocacao', kind: 'turret',
    desc: 'Ergue um cristal que dispara orbes nos inimigos por 14 segundos.', mp: 22, cd: 20, power: 0.9, scale: 'mag', duration: 14,
    req: { VON: 10, INT: 8 }, reqLevel: 2,
    tiers: [
      { at: 3, name: 'Sentinelas Gêmeas', desc: 'Duas sentinelas.' },
      { at: 5, name: 'Torre Astral', desc: 'Três sentinelas que disparam mais rápido.' },
    ],
  },
  // ------------------------------------------------------------ sombras
  {
    id: 'passo_sombrio', name: 'Passo Sombrio', school: 'sombras', kind: 'blink',
    desc: 'Surge atrás do inimigo mais próximo. O próximo ataque é crítico garantido.', mp: 10, cd: 8, power: 1.0, scale: 'atk',
    range: 6, req: { DES: 12 },
    tiers: [
      { at: 3, name: 'Passo Duplo', desc: 'Salta entre dois inimigos, ferindo os dois.' },
      { at: 5, name: 'Dança das Sombras', desc: 'Salta entre até quatro inimigos.' },
    ],
  },
  {
    id: 'adagas_espectrais', name: 'Adagas Espectrais', school: 'sombras', kind: 'fan',
    desc: 'Arremessa três adagas de sombra em leque.', mp: 10, cd: 4, power: 0.85, scale: 'atk', range: 7, req: { DES: 10 },
    tiers: [
      { at: 3, name: 'Leque da Noite', desc: 'Cinco adagas.' },
      { at: 5, name: 'Vendaval Sombrio', desc: 'Oito adagas em todas as direções.' },
    ],
  },
  // ------------------------------------------------------------ proteção
  {
    id: 'barreira', name: 'Barreira', school: 'protecao', kind: 'barrier',
    desc: 'Um escudo de luz absorve dano por alguns segundos.', mp: 15, cd: 14, power: 1.0, scale: 'heal', duration: 6, req: { VIG: 10 },
    tiers: [
      { at: 3, name: 'Égide', desc: 'Também devolve parte do dano a quem ataca.' },
      { at: 5, name: 'Égide Radiante', desc: 'Explode em luz quando termina.' },
    ],
  },
  {
    id: 'martelo_justica', name: 'Martelo da Justiça', school: 'protecao', kind: 'hammer',
    desc: 'Um martelo de luz cai sobre o alvo e o atordoa.', mp: 16, cd: 9, power: 1.9, scale: 'mixed', radius: 1.4, range: 7,
    req: { VON: 10, FOR: 8 }, reqLevel: 2,
    tiers: [
      { at: 3, name: 'Martelos Gêmeos', desc: 'Dois martelos caem em sequência.' },
      { at: 5, name: 'Julgamento Divino', desc: 'Um martelo gigante que também cura você.' },
    ],
  },
  // ------------------------------------------------------------ alquimia
  {
    id: 'bomba_alquimica', name: 'Bomba Alquímica', school: 'alquimia', kind: 'bomb',
    desc: 'Arremessa uma bomba que explode em chamas e queima.', mp: 12, cd: 6, power: 1.6, scale: 'mixed', radius: 1.8,
    range: 6, req: { INT: 6, DES: 6 },
    tiers: [
      { at: 3, name: 'Bombas de Fragmentação', desc: 'Três bombas espalhadas.' },
      { at: 5, name: 'Bomba Solar', desc: 'Uma explosão enorme que deixa o chão em chamas.' },
    ],
  },
  {
    id: 'elixir_furia', name: 'Elixir da Fúria', school: 'alquimia', kind: 'buff',
    desc: 'Por 8 segundos, ataca 35% mais rápido e causa 20% mais dano.', mp: 14, cd: 18, power: 1, scale: 'atk', duration: 8,
    req: { VIG: 6, INT: 6 },
    tiers: [
      { at: 3, name: 'Elixir Sanguíneo', desc: 'Também rouba vida a cada golpe.' },
      { at: 5, name: 'Elixir do Titã', desc: 'Você cresce, ganha armadura e o efeito dura mais.' },
    ],
  },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(list.map((s) => [s.id, s]));
export const SKILL_LIST = list;

/** Estágio de evolução (0, 1 ou 2) para o nível de maestria. */
export function skillTier(def: SkillDef, mastery: number): number {
  let t = 0;
  (def.tiers ?? []).forEach((tier, i) => {
    if (mastery >= tier.at) t = i + 1;
  });
  return t;
}

export function skillName(def: SkillDef, mastery: number): string {
  const t = skillTier(def, mastery);
  return t > 0 ? def.tiers![t - 1].name : def.name;
}

export const TIER_COLORS = ['#c8a96a', '#c8d4e8', '#ffd24a'];
