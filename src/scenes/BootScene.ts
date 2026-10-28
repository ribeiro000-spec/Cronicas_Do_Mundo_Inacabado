import * as Phaser from 'phaser';
import { ENEMIES } from '../data/enemies';
import { NPCS } from '../data/npcs';
import { game } from '../game';
import { ensureCreature, ensureHumanoid, ensureWeapon } from '../render/characterArt';
import { buildFx, buildObjectAtlas, buildTileAtlas } from '../render/registerArt';

/* Prepara as texturas antes do jogo começar — inclusive todos os NPCs e inimigos,
 * para não haver travadas ao encontrá-los pela primeira vez.
 * Se o manifesto do mundo apontar atlas desenhados à mão (manifest.art.tiles…),
 * eles são carregados no lugar da arte procedural. */
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
    const steps: (() => void)[] = [
      () => buildTileAtlas(this, game.manifest?.edgeKinds ?? []),
      () => buildObjectAtlas(this),
      () => buildFx(this),
      () => {
        for (const n of Object.values(NPCS)) {
          ensureHumanoid(this.textures, n.look);
          if (n.look.main) ensureWeapon(this.textures, n.look.main);
          if (n.look.off) ensureWeapon(this.textures, n.look.off);
        }
      },
      () => {
        for (const e of Object.values(ENEMIES)) {
          if (e.kind === 'humanoid' && e.look) {
            ensureHumanoid(this.textures, e.look);
            if (e.look.main) ensureWeapon(this.textures, e.look.main);
            if (e.look.off) ensureWeapon(this.textures, e.look.off);
          } else if (e.kind !== 'humanoid') ensureCreature(this.textures, e.kind, e.color ?? '#888888', !!e.spirit);
        }
      },
    ];
    // um passo por quadro, para a barra de carregamento continuar viva
    let i = 0;
    const run = () => {
      if (i < steps.length) {
        steps[i++]();
        this.game.events.emit('art-progress', i / steps.length);
        this.time.delayedCall(16, run);
      } else this.game.events.emit('art-ready');
    };
    run();
  }
}
