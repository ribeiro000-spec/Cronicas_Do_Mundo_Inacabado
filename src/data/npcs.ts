import type { HumanoidLook } from '../core/types';
import type { Action } from './quests';

/* NPCs e diálogos. Cada NPC tem uma lista de entradas; a primeira cuja condição for
 * verdadeira é usada. Condições consultam o estado de missões, itens e marcas. */

export interface DialogueCtx {
  status(questId: string): 'none' | 'available' | 'active' | 'done' | 'failed' | 'closed';
  step(questId: string): number;
  /** a etapa atual da missão é "falar com este NPC"? */
  ready(questId: string): boolean;
  has(itemId: string, qty?: number): boolean;
  flag(key: string): boolean | number | string | undefined;
}

export interface DialogueOption {
  text: string;
  next?: string;
  actions?: Action[];
  cond?: (c: DialogueCtx) => boolean;
}

export interface DialogueNode {
  text: string;
  options?: DialogueOption[];
}

export interface DialogueEntry {
  cond?: (c: DialogueCtx) => boolean;
  start?: string;
  nodes: Record<string, DialogueNode>;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  look: HumanoidLook;
  dialogue: DialogueEntry[];
  barks?: string[];
}

const BYE: DialogueOption = { text: 'Até logo.' };

function giver(
  q: string,
  t: {
    offer: string;
    accept?: string;
    decline?: string;
    progress: string;
    turnIn: string;
    turnInOption: string;
    turnInActions?: Action[];
    after?: Action[];
  },
): DialogueEntry[] {
  return [
    {
      cond: (c) => c.status(q) === 'active' && c.ready(q),
      nodes: {
        start: {
          text: t.turnIn,
          options: [{ text: t.turnInOption, actions: [...(t.turnInActions ?? []), { t: 'advance', id: q }, ...(t.after ?? [])] }],
        },
      },
    },
    { cond: (c) => c.status(q) === 'active', nodes: { start: { text: t.progress, options: [BYE] } } },
    {
      cond: (c) => c.status(q) === 'available',
      nodes: {
        start: {
          text: t.offer,
          options: [
            { text: t.accept ?? 'Pode contar comigo.', actions: [{ t: 'startQuest', id: q }] },
            { text: t.decline ?? 'Agora não.' },
          ],
        },
      },
    },
  ];
}

