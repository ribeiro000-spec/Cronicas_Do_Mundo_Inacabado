/* Tipos compartilhados por todo o jogo. A lógica (systems) só depende destes tipos,
 * nunca do Phaser — assim regras, save e testes ficam independentes da renderização. */

export type AttrKey = 'FOR' | 'DES' | 'INT' | 'VON' | 'VIG' | 'AFI';
export type Attrs = Record<AttrKey, number>;
export const ATTR_KEYS: AttrKey[] = ['FOR', 'DES', 'INT', 'VON', 'VIG', 'AFI'];

export type EquipSlot = 'head' | 'chest' | 'legs' | 'gloves' | 'cape' | 'mainHand' | 'offHand' | 'acc1' | 'acc2';
export const EQUIP_SLOTS: EquipSlot[] = ['head', 'chest', 'legs', 'gloves', 'cape', 'mainHand', 'offHand', 'acc1', 'acc2'];

export type ItemCategory = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'quest';
export type WeaponType = 'sword' | 'axe' | 'dagger' | 'mace' | 'bow' | 'staff';
export type OffhandType = 'shield' | 'orb';
export type ArmorSlot = 'head' | 'chest' | 'legs' | 'gloves' | 'cape';
export type Rarity = 'comum' | 'incomum' | 'raro' | 'epico' | 'lendario';

/** Aparência de uma peça: qual camada do personagem ela substitui e como desenhar. */
export interface ItemVisual {
  style: string;
  color: string;
  color2?: string;
}

export interface ItemStats {
  dmg?: number;
  mag?: number;
  armor?: number;
  hp?: number;
  mp?: number;
  crit?: number;
  speed?: number;
  attrs?: Partial<Attrs>;
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  rarity?: Rarity;
  desc: string;
  price: number;
  stack?: number;
  /** armas */
  weaponType?: WeaponType;
  hands?: 'one' | 'two';
  /** mão secundária (escudo, foco) */
  offhandType?: OffhandType;
  /** armaduras */
  armorSlot?: ArmorSlot;
  req?: Partial<Attrs>;
  stats?: ItemStats;
  visual?: ItemVisual;
  use?: { heal?: number; mana?: number; regen?: number };
  /** ícone procedural */
  icon?: { kind: string; color: string; color2?: string };
}

export interface InvEntry {
  id: string;
  qty: number;
}

export type SkillSchool =
  | 'arcana'
  | 'marcial'
  | 'precisao'
  | 'natureza'
  | 'invocacao'
  | 'sombras'
  | 'protecao'
  | 'alquimia';

export type SkillKind =
  | 'spin'
  | 'dash'
  | 'bolt'
  | 'rune'
  | 'pierce'
  | 'heal'
  | 'roots'
  | 'summon'
  | 'blink'
  | 'barrier'
  | 'bomb';

export interface SkillDef {
  id: string;
  name: string;
  school: SkillSchool;
  kind: SkillKind;
  desc: string;
  mp: number;
  cd: number;
  power: number;
  scale: 'atk' | 'mag' | 'heal' | 'mixed';
  radius?: number;
  range?: number;
  duration?: number;
  req?: Partial<Attrs>;
  reqLevel?: number;
}

export interface QuestState {
  status: 'active' | 'done' | 'failed' | 'closed';
  step: number;
  progress: number;
  startedAt: number;
  log: string[];
}

export interface PlayerLook {
  skin: string;
  hair: string;
  hairStyle: 'curto' | 'longo' | 'rabo' | 'careca';
}

/** Descrição visual completa de um humanoide (jogador, NPC ou inimigo).
 *  Cada campo vira uma camada do sprite; trocar um item troca só aquela camada. */
export interface HumanoidLook {
  skin: string;
  hair: string;
  hairStyle: PlayerLook['hairStyle'];
  body?: 'normal' | 'small' | 'skeleton';
  eyes?: string;
  head?: ItemVisual | null;
  chest?: ItemVisual | null;
  legs?: ItemVisual | null;
  gloves?: ItemVisual | null;
  cape?: ItemVisual | null;
  main?: ItemVisual | null;
  off?: ItemVisual | null;
  beard?: string;
}

export interface PlayerState {
  name: string;
  archetype: string;
  look: PlayerLook;
  level: number;
  xp: number;
  attrs: Attrs;
  unspent: number;
  skillPoints: number;
  skills: Record<string, number>;
  hotbar: (string | null)[];
  hp: number;
  mp: number;
  gold: number;
  x: number;
  y: number;
}

export interface MapMarker {
  id: string;
  x: number;
  y: number;
  note: string;
}

export interface WorldPersist {
  chests: string[];
  bosses: string[];
  waystonesActive: string[];
  picked: Record<string, number>;
  fog: string;
  fragments: string[];
  markers: MapMarker[];
  npcMet: string[];
  visitedAreas: string[];
}

export interface GameState {
  schema: number;
  player: PlayerState;
  equipment: Record<EquipSlot, string | null>;
  inventory: InvEntry[];
  quests: Record<string, QuestState>;
  tracked: string | null;
  flags: Record<string, boolean | number | string>;
  rep: Record<string, number>;
  world: WorldPersist;
  codex: string[];
  meta: {
    created: number;
    playtime: number;
    deaths: number;
    lastDeathId: string | null;
    lastPenalizedDeathId: string | null;
    version: string;
  };
}

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  atk: number;
  mag: number;
  heal: number;
  armor: number;
  crit: number;
  critMult: number;
  speed: number;
  attack: AttackProfile;
  attrs: Attrs;
}

export interface AttackProfile {
  kind: 'melee' | 'arrow' | 'orb';
  range: number;
  arc: number;
  cooldown: number;
  power: number;
  scale: 'atk' | 'mag';
  weaponType: WeaponType | 'fist';
}

/* ---------------------------------------------------------------- mundo */

export interface WorldPoi {
  id: string;
  type: 'npc' | 'waystone' | 'chest' | 'cargo' | 'altar' | 'boss' | 'herb';
  x: number;
  y: number;
  name?: string;
  kind?: string;
  enemy?: string;
  wander?: number;
}

export interface WorldArea {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
}

export interface MapFragmentDef {
  id: string;
  name: string;
  rect: [number, number, number, number];
}

export interface WorldManifest {
  format: string;
  version: string;
  tileW: number;
  tileH: number;
  chunkSize: number;
  widthChunks: number;
  heightChunks: number;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  areas: WorldArea[];
  defaultArea: string;
  pois: WorldPoi[];
  mapFragments: MapFragmentDef[];
  overviewPalette: string[];
  overview: string;
  art: Record<string, string>;
}

export interface SpawnDef {
  id: string;
  e: string;
  x: number;
  y: number;
  n: number;
  lv: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  g: string;
  o: [number, number, number][];
  s: SpawnDef[];
}
