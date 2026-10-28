/* Conteúdo dos baús (fixo, desenhado à mão) e catálogo das lojas. */

export interface ChestLoot {
  gold: number;
  items: { id: string; qty: number }[];
  fragment?: string;
}

export const CHESTS: Record<string, ChestLoot> = {
  ch_doc1: { gold: 15, items: [{ id: 'documento_caravana', qty: 1 }, { id: 'pocao_vida', qty: 1 }] },
  ch_doc2: { gold: 25, items: [{ id: 'documento_caravana', qty: 1 }, { id: 'pocao_vida', qty: 2 }] },
  ch_doc3: { gold: 15, items: [{ id: 'documento_caravana', qty: 1 }, { id: 'pao_mel', qty: 2 }] },
  ch_map_floresta: { gold: 30, items: [{ id: 'capuz_verde', qty: 1 }], fragment: 'frag_floresta' },
  ch_map_sul: { gold: 30, items: [{ id: 'pocao_mana', qty: 2 }], fragment: 'frag_sul' },
  ch_vale: { gold: 20, items: [{ id: 'pao_mel', qty: 3 }], fragment: 'frag_vale' },
  ch_ruinas_1: { gold: 90, items: [{ id: 'manto_invocador', qty: 1 }, { id: 'pocao_grande', qty: 1 }] },
  ch_ruinas_2: { gold: 40, items: [{ id: 'espada_aco', qty: 1 }, { id: 'cristal_eco', qty: 1 }] },
  ch_lago: { gold: 35, items: [{ id: 'anel_vigor', qty: 1 }, { id: 'pocao_vida', qty: 2 }] },
  ch_norte: { gold: 60, items: [{ id: 'adaga_serpente', qty: 1 }, { id: 'amuleto_arcano', qty: 1 }] },
  ch_oeste: { gold: 25, items: [{ id: 'capa_azul', qty: 1 }, { id: 'pocao_vida', qty: 2 }] },
  ch_ponte: { gold: 25, items: [{ id: 'luvas_couro', qty: 1 }, { id: 'pocao_mana', qty: 1 }] },
};

export interface Shop {
  id: string;
  name: string;
  faction: string;
  stock: string[];
}

export const SHOPS: Record<string, Shop> = {
  nira: {
    id: 'nira',
    name: 'Tenda da Nira',
    faction: 'liga',
    stock: ['pocao_vida', 'pocao_mana', 'pocao_grande', 'pao_mel', 'tunica_linho', 'calcas_couro', 'capuz_couro', 'luvas_couro', 'capa_viajante', 'amuleto_arcano', 'anel_vigor'],
  },
  doran: {
    id: 'doran',
    name: 'Forja do Doran',
    faction: 'liga',
    stock: [
      'espada_ferro', 'espada_aco', 'adaga_simples', 'maca_clerigo', 'machado_lenhador', 'arco_curto', 'cajado_aprendiz',
      'escudo_madeira', 'escudo_ferro', 'foco_cristal', 'elmo_ferro', 'cota_malha', 'grevas_ferro', 'manoplas_ferro',
      'armadura_placas', 'machado_colossal',
    ],
  },
};
