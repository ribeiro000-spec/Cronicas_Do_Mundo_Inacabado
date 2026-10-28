import type { Attrs, EquipSlot } from '../core/types';

/* Arquétipos iniciais: orientam o começo (atributos, equipamento e uma habilidade),
 * mas não criam classe permanente — qualquer personagem pode aprender qualquer escola. */

export interface Archetype {
  id: string;
  name: string;
  desc: string;
  attrs: Attrs;
  equipment: Partial<Record<EquipSlot, string>>;
  skills: Record<string, number>;
  hotbar: (string | null)[];
  items: { id: string; qty: number }[];
  color: string;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'guerreiro',
    name: 'Guerreiro',
    desc: 'Espada e escudo. Resistente e direto. Bom para começar.',
    attrs: { FOR: 12, DES: 6, INT: 4, VON: 5, VIG: 11, AFI: 4 },
    equipment: { mainHand: 'espada_ferro', offHand: 'escudo_madeira', chest: 'peitoral_couro', legs: 'calcas_tecido', cape: 'capa_vermelha' },
    skills: { golpe_giratorio: 1 },
    hotbar: ['golpe_giratorio', null, null, null],
    items: [{ id: 'pocao_vida', qty: 4 }],
    color: '#d8573a',
  },
  {
    id: 'maga',
    name: 'Maga',
    desc: 'Cajado e magia arcana. Ataca à distância, mas é frágil.',
    attrs: { FOR: 4, DES: 6, INT: 13, VON: 10, VIG: 6, AFI: 7 },
    equipment: { mainHand: 'cajado_aprendiz', chest: 'manto_aprendiz', head: 'chapeu_aprendiz', legs: 'calcas_tecido' },
    skills: { projetil_arcano: 1 },
    hotbar: ['projetil_arcano', null, null, null],
    items: [{ id: 'pocao_vida', qty: 3 }, { id: 'pocao_mana', qty: 3 }],
    color: '#5a8dff',
  },
  {
    id: 'arqueira',
    name: 'Arqueira',
    desc: 'Arco e agilidade. Golpes críticos e distância segura.',
    attrs: { FOR: 6, DES: 13, INT: 5, VON: 5, VIG: 8, AFI: 9 },
    equipment: { mainHand: 'arco_curto', chest: 'peitoral_couro', head: 'capuz_verde', legs: 'calcas_couro', gloves: 'luvas_couro', cape: 'capa_viajante' },
    skills: { flecha_perfurante: 1 },
    hotbar: ['flecha_perfurante', null, null, null],
    items: [{ id: 'pocao_vida', qty: 4 }],
    color: '#7fc24a',
  },
  {
    id: 'clerigo',
    name: 'Clérigo',
    desc: 'Maça, escudo e cura. Aguenta lutas longas.',
    attrs: { FOR: 8, DES: 5, INT: 6, VON: 12, VIG: 9, AFI: 8 },
    equipment: { mainHand: 'maca_clerigo', offHand: 'escudo_madeira', chest: 'robe_clerigo', legs: 'calcas_tecido' },
    skills: { cura_natural: 1 },
    hotbar: ['cura_natural', null, null, null],
    items: [{ id: 'pocao_vida', qty: 3 }, { id: 'pocao_mana', qty: 2 }],
    color: '#e0b84a',
  },
];

export const SKIN_TONES = ['#f2d1b0', '#e3b48c', '#c68d63', '#9a6440', '#6b4029'];
export const HAIR_COLORS = ['#3a2416', '#6b3f22', '#b8732f', '#e2c26b', '#c9c9c9', '#9c2f2f', '#2a2a3a', '#4a6bb0'];
export const HAIR_STYLES: { id: 'curto' | 'longo' | 'rabo' | 'careca'; name: string }[] = [
  { id: 'curto', name: 'Curto' },
  { id: 'longo', name: 'Longo' },
  { id: 'rabo', name: 'Rabo' },
  { id: 'careca', name: 'Raspado' },
];
