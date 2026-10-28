export interface Faction {
  id: string;
  name: string;
  goal: string;
  color: string;
}

export const FACTIONS: Faction[] = [
  { id: 'academia', name: 'Academia de Lúmen', goal: 'Compreender e controlar as Costuras.', color: '#5a8dff' },
  { id: 'liga', name: 'Liga das Cidades Livres', goal: 'Autonomia, estabilidade e interesses mercantis.', color: '#e0b84a' },
  { id: 'clas', name: 'Clãs das Terras de Cinza', goal: 'Território, recursos e prestígio guerreiro.', color: '#d8573a' },
  { id: 'ordem', name: 'Ordem do Último Marco', goal: 'Proteger selos e impedir que forças perigosas sejam libertadas.', color: '#c9ced6' },
  { id: 'salnegro', name: 'Companhia do Sal Negro', goal: 'Comércio clandestino, raridades e segredos.', color: '#7a6a9a' },
  { id: 'raizes', name: 'Círculo das Raízes', goal: 'Proteger ecossistemas e restaurar o equilíbrio natural.', color: '#3fbf7f' },
  { id: 'veu', name: 'Véu das Cinzas', goal: 'Destruir as Costuras.', color: '#8a4a4a' },
  { id: 'cartografos', name: 'Cartógrafos do Inexplorado', goal: 'Explorar e estudar lugares desconhecidos.', color: '#7fd8c8' },
];

export function repTier(v: number): string {
  if (v <= -50) return 'Hostil';
  if (v <= -15) return 'Desconfiado';
  if (v < 15) return 'Neutro';
  if (v < 50) return 'Amigável';
  if (v < 80) return 'Honrado';
  return 'Aliado';
}
