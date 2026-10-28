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
  /** combo do ataque básico: 0 → 1 → 2 (o terceiro golpe é mais forte) */
  comboStep = 0;
  comboT = 0;
  /** onda de choque ao terminar a investida (evolução da habilidade) */
  dashShock: { power: number; radius: number } | null = null;
  /** Égide: devolve dano / explode ao acabar */
  barrierReflect = 0;
  barrierBurst = 0;
  /** Elixir da Fúria */
  fury: { t: number; speed: number; dmg: number; leech: number; titan: boolean } | null = null;
  furyAura: Phaser.GameObjects.Image | null = null;
  /** redução de dano temporária (Bênção da Floresta) */
  guardT = 0;
  guardF = 1;

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
