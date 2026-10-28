import * as Phaser from 'phaser';
import { depthOf, toScreen } from '../core/iso';
import type { WorldPoi } from '../core/types';
import { game } from '../game';
import { ART_SCALE, anchorOf } from '../render/registerArt';

/* Pontos de interesse fixos: baús, pedras-guia, ervas, altar, carga da caravana. */
export class PoiSprite {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null = null;
  extra: Phaser.GameObjects.Image | null = null;
  private t = Math.random() * 5;

  constructor(
    private scene: Phaser.Scene,
    readonly poi: WorldPoi,
  ) {
    const s = toScreen(poi.x, poi.y);
    this.img = scene.add.image(s.x, s.y, 'pois', this.frame()).setScale(ART_SCALE);
    this.img.setDepth(depthOf(poi.x, poi.y));
    this.refresh();
  }

  private frame(): string {
    const w = game.state.world;
    switch (this.poi.type) {
      case 'chest':
        return w.chests.includes(this.poi.id) ? 'chest_open' : 'chest_closed';
      case 'waystone':
        return w.waystonesActive.includes(this.poi.id) ? 'waystone_on' : 'waystone_off';
      case 'herb':
        return 'herb';
      case 'altar':
        return game.quests.step('q_fragmento') >= 2 || game.quests.status('q_fragmento') === 'done' ? 'altar_dim' : 'altar';
      case 'cargo':
        return 'cargo';
      default:
        return 'chest_closed';
    }
  }

  refresh(): void {
    const f = this.frame();
    this.img.setFrame(f);
    const an = anchorOf(this.scene, 'pois', f);
    this.img.setOrigin(an.ox, an.oy);
    const s = toScreen(this.poi.x, this.poi.y);
    const visible = this.poi.type !== 'herb' || game.herbReady(this.poi.id);
    this.img.setVisible(visible);
    const wantsGlow =
      (this.poi.type === 'waystone' && f === 'waystone_on') ||
      (this.poi.type === 'herb' && visible) ||
      (this.poi.type === 'altar' && f === 'altar') ||
      (this.poi.type === 'cargo' && game.quests.wantsInteract(this.poi.id)) ||
      (this.poi.type === 'chest' && f === 'chest_closed');
    if (wantsGlow && !this.glow) {
      const color = this.poi.type === 'waystone' ? 0x7cf0ff : this.poi.type === 'altar' ? 0xc58bff : this.poi.type === 'herb' ? 0x7fd8ff : 0xffd56a;
      this.glow = this.scene.add.image(s.x, s.y - 6, 'fx', 'light').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(0.35);
      this.glow.setScale(this.poi.type === 'herb' ? 0.4 : 0.7).setDepth(depthOf(this.poi.x, this.poi.y) + 1);
    } else if (!wantsGlow && this.glow) {
      this.glow.destroy();
      this.glow = null;
    }
    if (this.poi.type === 'altar' && f === 'altar' && !this.extra) {
      this.extra = this.scene.add.image(s.x, s.y - 26, 'fx', 'shard').setScale(ART_SCALE).setDepth(depthOf(this.poi.x, this.poi.y) + 2);
    } else if (this.extra && f !== 'altar') {
      this.extra.destroy();
      this.extra = null;
    }
  }

  update(dt: number): void {
    this.t += dt;
    if (this.glow) this.glow.setAlpha(0.28 + Math.sin(this.t * 3) * 0.1);
    if (this.extra) this.extra.y = toScreen(this.poi.x, this.poi.y).y - 26 + Math.sin(this.t * 2) * 3;
    if (this.poi.type === 'herb' && !this.img.visible && game.herbReady(this.poi.id)) this.refresh();
  }

  destroy(): void {
    this.img.destroy();
    this.glow?.destroy();
    this.extra?.destroy();
  }
}
