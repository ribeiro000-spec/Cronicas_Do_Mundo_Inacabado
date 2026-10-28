import { BALANCE, GAME_VERSION, SAVE_SCHEMA } from '../config';
import { EQUIP_SLOTS, type EquipSlot, type GameState, type PlayerLook } from '../core/types';
import { ARCHETYPES } from '../data/archetypes';
import { FACTIONS } from '../data/factions';
import { addItem } from './inventory';
import { derive } from './stats';

export interface NewGameOptions {
  name: string;
  archetype: string;
  look: PlayerLook;
  spawn: { x: number; y: number };
}

export function createNewState(opts: NewGameOptions): GameState {
  const arch = ARCHETYPES.find((a) => a.id === opts.archetype) ?? ARCHETYPES[0];
  const equipment = Object.fromEntries(EQUIP_SLOTS.map((s) => [s, null])) as Record<EquipSlot, string | null>;
  for (const [slot, id] of Object.entries(arch.equipment)) equipment[slot as EquipSlot] = id ?? null;

  const state: GameState = {
    schema: SAVE_SCHEMA,
    player: {
      name: opts.name.trim().slice(0, 18) || 'Viajante',
      archetype: arch.id,
      look: { ...opts.look },
      level: 1,
      xp: 0,
      attrs: { ...arch.attrs },
      unspent: 0,
      skillPoints: BALANCE.startingSkillPoints,
      skills: { ...arch.skills },
      hotbar: [...arch.hotbar],
      hp: 1,
      mp: 1,
      gold: 30,
      x: opts.spawn.x,
      y: opts.spawn.y,
    },
    equipment,
    inventory: [],
    quests: {},
    tracked: null,
    flags: {},
    rep: Object.fromEntries(FACTIONS.map((f) => [f.id, 0])),
    world: {
      chests: [],
      bosses: [],
      waystonesActive: ['ws_eldenor'],
      picked: {},
      fog: '',
      fragments: [],
      markers: [],
      npcMet: [],
      visitedAreas: [],
    },
    codex: ['avarra', 'eldenor'],
    meta: {
      created: Date.now(),
      playtime: 0,
      deaths: 0,
      lastDeathId: null,
      lastPenalizedDeathId: null,
      version: GAME_VERSION,
    },
  };
  for (const it of arch.items) addItem(state, it.id, it.qty);
  const d = derive(state);
  state.player.hp = d.maxHp;
  state.player.mp = d.maxMp;
  return state;
}