export const NPCS: Record<string, NpcDef> = {
  prefeito_aldren: {
    id: 'prefeito_aldren',
    name: 'Aldren',
    title: 'Prefeito de Eldenor',
    look: {
      skin: '#e3b48c', hair: '#c9c9c9', hairStyle: 'curto', beard: '#c9c9c9',
      chest: { style: 'robe', color: '#6b2f3a', color2: '#d8b54a' }, cape: { style: 'cape', color: '#3a2a4a' },
    },
    barks: ['Eldenor resiste. Sempre resistiu.', 'A fonte nunca secou, sabia?'],
    dialogue: [
      {
        cond: (c) => c.status('q_cavaleiro') === 'active' && c.ready('q_cavaleiro'),
        nodes: {
          start: {
            text: 'Você voltou… e a estrada leste está quieta pela primeira vez em semanas. O que havia nas ruínas?',
            options: [{ text: 'Um cavaleiro preso num juramento antigo. Ele descansou.', next: 'fim' }],
          },
          fim: {
            text: 'Então as histórias eram verdadeiras. Se uma Costura se rompeu aqui, outras vão se romper. Avarra inteira vai precisar de gente como você. A estrada para fora de Eldenor está aberta, viajante.',
            options: [{ text: 'Então é por ela que eu sigo.', actions: [{ t: 'advance', id: 'q_cavaleiro' }, { t: 'ending' }] }],
          },
        },
      },
      {
        cond: (c) => c.status('q_cavaleiro') === 'active',
        nodes: { start: { text: 'O cavaleiro ainda guarda o coração das ruínas. Leve poções — e, se tiver alguma pista sobre quem ele foi, leve também.', options: [BYE] } },
      },
      {
        cond: (c) => c.status('q_fragmento') === 'active' && c.ready('q_fragmento'),
        nodes: {
          start: {
            text: 'Isso é… luz? Está quente e fria ao mesmo tempo. Escute: duas pessoas chegaram à vila perguntando por algo assim.',
            options: [{ text: 'Quem?', next: 'quem' }],
          },
          quem: {
            text: 'Sera, emissária da Academia de Lúmen, quer estudá-lo. O Irmão Tobias, da Ordem do Último Marco, quer protegê-lo — longe de todos. Não dá para atender aos dois. A escolha é sua.',
            options: [{ text: 'Vou falar com eles.', actions: [{ t: 'advance', id: 'q_fragmento' }] }],
          },
        },
      },
      {
        cond: (c) => c.status('q_fragmento') === 'active',
        nodes: { start: { text: 'As ruínas ficam a nordeste, depois da ponte. Siga a estrada até as colunas.', options: [BYE] } },
      },
      {
        cond: (c) => (c.status('q_lumen') === 'available' || c.status('q_marco') === 'available') && c.status('q_lumen') !== 'active' && c.status('q_marco') !== 'active',
        nodes: { start: { text: 'Sera espera perto da fonte, a leste. Tobias reza do lado oeste da praça. Escolha com cuidado.', options: [BYE] } },
      },
      {
        cond: (c) => c.status('q_ecos') === 'active' && c.ready('q_ecos'),
        nodes: {
          start: {
            text: 'Você encontrou a caravana? Fale, por favor.',
            options: [{ text: 'Encontrei este diário entre os destroços.', next: 'diario' }],
          },
          diario: {
            text: '“A estrada se dobrou. Vimos a mesma árvore três vezes. Há uma luz nas ruínas.” …Pelos deuses. Os antigos chamavam isso de falha nas Costuras. Preciso que você vá até essas ruínas.',
            options: [
              { text: 'Eu vou.', actions: [{ t: 'take', id: 'diario_caravana' }, { t: 'advance', id: 'q_ecos' }, { t: 'startQuest', id: 'q_fragmento' }] },
            ],
          },
        },
      },
      ...giver('q_ecos', {
        offer: 'Viajante! Uma caravana de Valedouro devia ter chegado há dois dias. Os batedores ouviram vozes na estrada leste… repetindo as mesmas palavras, sem parar. Pode investigar?',
        accept: 'Vou até a estrada leste.',
        progress: 'A caravana seguia pela estrada leste, depois da ponte. Cuidado com saqueadores.',
        turnIn: '',
        turnInOption: '',
      }).slice(1),
      {
        nodes: {
          start: {
            text: 'Bem-vindo a Eldenor. Se precisar de equipamento, Doran tem a forja e Nira vende de tudo um pouco.',
            options: [{ text: 'O que são as Costuras?', next: 'costuras', actions: [{ t: 'codex', id: 'costuras' }] }, BYE],
          },
          costuras: {
            text: 'Histórias de avó: fios que seguram o mundo no lugar. Matéria, memória, o próprio tempo. Dizem que quando um fio se solta, coisas impossíveis acontecem.',
            options: [BYE],
          },
        },
      },
    ],
  },

  mercadora_nira: {
    id: 'mercadora_nira',
    name: 'Nira',
    title: 'Mercadora da Liga',
    look: {
      skin: '#c68d63', hair: '#9c2f2f', hairStyle: 'rabo',
      chest: { style: 'tunic', color: '#d8b54a' }, legs: { style: 'pants', color: '#5a3a22', color2: '#3a2616' },
    },
    barks: ['Poções fresquinhas!', 'A Liga garante o preço justo.'],
    dialogue: [
      {
        nodes: {
          start: {
            text: 'Poções, pão de mel, roupas de viagem… E se você tiver boa reputação com a Liga, faço desconto.',
            options: [{ text: 'Quero negociar.', actions: [{ t: 'shop', id: 'nira' }] }, BYE],
          },
        },
      },
    ],
  },

  ferreiro_doran: {
    id: 'ferreiro_doran',
    name: 'Doran',
    title: 'Ferreiro',
    look: {
      skin: '#9a6440', hair: '#2a2a3a', hairStyle: 'careca', beard: '#2a2a3a',
      chest: { style: 'leather', color: '#5a3a22' }, legs: { style: 'pants', color: '#3a3330', color2: '#22180f' },
      gloves: { style: 'gloves', color: '#3a2a20' },
    },
    barks: ['O ferro não mente.', '*clang* *clang*'],
    dialogue: [
      {
        nodes: {
          start: {
            text: 'Lâminas, escudos, armaduras. Tudo exige força, destreza ou vontade — não importa sua “classe”. Importa se você aguenta o peso.',
            options: [{ text: 'Mostre o que tem.', actions: [{ t: 'shop', id: 'doran' }] }, BYE],
          },
        },
      },
    ],
  },

  emissaria_sera: {
    id: 'emissaria_sera',
    name: 'Sera',
    title: 'Emissária da Academia de Lúmen',
    look: {
      skin: '#f2d1b0', hair: '#e2c26b', hairStyle: 'longo',
      chest: { style: 'robe', color: '#2f4f9c', color2: '#e8e0c8' }, head: { style: 'circlet', color: '#d8b54a' },
      main: { style: 'staff', color: '#e8e0c8', color2: '#7cc7ff' },
    },
    barks: ['O conhecimento é a única proteção real.', 'Fascinante…'],
    dialogue: [
      {
        cond: (c) => c.status('q_marco') === 'active' || c.status('q_marco') === 'done',
        nodes: { start: { text: 'Você escolheu a Ordem. Espero que saiba o que está trancando — porque eles não sabem.', options: [BYE] } },
      },
      ...giver('q_lumen', {
        offer: 'Então é verdade, você tem o fragmento. A Academia pode estudá-lo com segurança. Só preciso de três Cristais de Eco das ruínas para estabilizá-lo. Aceita o convite de Lúmen? (Isso fecha o caminho com a Ordem.)',
        accept: 'Aceito o convite de Lúmen.',
        decline: 'Preciso pensar.',
        progress: 'Os Cristais de Eco se formam nos ossos dos mortos inquietos das ruínas. Três bastam.',
        turnIn: 'Os cristais! E o fragmento… veja como ele canta quando se aproximam. A Academia não esquecerá disso.',
        turnInOption: 'Entregar o fragmento e os cristais.',
        turnInActions: [{ t: 'take', id: 'fragmento_costura' }, { t: 'take', id: 'cristal_eco', qty: 3 }],
      }),
      {
        cond: (c) => c.status('q_lumen') === 'done',
        nodes: { start: { text: 'Nossos estudiosos já começaram. Quando a Academia abrir as portas para você, venha a Lúmen.', options: [BYE] } },
      },
      {
        nodes: { start: { text: 'Sou Sera, da Academia de Lúmen. Estamos investigando fenômenos estranhos nesta região. Se encontrar algo… impossível, me procure.', options: [BYE] } },
      },
    ],
  },

  irmao_tobias: {
    id: 'irmao_tobias',
    name: 'Irmão Tobias',
    title: 'Ordem do Último Marco',
    look: {
      skin: '#e3b48c', hair: '#6b3f22', hairStyle: 'careca', beard: '#6b3f22',
      chest: { style: 'robe', color: '#8d8a80', color2: '#e0b84a' }, cape: { style: 'cape', color: '#e6e1d3' },
      main: { style: 'mace', color: '#c9ced6', color2: '#7a5530' },
    },
    barks: ['Alguns selos existem por um motivo.', 'Que o Marco nos guarde.'],
    dialogue: [
      {
        cond: (c) => c.status('q_lumen') === 'active' || c.status('q_lumen') === 'done',
        nodes: { start: { text: 'A Academia brinca com o que não entende. Rezarei para que você não se arrependa.', options: [BYE] } },
      },
      ...giver('q_marco', {
        offer: 'Esse fragmento não deveria existir fora do selo. A Ordem pode protegê-lo — com você como guardiã ou guardião. Mas primeiro, os mortos das ruínas precisam descansar. Faz o Juramento do Marco? (Isso fecha o caminho com a Academia.)',
        accept: 'Farei o juramento.',
        decline: 'Preciso pensar.',
        progress: 'Cinco mortos inquietos. Dê a eles o descanso que o tempo negou.',
        turnIn: 'Os ecos se calaram. Repita comigo: “O que deve ficar fechado, fechado ficará.”',
        turnInOption: '“O que deve ficar fechado, fechado ficará.”',
        turnInActions: [{ t: 'flag', key: 'guardiao_fragmento', value: true }],
      }),
      {
        cond: (c) => c.status('q_marco') === 'done',
        nodes: { start: { text: 'Guarde bem o fragmento. Ele vai chamar por você — não responda.', options: [BYE] } },
      },
      {
        nodes: { start: { text: 'Paz, viajante. A Ordem vigia selos antigos. Ultimamente, vigia mais do que gostaria.', options: [BYE] } },
      },
    ],
  },

  cartografa_ilsa: {
    id: 'cartografa_ilsa',
    name: 'Ilsa',
    title: 'Cartógrafa do Inexplorado',
    look: {
      skin: '#c68d63', hair: '#2a2a3a', hairStyle: 'curto',
      chest: { style: 'leather', color: '#3f6b5a' }, legs: { style: 'pants', color: '#4a4036', color2: '#3a2616' },
      head: { style: 'hood', color: '#7fd8c8' },
    },
    barks: ['Todo mapa é uma promessa.', 'Onde termina o papel começa a aventura.'],
    dialogue: [
      ...giver('q_mapas', {
        offer: 'A caravana levava documentos nossos — rotas, esboços, notas. Se você os recuperar, pago com um mapa da estrada leste e algo curioso que encontramos.',
        accept: 'Vou procurar os documentos.',
        progress: 'Um baú perto dos destroços, outro no acampamento dos saqueadores, e o batedor deixou um na trilha da floresta, ao norte.',
        turnIn: 'Todos os três! Veja: as rotas não batem umas com as outras. A estrada realmente se dobrou. Tome — o mapa e isto aqui: metade de um brasão, achado perto das ruínas.',
        turnInOption: 'Entregar os documentos.',
        turnInActions: [{ t: 'take', id: 'documento_caravana', qty: 3 }],
      }),
      {
        cond: (c) => c.has('brasao_partido'),
        nodes: {
          start: {
            text: 'Esse brasão foi arrancado de propósito. Um cavaleiro que renega o próprio brasão… ou que foi esquecido por quem o deu. Talvez ele reconheça.',
            options: [BYE],
          },
        },
      },
      {
        nodes: {
          start: {
            text: 'Os Cartógrafos pagam bem por fragmentos de mapa. Cada um que você encontrar revela um pedaço de Avarra no seu mapa.',
            options: [BYE],
          },
        },
      },
    ],
  },

  cacador_bram: {
    id: 'cacador_bram',
    name: 'Bram',
    title: 'Caçador',
    look: {
      skin: '#c68d63', hair: '#6b3f22', hairStyle: 'curto', beard: '#6b3f22',
      chest: { style: 'leather', color: '#4a5a3a' }, head: { style: 'hood', color: '#3f6b3a' },
      legs: { style: 'pants', color: '#4a4036', color2: '#3a2616' }, main: { style: 'bow', color: '#5c3b22', color2: '#d9c79a' },
    },
    barks: ['Ouviu isso? Uivos.', 'Rastros frescos ao norte.'],
    dialogue: [
      ...giver('q_lobos', {
        offer: 'Os lobos da Floresta dos Sinos Mudos ficaram ousados. Já levaram três ovelhas esta semana. Derrube dez deles e eu te dou meu arco reforçado.',
        accept: 'Dez lobos. Combinado.',
        progress: 'A floresta começa ao norte da vila. Os lobos andam em matilha — não deixe que te cerquem.',
        turnIn: 'Os uivos diminuíram. Bom trabalho. Um caçador cumpre a palavra: o arco é seu.',
        turnInOption: 'Obrigado, Bram.',
      }),
      {
        nodes: { start: { text: 'Se for para a floresta, fique perto da trilha. Lá dentro, o silêncio engana.', options: [BYE] } },
      },
    ],
  },

  fazendeira_lia: {
    id: 'fazendeira_lia',
    name: 'Lia',
    title: 'Fazendeira de Valedouro',
    look: {
      skin: '#e3b48c', hair: '#b8732f', hairStyle: 'rabo',
      chest: { style: 'tunic', color: '#7a9a4a' }, legs: { style: 'pants', color: '#5a4a36', color2: '#3a2616' },
      head: { style: 'bandana', color: '#c84a3a' },
    },
    barks: ['As vacas não estão bem…', 'Que calor!'],
    dialogue: [
      ...giver('q_fazendeira', {
        offer: 'Ah, graças aos céus, alguém de fora! O gado está doente e só a Erva-de-Orvalho cura. Ela cresce nos campos por aqui — brilha um pouquinho. Pode me trazer cinco?',
        accept: 'Trago as ervas.',
        progress: 'Procure plantinhas com flores azuladas pelos campos em volta de Valedouro.',
        turnIn: 'Cinco ervas! As vacas vão ficar boas. Tome, poções e pão de mel — é o que posso pagar.',
        turnInOption: 'Entregar as ervas.',
        turnInActions: [{ t: 'take', id: 'erva_orvalho', qty: 5 }],
      }),
      {
        nodes: { start: { text: 'Valedouro é pequena, mas aqui todo mundo se ajuda. Descanse um pouco perto da pedra-guia, se quiser.', options: [BYE] } },
      },
    ],
  },

  guarda_eldenor: {
    id: 'guarda_eldenor',
    name: 'Guarda Hal',
    title: 'Guarda de Eldenor',
    look: {
      skin: '#d6a77a', hair: '#3a2416', hairStyle: 'curto',
      head: { style: 'helm', color: '#a7adb8' }, chest: { style: 'chain', color: '#9ea6b3', color2: '#3b5e9c' },
      legs: { style: 'greaves', color: '#a3aab6', color2: '#4a4036' }, main: { style: 'sword', color: '#c9ced6', color2: '#6b4a2b' },
      off: { style: 'shield_kite', color: '#3b5e9c', color2: '#c9ced6' },
    },
    barks: ['Estrada leste: perigosa.', 'Mantenha a arma embainhada na vila.'],
    dialogue: [
      {
        nodes: {
          start: {
            text: 'A estrada leste está perigosa desde que a caravana sumiu. Se for para lá, use as pedras-guia: toque nelas para ativar a viagem rápida.',
            options: [{ text: 'Alguma dica de combate?', next: 'dica' }, BYE],
          },
          dica: {
            text: 'Observe o inimigo: quando ele brilha antes do golpe, role para o lado. E distribua seus pontos de atributo — o menu mostra o resultado antes de confirmar.',
            options: [BYE],
          },
        },
      },
    ],
  },

  aldeao_marta: {
    id: 'aldeao_marta',
    name: 'Marta',
    title: 'Moradora',
    look: { skin: '#f2d1b0', hair: '#6b3f22', hairStyle: 'longo', chest: { style: 'tunic', color: '#9c5a7a' } },
    barks: ['Bom dia!', 'Você não é daqui, é?', 'Ouvi dizer que a fonte é mágica.'],
    dialogue: [{ nodes: { start: { text: 'Minha avó dizia que as estrelas mudavam de lugar quando ela era menina. Ninguém acreditava. Agora eu acredito.', options: [BYE] } } }],
  },
  aldeao_pip: {
    id: 'aldeao_pip',
    name: 'Pip',
    title: 'Criança',
    look: { skin: '#e3b48c', hair: '#e2c26b', hairStyle: 'curto', body: 'small', chest: { style: 'tunic', color: '#4f78b0' } },
    barks: ['Pega-pega!', 'Você tem uma espada de verdade?'],
    dialogue: [{ nodes: { start: { text: 'Eu vi um esqueleto andando lá nas ruínas! Ninguém acredita em mim…', options: [BYE] } } }],
  },
  aldeao_velho: {
    id: 'aldeao_velho',
    name: 'Velho Tomé',
    title: 'Morador de Valedouro',
    look: { skin: '#c68d63', hair: '#c9c9c9', hairStyle: 'careca', beard: '#e0e0e0', chest: { style: 'tunic', color: '#6b5a3a' } },
    barks: ['No meu tempo…', 'Hmpf.'],
    dialogue: [{ nodes: { start: { text: 'Javalis de novo nas lavouras. No meu tempo, a gente espantava com panela.', options: [BYE] } } }],
  },
};
