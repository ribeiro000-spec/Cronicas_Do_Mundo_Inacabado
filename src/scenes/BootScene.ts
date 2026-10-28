import * as Phaser from 'phaser';
import { game } from '../game';
import { buildFx, buildObjectAtlas, buildTileAtlas } from '../render/registerArt';

/* Prepara as texturas. Se o manifesto do mundo apontar atlas desenhados à mão
 * (manifest.art.tiles / manifest.art.objects), eles são carregados no lugar da arte procedural. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const art = game.manifest?.art ?? {};
    const base = import.meta.env.BASE_URL;
    for (const key of ['tiles', 'objects', 'pois'] as const) {
      const path = art[key];
      if (path) this.load.atlas(key, `${base}${path}.png`, `${base}${path}.json`);
    }
  }

  create(): void {
    buildTileAtlas(this);
    buildObjectAtlas(this);
    buildFx(this);
    this.game.events.emit('art-ready');
  }
}
