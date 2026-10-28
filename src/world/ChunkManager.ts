import * as Phaser from 'phaser';
import { ENGINE } from '../config';
import { depthOf, toScreen } from '../core/iso';
import type { ChunkData } from '../core/types';
import worldDefs from '../data/worldDefs.json';
import { hash } from '../render/pixel';
import { OBJ_VARIANTS, TILE_VARIANTS, WATER_FRAMES, WATER_VARIANTS, anchorOf } from '../render/registerArt';
import type { CollisionGrid } from './CollisionGrid';
import type { WorldData } from './WorldData';

/* Carregamento dinâmico (GDD §15):
 *  1. carrega o chunk atual e os vizinhos (raio configurável);
 *  2. pré-carrega na direção do movimento;
 *  3. descarrega chunks distantes — o estado persistente fica no save, não no chunk;
 *  4. cada chunk vira um Blitter (chão, 1 draw call) + imagens de objetos ordenadas por profundidade. */

const TILE_KEYS = worldDefs.tiles.map((t) => t.key);
const TILE_SOLID = worldDefs.tiles.map((t) => t.solid);
const OBJ_BY_ID = new Map(worldDefs.objects.map((o) => [o.id, o]));
const FLAT = new Set(['flowers', 'tuft', 'crops', 'lily']);
const NO_FLIP = new Set(['house_blue', 'house_red', 'house_brown', 'fountain', 'well', 'stall', 'fence_x', 'fence_y', 'tent', 'signpost', 'cart_broken']);
const LIGHTS: Record<string, { color: number; y: number; scale: number }> = {
  lamp: { color: 0xffc860, y: -24, scale: 1.4 },
  campfire: { color: 0xff8a3a, y: -6, scale: 1.8 },
};

export interface LoadedChunk {
  cx: number;
  cy: number;
  key: string;
  data: ChunkData;
  blitter: Phaser.GameObjects.Blitter;
  water: { bob: Phaser.GameObjects.Bob; name: string; v: number }[];
  objects: Phaser.GameObjects.GameObject[];
}

export interface ChunkHooks {
  onLoad(chunk: LoadedChunk): void;
  onUnload(chunk: LoadedChunk): void;
}

