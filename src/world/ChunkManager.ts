import * as Phaser from 'phaser';
import { ENGINE } from '../config';
import { depthOf, toScreen } from '../core/iso';
import type { ChunkData } from '../core/types';
import worldDefs from '../data/worldDefs.json';
import { ART } from '../render/art/paint';
import { hash } from '../render/pixel';
import { ART_SCALE, OBJ_VARIANTS, TILE_VARIANTS, WATER_FRAMES, WATER_VARIANTS, anchorOf } from '../render/registerArt';
import type { CollisionGrid } from './CollisionGrid';
import type { WorldData } from './WorldData';

/* Carregamento dinâmico (GDD §15):
 *  1. carrega o chunk atual e os vizinhos (raio configurável);
 *  2. pré-carrega na direção do movimento;
 *  3. descarrega chunks distantes — o estado persistente fica no save, não no chunk;
 *  4. cada chunk vira um Blitter (chão + bordas, 1 draw call) e imagens de objetos ordenadas
 *     por profundidade;
 *  5. chunks baixados entram numa fila e são montados um por quadro — sem travadas. */

const TILE_KEYS = worldDefs.tiles.map((t) => t.key);
const TILE_SOLID = worldDefs.tiles.map((t) => t.solid);
const OBJ_BY_ID = new Map(worldDefs.objects.map((o) => [o.id, o]));
const WATER_IDS = new Set(worldDefs.tiles.filter((t) => t.key === 'water' || t.key === 'deep_water').map((t) => t.id));
const FLAT = new Set(['flowers', 'tuft', 'crops', 'lily', 'pebbles', 'leaves']);
const NO_FLIP = new Set(['house_blue', 'house_red', 'house_brown', 'fountain', 'well', 'stall', 'fence_x', 'fence_y', 'tent', 'signpost', 'cart_broken', 'crate', 'hay']);
const LIGHTS: Record<string, { color: number; y: number; scale: number }> = {
  lamp: { color: 0xffc860, y: -25, scale: 0.9 },
  campfire: { color: 0xff8a3a, y: -6, scale: 1.3 },
};

export interface Emitter {
  kind: 'smoke' | 'fire' | 'sparkle';
  x: number;
  y: number;
  depth: number;
}

export interface LoadedChunk {
  cx: number;
  cy: number;
  key: string;
  data: ChunkData;
  blitter: Phaser.GameObjects.Blitter;
  /** o Blitter do Phaser ignora a própria escala: ele fica dentro de um Container escalado */
  layer: Phaser.GameObjects.Container;
  water: { bob: Phaser.GameObjects.Bob; name: string; v: number }[];
  objects: Phaser.GameObjects.GameObject[];
  emitters: Emitter[];
}

export interface ChunkHooks {
  onLoad(chunk: LoadedChunk): void;
  onUnload(chunk: LoadedChunk): void;
}

