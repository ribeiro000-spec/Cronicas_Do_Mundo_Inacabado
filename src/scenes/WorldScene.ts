import * as Phaser from 'phaser';
import { BALANCE, ENGINE } from '../config';
import { bus } from '../core/events';
import { input } from '../core/input';
import { screenDirToWorld, toScreen, toWorld, worldDirToScreen } from '../core/iso';
import type { SkillDef, WorldPoi } from '../core/types';
import { angleDiff, chance, clamp, dist, rand, randInt } from '../core/util';
import { SKILLS } from '../data/skills';
import { Actor } from '../entities/Actor';
import type { HitOpts, ProjectileSpec, WorldCtx } from '../entities/ctx';
import { Enemy } from '../entities/Enemy';
import { Npc } from '../entities/Npc';
import { Player } from '../entities/Player';
import { PoiSprite } from '../entities/PoiSprite';
import { Projectile } from '../entities/Projectile';
import { game, type SceneApi } from '../game';
import { Fx } from '../render/Fx';
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
  private groupDeadAt = new Map<string, number>();
  private hint: { poi: WorldPoi; label: string } | null = null;
  private timers = { hint: 0, reveal: 0, area: 0, reach: 0, combat: 0, ambient: 0, fogSave: 0, fps: 0 };
  private mapDirty = false;
  private lastArea = '';
  private mouseActiveT = 0;
  private manaWarnT = 0;
  private unsub: (() => void)[] = [];

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
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0b1220');
    cam.setRoundPixels(true);
    cam.startFollow(this.player.view.root, true, 0.2, 0.2);
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
    this.setupPointer();

    game.scene = this;
    game.running = true;
    this.unsub.push(
      bus.on('quest:changed', () => this.refreshMarkers()),
      bus.on('state:changed', () => this.applyZoom()),
    );
    this.events.once('shutdown', () => this.cleanup());
    bus.emit('travel:start');
    void this.chunks.ensureArea(st.x, st.y).then(() => {
      this.placePlayerSafely();
      this.ready = true;
      cam.centerOn(this.player.view.root.x, this.player.view.root.y);
      bus.emit('travel:end');
      this.lastArea = '';
    });
  }

  private cleanup(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    game.scene = null;
    game.running = false;
    this.chunks.destroy();
  }

  applyZoom(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const auto = clamp(Math.round(Math.min(w, h) / 210), 2, 5);
    const z = game.settings.zoom > 0 ? game.settings.zoom : auto;
    if (this.cameras.main.zoom !== z) this.cameras.main.setZoom(z);
  }

  private setupPointer(): void {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const w = toWorld(wp.x, wp.y + 8);
      input.aim = w;
      this.mouseActiveT = 2.5;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch || p.button !== 0) return;
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

  /* ================================================================ chunks */

  private onChunkLoad(c: LoadedChunk): void {
    const CS = this.world.manifest.chunkSize;
    for (const s of c.data.s) {
      const deadAt = this.groupDeadAt.get(s.id);
      if (deadAt !== undefined && this.now - deadAt < BALANCE.respawnSeconds) continue;
      if (this.enemies.some((e) => e.groupId === s.id && !e.dead)) continue;
      for (let k = 0; k < s.n; k++) {
        const pos = this.grid.nearestFree(s.x + rand(-1.2, 1.2), s.y + rand(-1.2, 1.2), 0.35, 3);
        if (pos) this.spawnEnemy(s.e, pos.x, pos.y, s.lv, { groupId: s.id });
      }
      this.groupDeadAt.delete(s.id);
    }
    for (const poi of this.world.manifest.pois) {
      if (Math.floor(poi.x / CS) !== c.cx || Math.floor(poi.y / CS) !== c.cy) continue;
      if (poi.type === 'npc') {
        if (!this.npcs.has(poi.id)) this.npcs.set(poi.id, new Npc(this, poi));
      } else if (poi.type === 'boss') {
        if (!game.state.world.bosses.includes(poi.id) && !this.enemies.some((e) => e.groupId === 'boss:' + poi.id && !e.dead)) {
          this.spawnEnemy(poi.enemy ?? 'cavaleiro_sem_brasao', poi.x, poi.y, 6, { groupId: 'boss:' + poi.id });
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

  spawnEnemy(defId: string, x: number, y: number, level: number, opts: { team?: 'enemy' | 'ally'; tag?: string; groupId?: string; life?: number } = {}): Enemy | null {
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
    const fromPlayerSide = !opts.source || opts.source === this.player || (opts.source instanceof Enemy && opts.source.team === 'ally');
    let dmg = amount * (opts.crit ? game.derived.critMult : 1);
    dmg = mitigate(dmg, e.armor);
    if (e.team === 'ally' && fromPlayerSide) return;
    e.hp -= dmg;
    e.lastHitAt = this.now;
    e.showBar();
    if (!opts.silent) {
      e.view.flash();
      const color = opts.crit ? 0xffd23a : opts.kind === 'fire' ? 0xff8a3a : opts.kind === 'magic' ? 0xa8c8ff : 0xffffff;
      this.fx.number(e.x, e.y, String(Math.round(dmg)), color, !!opts.crit);
      sfx.play('hit');
      if (opts.crit) this.fx.burst(e.x, e.y, 0xffe08a, 5, 'spark', 12, 12);
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
    if (game.dead || p.dead) return;
    if (p.invulnT > 0) {
      if (p.dodgeT > 0 || p.dashT > 0) this.fx.label(p.x, p.y, 'Esquiva!', '#bfe3ff');
      return;
    }
    let dmg = mitigate(amount * rand(0.92, 1.08), game.derived.armor);
    if (p.barrier > 0) {
      const absorbed = Math.min(p.barrier, dmg);
      p.barrier -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0) this.fx.number(p.x, p.y, String(Math.round(absorbed)), 0xffe9a0);
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
    this.tweens.add({ targets: p.view.root, angle: 90, alpha: 0.4, duration: 500, ease: 'Quad.easeIn' });
    for (const e of this.enemies) if (e.team === 'enemy' && e.state !== 'idle') e.state = 'return';
    bus.emit('boss:update', null);
    game.onPlayerDeath();
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    e.destroyView(this);
    if (e.team !== 'enemy') return;
    const def = e.def;
    const xp = Math.round(def.xp * (0.85 + 0.15 * e.level));
    if (xp > 0) {
      game.gainXp(xp);
      this.time.delayedCall(180, () => this.fx.number(e.x, e.y - 0.4, `+${xp}XP`, 0xb48cff));
    }
    const gold = Math.round(randInt(def.gold[0], def.gold[1]) * (1 + 0.1 * (e.level - 1)));
    if (gold > 0) game.addGold(gold);
    for (const l of def.loot) {
      if (chance(l.chance)) game.giveItem(l.id, randInt(l.min ?? 1, l.max ?? 1));
    }
    game.quests.onKill(def.id);
    if (e.isBoss) {
      game.state.world.bosses.push('boss_cavaleiro');
      bus.emit('boss:update', null);
      this.fx.explosion(e.x, e.y, 3, 0xb48cff);
      this.fx.shake(0.012, 500);
      game.toast(`${def.name} caiu. A estrada se aquieta.`, 'good');
      for (const o of this.enemies) if (o.tag === 'eco' && !o.dead) this.killEnemy(o);
      this.time.delayedCall(6000, () => void game.autosave('chefe'));
    } else {
      this.fx.burst(e.x, e.y, 0xffffff, 5, 'dot', 10, 8);
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
    await new Promise((r) => this.time.delayedCall(220, r));
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
    cam.centerOn(this.player.view.root.x, this.player.view.root.y);
    cam.fadeIn(260, 11, 18, 32);
    game.state.player.x = this.player.x;
    game.state.player.y = this.player.y;
  }

  rebuildPlayer(): void {
    this.player?.rebuild();
  }

  async resetWorld(): Promise<void> {
    this.ready = false;
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
    p.view.root.setAngle(0).setAlpha(1);
    p.dead = false;
    p.barrier = 0;
    p.barrierT = 0;
    p.bubble?.destroy();
    p.bubble = null;
    p.x = game.state.player.x;
    p.y = game.state.player.y;
    p.rebuild();
    await this.chunks.ensureArea(p.x, p.y);
    this.placePlayerSafely();
    this.cameras.main.centerOn(p.view.root.x, p.view.root.y);
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

  /* ================================================================ laço principal */

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (!this.ready) return;
    this.timers.fps += dt;
    if (this.timers.fps > 1) {
      this.timers.fps = 0;
      game.fps = Math.round(this.game.loop.actualFps);
    }
    if (game.paused) return;
    this.now += dt;
    game.tick(dt);
    const p = this.player;
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
    if (this.mouseActiveT > 0) this.mouseActiveT -= dt;
    if (this.manaWarnT > 0) this.manaWarnT -= dt;
  }

  private ambient(): void {
    if (!game.settings.particles) return;
    const p = this.player;
    const area = this.lastArea;
    const x = p.x + rand(-7, 7);
    const y = p.y + rand(-7, 7);
    const s = toScreen(x, y);
    if (area.startsWith('Floresta') || area === 'Clareira do Sino') {
      const f = this.add.image(s.x, s.y - 10, 'fx', 'dot').setTint(0xd8ff7a).setBlendMode(Phaser.BlendModes.ADD).setDepth(1_500_000).setAlpha(0);
      this.tweens.add({ targets: f, alpha: { from: 0, to: 0.9 }, y: s.y - 22, x: s.x + rand(-8, 8), duration: 1400, yoyo: true, onComplete: () => f.destroy() });
    } else if (chance(0.5)) {
      const l = this.add.image(s.x, s.y - 40, 'fx', 'leaf').setDepth(1_500_000).setAlpha(0.9);
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
          if (!a.isBoss) a.move(this.grid, -nx * push, -ny * push);
          if (!b.isBoss) b.move(this.grid, nx * push, ny * push);
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
    if (p.guaranteedCrit > 0) p.guaranteedCrit -= dt;
    if (p.barrierT > 0) {
      p.barrierT -= dt;
      if (p.barrierT <= 0 || p.barrier <= 0) {
        p.barrier = 0;
        p.bubble?.destroy();
        p.bubble = null;
      }
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
      sfx.play('swing');
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
      for (const e of this.enemies) {
        if (e.dead || e.team !== 'enemy' || p.dashHit.has(e.uid)) continue;
        if (e.distTo(p) < e.radius + 0.9) {
          p.dashHit.add(e.uid);
          this.hitActor(e, p.dashPower, { source: p, knock: 0.5, stun: 0.7, crit: this.rollCrit() });
        }
      }
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
    p.vx = vx;
    p.vy = vy;
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

    if (p.bubble) {
      const s = toScreen(p.x, p.y);
      p.bubble.setPosition(s.x, s.y - 12).setDepth(p.view.root.depth + 1);
    }
    p.syncView();
  }

  private ghost(): void {
    const p = this.player;
    const b = p.view.body;
    const g = this.add
      .image(p.view.root.x, p.view.root.y + b.y, b.texture.key, b.frame.name)
      .setOrigin(b.originX, b.originY)
      .setFlipX(b.flipX)
      .setScale(p.view.scale)
      .setTint(0x9ad8ff)
      .setAlpha(0.45)
      .setDepth(p.view.root.depth - 1);
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  private rollCrit(): boolean {
    const p = this.player;
    if (p.guaranteedCrit > 0) {
      p.guaranteedCrit = 0;
      return true;
    }
    return Math.random() < game.derived.crit;
  }

  /** Mira automática: inimigo mais próximo, com preferência para quem está à frente. */
  private autoTarget(range: number): Enemy | null {
    const p = this.player;
    if (this.mouseActiveT > 0 && input.aim) {
      let best: Enemy | null = null;
      let bd = 1.8;
      for (const e of this.enemies) {
        if (e.dead || e.team !== 'enemy') continue;
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
      if (e.dead || e.team !== 'enemy') continue;
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

  private aimDirection(target: Enemy | null): { x: number; y: number } {
    const p = this.player;
    if (target) {
      p.faceTo(target.x, target.y);
    } else if (this.mouseActiveT > 0 && input.aim) {
      p.faceTo(input.aim.x, input.aim.y);
    }
    return { x: p.fx, y: p.fy };
  }

  private playerAttack(): void {
    const p = this.player;
    const a = game.derived.attack;
    p.attackCd = a.cooldown;
    const target = this.autoTarget(a.kind === 'melee' ? a.range + 1.8 : a.range + 1);
    const dir = this.aimDirection(target);
    const crit = this.rollCrit();
    const base = a.power * rand(0.9, 1.1);
    if (a.kind === 'melee') {
      p.view.swing('melee', Math.min(0.22, a.cooldown * 0.6));
      sfx.play('swing');
      const sd = worldDirToScreen(dir.x, dir.y);
      this.fx.slash(p.x + dir.x * 0.7, p.y + dir.y * 0.7, Math.atan2(sd.y, sd.x), a.weaponType === 'axe' ? 1.3 : 1);
      const fa = Math.atan2(dir.y, dir.x);
      for (const e of this.enemies) {
        if (e.dead || e.team !== 'enemy') continue;
        const d = e.distTo(p);
        if (d > a.range + e.radius) continue;
        if (d > 0.5 && angleDiff(Math.atan2(e.y - p.y, e.x - p.x), fa) > a.arc / 2) continue;
        this.hitActor(e, base, { crit, knock: a.weaponType === 'axe' ? 0.45 : 0.28, source: p });
      }
    } else {
      p.view.swing(a.kind === 'arrow' ? 'ranged' : 'cast', 0.2);
      sfx.play(a.kind === 'arrow' ? 'arrow' : 'magic');
      this.spawnProjectile({
        x: p.x + dir.x * 0.3,
        y: p.y + dir.y * 0.3,
        dx: dir.x,
        dy: dir.y,
        speed: a.kind === 'arrow' ? 14 : 11,
        range: a.range,
        dmg: base,
        team: 'player',
        frame: a.kind === 'arrow' ? 'arrow' : 'orb',
        homing: a.kind === 'orb' ? target : null,
        crit,
        onHit: { kind: a.kind === 'orb' ? 'magic' : 'phys' },
        source: p,
      });
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
    if (!this.performSkill(def, power)) return;
    game.state.player.mp -= def.mp;
    const total = skillCooldown(def, m);
    game.cooldowns[id] = { left: total, total };
  }

  private targetPoint(range: number): { x: number; y: number; target: Enemy | null } {
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

  private performSkill(def: SkillDef, power: number): boolean {
    const p = this.player;
    const crit = this.rollCrit();
    switch (def.kind) {
      case 'spin': {
        const r = def.radius ?? 1.9;
        p.view.swing('spin', 0.3);
        sfx.play('swing');
        this.fx.ring(p.x, p.y, r, 0xffd0a0, 300);
        for (const e of this.enemies) {
          if (e.dead || e.team !== 'enemy') continue;
          if (e.distTo(p) <= r + e.radius) this.hitActor(e, power, { crit, knock: 0.5, source: p });
        }
        return true;
      }
      case 'dash': {
        const t = this.autoTarget(def.range ?? 4.5);
        const dir = this.aimDirection(t);
        p.dashDx = dir.x;
        p.dashDy = dir.y;
        p.dashT = (def.range ?? 4.5) / 18;
        p.dashHit.clear();
        p.dashPower = power;
        p.invulnT = p.dashT + 0.05;
        sfx.play('swing');
        return true;
      }
      case 'bolt': {
        const t = this.autoTarget(def.range ?? 8);
        const dir = this.aimDirection(t);
        p.view.swing('cast', 0.2);
        sfx.play('magic');
        this.spawnProjectile({
          x: p.x, y: p.y, dx: dir.x, dy: dir.y, speed: 11, range: def.range ?? 8, dmg: power, team: 'player', frame: 'orb',
          tint: 0xb8d0ff, homing: t, crit, onHit: { kind: 'magic' }, source: p,
        });
        return true;
      }
      case 'rune': {
        const tp = this.targetPoint(def.range ?? 7);
        const r = def.radius ?? 2;
        p.view.swing('cast', 0.3);
        sfx.play('magic');
        this.fx.telegraph(tp.x, tp.y, r, 0x7aa8ff, 0.6, 'rune');
        this.time.delayedCall(600, () => {
          sfx.play('explosion');
          this.fx.explosion(tp.x, tp.y, r, 0x7aa8ff);
          for (const e of this.enemies) {
            if (e.dead || e.team !== 'enemy') continue;
            if (dist(e.x, e.y, tp.x, tp.y) <= r + e.radius) this.hitActor(e, power, { crit, kind: 'magic', knock: 0.3, source: p });
          }
        });
        return true;
      }
      case 'pierce': {
        const t = this.autoTarget(def.range ?? 10);
        const dir = this.aimDirection(t);
        p.view.swing('ranged', 0.2);
        sfx.play('arrow');
        this.spawnProjectile({
          x: p.x, y: p.y, dx: dir.x, dy: dir.y, speed: 17, range: def.range ?? 10, dmg: power, team: 'player', frame: 'arrow',
          tint: 0xd8ffa8, pierce: true, crit, source: p,
        });
        return true;
      }
      case 'heal': {
        const st = game.state.player;
        const amount = Math.round(15 + power * 1.6);
        st.hp = Math.min(game.derived.maxHp, st.hp + amount);
        game.regen = { perSec: (power * 1.2) / (def.duration ?? 4), left: def.duration ?? 4 };
        this.fx.heal(p.x, p.y);
        this.fx.number(p.x, p.y, `+${amount}`, 0x7dff9a);
        sfx.play('heal');
        return true;
      }
      case 'roots': {
        const tp = this.targetPoint(def.range ?? 6);
        const r = def.radius ?? 2.5;
        sfx.play('magic');
        this.fx.ring(tp.x, tp.y, r, 0x6adf7a, 400);
        for (const e of this.enemies) {
          if (e.dead || e.team !== 'enemy') continue;
          if (dist(e.x, e.y, tp.x, tp.y) > r + e.radius) continue;
          this.hitActor(e, power, { crit, kind: 'magic', root: def.duration ?? 2.5, source: p });
          const s = toScreen(e.x, e.y);
          const img = this.add.image(s.x, s.y + 2, 'fx', 'roots').setOrigin(0.5, 1).setDepth(e.view.root.depth + 1);
          this.tweens.add({ targets: img, alpha: 0, delay: (def.duration ?? 2.5) * 1000 - 300, duration: 300, onComplete: () => img.destroy() });
        }
        return true;
      }
      case 'summon': {
        for (const e of this.enemies) if (e.team === 'ally' && !e.dead) e.life = 0.01;
        const ally = this.spawnEnemy('lobo_espiritual', p.x + p.fx, p.y + p.fy, game.state.player.level, { team: 'ally', life: def.duration ?? 20 });
        if (ally) {
          ally.dmg = 6 + power * 0.6;
          ally.maxHp = Math.round(60 + power * 3);
          ally.hp = ally.maxHp;
          this.fx.burst(ally.x, ally.y, 0x7cf0ff, 12);
        }
        sfx.play('magic');
        return !!ally;
      }
      case 'blink': {
        const t = this.autoTarget(def.range ?? 6);
        if (!t) {
          this.fx.label(p.x, p.y, 'Sem alvo', '#c8c8e8');
          return false;
        }
        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const pos = this.grid.nearestFree(t.x + (dx / d) * 0.9, t.y + (dy / d) * 0.9, p.radius, 2);
        if (!pos) return false;
        this.fx.burst(p.x, p.y, 0x9a7aff, 10);
        p.x = pos.x;
        p.y = pos.y;
        p.faceTo(t.x, t.y);
        p.guaranteedCrit = 3;
        p.invulnT = 0.3;
        this.fx.burst(p.x, p.y, 0x9a7aff, 10);
        sfx.play('magic');
        return true;
      }
      case 'barrier': {
        p.barrier = Math.round(20 + power * 2.2);
        p.barrierT = def.duration ?? 6;
        if (!p.bubble) {
          p.bubble = this.add.image(0, 0, 'fx', 'bubble').setAlpha(0.8);
          this.tweens.add({ targets: p.bubble, alpha: { from: 0.55, to: 0.85 }, duration: 400, yoyo: true, repeat: -1 });
        }
        this.fx.label(p.x, p.y, `Barreira ${p.barrier}`, '#ffe9a0');
        sfx.play('heal');
        return true;
      }
      case 'bomb': {
        const tp = this.targetPoint(def.range ?? 6);
        p.view.swing('ranged', 0.2);
        sfx.play('swing');
        this.spawnProjectile({
          x: p.x, y: p.y, dx: 0, dy: 0, speed: 9, range: 99, dmg: power, team: 'player', frame: 'bomb', crit, source: p,
          lob: { tx: tp.x, ty: tp.y, radius: def.radius ?? 1.8, burn: { t: 3, dps: power * 0.15 } },
        });
        this.time.delayedCall(Math.max(250, (dist(p.x, p.y, tp.x, tp.y) / 9) * 1000), () => sfx.play('explosion'));
        return true;
      }
    }
    return false;
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