export class ChunkManager {
  readonly loaded = new Map<string, LoadedChunk>();
  private loading = new Set<string>();
  private waterFrame = 0;
  private waterTimer = 0;
  private lastCenter = '';
  private destroyed = false;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldData,
    private grid: CollisionGrid,
    private hooks: ChunkHooks,
  ) {}

  get chunkSize(): number {
    return this.world.manifest.chunkSize;
  }

  chunkOf(x: number, y: number): { cx: number; cy: number } {
    return { cx: Math.floor(x / this.chunkSize), cy: Math.floor(y / this.chunkSize) };
  }

  /** Chamado a cada frame com a posição e velocidade do jogador. */
  update(x: number, y: number, vx: number, vy: number, dt: number): void {
    const { cx, cy } = this.chunkOf(x, y);
    const R = ENGINE.chunkRadius;
    const want = new Set<string>();
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) this.request(cx + dx, cy + dy, want);
    // pré-carga na direção do movimento
    const sp = Math.hypot(vx, vy);
    if (sp > 0.1) {
      const ax = Math.round(vx / sp) * (R + ENGINE.prefetchAhead);
      const ay = Math.round(vy / sp) * (R + ENGINE.prefetchAhead);
      this.request(cx + ax, cy + ay, want);
      this.request(cx + ax + Math.sign(ay), cy + ay + Math.sign(ax), want);
    }
    const centerKey = `${cx}_${cy}`;
    if (centerKey !== this.lastCenter) {
      this.lastCenter = centerKey;
      for (const [key, ch] of this.loaded) {
        if (Math.max(Math.abs(ch.cx - cx), Math.abs(ch.cy - cy)) > ENGINE.unloadRadius) this.unload(key);
      }
    }
    // animação da água (só nos chunks carregados)
    this.waterTimer += dt;
    if (this.waterTimer > 0.28) {
      this.waterTimer = 0;
      this.waterFrame = (this.waterFrame + 1) % WATER_FRAMES;
      for (const ch of this.loaded.values()) {
        for (const w of ch.water) w.bob.setFrame(`${w.name}:${w.v}:${this.waterFrame}`);
      }
    }
  }

  private request(cx: number, cy: number, want: Set<string>): void {
    if (!this.world.inBounds(cx, cy)) return;
    const key = this.world.key(cx, cy);
    want.add(key);
    if (this.loaded.has(key) || this.loading.has(key)) return;
    this.loading.add(key);
    this.world
      .chunk(cx, cy)
      .then((data) => {
        this.loading.delete(key);
        if (this.destroyed || this.loaded.has(key)) return;
        this.build(data);
      })
      .catch((err) => {
        this.loading.delete(key);
        console.warn('Falha ao carregar chunk', key, err);
      });
  }

  /** Garante que a área em volta de (x, y) está carregada (teleporte, carregar save). */
  async ensureArea(x: number, y: number): Promise<void> {
    const { cx, cy } = this.chunkOf(x, y);
    const R = ENGINE.chunkRadius;
    const jobs: Promise<void>[] = [];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.world.inBounds(nx, ny)) continue;
        const key = this.world.key(nx, ny);
        if (this.loaded.has(key)) continue;
        jobs.push(
          this.world.chunk(nx, ny).then((data) => {
            if (!this.loaded.has(key) && !this.destroyed) this.build(data);
          }),
        );
      }
    }
    await Promise.all(jobs);
    this.lastCenter = '';
  }

  private build(data: ChunkData): void {
    const CS = this.chunkSize;
    const key = this.world.key(data.cx, data.cy);
    const g = this.world.ground(data);
    const blitter = this.scene.add.blitter(0, 0, 'tiles');
    blitter.setDepth(-1_000_000);
    const water: LoadedChunk['water'] = [];
    const x0 = data.cx * CS;
    const y0 = data.cy * CS;
    for (let ly = 0; ly < CS; ly++) {
      for (let lx = 0; lx < CS; lx++) {
        const id = g[ly * CS + lx];
        const tx = x0 + lx;
        const ty = y0 + ly;
        const name = TILE_KEYS[id] ?? 'grass';
        const s = toScreen(tx, ty);
        const isWater = name === 'water' || name === 'deep_water';
        const v = Math.floor(hash(tx, ty, 3) * (isWater ? WATER_VARIANTS : TILE_VARIANTS));
        const frame = isWater ? `${name}:${v}:${this.waterFrame}` : `${name}:${v}`;
        const bob = blitter.create(s.x - 16, s.y, frame);
        if (isWater) water.push({ bob, name, v });
        this.grid.setGround(tx, ty, !!TILE_SOLID[id]);
      }
    }

    const objects: Phaser.GameObjects.GameObject[] = [];
    for (const [id, lx, ly] of data.o) {
      const def = OBJ_BY_ID.get(id);
      if (!def) continue;
      const ax = x0 + lx;
      const ay = y0 + ly;
      const n = OBJ_VARIANTS[def.key] ?? 1;
      const v = Math.floor(hash(ax, ay, 9) * n);
      const frame = `${def.key}:${v}`;
      const fx = ax + def.w / 2;
      const fy = ay + def.h / 2;
      const s = toScreen(fx, fy);
      const img = this.scene.add.image(s.x, s.y, 'objects', frame);
      const an = anchorOf(this.scene, 'objects', frame);
      img.setOrigin(an.ox, an.oy);
      if (!NO_FLIP.has(def.key) && hash(ax, ay, 17) > 0.5) img.setFlipX(true);
      img.setDepth(FLAT.has(def.key) ? -500_000 + s.y : depthOf(fx, fy));
      objects.push(img);
      if (def.solid) this.grid.addObject(ax, ay, def.w, def.h, 1);
      const light = LIGHTS[def.key];
      if (light) {
        const glow = this.scene.add.image(s.x, s.y + light.y, 'fx', 'light');
        glow.setBlendMode(Phaser.BlendModes.ADD).setTint(light.color).setAlpha(0.45).setScale(light.scale).setDepth(depthOf(fx, fy) + 1);
        this.scene.tweens.add({
          targets: glow,
          alpha: { from: 0.32, to: 0.55 },
          duration: 260 + hash(ax, ay, 2) * 300,
          yoyo: true,
          repeat: -1,
        });
        objects.push(glow);
        if (def.key === 'campfire') {
          const fire = this.scene.add.image(s.x, s.y - 6, 'fx', 'fire').setOrigin(0.5, 1).setDepth(depthOf(fx, fy) + 0.5);
          this.scene.tweens.add({ targets: fire, scaleY: { from: 0.8, to: 1.35 }, scaleX: { from: 1.1, to: 0.85 }, duration: 180, yoyo: true, repeat: -1 });
          objects.push(fire);
        }
      }
    }

    const chunk: LoadedChunk = { cx: data.cx, cy: data.cy, key, data, blitter, water, objects };
    this.loaded.set(key, chunk);
    this.hooks.onLoad(chunk);
  }

  unload(key: string): void {
    const ch = this.loaded.get(key);
    if (!ch) return;
    this.hooks.onUnload(ch);
    const CS = this.chunkSize;
    const x0 = ch.cx * CS;
    const y0 = ch.cy * CS;
    for (let ly = 0; ly < CS; ly++) for (let lx = 0; lx < CS; lx++) this.grid.clearGround(x0 + lx, y0 + ly);
    for (const [id, lx, ly] of ch.data.o) {
      const def = OBJ_BY_ID.get(id);
      if (def?.solid) this.grid.addObject(x0 + lx, y0 + ly, def.w, def.h, -1);
    }
    ch.blitter.destroy();
    for (const o of ch.objects) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.loaded.delete(key);
  }

  unloadAll(): void {
    for (const key of [...this.loaded.keys()]) this.unload(key);
    this.lastCenter = '';
  }

  destroy(): void {
    this.destroyed = true;
    this.unloadAll();
  }

  stats(): { loaded: number; loading: number } {
    return { loaded: this.loaded.size, loading: this.loading.size };
  }
}
