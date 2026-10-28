import * as Phaser from 'phaser';
import { BALANCE, ENGINE } from '../config';
import { endBarrier, endFury, enemiesIn, performSkill } from '../combat/SkillCaster';
import { bus, type CineLine } from '../core/events';
import { input } from '../core/input';
import { screenDirToWorld, toScreen, toWorld, worldDirToScreen } from '../core/iso';
import type { WorldPoi } from '../core/types';
import { angleDiff, chance, clamp, dist, rand, randInt } from '../core/util';
import { ENEMIES } from '../data/enemies';
import { SKILLS, skillTier } from '../data/skills';
import { Actor } from '../entities/Actor';
import type { HitOpts, ProjectileSpec, WorldCtx } from '../entities/ctx';
import { Enemy } from '../entities/Enemy';
import { Npc } from '../entities/Npc';
import { Player, playerLook } from '../entities/Player';
import { PoiSprite } from '../entities/PoiSprite';
import { Projectile } from '../entities/Projectile';
import { game, type SceneApi } from '../game';
import type { SwingKind } from '../render/CharacterView';
import { Fx } from '../render/Fx';
import { ART_SCALE } from '../render/registerArt';
import { skillCooldown, skillPower } from '../systems/progression';
import { sfx } from '../systems/sfx';
import { mitigate } from '../systems/stats';
import { ChunkManager, type LoadedChunk } from '../world/ChunkManager';
import { CollisionGrid } from '../world/CollisionGrid';
import type { WorldData } from '../world/WorldData';

const AREA_CODEX: Record<string, string> = {
  'Floresta dos Sinos Mudos': 'floresta',
  'Ruínas Antigas': 'ruinas',
  'Campos de Orvalho': 'campos',
  'Vila de Eldenor': 'eldenor',
};

/** Sequência de golpes do combo básico por tipo de arma (o terceiro é o golpe forte). */
const COMBOS: Record<string, SwingKind[]> = {
  sword: ['melee', 'reverse', 'heavy'],
  mace: ['melee', 'reverse', 'heavy'],
  dagger: ['thrust', 'reverse', 'thrust'],
  axe: ['heavy', 'reverse', 'spin'],
  fist: ['thrust', 'thrust', 'heavy'],
};

/* Cena principal: mundo em chunks, jogador, inimigos, NPCs, projéteis e efeitos. */
export class WorldScene extends Phaser.Scene implements SceneApi, WorldCtx {
  world!: WorldData;
  grid!: CollisionGrid;
  chunks!: ChunkManager;
  fx!: Fx;
  player!: Player;
  enemies: Enemy[] = [];
  npcs = new Map<string, Npc>();
  pois = new Map<string, PoiSprite>();
  projectiles: Projectile[] = [];
  now = 0;
  ready = false;
  /** cena de apresentação em andamento (jogador e inimigos parados) */
  cinematic = false;
  private groupDeadAt = new Map<string, number>();
  private hint: { poi: WorldPoi; label: string } | null = null;
  private timers = { hint: 0, reveal: 0, area: 0, reach: 0, combat: 0, ambient: 0, fogSave: 0, fps: 0, emit: 0 };
  private mapDirty = false;
  private lastArea = '';
  private mouseActiveT = 0;
  private manaWarnT = 0;
  private immuneLabelT = 0;
  private statueHintT = 0;
  private unsub: (() => void)[] = [];
  // câmera suave (posição em pixels lógicos)
  private camX = 0;
  private camY = 0;
  private leadX = 0;
  private leadY = 0;
  private camFocus: { x: number; y: number; rate: number } | null = null;
  private hitStopT = 0;
  private pausedFx = false;
  private cine: { timers: Phaser.Time.TimerEvent[]; boss: Enemy; finished: boolean } | null = null;

  constructor() {
    super('world');
  }

  get stage(): Phaser.Scene {
    return this;
  }

  init(data: { world: WorldData }): void {
    this.world = data.world;
  }

  create(): void {
    const m = this.world.manifest;
    this.grid = new CollisionGrid(m.width, m.height);
    this.fx = new Fx(this);
    this.chunks = new ChunkManager(this, this.world, this.grid, {
      onLoad: (c) => this.onChunkLoad(c),
      onUnload: (c) => this.onChunkUnload(c),
    });
    const st = game.state.player;
    this.player = new Player(this, st.x, st.y);
    this.enemies = [];
    this.projectiles = [];
    this.cinematic = false;
    this.cine = null;
    this.camFocus = null;
    this.hitStopT = 0;
    this.pausedFx = false;
    this.tweens.timeScale = 1;
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0b1220');
    cam.setRoundPixels(true);
    this.applyZoom();
    this.snapCamera();
    this.scale.on('resize', this.onResize, this);
    this.setupPointer();

    game.scene = this;
    game.running = true;
    this.unsub.push(
      bus.on('quest:changed', () => this.refreshMarkers()),
      bus.on('state:changed', () => this.applyZoom()),
      bus.on('cinematic:skip', () => this.endBossIntro()),
    );
    this.events.once('shutdown', () => this.cleanup());
    bus.emit('travel:start');
    void this.chunks.ensureArea(st.x, st.y).then(() => {
      this.placePlayerSafely();
      this.ready = true;
      this.snapCamera();
      bus.emit('travel:end');
      this.lastArea = '';
    });
  }

  private onResize(): void {
    this.applyZoom();
    this.snapCamera();
  }

  private cleanup(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.scale.off('resize', this.onResize, this);
    if (this.cinematic) bus.emit('cinematic:end');
    this.cinematic = false;
    this.cine = null;
    game.scene = null;
    game.running = false;
    this.chunks.destroy();
  }

  /**
   * Zoom inteiro: cada pixel da arte vira um número inteiro de pixels do canvas
   * (sem pixels de tamanhos diferentes, sem tremido ao andar).
   */
  applyZoom(): void {
    const short = Math.min(this.scale.width, this.scale.height);
    const auto = Math.max(1, Math.round(short / 460));
    const pref = game.settings.zoom === -1 ? -1 : game.settings.zoom === 1 ? 1 : 0;
    const artPx = clamp(auto + pref, 1, 8);
    const z = artPx / ART_SCALE;
    if (this.cameras.main.zoom !== z) this.cameras.main.setZoom(z);
  }

