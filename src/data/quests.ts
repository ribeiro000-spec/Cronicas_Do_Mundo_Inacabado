/* Missões do recorte jogável (Ato I). Os códigos M01…M05 seguem a lista de 47 missões do GDD.
 * Cada missão é uma sequência de etapas com objetivo; rotas exclusivas fecham a alternativa. */

export type Action =
  | { t: 'startQuest'; id: string }
  | { t: 'advance'; id: string }
  | { t: 'give'; id: string; qty?: number }
  | { t: 'take'; id: string; qty?: number }
  | { t: 'gold'; amount: number }
  | { t: 'shop'; id: string }
  | { t: 'flag'; key: string; value?: boolean | number | string }
  | { t: 'rep'; id: string; amount: number }
  | { t: 'heal' }
  | { t: 'codex'; id: string }
  | { t: 'fragment'; id: string }
  | { t: 'xp'; amount: number }
  | { t: 'spawnEchoes'; x: number; y: number }
  | { t: 'weakenBoss' }
  | { t: 'ending' };

export type Objective =
  | { type: 'talk'; npc: string }
  | { type: 'kill'; enemy: string[]; count: number }
  | { type: 'collect'; item: string; count: number }
  | { type: 'reach'; x: number; y: number; r: number }
  | { type: 'interact'; poi: string };

export interface QuestStepDef {
  text: string;
  obj: Objective;
  /** onde mostrar o marcador no mapa (se o objetivo não tiver posição própria) */
  marker?: { x: number; y: number };
  onDone?: Action[];
}

export interface QuestDef {
  id: string;
  code: string;
  name: string;
  type: 'main' | 'side';
  giver: string;
  summary: string;
  steps: QuestStepDef[];
  rewards: {
    xp: number;
    gold?: number;
    items?: { id: string; qty: number }[];
    rep?: Record<string, number>;
    fragments?: string[];
    codex?: string[];
  };
  /** missões liberadas ao concluir */
  unlocks?: string[];
  /** missões que esta fecha ao ser aceita (rotas mutuamente exclusivas) */
  excludes?: string[];
  /** começa sozinha quando liberada */
  autoStart?: boolean;
}

