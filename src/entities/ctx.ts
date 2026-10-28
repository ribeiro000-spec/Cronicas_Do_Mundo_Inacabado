import type * as Phaser from 'phaser';
import type { Fx } from '../render/Fx';
import type { CollisionGrid } from '../world/CollisionGrid';
import type { Actor } from './Actor';
import type { Enemy } from './Enemy';
import type { Player } from './Player';

export interface HitOpts {
  crit?: boolean;
  knock?: number;
  kind?: 'phys' | 'magic' | 'fire';
  source?: Actor | null;
  stun?: number;
  root?: number;
  slow?: { t: number; f: number };
  burn?: { t: number; dps: number };
  silent?: boolean;
  /** sem faísca de impacto (dano em área contínuo) */
  light?: boolean;
}

export interface ProjectileSpec {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  range: number;
  dmg: number;
  team: 'player' | 'enemy';
  frame: string;
  tint?: number;
  pierce?: boolean;
  homing?: Actor | null;
  crit?: boolean;
  onHit?: HitOpts;
  /** arremesso em arco que explode no destino (bomba) */
  lob?: { tx: number; ty: number; radius: number; burn?: { t: number; dps: number } };
  source?: Actor | null;
  /** escala visual do projétil */
  scale?: number;
  /** cor do rastro de partículas */
  trail?: number;
  /** ao acertar, salta para outros alvos (relâmpago) */
  chain?: number;
  /** explode em área ao acertar */
  burstRadius?: number;
}

/** O que as entidades enxergam da cena. */
export interface WorldCtx {
  /** a cena Phaser (nome diferente de Scene.scene, que é o ScenePlugin) */
  stage: Phaser.Scene;
  grid: CollisionGrid;
  fx: Fx;
  now: number;
  player: Player;
  enemies: Enemy[];
  hitActor(target: Actor, amount: number, opts: HitOpts): void;
  spawnProjectile(spec: ProjectileSpec): void;
  spawnEnemy(defId: string, x: number, y: number, level: number, opts?: { team?: 'enemy' | 'ally'; tag?: string; groupId?: string; life?: number }): Enemy | null;
}
