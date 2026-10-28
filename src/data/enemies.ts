import type { HumanoidLook } from '../core/types';

export type EnemyKind = 'slime' | 'wolf' | 'boar' | 'spider' | 'totem' | 'humanoid';

export interface EnemyAttack {
  type: 'melee' | 'ranged' | 'charge';
  range: number;
  windup: number;
  cooldown: number;
  projectile?: 'arrow' | 'web' | 'orb';
  /** distância que inimigos à distância tentam manter */
  keepAway?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  kind: EnemyKind;
  look?: HumanoidLook;
  /** cor base para criaturas não humanoides */
  color?: string;
  hp: number;
  hpLv: number;
  dmg: number;
  dmgLv: number;
  armor: number;
  speed: number;
  aggro: number;
  leash: number;
  radius: number;
  scale?: number;
  attack: EnemyAttack;
  xp: number;
  gold: [number, number];
  loot: { id: string; chance: number; min?: number; max?: number }[];
  /** foge quando a vida cai abaixo desta fração */
  flee?: number;
  boss?: boolean;
  /** criatura espiritual (translúcida, invocada) */
  spirit?: boolean;
  /** não se move (sentinela) */
  stationary?: boolean;
}

/* Dificuldade: valores ~45% mais altos de vida e ~30% de dano em relação à primeira versão.
 * Ajuste fino em DIFFICULTY abaixo (multiplicadores aplicados a todos, exceto invocações). */
export const DIFFICULTY = { hp: 1.45, dmg: 1.3, cooldown: 0.88, windup: 0.92, aggro: 1, speed: 1.05 };