const list: QuestDef[] = [
  {
    id: 'q_ecos', code: 'M01', name: 'Ecos na Estrada', type: 'main', giver: 'prefeito_aldren',
    summary: 'Uma caravana de Valedouro desapareceu na estrada leste. Batedores ouviram vozes repetindo as mesmas palavras.',
    steps: [
      { text: 'Investigue a estrada leste, depois da ponte', obj: { type: 'reach', x: 142, y: 104, r: 6 } },
      { text: 'Derrote os saqueadores', obj: { type: 'kill', enemy: ['bandido'], count: 3 }, marker: { x: 147, y: 100 } },
      {
        text: 'Examine a carga da caravana', obj: { type: 'interact', poi: 'carga_caravana' },
        onDone: [{ t: 'give', id: 'diario_caravana' }, { t: 'codex', id: 'costuras' }],
      },
      { text: 'Volte ao Prefeito Aldren', obj: { type: 'talk', npc: 'prefeito_aldren' } },
    ],
    rewards: { xp: 200, gold: 60, rep: { liga: 5 } },
    unlocks: ['q_mapas'],
  },
  {
    id: 'q_fragmento', code: 'M02', name: 'O Fragmento Impossível', type: 'main', giver: 'prefeito_aldren',
    summary: 'O diário fala de uma luz nas ruínas a nordeste. Algo ali está fazendo a estrada se dobrar.',
    steps: [
      { text: 'Siga a luz até as Ruínas Antigas', obj: { type: 'reach', x: 150, y: 70, r: 7 } },
      {
        text: 'Investigue o altar partido', obj: { type: 'interact', poi: 'altar_fragmento' },
        onDone: [{ t: 'give', id: 'fragmento_costura' }, { t: 'codex', id: 'fragmento' }, { t: 'codex', id: 'ecos' }, { t: 'spawnEchoes', x: 158.5, y: 58.5 }],
      },
      { text: 'Leve o fragmento ao Prefeito Aldren', obj: { type: 'talk', npc: 'prefeito_aldren' } },
    ],
    rewards: { xp: 260, gold: 40, codex: ['ruinas'] },
    unlocks: ['q_lumen', 'q_marco'],
  },
  {
    id: 'q_lumen', code: 'M04-A', name: 'Um Convite de Lúmen', type: 'main', giver: 'emissaria_sera',
    summary: 'A Academia quer estudar o fragmento. Sera precisa de Cristais de Eco para estabilizá-lo. (Rota incompatível com o Juramento do Marco.)',
    steps: [
      { text: 'Colete Cristais de Eco nas ruínas', obj: { type: 'collect', item: 'cristal_eco', count: 3 }, marker: { x: 160, y: 58 } },
      { text: 'Entregue o fragmento e os cristais a Sera', obj: { type: 'talk', npc: 'emissaria_sera' } },
    ],
    rewards: { xp: 320, items: [{ id: 'anel_lumen', qty: 1 }], rep: { academia: 25, ordem: -10 }, codex: ['academia'] },
    unlocks: ['q_cavaleiro'],
    excludes: ['q_marco'],
  },
  {
    id: 'q_marco', code: 'M04-B', name: 'O Juramento do Marco', type: 'main', giver: 'irmao_tobias',
    summary: 'A Ordem quer manter o fragmento longe de mãos ambiciosas. Antes, os mortos inquietos das ruínas precisam descansar. (Rota incompatível com o Convite de Lúmen.)',
    steps: [
      { text: 'Purifique esqueletos nas ruínas', obj: { type: 'kill', enemy: ['esqueleto'], count: 5 }, marker: { x: 160, y: 60 } },
      { text: 'Faça o juramento com o Irmão Tobias', obj: { type: 'talk', npc: 'irmao_tobias' } },
    ],
    rewards: { xp: 320, items: [{ id: 'amuleto_marco', qty: 1 }], rep: { ordem: 25, academia: -10 }, codex: ['ordem'] },
    unlocks: ['q_cavaleiro'],
    excludes: ['q_lumen'],
  },
  {
    id: 'q_cavaleiro', code: 'M05', name: 'O Cavaleiro Sem Brasão', type: 'main', giver: 'prefeito_aldren', autoStart: true,
    summary: 'Um cavaleiro guarda o coração das ruínas. Enquanto ele estiver de pé, a estrada não volta ao normal. Pistas sobre o seu passado podem mudar o encontro.',
    steps: [
      { text: 'Encontre o cavaleiro no coração das ruínas', obj: { type: 'reach', x: 166, y: 44, r: 9 } },
      { text: 'Derrote o Cavaleiro Sem Brasão', obj: { type: 'kill', enemy: ['cavaleiro_sem_brasao'], count: 1 }, marker: { x: 166, y: 44 } },
      { text: 'Conte ao Prefeito Aldren o que aconteceu', obj: { type: 'talk', npc: 'prefeito_aldren' } },
    ],
    rewards: { xp: 600, gold: 150, items: [{ id: 'espada_sem_brasao', qty: 1 }, { id: 'pocao_grande', qty: 2 }], codex: ['cavaleiro'] },
  },
  {
    id: 'q_mapas', code: 'M03', name: 'A Caravana dos Mapas', type: 'side', giver: 'cartografa_ilsa',
    summary: 'A caravana levava documentos dos Cartógrafos. Estão espalhados entre a estrada, o acampamento dos saqueadores e a floresta.',
    steps: [
      { text: 'Recupere os documentos da caravana', obj: { type: 'collect', item: 'documento_caravana', count: 3 } },
      { text: 'Entregue os documentos a Ilsa', obj: { type: 'talk', npc: 'cartografa_ilsa' } },
    ],
    rewards: { xp: 240, items: [{ id: 'brasao_partido', qty: 1 }], rep: { cartografos: 20 }, fragments: ['frag_leste'], codex: ['cartografos'] },
  },
  {
    id: 'q_lobos', code: 'S01', name: 'Caçador de Lobos', type: 'side', giver: 'cacador_bram',
    summary: 'Os lobos da Floresta dos Sinos Mudos estão atacando os rebanhos. Bram quer ajuda para afastá-los.',
    steps: [
      { text: 'Derrote lobos na floresta', obj: { type: 'kill', enemy: ['lobo'], count: 10 }, marker: { x: 80, y: 50 } },
      { text: 'Fale com o caçador Bram', obj: { type: 'talk', npc: 'cacador_bram' } },
    ],
    rewards: { xp: 220, gold: 80, items: [{ id: 'arco_reforcado', qty: 1 }], rep: { liga: 10 }, codex: ['floresta'] },
  },
  {
    id: 'q_fazendeira', code: 'S02', name: 'O Pedido da Fazendeira', type: 'side', giver: 'fazendeira_lia',
    summary: 'Lia precisa de Ervas-de-Orvalho para tratar o gado doente de Valedouro.',
    steps: [
      { text: 'Colete Ervas-de-Orvalho', obj: { type: 'collect', item: 'erva_orvalho', count: 5 }, marker: { x: 46, y: 138 } },
      { text: 'Volte para a fazenda de Lia', obj: { type: 'talk', npc: 'fazendeira_lia' } },
    ],
    rewards: { xp: 160, gold: 40, items: [{ id: 'pocao_vida', qty: 3 }, { id: 'pao_mel', qty: 3 }], rep: { raizes: 10, liga: 5 }, codex: ['campos'] },
  },
];

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(list.map((q) => [q.id, q]));
export const QUEST_LIST = list;
