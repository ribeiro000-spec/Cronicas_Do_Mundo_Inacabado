import * as Phaser from 'phaser';
import type { HumanoidLook } from '../core/types';
import { ITEMS } from '../data/items';
import { game } from '../game';
import { CharacterView } from '../render/CharacterView';
import { Actor, type Team } from './Actor';

export function playerLook(): HumanoidLook {
  const s = game.state;
  const eq = s.equipment;
  const vis = (id: string | null) => (id ? ITEMS[id]?.visual ?? null : null);
  return {
    skin: s.player.look.skin,
    hair: s.player.look.hair,
    hairStyle: s.player.look.hairStyle,
    head: vis(eq.head),
    chest: vis(eq.chest) ?? { style: 'tunic', color: '#7a6a55' },
    legs: vis(eq.legs) ?? { style: 'pants', color: '#4a4036', color2: '#3a2616' },
    gloves: vis(eq.gloves),
    cape: vis(eq.cape),
    main: vis(eq.mainHand),
    off: vis(eq.offHand),
  };
}

export class Player extends Actor {
  team: Team = 'player';
  view: CharacterView;
  attackCd = 0;
  dodgeCd = 0;
  dodgeT = 0;
  dodgeDx = 0;
  dodgeDy = 0;
  dashT = 0;
  dashDx = 0;
  dashDy = 0;
  dashHit = new Set<number>();
  dashPower = 0;
  barrier = 0;
  barrierT = 0;
  bubble: Phaser.GameObjects.Image | null = null;
  guaranteedCrit = 0;
  stepT = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(x, y);
    this.radius = 0.28;
    this.view = new CharacterView(scene, { look: playerLook() });
    this.syncView();
  }

  rebuild(): void {
    this.view.setLook(playerLook());
    this.faceDir(this.fx, this.fy);
  }
}
