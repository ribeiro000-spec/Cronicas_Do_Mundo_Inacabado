/* Diário e descobertas: entradas desbloqueadas ao explorar, conversar e cumprir missões. */

export interface CodexEntry {
  id: string;
  title: string;
  category: 'Mundo' | 'Lugares' | 'Personagens' | 'Facções' | 'Criaturas' | 'Costuras';
  text: string;
}

const list: CodexEntry[] = [
  {
    id: 'avarra', title: 'Avarra', category: 'Mundo',
    text: 'Um mundo de ruínas, cidades e segredos. Quem viaja por suas estradas costuma dizer que Avarra parece inacabada — como se alguém tivesse parado de escrevê-la no meio da frase.',
  },
  {
    id: 'costuras', title: 'As Costuras', category: 'Costuras',
    text: 'Estruturas ou forças que mantêm a realidade coesa: matéria, memória, causalidade e leis naturais. Estão falhando. Caminhos que se dobram, ruínas maiores por dentro e lembranças que se contradizem são os primeiros sintomas.',
  },
  {
    id: 'fragmento', title: 'O Fragmento Impossível', category: 'Costuras',
    text: 'Um fio de luz sólida retirado de um altar partido. Ele parece estar em dois lugares ao mesmo tempo. Facções inteiras dariam muito para estudá-lo — ou para trancá-lo para sempre.',
  },
  {
    id: 'eldenor', title: 'Vila de Eldenor', category: 'Lugares',
    text: 'Vila de mercadores e lavradores no coração dos Campos de Orvalho. A fonte da praça nunca secou, nem no ano da grande seca. O Prefeito Aldren governa com mais paciência do que autoridade.',
  },
  {
    id: 'campos', title: 'Campos de Orvalho', category: 'Lugares',
    text: 'Planícies, fazendas e estradas. Lobos descem da floresta no inverno, javalis reviram as lavouras e slimes surgem depois das chuvas.',
  },
  {
    id: 'floresta', title: 'Floresta dos Sinos Mudos', category: 'Lugares',
    text: 'Floresta ancestral ao norte. Dizem que antigamente sinos tocavam entre as árvores; hoje só há silêncio — e lobos.',
  },
  {
    id: 'ruinas', title: 'Ruínas Antigas', category: 'Lugares',
    text: 'Restos de um reino sem nome a nordeste. Colunas que projetam sombras para o lado errado. Os mortos ali não descansam.',
  },
  {
    id: 'cavaleiro', title: 'O Cavaleiro Sem Brasão', category: 'Personagens',
    text: 'Um cavaleiro que jurou proteger algo de que ninguém mais se lembra. Quando a Costura se rompeu, sua lealdade ficou presa num laço: ele defende as ruínas de um ataque que já aconteceu há séculos.',
  },
  {
    id: 'academia', title: 'Academia de Lúmen', category: 'Facções',
    text: 'Magos e estudiosos que querem compreender — e controlar — as Costuras. Generosos com quem traz conhecimento; perigosos com quem o esconde.',
  },
  {
    id: 'ordem', title: 'Ordem do Último Marco', category: 'Facções',
    text: 'Guardiões de selos antigos. Acreditam que certas portas existem para continuar fechadas.',
  },
  {
    id: 'cartografos', title: 'Cartógrafos do Inexplorado', category: 'Facções',
    text: 'Exploradores que pagam bem por mapas, mesmo incompletos. Para eles, todo mapa é uma promessa.',
  },
  {
    id: 'ecos', title: 'Ecos', category: 'Criaturas',
    text: 'Criaturas e lugares que se repetem. Perto das falhas nas Costuras, o mesmo esqueleto pode cair duas vezes — e se levantar uma terceira.',
  },
];

export const CODEX: Record<string, CodexEntry> = Object.fromEntries(list.map((c) => [c.id, c]));
export const CODEX_LIST = list;