const list: EnemyDef[] = [
  {
    id: 'slime', name: 'Slime', kind: 'slime', color: '#5fc65a', hp: 22, hpLv: 8, dmg: 5, dmgLv: 2, armor: 0, speed: 1.7,
    aggro: 4.5, leash: 10, radius: 0.32, attack: { type: 'melee', range: 0.95, windup: 0.4, cooldown: 1.3 },
    xp: 10, gold: [1, 4], loot: [{ id: 'gosma', chance: 0.6 }, { id: 'pocao_vida', chance: 0.04 }],
  },
  {
    id: 'lobo', name: 'Lobo', kind: 'wolf', color: '#7d7f86', hp: 34, hpLv: 10, dmg: 8, dmgLv: 2.5, armor: 1, speed: 3.5,
    aggro: 6.5, leash: 14, radius: 0.35, flee: 0.18, attack: { type: 'melee', range: 1.05, windup: 0.32, cooldown: 1.15 },
    xp: 20, gold: [0, 3], loot: [{ id: 'pele_lobo', chance: 0.55 }],
  },
  {
    id: 'javali', name: 'Javali', kind: 'boar', color: '#6b4a32', hp: 52, hpLv: 12, dmg: 11, dmgLv: 3, armor: 2, speed: 2.5,
    aggro: 5, leash: 12, radius: 0.4, attack: { type: 'charge', range: 4.5, windup: 0.7, cooldown: 3 },
    xp: 24, gold: [0, 4], loot: [{ id: 'presa_javali', chance: 0.5 }, { id: 'pao_mel', chance: 0.08 }],
  },
  {
    id: 'aranha', name: 'Aranha Tecelã', kind: 'spider', color: '#3a3346', hp: 30, hpLv: 9, dmg: 7, dmgLv: 2.5, armor: 1, speed: 2.9,
    aggro: 6, leash: 12, radius: 0.36, attack: { type: 'ranged', range: 5, windup: 0.55, cooldown: 2.2, projectile: 'web', keepAway: 2.5 },
    xp: 22, gold: [0, 3], loot: [{ id: 'seda_aranha', chance: 0.55 }],
  },
  {
    id: 'goblin', name: 'Goblin', kind: 'humanoid', hp: 32, hpLv: 9, dmg: 7, dmgLv: 2.2, armor: 1, speed: 2.7, aggro: 5.5, leash: 12,
    radius: 0.3, scale: 0.85, attack: { type: 'melee', range: 1.0, windup: 0.36, cooldown: 1.1 },
    look: {
      skin: '#7fae4a', hair: '#2a2a1a', hairStyle: 'careca', body: 'small', ears: 'pointy', eyes: '#ffd23a',
      chest: { style: 'vest', color: '#6b4a2b' }, legs: { style: 'pants', color: '#4a3a26', color2: '#2e2116' },
      main: { style: 'dagger', color: '#9aa0a8', color2: '#4a3020' },
    },
    xp: 18, gold: [2, 8], loot: [{ id: 'moeda_antiga', chance: 0.05 }, { id: 'pocao_vida', chance: 0.07 }, { id: 'minerio_ferro', chance: 0.08 }],
  },
  {
    id: 'goblin_arqueiro', name: 'Goblin Arqueiro', kind: 'humanoid', hp: 24, hpLv: 7, dmg: 7, dmgLv: 2.2, armor: 0, speed: 2.6,
    aggro: 7, leash: 12, radius: 0.3, scale: 0.85,
    attack: { type: 'ranged', range: 6.5, windup: 0.6, cooldown: 1.9, projectile: 'arrow', keepAway: 4 },
    look: {
      skin: '#7fae4a', hair: '#2a2a1a', hairStyle: 'careca', body: 'small', ears: 'pointy', eyes: '#ffd23a',
      head: { style: 'hood', color: '#4a5a2a' }, chest: { style: 'vest', color: '#5a4a2b' },
      legs: { style: 'pants', color: '#4a3a26', color2: '#2e2116' }, main: { style: 'bow', color: '#6b4a2b', color2: '#d9c79a' },
    },
    xp: 20, gold: [2, 7], loot: [{ id: 'pocao_vida', chance: 0.06 }, { id: 'arco_curto', chance: 0.03 }],
  },
  {
    id: 'bandido', name: 'Saqueador', kind: 'humanoid', hp: 44, hpLv: 11, dmg: 9, dmgLv: 3, armor: 2, speed: 2.9, aggro: 6, leash: 13,
    radius: 0.32, attack: { type: 'melee', range: 1.05, windup: 0.34, cooldown: 1.05 },
    look: {
      skin: '#d6a77a', hair: '#3a2416', hairStyle: 'curto', head: { style: 'hood', color: '#5a2f2f' },
      chest: { style: 'leather', color: '#4a3a2e' }, legs: { style: 'pants', color: '#3a3330', color2: '#22180f' },
      cape: { style: 'cape', color: '#5a2f2f' }, main: { style: 'sword', color: '#a7adb8', color2: '#3a2616' },
    },
    xp: 26, gold: [4, 12], loot: [{ id: 'pocao_vida', chance: 0.12 }, { id: 'adaga_simples', chance: 0.04 }, { id: 'capuz_couro', chance: 0.04 }],
  },
  {
    id: 'bandido_arqueiro', name: 'Saqueador Atirador', kind: 'humanoid', hp: 36, hpLv: 9, dmg: 8, dmgLv: 2.6, armor: 1, speed: 2.8,
    aggro: 7.5, leash: 13, radius: 0.32, attack: { type: 'ranged', range: 7, windup: 0.6, cooldown: 1.8, projectile: 'arrow', keepAway: 4.5 },
    look: {
      skin: '#c68d63', hair: '#1f1a16', hairStyle: 'rabo', head: { style: 'hood', color: '#3a4a3a' },
      chest: { style: 'leather', color: '#3e3a30' }, legs: { style: 'pants', color: '#33302c', color2: '#22180f' },
      main: { style: 'bow', color: '#5c3b22', color2: '#d9c79a' },
    },
    xp: 26, gold: [4, 11], loot: [{ id: 'pocao_vida', chance: 0.1 }, { id: 'luvas_couro', chance: 0.05 }],
  },
  {
    id: 'esqueleto', name: 'Esqueleto Inquieto', kind: 'humanoid', hp: 46, hpLv: 12, dmg: 10, dmgLv: 3, armor: 3, speed: 2.2,
    aggro: 6, leash: 12, radius: 0.32, attack: { type: 'melee', range: 1.1, windup: 0.48, cooldown: 1.35 },
    look: {
      skin: '#e6dfc8', hair: '#000000', hairStyle: 'careca', body: 'skeleton', eyes: '#7cf0ff',
      chest: { style: 'bones', color: '#e6dfc8' }, legs: { style: 'bones', color: '#e6dfc8' },
      main: { style: 'sword', color: '#8d8a80', color2: '#4a3a2a' }, off: { style: 'shield_round', color: '#5a4a3a', color2: '#7a7a7a' },
    },
    xp: 30, gold: [2, 9], loot: [{ id: 'osso', chance: 0.6 }, { id: 'cristal_eco', chance: 0.4 }, { id: 'moeda_antiga', chance: 0.08 }],
  },
  {
    id: 'cavaleiro_sem_brasao', name: 'Cavaleiro Sem Brasão', kind: 'humanoid', boss: true, hp: 1100, hpLv: 0, dmg: 21, dmgLv: 0,
    armor: 9, speed: 2.3, aggro: 9, leash: 20, radius: 0.55, scale: 1.7,
    attack: { type: 'melee', range: 1.7, windup: 0.6, cooldown: 1.5 },
    look: {
      skin: '#3a3a4a', hair: '#000000', hairStyle: 'careca', eyes: '#ff4a4a',
      head: { style: 'helm', color: '#6d7591' }, chest: { style: 'plate', color: '#5a627c', color2: '#c8a957' },
      legs: { style: 'greaves', color: '#5a627c', color2: '#2a2a35' }, gloves: { style: 'gloves', color: '#454b62' },
      cape: { style: 'cape', color: '#7a1f2a' }, main: { style: 'sword', color: '#9aa3c8', color2: '#c8a957' },
    },
    xp: 600, gold: [120, 160], loot: [{ id: 'pocao_grande', chance: 1, min: 2, max: 2 }, { id: 'moeda_antiga', chance: 1, min: 3, max: 5 }],
  },
  // ------------------------------------------------------------ invocações (aliados)
  {
    id: 'lobo_espiritual', name: 'Lobo Espiritual', kind: 'wolf', color: '#7cf0ff', spirit: true, hp: 70, hpLv: 14, dmg: 9, dmgLv: 3, armor: 2, speed: 4,
    aggro: 8, leash: 30, radius: 0.35, attack: { type: 'melee', range: 1.05, windup: 0.22, cooldown: 0.9 },
    xp: 0, gold: [0, 0], loot: [],
  },
  {
    id: 'lobo_matilha', name: 'Lobo da Matilha Espiritual', kind: 'wolf', color: '#a890ff', spirit: true, hp: 90, hpLv: 16, dmg: 11, dmgLv: 3.4, armor: 3,
    speed: 4.3, aggro: 9, leash: 30, radius: 0.36, scale: 1.1, attack: { type: 'melee', range: 1.1, windup: 0.2, cooldown: 0.8 },
    xp: 0, gold: [0, 0], loot: [],
  },
  {
    id: 'lobo_alfa', name: 'Alfa Celestial', kind: 'wolf', color: '#fff0b0', spirit: true, hp: 160, hpLv: 22, dmg: 16, dmgLv: 4.5, armor: 5,
    speed: 4.6, aggro: 10, leash: 30, radius: 0.45, scale: 1.4, attack: { type: 'melee', range: 1.35, windup: 0.2, cooldown: 0.75 },
    xp: 0, gold: [0, 0], loot: [],
  },
  {
    id: 'sentinela', name: 'Sentinela Astral', kind: 'totem', color: '#7ab8ff', spirit: true, stationary: true, hp: 120, hpLv: 15, dmg: 8, dmgLv: 2.5,
    armor: 4, speed: 0, aggro: 8, leash: 30, radius: 0.4, attack: { type: 'ranged', range: 7.5, windup: 0.25, cooldown: 1.1, projectile: 'orb', keepAway: 0 },
    xp: 0, gold: [0, 0], loot: [],
  },
];

for (const e of list) {
  if (e.spirit) continue;
  e.hp = Math.round(e.hp * DIFFICULTY.hp);
  e.hpLv = Math.round(e.hpLv * DIFFICULTY.hp * 10) / 10;
  e.dmg = Math.round(e.dmg * DIFFICULTY.dmg * 10) / 10;
  e.dmgLv = Math.round(e.dmgLv * DIFFICULTY.dmg * 10) / 10;
  e.attack.cooldown *= DIFFICULTY.cooldown;
  e.attack.windup *= DIFFICULTY.windup;
  e.aggro += DIFFICULTY.aggro;
  e.speed *= DIFFICULTY.speed;
  e.xp = Math.round(e.xp * 1.25);
}

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));
