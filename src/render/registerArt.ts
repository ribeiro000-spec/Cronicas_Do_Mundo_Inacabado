import * as Phaser from 'phaser';
import worldDefs from '../data/worldDefs.json';
import { AtlasBuilder, PB } from './pixel';
import { FONT_CHARS, drawFont, drawFx, drawObject, drawPoi, drawTile } from './worldArt';

/* Gera as texturas do cenário e registra no Phaser.
 * Atlas: 'tiles' (chão), 'objects' (árvores, casas…), 'pois' (baús, pedras-guia…), 'fx'.
 * Para usar arte desenhada à mão, publique atlas com os MESMOS nomes de quadro
 * em public/assets/atlases e aponte o manifesto do mundo para eles (veja o README). */

export const TILE_VARIANTS = 4;
export const WATER_FRAMES = 4;
export const WATER_VARIANTS = 2;

export const OBJ_VARIANTS: Record<string, number> = {
  oak: 3,
  pine: 2,
  dark_tree: 2,
  bush: 2,
  flowers: 4,
  tuft: 2,
  crops: 2,
  pillar_broken: 3,
  ruin_wall: 3,
  house_blue: 2,
  house_red: 2,
  house_brown: 2,
  lily: 2,
};

export interface FrameAnchor {
  ox: number;
  oy: number;
}

/** origem (0..1) de cada quadro de objeto/POI, para encostar a base no chão */
export const ANCHORS = new Map<string, FrameAnchor>();

export const FX_KEYS = [
  'shadow', 'slash', 'orb', 'orb_red', 'arrow', 'web', 'spark', 'dot', 'ring', 'disk', 'rune', 'fire', 'heal', 'leaf',
  'roots', 'bubble', 'bomb', 'light', 'shard',
];

export const POI_KEYS = [
  'chest_closed', 'chest_open', 'waystone_off', 'waystone_on', 'herb', 'altar', 'altar_dim', 'cargo', 'mark_quest', 'mark_turnin',
];

function addAtlas(scene: Phaser.Scene, key: string, b: AtlasBuilder): Phaser.Textures.Texture | null {
  const { canvas, frames } = b.build();
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex) return null;
  for (const f of frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
  return tex;
}

export function buildTileAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists('tiles')) return;
  const b = new AtlasBuilder(512);
  for (const t of worldDefs.tiles) {
    if (t.key === 'water' || t.key === 'deep_water') {
      for (let v = 0; v < WATER_VARIANTS; v++) for (let f = 0; f < WATER_FRAMES; f++) b.add(`${t.key}:${v}:${f}`, drawTile(t.key, v, f));
    } else {
      for (let v = 0; v < TILE_VARIANTS; v++) b.add(`${t.key}:${v}`, drawTile(t.key, v));
    }
  }
  addAtlas(scene, 'tiles', b);
}

export function buildObjectAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists('objects')) return;
  const b = new AtlasBuilder(1024);
  for (const o of worldDefs.objects) {
    const n = OBJ_VARIANTS[o.key] ?? 1;
    for (let v = 0; v < n; v++) {
      const art = drawObject(o.key, v);
      const name = `${o.key}:${v}`;
      b.add(name, art.pb);
      ANCHORS.set(name, { ox: art.ax / art.pb.w, oy: art.ay / art.pb.h });
    }
  }
  addAtlas(scene, 'objects', b);

  const p = new AtlasBuilder(256);
  for (const k of POI_KEYS) {
    const art = drawPoi(k);
    p.add(k, art.pb);
    ANCHORS.set(k, { ox: art.ax / art.pb.w, oy: art.ay / art.pb.h });
  }
  addAtlas(scene, 'pois', p);
}

export function buildFx(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx')) return;
  const b = new AtlasBuilder(256);
  for (const k of FX_KEYS) b.add(k, drawFx(k));
  addAtlas(scene, 'fx', b);

  // fonte bitmap dos números de dano
  const font: PB = drawFont();
  scene.textures.addCanvas('font_dmg', font.toCanvas());
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'font_dmg',
    width: 5,
    height: 7,
    chars: FONT_CHARS,
    charsPerRow: FONT_CHARS.length,
    'spacing.x': 0,
    'spacing.y': 0,
    'offset.x': 0,
    'offset.y': 0,
    lineSpacing: 0,
  });
  scene.cache.bitmapFont.add('dmg', data);
}

/** Âncora de um quadro: usa a tabela procedural ou o pivô do atlas externo. */
export function anchorOf(scene: Phaser.Scene, texture: string, frame: string): FrameAnchor {
  const a = ANCHORS.get(frame);
  if (a) return a;
  const f = scene.textures.getFrame(texture, frame);
  if (f && f.customPivot) return { ox: f.pivotX, oy: f.pivotY };
  return { ox: 0.5, oy: 0.9 };
}
