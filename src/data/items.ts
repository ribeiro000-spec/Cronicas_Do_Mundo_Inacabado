import type { ItemDef } from '../core/types';

/* Catálogo de itens. Requisitos seguem os exemplos do GDD
 * (espada de ferro FOR 8, arco reforçado DES 12, cajado rúnico INT 18, machado colossal FOR 28…). */

const list: ItemDef[] = [
  // ------------------------------------------------------------ armas de uma mão
  {
    id: 'espada_ferro', name: 'Espada de Ferro', category: 'weapon', weaponType: 'sword', hands: 'one',
    desc: 'Lâmina simples e confiável, forjada em Eldenor.', price: 60, req: { FOR: 8 }, stats: { dmg: 9 },
    visual: { style: 'sword', color: '#c9ced6', color2: '#6b4a2b' }, icon: { kind: 'sword', color: '#c9ced6', color2: '#6b4a2b' },
  },
  {
    id: 'espada_aco', name: 'Espada de Aço', category: 'weapon', weaponType: 'sword', hands: 'one', rarity: 'incomum',
    desc: 'Aço temperado com fio duradouro.', price: 180, req: { FOR: 14 }, stats: { dmg: 15 },
    visual: { style: 'sword', color: '#e2e8f0', color2: '#3b3b55' }, icon: { kind: 'sword', color: '#e2e8f0', color2: '#3b3b55' },
  },
  {
    id: 'espada_sem_brasao', name: 'Lâmina Sem Brasão', category: 'weapon', weaponType: 'sword', hands: 'one', rarity: 'raro',
    desc: 'A espada do cavaleiro esquecido. O metal parece lembrar de batalhas que nunca aconteceram.', price: 600,
    req: { FOR: 12 }, stats: { dmg: 24, crit: 0.05, attrs: { FOR: 2, VIG: 2 } },
    visual: { style: 'sword', color: '#7d86a8', color2: '#c8a957' }, icon: { kind: 'sword', color: '#7d86a8', color2: '#c8a957' },
  },
  {
    id: 'adaga_simples', name: 'Adaga Simples', category: 'weapon', weaponType: 'dagger', hands: 'one',
    desc: 'Rápida e precisa. Pode ser usada nas duas mãos.', price: 45, req: { DES: 6 }, stats: { dmg: 6, crit: 0.08 },
    visual: { style: 'dagger', color: '#d0d4dc', color2: '#5a3d26' }, icon: { kind: 'dagger', color: '#d0d4dc', color2: '#5a3d26' },
  },
  {
    id: 'adaga_serpente', name: 'Adaga da Serpente', category: 'weapon', weaponType: 'dagger', hands: 'one', rarity: 'incomum',
    desc: 'Lâmina ondulada usada por contrabandistas do Sal Negro.', price: 220, req: { DES: 14 }, stats: { dmg: 11, crit: 0.1 },
    visual: { style: 'dagger', color: '#8fd18b', color2: '#2d2d3a' }, icon: { kind: 'dagger', color: '#8fd18b', color2: '#2d2d3a' },
  },
  {
    id: 'maca_clerigo', name: 'Maça do Peregrino', category: 'weapon', weaponType: 'mace', hands: 'one',
    desc: 'Arma de clérigos itinerantes. Canaliza um pouco de magia.', price: 70, req: { VON: 8 }, stats: { dmg: 8, mag: 4 },
    visual: { style: 'mace', color: '#b8bcc6', color2: '#7a5530' }, icon: { kind: 'mace', color: '#b8bcc6', color2: '#7a5530' },
  },
  // ------------------------------------------------------------ armas de duas mãos
  {
    id: 'machado_lenhador', name: 'Machado de Lenhador', category: 'weapon', weaponType: 'axe', hands: 'two',
    desc: 'Pesado e lento, mas cada golpe conta. Ocupa as duas mãos.', price: 140, req: { FOR: 12 }, stats: { dmg: 16 },
    visual: { style: 'axe', color: '#b9bec8', color2: '#6b4a2b' }, icon: { kind: 'axe', color: '#b9bec8', color2: '#6b4a2b' },
  },
  {
    id: 'machado_colossal', name: 'Machado Colossal', category: 'weapon', weaponType: 'axe', hands: 'two', rarity: 'epico',
    desc: 'Uma arma feita para gigantes das Terras de Cinza.', price: 900, req: { FOR: 28 }, stats: { dmg: 30, attrs: { VIG: 2 } },
    visual: { style: 'axe', color: '#d8572a', color2: '#2f2a28' }, icon: { kind: 'axe', color: '#d8572a', color2: '#2f2a28' },
  },
  {
    id: 'arco_curto', name: 'Arco Curto', category: 'weapon', weaponType: 'bow', hands: 'two',
    desc: 'Arco leve de caçador. Ataques à distância.', price: 60, req: { DES: 6 }, stats: { dmg: 8 },
    visual: { style: 'bow', color: '#8b5a2b', color2: '#e8e0c8' }, icon: { kind: 'bow', color: '#8b5a2b', color2: '#e8e0c8' },
  },
  {
    id: 'arco_reforcado', name: 'Arco Reforçado', category: 'weapon', weaponType: 'bow', hands: 'two', rarity: 'incomum',
    desc: 'Madeira de teixo com placas de chifre. Alcance e força maiores.', price: 200, req: { DES: 12 }, stats: { dmg: 14, crit: 0.03 },
    visual: { style: 'bow', color: '#5c3b22', color2: '#d9c79a' }, icon: { kind: 'bow', color: '#5c3b22', color2: '#d9c79a' },
  },
  {
    id: 'cajado_aprendiz', name: 'Cajado de Aprendiz', category: 'weapon', weaponType: 'staff', hands: 'two',
    desc: 'Dispara orbes arcanos. Padrão da Academia de Lúmen.', price: 60, req: { INT: 6 }, stats: { dmg: 3, mag: 9 },
    visual: { style: 'staff', color: '#7a5530', color2: '#7cc7ff' }, icon: { kind: 'staff', color: '#7a5530', color2: '#7cc7ff' },
  },
  {
    id: 'cajado_runico', name: 'Cajado Rúnico', category: 'weapon', weaponType: 'staff', hands: 'two', rarity: 'raro',
    desc: 'Runas gravadas amplificam qualquer feitiço.', price: 400, req: { INT: 18 }, stats: { dmg: 4, mag: 18, mp: 20 },
    visual: { style: 'staff', color: '#3d3550', color2: '#c58bff' }, icon: { kind: 'staff', color: '#3d3550', color2: '#c58bff' },
  },
  // ------------------------------------------------------------ mão secundária
  {
    id: 'escudo_madeira', name: 'Escudo de Madeira', category: 'weapon', offhandType: 'shield',
    desc: 'Escudo redondo com aro de ferro.', price: 40, req: { VIG: 5 }, stats: { armor: 4 },
    visual: { style: 'shield_round', color: '#8b5a2b', color2: '#9aa0aa' }, icon: { kind: 'shield', color: '#8b5a2b', color2: '#9aa0aa' },
  },
  {
    id: 'escudo_ferro', name: 'Escudo de Ferro', category: 'weapon', offhandType: 'shield', rarity: 'incomum',
    desc: 'Escudo pesado em formato de gota.', price: 160, req: { VIG: 12 }, stats: { armor: 9 },
    visual: { style: 'shield_kite', color: '#9aa3b2', color2: '#3b5e9c' }, icon: { kind: 'shield', color: '#9aa3b2', color2: '#3b5e9c' },
  },
  {
    id: 'foco_cristal', name: 'Foco de Cristal', category: 'weapon', offhandType: 'orb', rarity: 'incomum',
    desc: 'Cristal lapidado que concentra a mana.', price: 150, req: { INT: 10 }, stats: { mag: 5, mp: 15 },
    visual: { style: 'orb', color: '#7cd3ff', color2: '#e8f7ff' }, icon: { kind: 'orb', color: '#7cd3ff', color2: '#e8f7ff' },
  },
  // ------------------------------------------------------------ cabeça
  {
    id: 'capuz_couro', name: 'Capuz de Couro', category: 'armor', armorSlot: 'head', desc: 'Protege do sol e da chuva.',
    price: 30, stats: { armor: 1, attrs: { DES: 1 } }, visual: { style: 'hood', color: '#6e4a2e' }, icon: { kind: 'hood', color: '#6e4a2e' },
  },
  {
    id: 'capuz_verde', name: 'Capuz do Caçador', category: 'armor', armorSlot: 'head', desc: 'Usado pelos caçadores da Ordem.',
    price: 70, stats: { armor: 2, attrs: { DES: 2 } }, visual: { style: 'hood', color: '#3f6b3a' }, icon: { kind: 'hood', color: '#3f6b3a' },
  },
  {
    id: 'elmo_ferro', name: 'Elmo de Ferro', category: 'armor', armorSlot: 'head', desc: 'Elmo com viseira aberta.',
    price: 120, req: { VIG: 10 }, stats: { armor: 4 }, visual: { style: 'helm', color: '#a7adb8' }, icon: { kind: 'helm', color: '#a7adb8' },
  },
  {
    id: 'chapeu_aprendiz', name: 'Chapéu de Aprendiz', category: 'armor', armorSlot: 'head', desc: 'O clássico chapéu pontudo.',
    price: 50, stats: { mp: 10, attrs: { INT: 1 } }, visual: { style: 'wizard', color: '#3b4f9c', color2: '#d8b54a' },
    icon: { kind: 'hat', color: '#3b4f9c', color2: '#d8b54a' },
  },
  // ------------------------------------------------------------ peitoral
  {
    id: 'tunica_linho', name: 'Túnica de Linho', category: 'armor', armorSlot: 'chest', desc: 'Roupa simples de viagem.',
    price: 15, stats: { armor: 1 }, visual: { style: 'tunic', color: '#4f78b0' }, icon: { kind: 'chest', color: '#4f78b0' },
  },
  {
    id: 'peitoral_couro', name: 'Peitoral de Couro', category: 'armor', armorSlot: 'chest', desc: 'Couro curtido com fivelas.',
    price: 60, stats: { armor: 3 }, visual: { style: 'leather', color: '#7a5032' }, icon: { kind: 'chest', color: '#7a5032' },
  },
  {
    id: 'cota_malha', name: 'Cota de Malha', category: 'armor', armorSlot: 'chest', rarity: 'incomum', desc: 'Anéis de ferro entrelaçados.',
    price: 200, req: { VIG: 12 }, stats: { armor: 7 }, visual: { style: 'chain', color: '#9ea6b3', color2: '#a8433a' },
    icon: { kind: 'chest', color: '#9ea6b3', color2: '#a8433a' },
  },
  {
    id: 'armadura_placas', name: 'Armadura de Placas', category: 'armor', armorSlot: 'chest', rarity: 'raro', desc: 'Proteção máxima, peso máximo.',
    price: 520, req: { VIG: 18 }, stats: { armor: 12, hp: 20 }, visual: { style: 'plate', color: '#b5bcc8', color2: '#c8a957' },
    icon: { kind: 'chest', color: '#b5bcc8', color2: '#c8a957' },
  },
  {
    id: 'manto_aprendiz', name: 'Manto de Aprendiz', category: 'armor', armorSlot: 'chest', desc: 'Tecido encantado da Academia.',
    price: 50, stats: { armor: 1, mp: 15, attrs: { INT: 1 } }, visual: { style: 'robe', color: '#34408a', color2: '#d8b54a' },
    icon: { kind: 'robe', color: '#34408a', color2: '#d8b54a' },
  },
  {
    id: 'robe_clerigo', name: 'Robe do Peregrino', category: 'armor', armorSlot: 'chest', desc: 'Veste branca dos peregrinos do Marco.',
    price: 60, stats: { armor: 2, attrs: { VON: 1 } }, visual: { style: 'robe', color: '#e6e1d3', color2: '#c8a957' },
    icon: { kind: 'robe', color: '#e6e1d3', color2: '#c8a957' },
  },
  {
    id: 'manto_invocador', name: 'Manto do Invocador', category: 'armor', armorSlot: 'chest', rarity: 'epico',
    desc: 'Costurado com fios que lembram vozes. Exige grande força de vontade.', price: 750, req: { VON: 20, AFI: 18 },
    stats: { armor: 3, mp: 40, attrs: { VON: 3, AFI: 3 } }, visual: { style: 'robe', color: '#4a2a5e', color2: '#7cf0c8' },
    icon: { kind: 'robe', color: '#4a2a5e', color2: '#7cf0c8' },
  },
  // ------------------------------------------------------------ pernas / mãos / capa
  {
    id: 'calcas_tecido', name: 'Calças de Tecido', category: 'armor', armorSlot: 'legs', desc: 'Calças e botas de viagem.',
    price: 12, stats: { armor: 1 }, visual: { style: 'pants', color: '#4a4036', color2: '#5a3a22' }, icon: { kind: 'legs', color: '#4a4036' },
  },
  {
    id: 'calcas_couro', name: 'Calças de Couro', category: 'armor', armorSlot: 'legs', desc: 'Reforçadas nos joelhos.',
    price: 45, stats: { armor: 2, speed: 0.05 }, visual: { style: 'pants', color: '#5e4128', color2: '#3a2616' }, icon: { kind: 'legs', color: '#5e4128' },
  },
  {
    id: 'grevas_ferro', name: 'Grevas de Ferro', category: 'armor', armorSlot: 'legs', rarity: 'incomum', desc: 'Placas sobre as canelas.',
    price: 150, req: { VIG: 10 }, stats: { armor: 4 }, visual: { style: 'greaves', color: '#a3aab6', color2: '#4a4036' },
    icon: { kind: 'boots', color: '#a3aab6' },
  },
  {
    id: 'luvas_couro', name: 'Luvas de Couro', category: 'armor', armorSlot: 'gloves', desc: 'Firmeza no arco e na espada.',
    price: 25, stats: { armor: 1, attrs: { DES: 1 } }, visual: { style: 'gloves', color: '#6e4a2e' }, icon: { kind: 'gloves', color: '#6e4a2e' },
  },
  {
    id: 'manoplas_ferro', name: 'Manoplas de Ferro', category: 'armor', armorSlot: 'gloves', rarity: 'incomum', desc: 'Pesadas e protetoras.',
    price: 110, req: { VIG: 10 }, stats: { armor: 3, attrs: { FOR: 1 } }, visual: { style: 'gloves', color: '#a3aab6' },
    icon: { kind: 'gloves', color: '#a3aab6' },
  },
  {
    id: 'capa_viajante', name: 'Capa do Viajante', category: 'armor', armorSlot: 'cape', desc: 'Verde-musgo, gasta pelas estradas.',
    price: 35, stats: { hp: 10 }, visual: { style: 'cape', color: '#4b6b3a' }, icon: { kind: 'cape', color: '#4b6b3a' },
  },
  {
    id: 'capa_vermelha', name: 'Capa Carmesim', category: 'armor', armorSlot: 'cape', rarity: 'incomum', desc: 'Usada por guardas veteranos.',
    price: 120, stats: { hp: 15, attrs: { FOR: 1 } }, visual: { style: 'cape', color: '#9c2f2f' }, icon: { kind: 'cape', color: '#9c2f2f' },
  },
  {
    id: 'capa_azul', name: 'Capa do Estudioso', category: 'armor', armorSlot: 'cape', rarity: 'incomum', desc: 'Bordada com constelações.',
    price: 120, stats: { mp: 15, attrs: { INT: 1 } }, visual: { style: 'cape', color: '#2f4f9c' }, icon: { kind: 'cape', color: '#2f4f9c' },
  },
  // ------------------------------------------------------------ acessórios
  {
    id: 'anel_vigor', name: 'Anel de Vigor', category: 'accessory', desc: 'Pedra vermelha que pulsa como um coração.',
    price: 140, stats: { hp: 15, attrs: { VIG: 2 } }, icon: { kind: 'ring', color: '#d0a640', color2: '#d8433a' },
  },
  {
    id: 'amuleto_arcano', name: 'Amuleto Arcano', category: 'accessory', desc: 'Um pequeno prisma que zumbe.',
    price: 140, stats: { mp: 15, attrs: { INT: 2 } }, icon: { kind: 'amulet', color: '#d0a640', color2: '#7cc7ff' },
  },
  {
    id: 'anel_cacador', name: 'Anel do Caçador', category: 'accessory', desc: 'Presente da Ordem dos Caçadores.',
    price: 160, stats: { crit: 0.03, attrs: { DES: 2 } }, icon: { kind: 'ring', color: '#a8adb5', color2: '#5fbf5f' },
  },
  {
    id: 'anel_lumen', name: 'Anel de Lúmen', category: 'accessory', rarity: 'raro', desc: 'Selo da Academia. Ressoa com o fragmento.',
    price: 400, stats: { mag: 4, mp: 20, attrs: { INT: 3 } }, icon: { kind: 'ring', color: '#e6e1d3', color2: '#9b7cff' },
  },
  {
    id: 'amuleto_marco', name: 'Amuleto do Último Marco', category: 'accessory', rarity: 'raro', desc: 'Juramento gravado em prata antiga.',
    price: 400, stats: { armor: 4, hp: 20, attrs: { VIG: 3 } }, icon: { kind: 'amulet', color: '#c9ced6', color2: '#e0b84a' },
  },
  // ------------------------------------------------------------ consumíveis
  {
    id: 'pocao_vida', name: 'Poção de Vida', category: 'consumable', stack: 20, desc: 'Recupera 60 de vida.', price: 25,
    use: { heal: 60 }, icon: { kind: 'potion', color: '#d8333b' },
  },
  {
    id: 'pocao_mana', name: 'Poção de Mana', category: 'consumable', stack: 20, desc: 'Recupera 40 de mana.', price: 25,
    use: { mana: 40 }, icon: { kind: 'potion', color: '#2f6fd1' },
  },
  {
    id: 'pocao_grande', name: 'Poção de Vida Maior', category: 'consumable', stack: 20, rarity: 'incomum', desc: 'Recupera 150 de vida.',
    price: 70, use: { heal: 150 }, icon: { kind: 'potion', color: '#ff5a6a', color2: '#ffd36a' },
  },
  {
    id: 'pao_mel', name: 'Pão de Mel', category: 'consumable', stack: 20, desc: 'Recupera 50 de vida ao longo de 10 s.', price: 8,
    use: { regen: 50 }, icon: { kind: 'bread', color: '#d39b4a' },
  },
  // ------------------------------------------------------------ materiais
  { id: 'erva_orvalho', name: 'Erva-de-Orvalho', category: 'material', stack: 50, desc: 'Brilha levemente ao amanhecer.', price: 6, icon: { kind: 'herb', color: '#7fd8ff' } },
  { id: 'gosma', name: 'Gosma', category: 'material', stack: 50, desc: 'Resto pegajoso de slime.', price: 4, icon: { kind: 'gel', color: '#6fd06f' } },
  { id: 'pele_lobo', name: 'Pele de Lobo', category: 'material', stack: 50, desc: 'Grossa e quente.', price: 12, icon: { kind: 'pelt', color: '#7d7f86' } },
  { id: 'presa_javali', name: 'Presa de Javali', category: 'material', stack: 50, desc: 'Curva e afiada.', price: 10, icon: { kind: 'tusk', color: '#efe6cf' } },
  { id: 'seda_aranha', name: 'Seda de Aranha', category: 'material', stack: 50, desc: 'Resistente como corda.', price: 9, icon: { kind: 'silk', color: '#e8e8f0' } },
  { id: 'osso', name: 'Osso Antigo', category: 'material', stack: 50, desc: 'Amarelado pelo tempo.', price: 5, icon: { kind: 'bone', color: '#e9e2c9' } },
  { id: 'minerio_ferro', name: 'Minério de Ferro', category: 'material', stack: 50, desc: 'Usado pelos ferreiros.', price: 15, icon: { kind: 'ore', color: '#8d8d96', color2: '#c96a3a' } },
  { id: 'cristal_eco', name: 'Cristal de Eco', category: 'material', stack: 50, rarity: 'incomum', desc: 'Repete baixinho o último som que ouviu.', price: 30, icon: { kind: 'crystal', color: '#b48cff' } },
  { id: 'moeda_antiga', name: 'Moeda Antiga', category: 'material', stack: 50, desc: 'Cunhada por um reino sem nome.', price: 30, icon: { kind: 'coin', color: '#d8b54a' } },
  // ------------------------------------------------------------ missão
  { id: 'diario_caravana', name: 'Diário da Caravana', category: 'quest', desc: '“A estrada se dobrou. Vimos a mesma árvore três vezes.”', price: 0, icon: { kind: 'book', color: '#7a4a2a' } },
  { id: 'fragmento_costura', name: 'Fragmento de Costura', category: 'quest', rarity: 'lendario', desc: 'Um fio de luz sólida. Parece estar em dois lugares ao mesmo tempo.', price: 0, icon: { kind: 'fragment', color: '#c58bff', color2: '#7cf0ff' } },
  { id: 'documento_caravana', name: 'Documento da Caravana', category: 'quest', stack: 10, desc: 'Folha de mapa com anotações de rota.', price: 0, icon: { kind: 'scroll', color: '#e8dcb5' } },
  { id: 'brasao_partido', name: 'Brasão Partido', category: 'quest', rarity: 'raro', desc: 'Metade de um brasão de cavaleiro. Alguém o arrancou de propósito.', price: 0, icon: { kind: 'emblem', color: '#c8a957', color2: '#7a1f1f' } },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));

export function item(id: string): ItemDef {
  const def = ITEMS[id];
  if (!def) throw new Error(`Item desconhecido: ${id}`);
  return def;
}

export const RARITY_COLOR: Record<string, string> = {
  comum: '#e9e4d8',
  incomum: '#7fd36b',
  raro: '#5aa8ff',
  epico: '#c27cff',
  lendario: '#ffb347',
};
