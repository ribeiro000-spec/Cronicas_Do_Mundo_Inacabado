import * as Phaser from 'phaser';
import worldDefs from '../data/worldDefs.json';
import { drawFountainHD, drawHouseHD } from './art/buildings';
import { FX_KEYS_HD, drawFxHD } from './art/fxArt';
import { ART } from './art/paint';
import { drawPoiHD, drawPropHD, type ArtPiece } from './art/props';
import { EDGE_VARIANTS, TERRAIN_PRIORITY, drawEdge, drawTileHD } from './art/tiles';
import { AtlasBuilder, PB } from './pixel';
import { FONT_CHARS, drawFont } from './worldArt';

/* Gera as texturas do cenário em alta resolução (2 pixels de arte por unidade lógica)
 * e registra no Phaser. Atlas: 'tiles' (chão + bordas), 'objects', 'pois', 'fx'.
 * Todo sprite do mundo é exibido com escala 1/ART.
 *
 * Para usar arte desenhada à mão, publique atlas com os MESMOS nomes de quadro
 * em public/assets/atlases e aponte o manifesto do mundo para eles (veja o README). */

export const ART_SCALE = 1 / ART;
export const TILE_VARIANTS = 4;
export const WATER_FRAMES = 4;
export const WATER_VARIANTS = 2;

export const OBJ_VARIANTS: Record<string, number> = {
  oak: 3,
  pine: 2,
  dark_tree: 2,
  bush: 2,
  rock: 2,
  rock_big: 2,
  flowers: 4,
  tuft: 2,
  crops: 2,
  reeds: 2,
  pillar_broken: 3,
  ruin_wall: 3,
  house_blue: 2,
  house_red: 2,
  house_brown: 2,
  lily: 2,
  pebbles: 3,
  leaves: 3,
};

export interface FrameAnchor {
  ox: number;
  oy: number;
  /** chaminé: deslocamento em unidades lógicas a partir do ponto de apoio */
  smoke?: { dx: number; dy: number };
}

/** origem (0..1) de cada quadro de objeto/POI, para encostar a base no chão */
export const ANCHORS = new Map<string, FrameAnchor>();

export const FX_KEYS = FX_KEYS_HD;

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

function anchor(name: string, art: ArtPiece): void {
  ANCHORS.set(name, {
    ox: art.ax / art.pb.w,
    oy: art.ay / art.pb.h,
    smoke: art.smoke ? { dx: (art.smoke.x - art.ax) / ART, dy: (art.smoke.y - art.ay) / ART } : undefined,
  });
}

/**
 * @param edgeKinds combinações de borda usadas no mapa ("upper:dir:lowerIsWater"),
 *                  vindas do manifesto — só elas são desenhadas.
 */
export function buildTileAtlas(scene: Phaser.Scene, edgeKinds: string[] = []): void {
  if (scene.textures.exists('tiles')) return;
  const b = new AtlasBuilder(2048);
  for (const t of worldDefs.tiles) {
    if (t.key === 'water' || t.key === 'deep_water') {
      for (let v = 0; v < WATER_VARIANTS; v++) for (let f = 0; f < WATER_FRAMES; f++) b.add(`${t.key}:${v}:${f}`, drawTileHD(t.key, v, f));
    } else {
      for (let v = 0; v < TILE_VARIANTS; v++) b.add(`${t.key}:${v}`, drawTileHD(t.key, v));
    }
  }
  for (const kind of edgeKinds) {
    const [upper, dir, w] = kind.split(':');
    if ((TERRAIN_PRIORITY[upper] ?? -1) < 0) continue;
    for (let v = 0; v < EDGE_VARIANTS; v++) b.add(`e:${upper}:${dir}:${w}:${v}`, drawEdge(upper, Number(dir), v, w === '1'));
  }
  addAtlas(scene, 'tiles', b);
}

export function buildObjectAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists('objects')) return;
  const b = new AtlasBuilder(2048);
  for (const o of worldDefs.objects) {
    const n = OBJ_VARIANTS[o.key] ?? 1;
    for (let v = 0; v < n; v++) {
      let art: ArtPiece | null;
      if (o.key.startsWith('house_')) art = drawHouseHD(o.key === 'house_blue' ? 0 : o.key === 'house_red' ? 1 : 2, v);
      else if (o.key === 'fountain') art = drawFountainHD();
      else art = drawPropHD(o.key, v);
      if (!art) continue;
      const name = `${o.key}:${v}`;
      b.add(name, art.pb);
      anchor(name, art);
    }
  }
  addAtlas(scene, 'objects', b);

  const p = new AtlasBuilder(512);
  for (const k of POI_KEYS) {
    const art = drawPoiHD(k);
    p.add(k, art.pb);
    anchor(k, art);
  }
  addAtlas(scene, 'pois', p);
}

export function buildFx(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx')) return;
  const b = new AtlasBuilder(1024);
  for (const k of FX_KEYS) b.add(k, drawFxHD(k));
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

/** Imagem de efeito na escala correta. */
export function fxImage(scene: Phaser.Scene, x: number, y: number, frame: string): Phaser.GameObjects.Image {
  return scene.add.image(x, y, 'fx', frame).setScale(ART_SCALE);
}