  private setupPointer(): void {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      input.aim = toWorld(wp.x, wp.y + 8);
      this.mouseActiveT = 2.5;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch || p.button !== 0 || this.cinematic) return;
      sfx.unlock();
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      input.aim = toWorld(wp.x, wp.y + 8);
      this.mouseActiveT = 2.5;
      input.press('attack');
      input.setAttackKey(true);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      input.setAttackKey(false);
    });
  }

  private placePlayerSafely(): void {
    const p = this.player;
    const free = this.grid.nearestFree(p.x, p.y, p.radius, 8);
    if (free) {
      p.x = free.x;
      p.y = free.y;
    }
    p.syncView();
  }

  /* ================================================================ câmera */

  private cameraTarget(): { x: number; y: number } {
    const p = this.player;
    const s = toScreen(p.x, p.y);
    return { x: s.x + this.leadX, y: s.y - 12 + this.leadY };
  }

  /** Centraliza a câmera no jogador sem transição (início, teleporte, renascer). */
  snapCamera(): void {
    if (!this.player) return;
    this.leadX = 0;
    this.leadY = 0;
    const t = this.cameraTarget();
    this.camX = t.x;
    this.camY = t.y;
    this.cameras.main.centerOn(this.camX, this.camY);
  }

  /**
   * Segue o jogador com suavização exponencial baseada no tempo do quadro, sem arredondar
   * posições (o arredondamento acontece só no desenho, em pixels reais da tela).
   * Uma leve antecipação na direção do movimento compensa o atraso da suavização.
   */
  private updateCamera(dt: number): void {
    const p = this.player;
    let tx: number;
    let ty: number;
    let rate: number;
    if (this.camFocus) {
      tx = this.camFocus.x;
      ty = this.camFocus.y;
      rate = this.camFocus.rate;
    } else {
      const v = worldDirToScreen(p.vx, p.vy);
      const lk = 1 - Math.exp(-dt * 4);
      this.leadX += (clamp(v.x * 0.1, -16, 16) - this.leadX) * lk;
      this.leadY += (clamp(v.y * 0.1, -10, 10) - this.leadY) * lk;
      const t = this.cameraTarget();
      tx = t.x;
      ty = t.y;
      rate = 10;
    }
    const k = 1 - Math.exp(-dt * rate);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.cameras.main.centerOn(this.camX, this.camY);
  }

  /** Congela a ação por um instante para dar peso ao golpe. */
  hitStop(t: number): void {
    if (this.hitStopT <= 0) this.tweens.timeScale = 0.3;
    this.hitStopT = Math.max(this.hitStopT, t);
  }

  /** Pausa relógio e animações da cena junto com os menus. */
  private syncPause(): void {
    const want = game.paused;
    if (want === this.pausedFx) return;
    this.pausedFx = want;
    this.time.paused = want;
    if (want) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }

  /* ================================================================ chunks */

  private onChunkLoad(c: LoadedChunk): void {
    const CS = this.world.manifest.chunkSize;
    for (const s of c.data.s) {
      const deadAt = this.groupDeadAt.get(s.id);
      if (deadAt !== undefined && this.now - deadAt < BALANCE.respawnSeconds) continue;
      if (this.enemies.some((e) => e.groupId === s.id && !e.dead)) continue;
      // às vezes um membro do grupo é uma versão de elite (mais forte, brilho dourado)
      const eliteIdx = s.lv >= 2 && chance(0.14) ? randInt(0, s.n - 1) : -1;
      for (let k = 0; k < s.n; k++) {
        const pos = this.grid.nearestFree(s.x + rand(-1.2, 1.2), s.y + rand(-1.2, 1.2), 0.35, 3);
        if (pos) this.spawnEnemy(s.e, pos.x, pos.y, s.lv, { groupId: s.id, elite: k === eliteIdx });
      }
      this.groupDeadAt.delete(s.id);
    }
    for (const poi of this.world.manifest.pois) {
      if (Math.floor(poi.x / CS) !== c.cx || Math.floor(poi.y / CS) !== c.cy) continue;
      if (poi.type === 'npc') {
        if (!this.npcs.has(poi.id)) this.npcs.set(poi.id, new Npc(this, poi));
      } else if (poi.type === 'boss') {
        if (!game.state.world.bosses.includes(poi.id) && !this.enemies.some((e) => e.groupId === 'boss:' + poi.id && !e.dead)) {
          // o chefe dorme como estátua até a missão chegar a ele
          this.spawnEnemy(poi.enemy ?? 'cavaleiro_sem_brasao', poi.x, poi.y, 6, { groupId: 'boss:' + poi.id, dormant: true });
        }
      } else if (!this.pois.has(poi.id)) {
        this.pois.set(poi.id, new PoiSprite(this, poi));
      }
    }
    this.refreshMarkers();
  }

  private onChunkUnload(c: LoadedChunk): void {
    const prefix = `${c.cx}_${c.cy}_`;
    const CS = this.world.manifest.chunkSize;
    this.enemies = this.enemies.filter((e) => {
      const mine =
        (e.groupId && e.groupId.startsWith(prefix)) ||
        (e.groupId?.startsWith('boss:') && Math.floor(e.homeX / CS) === c.cx && Math.floor(e.homeY / CS) === c.cy);
      if (mine && !e.dead) {
        if (this.cine?.boss === e) return true;
        e.destroyNow();
        if (e.isBoss) bus.emit('boss:update', null);
        return false;
      }
      return true;
    });
    for (const [id, n] of this.npcs) {
      if (Math.floor(n.poi.x / CS) === c.cx && Math.floor(n.poi.y / CS) === c.cy) {
        n.destroy();
        this.npcs.delete(id);
      }
    }
    for (const [id, p] of this.pois) {
      if (Math.floor(p.poi.x / CS) === c.cx && Math.floor(p.poi.y / CS) === c.cy) {
        p.destroy();
        this.pois.delete(id);
      }
    }
  }

  private refreshMarkers(): void {
    for (const [id, n] of this.npcs) n.setMarker(game.quests.npcMarker(id));
    for (const p of this.pois.values()) p.refresh();
  }

  /* ================================================================ WorldCtx */

  spawnEnemy(
    defId: string,
    x: number,
    y: number,
    level: number,
    opts: { team?: 'enemy' | 'ally'; tag?: string; groupId?: string; life?: number; elite?: boolean; dormant?: boolean } = {},
  ): Enemy | null {
    const pos = this.grid.nearestFree(x, y, 0.35, 4);
    if (!pos) return null;
    const e = new Enemy(this, defId, pos.x, pos.y, level, opts);
    this.enemies.push(e);
    return e;
  }

  spawnProjectile(spec: ProjectileSpec): void {
    this.projectiles.push(new Projectile(this, spec));
  }

  hitActor(target: Actor, amount: number, opts: HitOpts): void {
    if (target.dead) return;
    if (target === this.player) {
      this.damagePlayer(amount, opts);
      return;
    }
    const e = target as Enemy;
    const p = this.player;
    const fromPlayerSide = !opts.source || opts.source === p || (opts.source instanceof Enemy && opts.source.team === 'ally');
    if (e.team === 'ally' && fromPlayerSide) return;
    if (e.dormant) {
      // estátua do chefe: ainda não pode ser ferida
      if (this.immuneLabelT <= 0 && fromPlayerSide && !opts.silent) {
        this.immuneLabelT = 2;
        this.fx.label(e.x, e.y, 'Pedra fria… ainda não é a hora.', '#c8c8e8');
        this.fx.burst(e.x, e.y, 0xb0aab8, 4, 'dot', 10, 14);
      }
      return;
    }
    let dmg = amount * (opts.crit ? game.derived.critMult : 1);
    if (opts.source === p && p.fury) dmg *= p.fury.dmg;
    dmg = mitigate(dmg, e.armor);
    e.hp -= dmg;
    e.lastHitAt = this.now;
    e.showBar();
    if (!opts.silent) {
      e.view.flash();
      e.view.squash(0.1);
      const color = opts.crit ? 0xffd23a : opts.kind === 'fire' ? 0xff8a3a : opts.kind === 'magic' ? 0xa8c8ff : 0xffffff;
      this.fx.number(e.x, e.y, String(Math.round(dmg)), color, !!opts.crit);
      sfx.play('hit');
      if (!opts.light && opts.kind !== 'fire') this.fx.impact(e.x, e.y, opts.crit ? 0xffe08a : opts.kind === 'magic' ? 0xbfd8ff : 0xffffff, !!opts.crit);
    }
    // roubo de vida (Elixir Sanguíneo)
    if (opts.source === p && p.fury && p.fury.leech > 0) {
      const st = game.state.player;
      st.hp = Math.min(game.derived.maxHp, st.hp + dmg * p.fury.leech);
    }
    const res = e.isBoss ? 0.25 : 1;
    if (opts.knock && opts.source) e.knock(opts.source.x, opts.source.y, opts.knock * res);
    if (opts.stun) e.stunT = Math.max(e.stunT, opts.stun * (e.isBoss ? 0.3 : 1));
    if (opts.root) e.rootT = Math.max(e.rootT, opts.root * (e.isBoss ? 0.4 : 1));
    if (opts.slow) {
      e.slowT = opts.slow.t;
      e.slowF = opts.slow.f;
    }
    if (opts.burn) {
      e.burnT = opts.burn.t;
      e.burnDps = opts.burn.dps;
    }
    if (e.team === 'enemy' && fromPlayerSide) {
      game.markCombat();
      if (e.state === 'idle') e.engage(this, this.player);
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  private damagePlayer(amount: number, opts: HitOpts): void {
    const p = this.player;
    if (game.dead || p.dead || this.cinematic) return;
    if (p.invulnT > 0) {
      if (p.dodgeT > 0 || p.dashT > 0) this.fx.label(p.x, p.y, 'Esquiva!', '#bfe3ff');
      return;
    }
    let dmg = mitigate(amount * rand(0.92, 1.08), game.derived.armor);
    if (p.guardT > 0) dmg *= p.guardF;
    if (p.fury?.titan) dmg *= 0.75;
    if (p.barrier > 0) {
      const absorbed = Math.min(p.barrier, dmg);
      p.barrier -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0) {
        this.fx.number(p.x, p.y, String(Math.round(absorbed)), 0xffe9a0);
        // Égide: devolve parte do golpe a quem atacou
        const src = opts.source;
        if (p.barrierReflect > 0 && src instanceof Enemy && !src.dead && src.team === 'enemy') {
          this.fx.lightning(p.x, p.y, src.x, src.y, 0xffe08a);
          this.hitActor(src, Math.max(1, absorbed * p.barrierReflect), { kind: 'magic', source: p, light: true });
        }
      }
      if (p.barrier <= 0) endBarrier(this);
    }
    game.markCombat();
    if (opts.slow) {
      p.slowT = opts.slow.t;
      p.slowF = opts.slow.f;
      this.fx.label(p.x, p.y, 'Lento', '#c8c8e8');
    }
    if (dmg <= 0) return;
    const st = game.state.player;
    st.hp -= dmg;
    p.view.flash();
    p.view.squash(0.12);
    p.invulnT = 0.22;
    this.fx.number(p.x, p.y, String(Math.round(dmg)), 0xff5a5a);
    this.fx.shake(0.004, 100);
    sfx.play('hurt');
    if (game.settings.vibration && 'vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {
        /* ignore */
      }
    }
    if (opts.knock && opts.source) p.knock(opts.source.x, opts.source.y, opts.knock * 0.6);
    if (st.hp <= 0) {
      st.hp = 0;
      this.playerDie();
    }
  }

  private playerDie(): void {
    const p = this.player;
    p.dead = true;
    input.reset();
    if (p.fury) endFury(this);
    this.tweens.add({ targets: p.view.root, angle: 90, alpha: 0.4, duration: 500, ease: 'Quad.easeIn' });
    for (const e of this.enemies) if (e.team === 'enemy' && e.state !== 'idle') e.state = 'return';
    bus.emit('boss:update', null);
    game.onPlayerDeath();
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    if (this.cine?.boss === e) this.endBossIntro();
    e.destroyView(this);
    if (e.team !== 'enemy') return;
    const def = e.def;
    const eliteK = e.elite ? 2.5 : 1;
    const xp = Math.round(def.xp * (0.85 + 0.15 * e.level) * eliteK);
    if (xp > 0) {
      game.gainXp(xp);
      this.time.delayedCall(180, () => this.fx.number(e.x, e.y - 0.4, `+${xp}XP`, 0xb48cff));
    }
    const gold = Math.round(randInt(def.gold[0], def.gold[1]) * (1 + 0.1 * (e.level - 1)) * eliteK);
    if (gold > 0) game.addGold(gold);
    for (const l of def.loot) {
      if (chance(Math.min(1, l.chance * (e.elite ? 2 : 1)))) game.giveItem(l.id, randInt(l.min ?? 1, l.max ?? 1));
    }
    game.quests.onKill(def.id);
    if (e.isBoss) {
      game.state.world.bosses.push('boss_cavaleiro');
      bus.emit('boss:update', null);
      this.fx.explosion(e.x, e.y, 3, 0xb48cff);
      this.fx.pillar(e.x, e.y, 0xb48cff, 2.5, 1200);
      this.fx.shake(0.012, 500);
      this.hitStop(0.25);
      for (const o of this.enemies) if (o.tag === 'eco' && !o.dead) this.killEnemy(o);
      this.time.delayedCall(1300, () =>
        bus.emit('highlight', {
          kind: 'boss',
          title: 'Chefe derrotado',
          name: def.name,
          text: 'O juramento se desfaz em poeira. A estrada se aquieta — conte ao Prefeito Aldren o que aconteceu.',
          color: '#b48cff',
        }),
      );
      this.time.delayedCall(6000, () => void game.autosave('chefe'));
    } else {
      this.fx.burst(e.x, e.y, 0xffffff, 5, 'dot', 10, 8);
      if (e.elite) this.fx.explosion(e.x, e.y, 1, 0xffb030);
    }
    if (e.groupId && !e.groupId.startsWith('boss:')) {
      const alive = this.enemies.some((o) => o.groupId === e.groupId && !o.dead);
      if (!alive) this.groupDeadAt.set(e.groupId, this.now);
    }
  }

  /* ================================================================ SceneApi */

  async teleport(x: number, y: number): Promise<void> {
    const cam = this.cameras.main;
    cam.fadeOut(200, 11, 18, 32);
    await new Promise((r) => setTimeout(r, 220));
    for (const pr of this.projectiles) pr.kill(this, false);
    this.projectiles = [];
    for (const e of this.enemies) if (!e.groupId) e.destroyNow();
    this.enemies = this.enemies.filter((e) => e.groupId);
    this.player.x = x;
    this.player.y = y;
    this.ready = false;
    await this.chunks.ensureArea(x, y);
    this.placePlayerSafely();
    this.ready = true;
    this.snapCamera();
    cam.fadeIn(260, 11, 18, 32);
    game.state.player.x = this.player.x;
    game.state.player.y = this.player.y;
  }

  rebuildPlayer(): void {
    this.player?.rebuild();
  }

  async resetWorld(): Promise<void> {
    this.ready = false;
    if (this.cine) {
      for (const t of this.cine.timers) t.remove(false);
      this.cine = null;
      this.cinematic = false;
      this.camFocus = null;
      bus.emit('cinematic:end');
    }
    for (const e of this.enemies) e.destroyNow();
    this.enemies = [];
    for (const n of this.npcs.values()) n.destroy();
    this.npcs.clear();
    for (const p of this.pois.values()) p.destroy();
    this.pois.clear();
    for (const pr of this.projectiles) pr.kill(this, false);
    this.projectiles = [];
    this.groupDeadAt.clear();
    this.chunks.unloadAll();
    game.cooldowns = {};
    bus.emit('boss:update', null);
    const p = this.player;
    this.tweens.killTweensOf(p.view.root);
    p.view.root.setAngle(0).setAlpha(1).setScale(ART_SCALE * p.view.scale);
    p.dead = false;
    endBarrier(this);
    if (p.fury) endFury(this);
    p.guardT = 0;
    p.comboT = 0;
    p.x = game.state.player.x;
    p.y = game.state.player.y;
    p.rebuild();
    await this.chunks.ensureArea(p.x, p.y);
    this.placePlayerSafely();
    this.snapCamera();
    this.cameras.main.fadeIn(300, 11, 18, 32);
    this.lastArea = '';
    this.ready = true;
  }

  spawnEchoes(x: number, y: number): void {
    game.toast('Ecos despertam ao redor do altar!', 'warn');
    this.fx.explosion(x, y, 2, 0xb48cff);
    for (const [dx, dy] of [[2, 0], [-1.5, 1.5], [0, -2]]) this.spawnEnemy('esqueleto', x + dx, y + dy, 5, { tag: 'eco' });
  }

  weakenBoss(): void {
    const b = this.enemies.find((e) => e.isBoss && !e.dead);
    if (b) b.hp = Math.min(b.hp, Math.round(b.maxHp * 0.7));
  }

  refreshPoi(id: string): void {
    this.pois.get(id)?.refresh();
    this.refreshMarkers();
  }

  playerPos(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  effect(kind: 'heal' | 'levelup' | 'pickup', text?: string): void {
    const p = this.player;
    if (kind === 'heal') {
      this.fx.heal(p.x, p.y);
      if (text) this.fx.number(p.x, p.y, text, 0x7dff9a);
    } else if (kind === 'levelup') this.fx.levelUp(p.x, p.y);
    else this.fx.burst(p.x, p.y, 0xffe08a, 6);
  }

  /* ================================================================ apresentação do chefe */

  private startBossIntro(boss: Enemy): void {
    if (this.cine || this.cinematic) return;
    const full = !game.state.flags.boss_intro_visto;
    game.state.flags.boss_intro_visto = true;
    input.reset();
    this.cinematic = true;
    const p = this.player;
    p.vx = 0;
    p.vy = 0;
    p.view.setMoving(false, 0);
    p.faceTo(boss.x, boss.y);
    for (const pr of this.projectiles) pr.kill(this, false);
    this.projectiles = [];
    this.cine = { timers: [], boss, finished: false };
    const at = (ms: number, fn: () => void) => this.cine?.timers.push(this.time.delayedCall(ms, fn));
    const bs = toScreen(boss.x, boss.y);
    // ponto entre o jogador e o chefe, puxado para o chefe
    const ps = toScreen(p.x, p.y);
    const fx = bs.x * 0.75 + ps.x * 0.25;
    const fy = bs.y * 0.75 + ps.y * 0.25 - 22;
    bus.emit('cinematic:start');
    if (!full) {
      this.camFocus = { x: fx, y: fy, rate: 4 };
      at(600, () => this.awakenBoss(boss));
      at(1500, () => bus.emit('cinematic:title', { name: boss.def.name, subtitle: 'Guardião do Juramento Esquecido' }));
      at(3200, () => this.endBossIntro());
      return;
    }
    this.camFocus = { x: fx, y: fy, rate: 2.2 };
    sfx.play('boss');
    at(900, () => {
      this.fx.shake(0.003, 1100);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.time.delayedCall(i * 110, () => this.fx.dust(boss.x + Math.cos(a) * 1.4, boss.y + Math.sin(a) * 1.4, 3));
      }
    });
    at(1700, () => {
      this.fx.burst(boss.x, boss.y, 0xb0aab8, 8, 'dot', 18, 26);
      this.fx.glowAt(boss.x, boss.y - 1.1, 0xff3a3a, 0.7, 700);
      sfx.play('hit');
    });
    at(2500, () => this.awakenBoss(boss));
    at(3300, () => bus.emit('cinematic:title', { name: boss.def.name, subtitle: 'Guardião do Juramento Esquecido' }));
    at(5600, () => {
      const name = game.state.player.name;
      const brasao = game.hasItem('brasao_partido') && !game.state.flags.brasao_usado;
      const bossLook = ENEMIES[boss.def.id]?.look;
      const knight = (text: string): CineLine => ({ who: boss.def.name, text, look: bossLook, side: 'right' });
      const hero = (text: string): CineLine => ({ who: name, text, look: playerLook(), side: 'left' });
      const lines: CineLine[] = [
        knight('Passos… depois de tanto silêncio. Você tem cheiro de estrada — e das coisas que o mundo esqueceu.'),
        knight('Jurei guardar este coração de pedra até que o mundo terminasse de ser escrito. Ninguém passa. Ninguém… passa.'),
        hero('A estrada está se dobrando por sua causa. Caravanas sumiram. Saia do caminho.'),
        brasao
          ? knight('Esse brasão partido… era meu? Não. NÃO! Não me faça lembrar do que eu fui!')
          : knight('Então venha, viajante. Que a crônica decida qual de nós termina aqui.'),
      ];
      bus.emit('cinematic:dialogue', { lines, onDone: () => this.endBossIntro() });
    });
  }

  /** A estátua racha e o cavaleiro desperta. */
  private awakenBoss(boss: Enemy): void {
    if (!boss.dormant || boss.dead) return;
    boss.dormant = false;
    boss.view.setTint(boss.baseTint());
    boss.view.flash();
    boss.view.squash(0.25);
    this.time.delayedCall(140, () => !boss.dead && boss.view.swing('heavy', 0.55));
    this.fx.burst(boss.x, boss.y, 0x9a98a8, 14, 'shard', 34, 22);
    this.fx.explosion(boss.x, boss.y, 2.4, 0xb04aff);
    this.fx.pillar(boss.x, boss.y, 0xb48cff, 2, 900);
    this.fx.shake(0.012, 450);
    sfx.play('explosion');
  }

  private endBossIntro(): void {
    const c = this.cine;
    if (!c || c.finished) return;
    c.finished = true;
    for (const t of c.timers) t.remove(false);
    const boss = c.boss;
    if (boss.dormant) this.awakenBoss(boss);
    this.cine = null;
    this.cinematic = false;
    this.camFocus = null;
    input.reset();
    bus.emit('cinematic:end');
    if (!boss.dead && !this.player.dead) boss.engage(this, this.player);
  }

  /* ================================================================ laço principal */

  update(_time: number, deltaMs: number): void {
    const raw = Math.min(deltaMs / 1000, 0.05);
    if (!this.ready) return;
    this.timers.fps += raw;
    if (this.timers.fps > 1) {
      this.timers.fps = 0;
      game.fps = Math.round(this.game.loop.actualFps);
    }
    this.syncPause();
    if (game.paused) return;
    let dt = raw;
    if (this.hitStopT > 0) {
      this.hitStopT -= raw;
      dt = raw * 0.08;
      if (this.hitStopT <= 0) this.tweens.timeScale = 1;
    }
    this.now += dt;
    const p = this.player;

    if (this.cinematic) {
      p.view.update(dt);
      p.syncView();
      this.syncAttachments();
      const boss = this.cine?.boss;
      if (boss && !boss.dead) {
        boss.view.update(dt);
        boss.syncView();
      }
      for (const n of this.npcs.values()) n.update(0, this.grid, p, () => {});
      this.chunks.update(p.x, p.y, 0, 0, dt);
      this.updateCamera(raw);
      return;
    }

    game.tick(dt);
    if (!game.dead) this.updatePlayer(dt);

    // IA detalhada perto do jogador; longe dele, inimigos ociosos atualizam poucas vezes por segundo (GDD §15)
    for (const e of this.enemies) {
      if (e.state === 'idle' && e.team === 'enemy' && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) > 16) {
        e.lodAcc += dt;
        if (e.lodAcc < 0.35) continue;
        e.update(this, e.lodAcc);
        e.lodAcc = 0;
      } else {
        e.update(this, dt);
      }
    }
    this.separate();
    this.enemies = this.enemies.filter((e) => {
      if (e.dead) return false;
      // ecos e invocações perdidos muito longe somem
      if (!e.groupId && dist(e.x, e.y, p.x, p.y) > 40) {
        e.destroyNow();
        return false;
      }
      return true;
    });
    for (const pr of this.projectiles) pr.update(this, dt);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
    for (const n of this.npcs.values()) n.update(dt, this.grid, p, (text) => this.fx.label(n.x, n.y, text, '#f4e9c8'));
    for (const po of this.pois.values()) po.update(dt);
    this.chunks.update(p.x, p.y, p.vx, p.vy, dt);
    for (const cd of Object.values(game.cooldowns)) cd.left = Math.max(0, cd.left - dt);

    this.periodic(dt);
    this.updateCamera(raw);
  }

  private periodic(dt: number): void {
    const p = this.player;
    const t = this.timers;
    t.hint -= dt;
    if (t.hint <= 0) {
      t.hint = 0.12;
      this.updateHint();
    }
    t.reveal -= dt;
    if (t.reveal <= 0) {
      t.reveal = 0.25;
      if (game.fog.revealCircle(p.x, p.y, ENGINE.revealRadius)) this.mapDirty = true;
    }
    t.fogSave -= dt;
    if (t.fogSave <= 0) {
      t.fogSave = 1;
      if (this.mapDirty) {
        this.mapDirty = false;
        game.persistFog();
        bus.emit('map:changed');
      }
    }
    t.reach -= dt;
    if (t.reach <= 0) {
      t.reach = 0.3;
      game.quests.onReach(p.x, p.y);
      game.state.player.x = p.x;
      game.state.player.y = p.y;
      this.checkBoss();
    }
    t.area -= dt;
    if (t.area <= 0) {
      t.area = 0.5;
      const name = game.areaName(p.x, p.y);
      if (name !== this.lastArea) {
        const first = this.lastArea === '';
        this.lastArea = name;
        game.currentArea = name;
        bus.emit('area:entered', { name });
        const w = game.state.world;
        if (!w.visitedAreas.includes(name)) {
          w.visitedAreas.push(name);
          if (!first) game.gainXp(25);
        }
        const cx = AREA_CODEX[name];
        if (cx) game.unlockCodex(cx);
        if (!first && (name === 'Vila de Eldenor' || name === 'Valedouro')) void game.autosave('chegada');
      }
    }
    t.combat -= dt;
    if (t.combat <= 0) {
      t.combat = 0.4;
      for (const e of this.enemies) {
        if (e.team === 'enemy' && !e.dead && e.target === p && (e.state === 'chase' || e.state === 'windup' || e.state === 'special') && e.distTo(p) < 12) {
          game.markCombat();
          break;
        }
      }
    }
    t.ambient -= dt;
    if (t.ambient <= 0) {
      t.ambient = 0.35;
      this.ambient();
    }
    t.emit -= dt;
    if (t.emit <= 0) {
      t.emit = 0.12;
      this.emitters();
    }
    if (this.mouseActiveT > 0) this.mouseActiveT -= dt;
    if (this.manaWarnT > 0) this.manaWarnT -= dt;
    if (this.immuneLabelT > 0) this.immuneLabelT -= dt;
    if (this.statueHintT > 0) this.statueHintT -= dt;
  }

  /** O chefe adormecido desperta quando a missão chega até ele. */
  private checkBoss(): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.isBoss || !e.dormant || e.dead) continue;
      const d = e.distTo(p);
      if (game.quests.status('q_cavaleiro') === 'active' && d < 7.5) {
        this.startBossIntro(e);
      } else if (d < 4 && this.statueHintT <= 0) {
        this.statueHintT = 10;
        this.fx.label(e.x, e.y, 'Uma estátua de cavaleiro… os olhos ainda brilham.', '#c8c8e8');
      }
    }
  }

  /** Fumaça das chaminés, brasas das fogueiras e brilhos da fonte perto do jogador. */
  private emitters(): void {
    if (!game.settings.particles) return;
    const ps = toScreen(this.player.x, this.player.y);
    for (const em of this.chunks.emitters()) {
      if (Math.abs(em.x - ps.x) > 280 || Math.abs(em.y - ps.y) > 180) continue;
      if (em.kind === 'smoke') {
        if (Math.random() < 0.3) this.fx.smoke(em.x, em.y, em.depth);
      } else if (em.kind === 'fire') {
        if (Math.random() < 0.55) this.fx.ember(em.x, em.y, em.depth);
      } else if (Math.random() < 0.5) this.fx.sparkle(em.x, em.y, em.depth);
    }
  }

  private ambient(): void {
    if (!game.settings.particles) return;
    const p = this.player;
    const area = this.lastArea;
    const x = p.x + rand(-7, 7);
    const y = p.y + rand(-7, 7);
    const s = toScreen(x, y);
    const TOP = 1_500_000;
    const ADD = Phaser.BlendModes.ADD;
    if (area.startsWith('Floresta') || area === 'Clareira do Sino') {
      // vaga-lumes
      const f = this.add.image(s.x, s.y - 10, 'fx', 'mote').setScale(ART_SCALE * 0.7).setTint(0xd8ff7a).setBlendMode(ADD).setDepth(TOP).setAlpha(0);
      this.tweens.add({ targets: f, alpha: { from: 0, to: 0.9 }, y: s.y - 24, x: s.x + rand(-10, 10), duration: 1500, yoyo: true, onComplete: () => f.destroy() });
      // névoa baixa e raios de luz entre as árvores
      if (chance(0.22)) {
        const fog = this.add.image(s.x, s.y, 'fx', 'fog').setScale(ART_SCALE * rand(1, 1.6)).setTint(0xcfe6d8).setAlpha(0).setDepth(TOP - 10);
        this.tweens.add({ targets: fog, alpha: 0.22, x: s.x + 30, duration: 3500, yoyo: true, onComplete: () => fog.destroy() });
      }
      if (chance(0.08)) {
        const ray = this.add.image(s.x, s.y - 50, 'fx', 'ray').setScale(ART_SCALE * 1.2, ART_SCALE).setRotation(-0.35).setTint(0xfff0c0).setBlendMode(ADD).setAlpha(0).setDepth(TOP - 5);
        this.tweens.add({ targets: ray, alpha: 0.3, duration: 1800, yoyo: true, onComplete: () => ray.destroy() });
      }
    } else if (area === 'Ruínas Antigas') {
      // poeira arcana subindo
      const m = this.add.image(s.x, s.y - 4, 'fx', 'mote').setScale(ART_SCALE * 0.8).setTint(0xb48cff).setBlendMode(ADD).setDepth(TOP).setAlpha(0);
      this.tweens.add({ targets: m, alpha: { from: 0, to: 0.85 }, y: s.y - 40, duration: 2200, yoyo: false, onComplete: () => m.destroy() });
      if (chance(0.15)) {
        const fog = this.add.image(s.x, s.y, 'fx', 'fog').setScale(ART_SCALE * 1.4).setTint(0xb8a8d8).setAlpha(0).setDepth(TOP - 10);
        this.tweens.add({ targets: fog, alpha: 0.18, x: s.x - 24, duration: 3500, yoyo: true, onComplete: () => fog.destroy() });
      }
    } else if (area === 'Campos de Orvalho' || area === 'Valedouro') {
      const pt = this.add.image(s.x, s.y - 50, 'fx', 'petal').setScale(ART_SCALE).setTint(chance(0.5) ? 0xfff4c8 : 0xffc8dc).setDepth(TOP).setAlpha(0.9);
      this.tweens.add({ targets: pt, x: s.x + 40, y: s.y, angle: 300, alpha: 0, duration: 3000, onComplete: () => pt.destroy() });
    } else if (area === 'Lago de Orvalho') {
      this.fx.sparkle(s.x, s.y, TOP);
    } else if (chance(0.5)) {
      const l = this.add.image(s.x, s.y - 40, 'fx', 'leaf').setScale(ART_SCALE).setDepth(TOP).setAlpha(0.9);
      this.tweens.add({ targets: l, x: s.x + 30, y: s.y, angle: 220, alpha: 0, duration: 2600, onComplete: () => l.destroy() });
    }
  }

  private separate(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < min) {
          const push = (min - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          if (!a.isBoss && !a.def.stationary) a.move(this.grid, -nx * push, -ny * push);
          if (!b.isBoss && !b.def.stationary) b.move(this.grid, nx * push, ny * push);
        }
      }
    }
  }

  /* ================================================================ jogador */

  private updatePlayer(dt: number): void {
    const p = this.player;
    const d = game.derived;
    p.view.update(dt);
    p.tickStatus(dt);
    p.attackCd -= dt;
    p.dodgeCd -= dt;
    if (p.comboT > 0) p.comboT -= dt;
    if (p.guaranteedCrit > 0) p.guaranteedCrit -= dt;
    if (p.guardT > 0) p.guardT -= dt;
    if (p.barrierT > 0) {
      p.barrierT -= dt;
      if (p.barrierT <= 0 || p.barrier <= 0) endBarrier(this);
    }
    if (p.fury) {
      p.fury.t -= dt;
      if (p.fury.t <= 0) endFury(this);
    }
    const bx = p.x;
    const by = p.y;
    let vx = 0;
    let vy = 0;

    if (input.consume('dodge') && p.dodgeCd <= 0 && p.stunT <= 0 && p.dashT <= 0) {
      const dir = screenDirToWorld(input.moveX, input.moveY);
      const len = Math.hypot(dir.x, dir.y);
      p.dodgeDx = len > 0.1 ? dir.x / len : p.fx;
      p.dodgeDy = len > 0.1 ? dir.y / len : p.fy;
      p.dodgeT = 0.26;
      p.invulnT = 0.32;
      p.dodgeCd = 0.8;
      p.faceDir(p.dodgeDx, p.dodgeDy);
      sfx.play('swing');
      this.fx.dust(p.x, p.y, 3);
      this.ghost();
    }

    if (p.dodgeT > 0) {
      p.dodgeT -= dt;
      const sp = 8.5 * dt;
      p.move(this.grid, p.dodgeDx * sp, p.dodgeDy * sp);
      vx = p.dodgeDx * 8.5;
      vy = p.dodgeDy * 8.5;
      if (Math.random() < 0.5) this.ghost();
    } else if (p.dashT > 0) {
      p.dashT -= dt;
      const sp = 18 * dt;
      p.move(this.grid, p.dashDx * sp, p.dashDy * sp);
      vx = p.dashDx * 18;
      vy = p.dashDy * 18;
      this.ghost();
      if (Math.random() < 0.6) this.fx.dust(p.x, p.y, 1);
      for (const e of this.enemies) {
        if (e.dead || e.team !== 'enemy' || e.dormant || p.dashHit.has(e.uid)) continue;
        if (e.distTo(p) < e.radius + 0.9) {
          p.dashHit.add(e.uid);
          this.hitActor(e, p.dashPower, { source: p, knock: 0.5, stun: 0.7, crit: this.rollCrit() });
          this.hitStop(0.05);
        }
      }
      if (p.dashT <= 0 && p.dashShock) this.dashShockwave();
    } else {
      const dir = screenDirToWorld(input.moveX, input.moveY);
      const sp = d.speed * p.speedFactor;
      vx = dir.x * sp;
      vy = dir.y * sp;
      if (Math.abs(vx) + Math.abs(vy) > 0.01) {
        p.move(this.grid, vx * dt, vy * dt);
        if (p.attackCd < game.derived.attack.cooldown - 0.18) p.faceDir(dir.x, dir.y);
      } else {
        p.move(this.grid, 0, 0);
      }
    }
    // velocidade real (para a câmera antecipar só o que de fato andou)
    p.vx = dt > 0 ? (p.x - bx) / dt : 0;
    p.vy = dt > 0 ? (p.y - by) / dt : 0;
    if (Math.hypot(p.vx, p.vy) > 30) {
      p.vx = vx;
      p.vy = vy;
    }
    const moved = Math.hypot(p.x - bx, p.y - by) > 0.0005;
    p.view.setMoving(moved && p.dodgeT <= 0 && p.dashT <= 0, dt);
    if (moved) {
      p.stepT += dt;
      if (p.stepT > 0.32) {
        p.stepT = 0;
        sfx.play('step');
      }
    }

    // ações
    const tapAttack = input.consume('attack');
    if ((input.attackHeld || tapAttack) && p.attackCd <= 0 && p.dodgeT <= 0 && p.dashT <= 0 && p.stunT <= 0) this.playerAttack();
    for (let i = 0; i < 4; i++) if (input.consume(`skill${i}` as 'skill0')) this.castSkill(game.state.player.hotbar[i]);
    if (input.consume('potion')) game.quickPotion();
    if (input.consume('interact')) this.doInteract();

    p.syncView();
    this.syncAttachments();
  }

  /** Escudo e aura acompanham o jogador. */
  private syncAttachments(): void {
    const p = this.player;
    const s = toScreen(p.x, p.y);
    if (p.bubble) p.bubble.setPosition(s.x, s.y - 12).setDepth(p.view.root.depth + 1);
    if (p.furyAura) p.furyAura.setPosition(s.x, s.y - 2).setDepth(p.view.root.depth - 1);
  }

  /** Onda de choque no fim da investida (Investida Trovejante / Carga do Colosso). */
  private dashShockwave(): void {
    const p = this.player;
    const sh = p.dashShock;
    p.dashShock = null;
    if (!sh) return;
    this.fx.ring(p.x, p.y, sh.radius, 0xffe9a0, 380, 'shock');
    this.fx.ring(p.x, p.y, sh.radius * 0.6, 0xffffff, 260, 'shock');
    this.fx.burst(p.x, p.y, 0xffd8a0, 12, 'spark', sh.radius * 16, 6);
    this.fx.dust(p.x, p.y, 6);
    this.fx.shake(0.008, 220);
    sfx.play('explosion');
    let any = false;
    for (const e of enemiesIn(this, p.x, p.y, sh.radius)) {
      any = true;
      this.hitActor(e, sh.power, { knock: 0.7, stun: 0.6, source: p, crit: this.rollCrit() });
    }
    if (any) this.hitStop(0.07);
  }

  ghost(): void {
    const p = this.player;
    const b = p.view.body;
    const k = p.view.root.scaleX;
    const g = this.add
      .image(p.view.root.x + b.x * k, p.view.root.y + b.y * k, b.texture.key, b.frame.name)
      .setOrigin(b.originX, b.originY)
      .setFlipX(b.flipX)
      .setScale(k)
      .setTint(p.fury ? 0xff8a7a : 0x9ad8ff)
      .setAlpha(0.45)
      .setDepth(p.view.root.depth - 1);
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  rollCrit(): boolean {
    const p = this.player;
    if (p.guaranteedCrit > 0) {
      p.guaranteedCrit = 0;
      return true;
    }
    return Math.random() < game.derived.crit;
  }

  /** Mira automática: inimigo mais próximo, com preferência para quem está à frente. */
  autoTarget(range: number): Enemy | null {
    const p = this.player;
    if (this.mouseActiveT > 0 && input.aim) {
      let best: Enemy | null = null;
      let bd = 1.8;
      for (const e of this.enemies) {
        if (e.dead || e.team !== 'enemy' || e.dormant) continue;
        const d = dist(e.x, e.y, input.aim.x, input.aim.y);
        if (d < bd && e.distTo(p) <= range) {
          bd = d;
          best = e;
        }
      }
      return best;
    }
    if (!game.settings.autoAim) return null;
    let best: Enemy | null = null;
    let bs = Infinity;
    const fa = Math.atan2(p.fy, p.fx);
    for (const e of this.enemies) {
      if (e.dead || e.team !== 'enemy' || e.dormant) continue;
      const d = e.distTo(p);
      if (d > range) continue;
      if (!this.grid.lineOfSight(p.x, p.y, e.x, e.y) && d > 1.5) continue;
      const diff = angleDiff(Math.atan2(e.y - p.y, e.x - p.x), fa);
      const score = d + diff * 0.9;
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    return best;
  }

  aimDirection(target: Enemy | null): { x: number; y: number } {
    const p = this.player;
    if (target) {
      p.faceTo(target.x, target.y);
    } else if (this.mouseActiveT > 0 && input.aim) {
      p.faceTo(input.aim.x, input.aim.y);
    }
    return { x: p.fx, y: p.fy };
  }

  /** Ataque básico com combo de três golpes: o terceiro é mais forte, maior e empurra mais. */
  private playerAttack(): void {
    const p = this.player;
    const a = game.derived.attack;
    const spd = p.fury?.speed ?? 1;
    p.comboStep = p.comboT > 0 ? (p.comboStep + 1) % 3 : 0;
    const finisher = p.comboStep === 2;
    p.attackCd = (a.cooldown * (finisher ? 1.2 : 1)) / spd;
    p.comboT = p.attackCd + 0.55;
    const target = this.autoTarget(a.kind === 'melee' ? a.range + 1.8 : a.range + 1);
    const dir = this.aimDirection(target);
    const crit = this.rollCrit();
    const base = a.power * rand(0.9, 1.1) * (finisher ? 1.45 : 1);
    const sd = worldDirToScreen(dir.x, dir.y);
    const sAngle = Math.atan2(sd.y, sd.x);

    if (a.kind === 'melee') {
      const kind = (COMBOS[a.weaponType] ?? COMBOS.sword)[p.comboStep];
      const dur = Math.min(0.26, a.cooldown * 0.75) * (finisher ? 1.25 : 1);
      p.view.swing(kind, dur / spd);
      p.view.lunge(sd.x, sd.y, finisher ? 7 : 4);
      // passo à frente no golpe (se o alvo não estiver colado)
      if (!target || target.distTo(p) > a.range * 0.7) p.move(this.grid, dir.x * (finisher ? 0.2 : 0.09), dir.y * (finisher ? 0.2 : 0.09));
      sfx.play('swing');
      const range = a.range * (finisher ? 1.15 : 1);
      const arc = kind === 'spin' ? Math.PI * 2 : a.arc * (finisher ? 1.3 : 1);
      const big = a.weaponType === 'axe' || a.weaponType === 'mace';
      const color = crit ? 0xffe08a : p.fury ? 0xff9a8a : 0xffffff;
      const scale = (big ? 1.25 : a.weaponType === 'dagger' ? 0.85 : 1) * (finisher ? 1.25 : 1);
      if (kind === 'spin') this.fx.whirl(p.x, p.y, range + 0.2, color, 240);
      else {
        const style = kind === 'heavy' ? 'heavy' : kind === 'thrust' ? 'thrust' : a.weaponType === 'dagger' ? 'thin' : 'slash';
        this.fx.slash(p.x + dir.x * 0.7, p.y + dir.y * 0.7, sAngle, scale, color, style, kind === 'reverse');
      }
      if (finisher) this.fx.dust(p.x + dir.x * 0.5, p.y + dir.y * 0.5, 3);
      const fa = Math.atan2(dir.y, dir.x);
      let any = false;
      for (const e of this.enemies) {
        if (e.dead || e.team !== 'enemy' || e.dormant) continue;
        const d = e.distTo(p);
        if (d > range + e.radius) continue;
        if (d > 0.5 && angleDiff(Math.atan2(e.y - p.y, e.x - p.x), fa) > arc / 2) continue;
        this.hitActor(e, base, { crit, knock: (big ? 0.45 : 0.28) * (finisher ? 1.8 : 1), source: p });
        any = true;
      }
      if (any) {
        this.hitStop(finisher || crit ? 0.085 : 0.045);
        if (finisher) this.fx.shake(0.003, 90);
      }
    } else if (a.kind === 'arrow') {
      p.view.swing('ranged', 0.2 / spd);
      sfx.play('arrow');
      this.spawnProjectile({
        x: p.x + dir.x * 0.3, y: p.y + dir.y * 0.3, dx: dir.x, dy: dir.y, speed: finisher ? 17 : 14, range: a.range * (finisher ? 1.2 : 1),
        dmg: base, team: 'player', frame: 'arrow', crit, onHit: { kind: 'phys', knock: finisher ? 0.35 : 0.12 }, source: p,
        pierce: finisher, scale: finisher ? 1.4 : 1, trail: finisher ? 0xfff0c0 : undefined, tint: finisher ? 0xfff0c0 : undefined,
      });
      if (finisher) this.fx.glowAt(p.x + dir.x * 0.5, p.y + dir.y * 0.5, 0xfff0c0, 0.6, 200);
    } else {
      p.view.swing('cast', 0.2 / spd);
      sfx.play('magic');
      this.spawnProjectile({
        x: p.x + dir.x * 0.3, y: p.y + dir.y * 0.3, dx: dir.x, dy: dir.y, speed: finisher ? 9.5 : 11, range: a.range, dmg: base, team: 'player',
        frame: 'orb', homing: target, crit, onHit: { kind: 'magic' }, source: p, scale: finisher ? 1.6 : 1,
        burstRadius: finisher ? 1.2 : undefined, trail: finisher ? 0xc8b0ff : undefined, tint: finisher ? 0xd8c8ff : undefined,
      });
      if (finisher) this.fx.glowAt(p.x + dir.x * 0.5, p.y + dir.y * 0.5, 0xb8a8ff, 0.8, 220);
    }
  }

  private castSkill(id: string | null): void {
    if (!id) return;
    const def = SKILLS[id];
    const m = game.state.player.skills[id] ?? 0;
    if (!def || m <= 0) return;
    const p = this.player;
    if (p.stunT > 0 || p.dodgeT > 0 || p.dashT > 0) return;
    const cd = game.cooldowns[id];
    if (cd && cd.left > 0) {
      sfx.play('deny');
      return;
    }
    if (game.state.player.mp < def.mp) {
      if (this.manaWarnT <= 0) {
        this.manaWarnT = 1.5;
        this.fx.label(p.x, p.y, 'Mana insuficiente', '#9ab8ff');
      }
      sfx.play('deny');
      return;
    }
    const power = skillPower(def, m, game.derived);
    if (!performSkill(this, def, power, skillTier(def, m))) return;
    game.state.player.mp -= def.mp;
    const total = skillCooldown(def, m);
    game.cooldowns[id] = { left: total, total };
  }

  targetPoint(range: number): { x: number; y: number; target: Enemy | null } {
    const p = this.player;
    const t = this.autoTarget(range);
    if (t) {
      p.faceTo(t.x, t.y);
      return { x: t.x, y: t.y, target: t };
    }
    if (this.mouseActiveT > 0 && input.aim && dist(p.x, p.y, input.aim.x, input.aim.y) <= range) {
      p.faceTo(input.aim.x, input.aim.y);
      return { x: input.aim.x, y: input.aim.y, target: null };
    }
    return { x: p.x + p.fx * Math.min(4, range), y: p.y + p.fy * Math.min(4, range), target: null };
  }

  /* ================================================================ interação */

  private updateHint(): void {
    const p = this.player;
    let best: { poi: WorldPoi; label: string } | null = null;
    let bd = ENGINE.interactRange;
    for (const n of this.npcs.values()) {
      const d = dist(n.x, n.y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = { poi: { ...n.poi, x: n.x, y: n.y }, label: 'Falar' };
      }
    }
    for (const po of this.pois.values()) {
      const d = dist(po.poi.x, po.poi.y, p.x, p.y);
      if (d >= bd + 0.2) continue;
      const label = game.interactLabel(po.poi);
      if (!label) continue;
      bd = d;
      best = { poi: po.poi, label };
    }
    const prev = this.hint?.label ?? null;
    const prevId = this.hint?.poi.id ?? null;
    this.hint = best;
    if ((best?.label ?? null) !== prev || (best?.poi.id ?? null) !== prevId) bus.emit('interact:hint', { label: best?.label ?? null });
  }

  private doInteract(): void {
    if (!this.hint) return;
    const poi = this.hint.poi;
    sfx.play('click');
    if (poi.type === 'npc') {
      const n = this.npcs.get(poi.id);
      if (n) {
        n.faceTo(this.player.x, this.player.y);
        this.player.faceTo(n.x, n.y);
      }
    }
    game.interact(game.poi(poi.id) ?? poi);
    this.updateHint();
  }
}
