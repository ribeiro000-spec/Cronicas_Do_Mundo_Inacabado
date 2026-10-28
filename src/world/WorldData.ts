import type { ChunkData, WorldManifest } from '../core/types';
import { b64ToBytes } from '../core/util';

/* Acesso aos dados do mundo hospedados como arquivos estáticos (GitHub Pages).
 * Só o manifesto é baixado na abertura; chunks vêm sob demanda e ficam num cache LRU. */

const BASE = import.meta.env.BASE_URL;

export class WorldData {
  private cache = new Map<string, ChunkData>();
  private pending = new Map<string, Promise<ChunkData>>();
  private grounds = new Map<string, Uint8Array>();
  private overviewBytes: Uint8Array | null = null;
  bytesLoaded = 0;

  constructor(readonly manifest: WorldManifest) {}

  static async load(onProgress?: (t: number) => void): Promise<WorldData> {
    onProgress?.(0.1);
    const res = await fetch(`${BASE}data/world/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Não foi possível carregar o mundo (${res.status}).`);
    const manifest = (await res.json()) as WorldManifest;
    if (manifest.format !== 'cronicas-world') throw new Error('Manifesto do mundo inválido.');
    onProgress?.(0.3);
    return new WorldData(manifest);
  }

  key(cx: number, cy: number): string {
    return `${cx}_${cy}`;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.manifest.widthChunks && cy < this.manifest.heightChunks;
  }

  chunk(cx: number, cy: number): Promise<ChunkData> {
    const key = this.key(cx, cy);
    const hit = this.cache.get(key);
    if (hit) {
      // renova a posição no LRU
      this.cache.delete(key);
      this.cache.set(key, hit);
      return Promise.resolve(hit);
    }
    const p = this.pending.get(key);
    if (p) return p;
    const url = `${BASE}data/world/chunks/${key}.json?v=${this.manifest.version}`;
    const req = this.fetchWithRetry(url).then((data) => {
      this.pending.delete(key);
      this.cache.set(key, data);
      if (this.cache.size > 80) {
        const oldest = this.cache.keys().next().value as string;
        this.cache.delete(oldest);
        this.grounds.delete(oldest);
      }
      return data;
    });
    this.pending.set(key, req);
    req.catch(() => this.pending.delete(key));
    return req;
  }

  private async fetchWithRetry(url: string, tries = 3): Promise<ChunkData> {
    let lastErr: unknown;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        this.bytesLoaded += text.length;
        return JSON.parse(text) as ChunkData;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
    throw lastErr;
  }

  ground(data: ChunkData): Uint8Array {
    const key = this.key(data.cx, data.cy);
    let g = this.grounds.get(key);
    if (!g) {
      g = b64ToBytes(data.g);
      this.grounds.set(key, g);
    }
    return g;
  }

  overview(): Uint8Array {
    if (!this.overviewBytes) this.overviewBytes = b64ToBytes(this.manifest.overview);
    return this.overviewBytes;
  }
}
