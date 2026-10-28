/* Barramento de eventos tipado: conecta sistemas, cena e interface sem dependências diretas. */

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
