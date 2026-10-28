import * as Phaser from 'phaser';
import { depthOf, toScreen } from '../core/iso';
import type { WorldPoi } from '../core/types';
import { pick, rand } from '../core/util';
import { NPCS } from '../data/npcs';
import { CharacterView } from '../render/CharacterView';
import { anchorOf } from '../render/registerArt';
import type { CollisionGrid } from '../world/CollisionGrid';
import { Actor, type Team } from './Actor';

export class Npc extends Actor {
  team: Team = 'ally';
  view: CharacterView;
  poi: WorldPoi;
  private marker: Phaser.GameObjects.Image;
  private markerKind: '!' | '?' | null = null;
  private wanderT = rand(1, 4);
  private tx: number;
  private ty: number;
  private barkT = rand(6, 16);
  private nameTag: Phaser.GameObjects.Text;
  private bobT = Math.random() * 6;

  constructor(scene: Phaser.Scene, poi: WorldPoi) {
    super(poi.x, poi.y);
    this.poi = poi;
    const def = NPCS[poi.id];
    this.view = new CharacterView(scene, { look: def?.look ?? { skin: '#e3b48c', hair: '#3a2416', hairStyle: 'curto' } });
    this.tx = poi.x;
    this.ty = poi.y;
    this.faceDir(1, 1);
    this.marker = scene.add.image(0, 0, 'pois', 'mark_quest').setVisible(false);
    const an = anchorOf(scene, 'pois', 'mark_quest');
    this.marker.setOrigin(an.ox, an.oy);
    this.nameTag = scene.add
      .text(0, 0, def?.name ?? poi.id, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '8px',
        color: '#f4e9c8',
        stroke: '#1b1a24',
        strokeThickness: 3,
        resolution: 3,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0);
    this.syncView();
  }

  setMarker(kind: '!' | '?' | null): void {
    if (kind === this.markerKind) return;
    this.markerKind = kind;
    if (!kind) {
      this.marker.setVisible(false);
      return;
    }
    this.marker.setFrame(kind === '?' ? 'mark_turnin' : 'mark_quest').setVisible(true);
  }

  update(dt: number, grid: CollisionGrid, player: { x: number; y: number }, onBark: (text: string) => void): void {
    this.view.update(dt);
    this.bobT += dt;
    const dp = Math.hypot(player.x - this.x, player.y - this.y);
    let moving = false;
    if (dp < 2.4) {
      this.faceTo(player.x, player.y);
    } else if (this.poi.wander) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = rand(2, 6);
        this.tx = this.poi.x + rand(-this.poi.wander, this.poi.wander);
        this.ty = this.poi.y + rand(-this.poi.wander, this.poi.wander);
      }
      const dx = this.tx - this.x;
      const dy = this.ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.2) {
        const step = Math.min(d, 1.2 * dt);
        moving = this.move(grid, (dx / d) * step, (dy / d) * step);
        this.faceDir(dx, dy);
        if (!moving) this.wanderT = 0;
      }
    }
    this.view.setMoving(moving, dt);
    this.barkT -= dt;
    if (this.barkT <= 0) {
      this.barkT = rand(10, 22);
      const barks = NPCS[this.poi.id]?.barks;
      if (barks && dp < 7) onBark(pick(barks));
    }
    this.nameTag.setAlpha(dp < 3.2 ? 1 : 0);
    this.syncView();
  }

  syncView(): void {
    super.syncView();
    const s = toScreen(this.x, this.y);
    this.marker.setPosition(Math.round(s.x), Math.round(s.y - 34 + Math.sin(this.bobT * 4) * 1.5));
    this.marker.setDepth(depthOf(this.x, this.y) + 6000);
    this.nameTag.setPosition(Math.round(s.x), Math.round(s.y - (this.markerKind ? 50 : 34)));
    this.nameTag.setDepth(depthOf(this.x, this.y) + 6001);
  }

  destroy(): void {
    this.marker.destroy();
    this.nameTag.destroy();
    this.view.destroy();
  }
}
