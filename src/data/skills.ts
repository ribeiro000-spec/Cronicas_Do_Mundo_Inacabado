import type { SkillDef, SkillSchool } from '../core/types';

export const SCHOOLS: Record<SkillSchool, { name: string; color: string; desc: string }> = {
  marcial: { name: 'Combate Marcial', color: '#d8573a', desc: 'Golpes, combos e quebra de postura.' },
  arcana: { name: 'Arcana', color: '#5a8dff', desc: 'Projéteis, runas e explosões.' },
  precisao: { name: 'Precisão', color: '#7fc24a', desc: 'Tiros especiais, mobilidade e críticos.' },
  natureza: { name: 'Natureza', color: '#3fbf7f', desc: 'Cura, raízes e controle de terreno.' },
  invocacao: { name: 'Invocação', color: '#b46cff', desc: 'Espíritos e aliados temporários.' },
  sombras: { name: 'Sombras', color: '#7a6a9a', desc: 'Furtividade, emboscadas e mobilidade.' },
  protecao: { name: 'Proteção', color: '#e0b84a', desc: 'Escudos, barreiras e resistência.' },
  alquimia: { name: 'Alquimia e Artifícios', color: '#e07b2a', desc: 'Bombas, poções e engenhocas.' },
};

const list: SkillDef[] = [
  {
    id: 'golpe_giratorio', name: 'Golpe Giratório', school: 'marcial', kind: 'spin',
    desc: 'Gira a arma e atinge todos os inimigos ao redor.', mp: 10, cd: 5, power: 1.5, scale: 'atk', radius: 1.9, req: { FOR: 8 },
  },
  {
    id: 'investida', name: 'Investida', school: 'marcial', kind: 'dash',
    desc: 'Avança alguns passos, causando dano e atordoando quem estiver no caminho.', mp: 12, cd: 7, power: 1.2, scale: 'atk',
    range: 4.5, duration: 0.7, req: { FOR: 10, VIG: 8 },
  },
  {
    id: 'projetil_arcano', name: 'Projétil Arcano', school: 'arcana', kind: 'bolt',
    desc: 'Dispara um orbe que persegue o inimigo mais próximo.', mp: 6, cd: 1.0, power: 1.4, scale: 'mag', range: 8, req: { INT: 8 },
  },
  {
    id: 'explosao_runica', name: 'Explosão Rúnica', school: 'arcana', kind: 'rune',
    desc: 'Inscreve uma runa sob o alvo que explode após um instante.', mp: 20, cd: 8, power: 2.3, scale: 'mag', radius: 2.1,
    range: 7, req: { INT: 14 }, reqLevel: 3,
  },
  {
    id: 'flecha_perfurante', name: 'Flecha Perfurante', school: 'precisao', kind: 'pierce',
    desc: 'Um tiro que atravessa todos os inimigos em linha.', mp: 8, cd: 4, power: 1.8, scale: 'atk', range: 10, req: { DES: 10 },
  },
  {
    id: 'cura_natural', name: 'Cura Natural', school: 'natureza', kind: 'heal',
    desc: 'Recupera vida imediatamente e um pouco mais nos segundos seguintes.', mp: 15, cd: 10, power: 1.0, scale: 'heal',
    duration: 4, req: { AFI: 6 },
  },
  {
    id: 'raizes', name: 'Raízes Agarradoras', school: 'natureza', kind: 'roots',
    desc: 'Raízes prendem os inimigos numa área por alguns segundos.', mp: 14, cd: 10, power: 0.6, scale: 'mag', radius: 2.5,
    range: 6, duration: 2.5, req: { AFI: 10 },
  },
  {
    id: 'espirito_lobo', name: 'Espírito Lobo', school: 'invocacao', kind: 'summon',
    desc: 'Invoca um lobo espiritual que luta ao seu lado por 20 segundos.', mp: 25, cd: 25, power: 1.0, scale: 'mag',
    duration: 20, req: { VON: 12, AFI: 8 }, reqLevel: 2,
  },
  {
    id: 'passo_sombrio', name: 'Passo Sombrio', school: 'sombras', kind: 'blink',
    desc: 'Surge atrás do inimigo mais próximo. O próximo ataque é crítico garantido.', mp: 10, cd: 8, power: 1.0, scale: 'atk',
    range: 6, req: { DES: 12 },
  },
  {
    id: 'barreira', name: 'Barreira', school: 'protecao', kind: 'barrier',
    desc: 'Um escudo de luz absorve dano por alguns segundos.', mp: 15, cd: 14, power: 1.0, scale: 'heal', duration: 6, req: { VIG: 10 },
  },
  {
    id: 'bomba_alquimica', name: 'Bomba Alquímica', school: 'alquimia', kind: 'bomb',
    desc: 'Arremessa uma bomba que explode em chamas e queima.', mp: 12, cd: 6, power: 1.6, scale: 'mixed', radius: 1.8,
    range: 6, req: { INT: 6, DES: 6 },
  },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(list.map((s) => [s.id, s]));
export const SKILL_LIST = list;