export class ChunkManager {
  readonly loaded = new Map<string, LoadedChunk>();
  private loading = new Set<string>();
  private ready: ChunkData[] = [];
  private waterFrame = 0;
  private waterTimer = 0;
  private lastCenter = '';
  private destroyed = false;
  private px = 0;
  private py = 0;

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
    this.px = x;
    this.py = y;
    const { cx, cy } = this.chunkOf(x, y);
    const R = ENGINE.chunkRadius;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) this.request(cx + dx, cy + dy);
    // pré-carga na direção do movimento (um anel além do raio visível)
    const sp = Math.hypot(vx, vy);
    if (sp > 0.1) {
      const ax = Math.round(vx / sp) * (R + ENGINE.prefetchAhead);
      const ay = Math.round(vy / sp) * (R + ENGINE.prefetchAhead);
      for (let k = -1; k <= 1; k++) this.request(cx + ax + (ay !== 0 ? k : 0), cy + ay + (ax !== 0 ? k : 0));
    }
    const centerKey = `${cx}_${cy}`;
    if (centerKey !== this.lastCenter) {
      this.lastCenter = centerKey;
      for (const [key, ch] of this.loaded) {
        if (Math.max(Math.abs(ch.cx - cx), Math.abs(ch.cy - cy)) > ENGINE.unloadRadius) this.unload(key);
      }
      this.ready = this.ready.filter((d) => Math.max(Math.abs(d.cx - cx), Math.abs(d.cy - cy)) <= ENGINE.unloadRadius);
    }
    // monta no máximo um chunk por quadro, o mais próximo primeiro
    if (this.ready.length) {
      this.ready.sort((a, b) => this.distTo(a) - this.distTo(b));
      const next = this.ready.shift()!;
      if (!this.loaded.has(this.world.key(next.cx, next.cy))) this.build(next);
    }
    // animação da água
    this.waterTimer += dt;
    if (this.waterTimer > 0.26) {
      this.waterTimer = 0;
      this.waterFrame = (this.waterFrame + 1) % WATER_FRAMES;
      for (const ch of this.loaded.values()) {
        for (const w of ch.water) w.bob.setFrame(`${w.name}:${w.v}:${this.waterFrame}`);
      }
    }
  }

  private distTo(d: ChunkData): number {
    const cs = this.chunkSize;
    return Math.hypot(d.cx * cs + cs / 2 - this.px, d.cy * cs + cs / 2 - this.py);
  }

  private request(cx: number, cy: number): void {
    if (!this.world.inBounds(cx, cy)) return;
    const key = this.world.key(cx, cy);
    if (this.loaded.has(key) || this.loading.has(key)) return;
    this.loading.add(key);
    this.world
      .chunk(cx, cy)
      .then((data) => {
        this.loading.delete(key);
        if (this.destroyed || this.loaded.has(key)) return;
        if (!this.ready.some((d) => d.cx === cx && d.cy === cy)) this.ready.push(data);
      })
      .catch((err) => {
        this.loading.delete(key);
        console.warn('Falha ao carregar chunk', key, err);
      });
  }

  /** Garante que a área em volta de (x, y) está montada (teleporte, carregar save). */
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
    this.px = x;
    this.py = y;
    this.lastCenter = '';
  }

  private build(data: ChunkData): void {
    const CS = this.chunkSize;
    const key = this.world.key(data.cx, data.cy);
    const g = this.world.ground(data);
    // o chão é desenhado em pixels de arte (2×); o Container aplica a escala de exibição
    const blitter = this.scene.make.blitter({ x: 0, y: 0, key: 'tiles' }, false);
    const layer = this.scene.add.container(0, 0, [blitter]).setScale(ART_SCALE).setDepth(-1_000_000);
    const water: LoadedChunk['water'] = [];
    const x0 = data.cx * CS;
    const y0 = data.cy * CS;
    const tilePos = (tx: number, ty: number) => {
      const s = toScreen(tx, ty);
      return { x: s.x * ART - 32, y: s.y * ART };
    };
    for (let ly = 0; ly < CS; ly++) {
      for (let lx = 0; lx < CS; lx++) {
        const id = g[ly * CS + lx];
        const tx = x0 + lx;
        const ty = y0 + ly;
        const name = TILE_KEYS[id] ?? 'grass';
        const p = tilePos(tx, ty);
        const isWater = name === 'water' || name === 'deep_water';
        const v = Math.floor(hash(tx, ty, 3) * (isWater ? WATER_VARIANTS : TILE_VARIANTS));
        const frame = isWater ? `${name}:${v}:${this.waterFrame}` : `${name}:${v}`;
        const bob = blitter.create(p.x, p.y, frame);
        if (isWater) water.push({ bob, name, v });
        this.grid.setGround(tx, ty, !!TILE_SOLID[id]);
      }
    }
    // bordas de transição por cima do chão
    const e = data.e ?? [];
    const tex = this.scene.textures.get('tiles');
    for (let i = 0; i + 2 < e.length; i += 3) {
      const local = e[i];
      const dir = e[i + 1];
      const upper = TILE_KEYS[e[i + 2]];
      const lx = local % CS;
      const ly = Math.floor(local / CS);
      const tx = x0 + lx;
      const ty = y0 + ly;
      const w = WATER_IDS.has(g[local]) ? 1 : 0;
      const frame = `e:${upper}:${dir}:${w}:${Math.floor(hash(tx, ty, 11) * 2)}`;
      if (!tex.has(frame)) continue;
      const p = tilePos(tx, ty);
      blitter.create(p.x, p.y, frame);
    }

    const objects: Phaser.GameObjects.GameObject[] = [];
    const emitters: Emitter[] = [];
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
      const img = this.scene.add.image(s.x, s.y, 'objects', frame).setScale(ART_SCALE);
      const an = anchorOf(this.scene, 'objects', frame);
      img.setOrigin(an.ox, an.oy);
      const flip = !NO_FLIP.has(def.key) && hash(ax, ay, 17) > 0.5;
      if (flip) img.setFlipX(true);
      const depth = FLAT.has(def.key) ? -500_000 + s.y : depthOf(fx, fy);
      img.setDepth(depth);
      objects.push(img);
      if (def.solid) this.grid.addObject(ax, ay, def.w, def.h, 1);
      if (an.smoke) emitters.push({ kind: 'smoke', x: s.x + an.smoke.dx * (flip ? -1 : 1), y: s.y + an.smoke.dy, depth: depth + 1 });
      if (def.key === 'fountain') emitters.push({ kind: 'sparkle', x: s.x, y: s.y - 30, depth: depth + 1 });
      const light = LIGHTS[def.key];
      if (light) {
        const glow = this.scene.add.image(s.x, s.y + light.y, 'fx', 'light');
        glow.setBlendMode(Phaser.BlendModes.ADD).setTint(light.color).setAlpha(0.45).setScale(light.scale).setDepth(depth + 1);
        this.scene.tweens.add({
          targets: glow,
          alpha: { from: 0.32, to: 0.55 },
          duration: 260 + hash(ax, ay, 2) * 300,
          yoyo: true,
          repeat: -1,
        });
        objects.push(glow);
        if (def.key === 'campfire') {
          const fire = this.scene.add.image(s.x, s.y - 4, 'fx', 'flame_big').setOrigin(0.5, 1).setScale(ART_SCALE * 0.7).setDepth(depth + 0.5);
          this.scene.tweens.add({ targets: fire, scaleY: { from: ART_SCALE * 0.55, to: ART_SCALE * 0.85 }, scaleX: { from: ART_SCALE * 0.75, to: ART_SCALE * 0.6 }, duration: 160, yoyo: true, repeat: -1 });
          objects.push(fire);
          emitters.push({ kind: 'fire', x: s.x, y: s.y - 10, depth: depth + 1 });
        }
      }
    }

    const chunk: LoadedChunk = { cx: data.cx, cy: data.cy, key, data, blitter, layer, water, objects, emitters };
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
    ch.layer.destroy(true);
    for (const o of ch.objects) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.loaded.delete(key);
  }

  unloadAll(): void {
    for (const key of [...this.loaded.keys()]) this.unload(key);
    this.ready = [];
    this.lastCenter = '';
  }

  destroy(): void {
    this.destroyed = true;
    this.unloadAll();
  }

  emitters(): Emitter[] {
    const out: Emitter[] = [];
    for (const ch of this.loaded.values()) out.push(...ch.emitters);
    return out;
  }

  stats(): { loaded: number; loading: number; queued: number } {
    return { loaded: this.loaded.size, loading: this.loading.size, queued: this.ready.length };
  }
}
