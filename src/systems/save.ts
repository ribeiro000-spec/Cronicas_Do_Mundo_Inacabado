import { SAVE_SCHEMA } from '../config';
import { ATTR_KEYS, EQUIP_SLOTS, type GameState } from '../core/types';
import { deepClone } from '../core/util';
import { ITEMS } from '../data/items';
import { QUESTS } from '../data/quests';

/* Salvamento local com IndexedDB (sem servidor). Slots manuais + autosave,
 * versão de esquema com migrações e backup JSON validado antes de importar (GDD §14). */

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];
export const SLOT_LABEL: Record<SlotId, string> = {
  auto: 'Salvamento automático',
  slot1: 'Espaço 1',
  slot2: 'Espaço 2',
  slot3: 'Espaço 3',
};

export interface SaveMeta {
  name: string;
  level: number;
  archetype: string;
  area: string;
  playtime: number;
}

export interface SaveRecord {
  slot: SlotId;
  savedAt: number;
  meta: SaveMeta;
  state: GameState;
}

const DB_NAME = 'cronicas-do-mundo-inacabado';
const STORE = 'saves';

/** Armazenamento: IndexedDB quando disponível, senão memória + localStorage. */
class Backend {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memory = new Map<string, SaveRecord>();

  private open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  async put(rec: SaveRecord): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.memory.set(rec.slot, rec);
      try {
        localStorage.setItem(`${DB_NAME}:${rec.slot}`, JSON.stringify(rec));
      } catch {
        /* sem espaço / bloqueado */
      }
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async get(slot: SlotId): Promise<SaveRecord | null> {
    const db = await this.open();
    if (!db) {
      if (this.memory.has(slot)) return this.memory.get(slot)!;
      try {
        const raw = localStorage.getItem(`${DB_NAME}:${slot}`);
        return raw ? (JSON.parse(raw) as SaveRecord) : null;
      } catch {
        return null;
      }
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(slot);
      req.onsuccess = () => resolve((req.result as SaveRecord) ?? null);
      req.onerror = () => resolve(null);
    });
  }

  async delete(slot: SlotId): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.memory.delete(slot);
      try {
        localStorage.removeItem(`${DB_NAME}:${slot}`);
      } catch {
        /* ignore */
      }
      return;
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

export class SaveManager {
  private backend = new Backend();

  async save(slot: SlotId, state: GameState, area: string): Promise<SaveRecord> {
    const rec: SaveRecord = {
      slot,
      savedAt: Date.now(),
      meta: {
        name: state.player.name,
        level: state.player.level,
        archetype: state.player.archetype,
        area,
        playtime: state.meta.playtime,
      },
      state: deepClone(state),
    };
    await this.backend.put(rec);
    return rec;
  }

  async load(slot: SlotId): Promise<SaveRecord | null> {
    const rec = await this.backend.get(slot);
    if (!rec) return null;
    try {
      const migrated = migrate(rec.state as unknown as Record<string, unknown>);
      const errors = validateState(migrated);
      if (errors.length) {
        console.warn('Save inválido', slot, errors);
        return null;
      }
      return { ...rec, state: migrated };
    } catch (err) {
      console.warn('Falha ao ler save', err);
      return null;
    }
  }

  async list(): Promise<Partial<Record<SlotId, SaveRecord>>> {
    const out: Partial<Record<SlotId, SaveRecord>> = {};
    for (const s of SLOTS) {
      const r = await this.backend.get(s);
      if (r) out[s] = r;
    }
    return out;
  }

  async latest(): Promise<SaveRecord | null> {
    const all = await this.list();
    let best: SaveRecord | null = null;
    for (const r of Object.values(all)) if (r && (!best || r.savedAt > best.savedAt)) best = r;
    if (!best) return null;
    return this.load(best.slot);
  }

  async delete(slot: SlotId): Promise<void> {
    await this.backend.delete(slot);
  }

  exportJson(state: GameState): string {
    return JSON.stringify({ format: 'cronicas-save', exportedAt: new Date().toISOString(), schema: state.schema, state }, null, 1);
  }

  /** Lê um backup, migra e valida. Lança erro com mensagem amigável se algo estiver errado. */
  parseBackup(text: string): GameState {
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new Error('O arquivo não é um JSON válido.');
    }
    const o = obj as { format?: string; state?: unknown };
    if (!o || o.format !== 'cronicas-save' || !o.state) throw new Error('Este arquivo não é um backup de Crônicas do Mundo Inacabado.');
    const migrated = migrate(o.state as Record<string, unknown>);
    const errors = validateState(migrated);
    if (errors.length) throw new Error('Backup corrompido: ' + errors.slice(0, 3).join('; '));
    return migrated;
  }
}

/* ---------------------------------------------------------------- migrações */

type Migration = (s: Record<string, unknown>) => void;

/** migrations[n] leva um save do esquema n para n+1 */
const migrations: Record<number, Migration> = {
  1: (s) => {
    // v1 → v2: marcadores pessoais no mapa e áreas visitadas
    const world = (s.world ?? {}) as Record<string, unknown>;
    world.markers ??= [];
    world.visitedAreas ??= [];
    world.fragments ??= [];
    s.world = world;
  },
};

export function migrate(raw: Record<string, unknown>): GameState {
  const s = deepClone(raw);
  let v = typeof s.schema === 'number' ? s.schema : 1;
  while (v < SAVE_SCHEMA) {
    const m = migrations[v];
    if (m) m(s);
    v++;
  }
  s.schema = SAVE_SCHEMA;
  const st = s as unknown as GameState;
  // itens que deixaram de existir são removidos em vez de quebrar o save
  if (Array.isArray(st.inventory)) st.inventory = st.inventory.filter((e) => e && ITEMS[e.id] && e.qty > 0);
  if (st.equipment) for (const k of EQUIP_SLOTS) if (st.equipment[k] && !ITEMS[st.equipment[k]!]) st.equipment[k] = null;
  if (st.quests) for (const k of Object.keys(st.quests)) if (!QUESTS[k]) delete st.quests[k];
  return st;
}

export function validateState(s: GameState): string[] {
  const e: string[] = [];
  const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!s || typeof s !== 'object') return ['estado ausente'];
  if (!s.player) e.push('sem jogador');
  else {
    const p = s.player;
    if (typeof p.name !== 'string') e.push('nome inválido');
    if (!isNum(p.level) || p.level < 1) e.push('nível inválido');
    if (!isNum(p.xp) || p.xp < 0) e.push('XP inválido');
    if (!p.attrs || ATTR_KEYS.some((k) => !isNum(p.attrs[k]))) e.push('atributos inválidos');
    if (!isNum(p.x) || !isNum(p.y)) e.push('posição inválida');
    if (!Array.isArray(p.hotbar)) e.push('atalhos inválidos');
    if (!p.skills || typeof p.skills !== 'object') e.push('habilidades inválidas');
  }
  if (!s.equipment || typeof s.equipment !== 'object') e.push('equipamento inválido');
  if (!Array.isArray(s.inventory)) e.push('inventário inválido');
  if (!s.quests || typeof s.quests !== 'object') e.push('missões inválidas');
  if (!s.world || !Array.isArray(s.world.chests)) e.push('mundo inválido');
  if (!s.meta) e.push('metadados ausentes');
  return e;
}
