/* Barramento de eventos tipado: conecta sistemas, cena e interface sem dependências diretas. */

import type { HumanoidLook } from './types';

/** Uma fala de cena (apresentação do chefe). */
export interface CineLine {
  who: string;
  text: string;
  look?: HumanoidLook;
  /** lado do retrato */
  side?: 'left' | 'right';
}

/** Cartão de destaque no meio da tela (item importante, missão concluída, evolução…). */
export interface HighlightSpec {
  kind: 'item' | 'quest' | 'skill' | 'fragment' | 'boss' | 'level';
  /** linha pequena de cima, ex.: "Item importante" */
  title: string;
  /** nome em destaque */
  name: string;
  text?: string;
  /** ícone de item ou de habilidade (a interface desenha) */
  itemId?: string;
  skillId?: string;
  tier?: number;
  /** cor de destaque (#rrggbb) */
  color?: string;
}

export interface GameEvents {
  'state:changed': void;
  'inventory:changed': void;
  'equipment:changed': void;
  'skills:changed': void;
  'quest:changed': { id: string };
  'quest:completed': { id: string };
  'xp:gained': { amount: number };
  'level:up': { level: number };
  toast: { text: string; kind?: 'info' | 'good' | 'warn' | 'quest' | 'item' | 'level' };
  'area:entered': { name: string };
  'interact:hint': { label: string | null };
  'dialogue:open': { npcId: string };
  'boss:update': { name: string; hp: number; maxHp: number; level: number; phase: number } | null;
  'player:died': void;
  'map:changed': void;
  'menu:open': { tab?: string };
  'shop:open': { shopId: string };
  'combat:state': { inCombat: boolean };
  'travel:start': void;
  'travel:end': void;
  'saved': { slot: string };
  'demo:ending': void;
  'cinematic:start': void;
  'cinematic:title': { name: string; subtitle: string };
  'cinematic:dialogue': { lines: CineLine[]; onDone: () => void };
  'cinematic:skip': void;
  'cinematic:end': void;
  highlight: HighlightSpec;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(event: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, ...payload: GameEvents[K] extends void ? [] : [GameEvents[K]]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload[0]);
      } catch (err) {
        console.error(`Erro no evento ${String(event)}`, err);
      }
    }
  }
}

export const bus = new EventBus();
