import { toScreen } from '../core/iso';
import type { SkillDef } from '../core/types';
import { dist, rand } from '../core/util';
import type { Enemy } from '../entities/Enemy';
import { game } from '../game';
import { ART_SCALE } from '../render/registerArt';
import type { WorldScene } from '../scenes/WorldScene';
import { sfx } from '../systems/sfx';

/* Execução das habilidades do jogador. Cada habilidade tem três estágios (tier 0, 1 e 2,
 * liberados nos níveis de maestria 3 e 5): o estágio muda a aparência e o efeito —
 * mais lobos e com outra cor, mais projéteis, áreas maiores, efeitos extras. */

const TIER_TINT = [0xffffff, 0xc8e0ff, 0xffd24a];

/** Inimigos vivos (time inimigo, acordados) dentro de um raio. */
export function enemiesIn(w: WorldScene, x: number, y: number, r: number): Enemy[] {
  const out: Enemy[] = [];
  for (const e of w.enemies) {
    if (e.dead || e.team !== 'enemy' || e.dormant) continue;
    if (dist(e.x, e.y, x, y) <= r + e.radius) out.push(e);
  }
  return out;
}

/** Inimigos mais próximos de um ponto, do mais perto ao mais longe. */
function nearest(w: WorldScene, x: number, y: number, range: number, skip: Set<number> = new Set()): Enemy[] {
  return w.enemies
    .filter((e) => !e.dead && e.team === 'enemy' && !e.dormant && !skip.has(e.uid) && dist(e.x, e.y, x, y) <= range)
    .sort((a, b) => dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y));
}

/** Segundo ponto de impacto: outro inimigo perto do primeiro, ou um ponto ao lado. */
function secondSpot(w: WorldScene, x: number, y: number, main: Enemy | null): { x: number; y: number } {
  const skip = new Set<number>(main ? [main.uid] : []);
  const other = nearest(w, x, y, 5, skip)[0];
  if (other) return { x: other.x, y: other.y };
  const a = rand(0, Math.PI * 2);
  return { x: x + Math.cos(a) * 1.8, y: y + Math.sin(a) * 1.8 };
}

export function performSkill(w: WorldScene, def: SkillDef, power: number, tier: number): boolean {
  const p = w.player;
  const crit = w.rollCrit();
  const at = (ms: number, fn: () => void) => w.time.delayedCall(ms, fn);
  switch (def.kind) {
    /* ------------------------------------------------------------ marcial */
    case 'spin': {
      const spins = tier + 1;
      const r = (def.radius ?? 1.9) * [1, 1.2, 1.38][tier];
      const color = [0xffd0a0, 0xbfe6ff, 0xffd24a][tier];
      for (let k = 0; k < spins; k++) {
        at(k * 250, () => {
          if (p.dead) return;
          p.view.swing('spin', 0.24);
          sfx.play('swing');
          w.fx.whirl(p.x, p.y, r, color, 260, 1, k % 2 === 1);
          if (tier >= 1) w.fx.ring(p.x, p.y, r * 1.05, 0xe8f6ff, 320, 'shock');
          let any = false;
          for (const e of enemiesIn(w, p.x, p.y, r)) {
            if (tier === 2 && !e.isBoss) {
              const d = e.distTo(p) || 1;
              e.knockX += ((p.x - e.x) / d) * 0.3;
              e.knockY += ((p.y - e.y) / d) * 0.3;
            }
            w.hitActor(e, power * (k === spins - 1 && tier > 0 ? 1.15 : 1), { crit: k === 0 ? crit : w.rollCrit(), knock: tier === 2 ? 0 : 0.5, source: p });
            any = true;
          }
          if (any) w.hitStop(0.05);
        });
      }
      return true;
    }
    case 'dash': {
      const range = (def.range ?? 4.5) * (tier === 2 ? 1.4 : 1);
      const t = w.autoTarget(range);
      const dir = w.aimDirection(t);
      p.dashDx = dir.x;
      p.dashDy = dir.y;
      p.dashT = range / 18;
      p.dashHit.clear();
      p.dashPower = power;
      p.invulnT = p.dashT + 0.08;
      p.dashShock = tier > 0 ? { power: power * (tier === 2 ? 1.2 : 0.75), radius: tier === 2 ? 2.8 : 2 } : null;
      p.view.swing('thrust', 0.25);
      w.fx.dust(p.x, p.y, 5);
      if (tier > 0) w.fx.glowAt(p.x, p.y, tier === 2 ? 0xffd24a : 0x9cd8ff, 1.2, 260);
      sfx.play('swing');
      return true;
    }
    case 'quake': {
      const range = def.range ?? 5;
      const t = w.autoTarget(range);
      const dir = w.aimDirection(t);
      const base = Math.atan2(dir.y, dir.x);
      const angles = tier === 0 ? [base] : tier === 1 ? [base - 0.5, base, base + 0.5] : Array.from({ length: 8 }, (_, i) => base + (i * Math.PI) / 4);
      const len = tier === 2 ? range * 0.85 : range;
      const color = tier === 2 ? 0xff9a50 : tier === 1 ? 0xc89a60 : 0xb08a5a;
      const hit = new Set<number>();
      p.view.swing('heavy', 0.3);
      sfx.play('explosion');
      w.fx.shake(tier === 2 ? 0.009 : 0.006, 260);
      w.fx.ring(p.x, p.y, 1.1, 0xd8b080, 260, 'shock');
      for (const a of angles) {
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        let i = 0;
        for (let s = 0.8; s <= len; s += 0.6, i++) {
          const px = p.x + cx * s;
          const py = p.y + cy * s;
          if (w.grid.hasObject(Math.floor(px), Math.floor(py))) break;
          at(i * 45, () => {
            w.fx.crack(px, py, color, tier === 2);
            for (const e of enemiesIn(w, px, py, 0.75)) {
              if (hit.has(e.uid)) continue;
              hit.add(e.uid);
              w.hitActor(e, power, { crit, knock: 0.25, slow: { t: 2, f: 0.5 }, stun: tier === 2 ? 0.8 : undefined, source: p });
            }
          });
        }
      }
      return true;
    }
    /* ------------------------------------------------------------ arcana */
    case 'bolt': {
      const range = def.range ?? 8;
      const t = w.autoTarget(range);
      const dir = w.aimDirection(t);
      p.view.swing('cast', 0.22);
      sfx.play('magic');
      w.fx.glowAt(p.x + dir.x * 0.4, p.y + dir.y * 0.4, tier === 2 ? 0xc89aff : 0x9ab8ff, 0.9, 220);
      if (tier === 2) {
        w.spawnProjectile({
          x: p.x, y: p.y, dx: dir.x, dy: dir.y, speed: 8.5, range, dmg: power * 1.9, team: 'player', frame: 'orb_dark', tint: 0xe0c8ff,
          homing: t, crit, onHit: { kind: 'magic', knock: 0.4 }, source: p, scale: 2.2, trail: 0xb48cff, burstRadius: 1.8,
        });
        return true;
      }
      const n = tier === 1 ? 3 : 1;
      const targets = t ? [t, ...nearest(w, p.x, p.y, range, new Set([t.uid]))] : [];
      const base = Math.atan2(dir.y, dir.x);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.32;
        w.spawnProjectile({
          x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), speed: 11, range, dmg: power * (n > 1 ? 0.8 : 1), team: 'player', frame: 'orb',
          tint: tier === 1 ? 0xd0c0ff : 0xb8d0ff, homing: targets[i] ?? t, crit, onHit: { kind: 'magic' }, source: p, scale: tier === 1 ? 1.15 : 1,
        });
      }
      return true;
    }
    case 'rune': {
      const tp = w.targetPoint(def.range ?? 7);
      let r = def.radius ?? 2.1;
      let mult = 1;
      let stun: number | undefined;
      let color = 0x7aa8ff;
      const spots = [{ x: tp.x, y: tp.y }];
      if (tier === 1) spots.push(secondSpot(w, tp.x, tp.y, tp.target));
      if (tier === 2) {
        r *= 1.6;
        mult = 1.35;
        stun = 1.2;
        color = 0xc08aff;
      }
      p.view.swing('cast', 0.3);
      sfx.play('magic');
      spots.forEach((sp, i) => {
        const delay = 650 + i * 300;
        w.fx.telegraph(sp.x, sp.y, r, color, delay / 1000, 'rune');
        at(delay, () => {
          sfx.play('explosion');
          w.fx.explosion(sp.x, sp.y, r, color);
          if (tier === 2) {
            w.fx.pillar(sp.x, sp.y, color, 2.2, 650);
            w.fx.shake(0.008, 220);
          }
          for (const e of enemiesIn(w, sp.x, sp.y, r)) w.hitActor(e, power * mult, { crit, kind: 'magic', knock: 0.3, stun, source: p });
        });
      });
      return true;
    }
    case 'chain': {
      const range = def.range ?? 7;
      const first = w.autoTarget(range);
      if (!first) {
        w.fx.label(p.x, p.y, 'Sem alvo', '#c8c8e8');
        return false;
      }
      w.aimDirection(first);
      const jumps = [3, 5, 7][tier];
      const chain: Enemy[] = [first];
      const seen = new Set<number>([first.uid]);
      while (chain.length < jumps) {
        const last = chain[chain.length - 1];
        const next = nearest(w, last.x, last.y, 3.8, seen)[0];
        if (!next) break;
        chain.push(next);
        seen.add(next.uid);
      }
      p.view.swing('cast', 0.25);
      sfx.play('magic');
      const color = tier === 2 ? 0xfff07a : tier === 1 ? 0xbfe8ff : 0x9cd8ff;
      w.fx.glowAt(p.x, p.y, color, 1, 260);
      chain.forEach((e, i) => {
        const src = i === 0 ? { x: p.x, y: p.y } : { x: chain[i - 1].x, y: chain[i - 1].y };
        at(i * 75, () => {
          if (e.dead) return;
          w.fx.lightning(src.x, src.y, e.x, e.y, color);
          if (tier > 0) w.fx.lightning(src.x, src.y, e.x, e.y, 0xffffff);
          w.fx.impact(e.x, e.y, color, i === 0 && crit);
          w.hitActor(e, power * Math.pow(0.88, i), { crit: i === 0 && crit, kind: 'magic', stun: tier === 2 ? 0.5 : undefined, source: p, light: true });
        });
      });
      return true;
    }
    /* ------------------------------------------------------------ precisão */
    case 'pierce': {
      const range = def.range ?? 10;
      const t = w.autoTarget(range);
      const dir = w.aimDirection(t);
      p.view.swing('ranged', 0.22);
      sfx.play('arrow');
      const n = tier > 0 ? 3 : 1;
      const base = Math.atan2(dir.y, dir.x);
      const tint = tier === 2 ? 0xfff07a : tier === 1 ? 0xc8ffe8 : 0xd8ffa8;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.2;
        w.spawnProjectile({
          x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), speed: 18, range, dmg: power * (n > 1 ? 0.85 : 1), team: 'player', frame: 'arrow',
          tint, pierce: true, crit, source: p, scale: tier > 0 ? 1.3 : 1.15, trail: tint, chain: tier === 2 ? 1 : undefined,
        });
      }
      return true;
    }
    case 'rain': {
      const tp = w.targetPoint(def.range ?? 8);
      const r = (def.radius ?? 2.2) * (tier === 2 ? 1.35 : 1);
      const dur = (def.duration ?? 1.6) * (tier === 2 ? 1.5 : 1);
      const fire = tier >= 1;
      p.view.swing('ranged', 0.25);
      sfx.play('arrow');
      w.fx.telegraph(tp.x, tp.y, r, fire ? 0xff9a40 : 0xd8ffa8, dur + 0.3, 'disk');
      const ticks = Math.round(dur / 0.2);
      for (let k = 0; k < ticks; k++) {
        at(250 + k * 200, () => {
          const n = tier === 2 ? 7 : 5;
          for (let j = 0; j < n; j++) {
            const a = rand(0, Math.PI * 2);
            const d = r * Math.sqrt(Math.random());
            w.fx.fallingArrow(tp.x + Math.cos(a) * d, tp.y + Math.sin(a) * d, fire ? 0xffc080 : 0xffffff, fire && j % 2 === 0);
          }
          if (k % 2 === 0) sfx.play('arrow');
          for (const e of enemiesIn(w, tp.x, tp.y, r)) {
            w.hitActor(e, power, { knock: 0.04, burn: fire ? { t: 2, dps: power * 0.5 } : undefined, source: p, light: true });
          }
        });
      }
      return true;
    }
    /* ------------------------------------------------------------ natureza */
    case 'heal': {
      const st = game.state.player;
      const mult = tier === 0 ? 1 : 1.4;
      const amount = Math.round((15 + power * 1.6) * mult);
      st.hp = Math.min(game.derived.maxHp, st.hp + amount);
      const dur = (def.duration ?? 4) * (tier > 0 ? 1.5 : 1);
      game.regen = { perSec: (power * 1.2 * mult) / dur, left: dur };
      w.fx.heal(p.x, p.y);
      w.fx.number(p.x, p.y, `+${amount}`, 0x7dff9a);
      if (tier > 0) {
        w.fx.rise(p.x, p.y, 'petal', 0xffb0d8, 10, false);
        w.fx.pillar(p.x, p.y, 0x7dff9a, 1, 600);
      }
      if (tier === 2) {
        p.guardT = 6;
        p.guardF = 0.7;
        w.fx.label(p.x, p.y, 'Bênção da Floresta', '#9dffb0');
      }
      sfx.play('heal');
      return true;
    }
    case 'roots': {
      const tp = w.targetPoint(def.range ?? 6);
      const r = (def.radius ?? 2.5) * (tier === 2 ? 1.35 : 1);
      const dur = (def.duration ?? 2.5) + (tier === 2 ? 1.5 : 0);
      const mult = tier === 2 ? 2 : 1;
      p.view.swing('cast', 0.3);
      sfx.play('magic');
      w.fx.ring(tp.x, tp.y, r, 0x6adf7a, 420);
      w.fx.burst(tp.x, tp.y, 0x8adf6a, 10, 'leaf', r * 18, 4);
      const tint = tier === 2 ? 0xffe0a0 : tier === 1 ? 0xd8c8a0 : 0xffffff;
      const plant = (x: number, y: number, depth: number, k: number) => {
        const s = toScreen(x, y);
        const img = w.add.image(s.x, s.y + 2, 'fx', 'roots').setOrigin(0.5, 1).setScale(ART_SCALE * k, 0).setTint(tint).setDepth(depth);
        w.tweens.add({ targets: img, scaleY: ART_SCALE * k, duration: 160, ease: 'Back.easeOut' });
        w.tweens.add({ targets: img, alpha: 0, delay: dur * 1000 - 300, duration: 300, onComplete: () => img.destroy() });
      };
      // raízes decorativas pela área
      for (let i = 0; i < 3 + tier * 2; i++) {
        const a = rand(0, Math.PI * 2);
        const d = r * Math.sqrt(Math.random()) * 0.9;
        const x = tp.x + Math.cos(a) * d;
        const y = tp.y + Math.sin(a) * d;
        plant(x, y, (x + y) * 8 + 2, 0.7);
      }
      const caught = enemiesIn(w, tp.x, tp.y, r);
      for (const e of caught) {
        w.hitActor(e, power * mult, { crit, kind: 'magic', root: dur, source: p });
        plant(e.x, e.y, e.view.root.depth + 1, tier === 2 ? 1.3 : 1);
      }
      if (tier >= 1) {
        const ticks = Math.floor(dur / 0.5);
        for (let k = 1; k <= ticks; k++) {
          at(k * 500, () => {
            for (const e of caught) {
              if (e.dead || e.rootT <= 0) continue;
              w.hitActor(e, power * 0.35 * mult, { kind: 'phys', source: p, light: true });
              w.fx.burst(e.x, e.y, 0xc8e08a, 3, 'leaf', 10, 6);
            }
          });
        }
      }
      return true;
    }
    case 'frost': {
      const r = (def.radius ?? 2.4) * (tier === 2 ? 1.35 : 1);
      const dur = def.duration ?? 3;
      p.view.swing('cast', 0.3);
      sfx.play('magic');
      w.fx.ring(p.x, p.y, r, 0xbfe8ff, 420, 'shock');
      w.fx.ring(p.x, p.y, r * 0.6, 0xffffff, 300, 'shock');
      w.fx.burst(p.x, p.y, 0xd8f4ff, 14, 'spark', r * 16, 6);
      const spikes = 8 + tier * 6;
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2 + rand(-0.2, 0.2);
        const d = r * rand(0.55, 1);
        at(i * 12, () => w.fx.iceSpike(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, tier === 2 ? 1200 : 800));
      }
      const caught = enemiesIn(w, p.x, p.y, r);
      for (const e of caught) {
        w.hitActor(e, power, { crit, kind: 'magic', slow: { t: dur, f: 0.45 }, stun: tier >= 1 ? 1.4 : undefined, source: p });
        if (tier >= 1 && !e.dead) {
          e.view.setTint(0x9ad8ff);
          w.fx.iceSpike(e.x, e.y, 1300);
          at(1400 * (e.isBoss ? 0.3 : 1), () => !e.dead && e.view.setTint(e.baseTint()));
        }
      }
      if (tier === 2) {
        at(1200, () => {
          let any = false;
          for (const e of caught) {
            if (e.dead) continue;
            any = true;
            w.fx.burst(e.x, e.y, 0xe0f8ff, 8, 'shard', 22, 10);
            w.hitActor(e, power * 0.8, { kind: 'magic', source: p });
          }
          if (any) sfx.play('explosion');
        });
      }
      return true;
    }
    /* ------------------------------------------------------------ invocação */
    case 'summon': {
      for (const e of w.enemies) if (e.team === 'ally' && !e.dead && e.tag === 'lobo') e.life = 0.01;
      const lvl = game.state.player.level;
      const life = def.duration ?? 20;
      const list = tier === 0 ? ['lobo_espiritual'] : tier === 1 ? ['lobo_matilha', 'lobo_matilha'] : ['lobo_alfa', 'lobo_matilha', 'lobo_matilha'];
      const colors: Record<string, number> = { lobo_espiritual: 0x7cf0ff, lobo_matilha: 0xa890ff, lobo_alfa: 0xfff0b0 };
      const face = Math.atan2(p.fy, p.fx);
      let made = 0;
      list.forEach((id, i) => {
        const a = face + (i - (list.length - 1) / 2) * 1.1;
        const ally = w.spawnEnemy(id, p.x + Math.cos(a) * 1.3, p.y + Math.sin(a) * 1.3, lvl, { team: 'ally', life, tag: 'lobo' });
        if (!ally) return;
        made++;
        const k = id === 'lobo_alfa' ? 1.6 : id === 'lobo_matilha' ? 1.15 : 1;
        ally.dmg = (6 + power * 0.6) * k;
        ally.maxHp = Math.round((60 + power * 3) * k);
        ally.hp = ally.maxHp;
        w.fx.pillar(ally.x, ally.y, colors[id], id === 'lobo_alfa' ? 1.6 : 1, 650);
        w.fx.burst(ally.x, ally.y, colors[id], 12);
      });
      if (tier === 2) {
        w.fx.label(p.x, p.y, 'Uivo celestial!', '#fff0b0');
        w.fx.shake(0.004, 200);
      }
      sfx.play('magic');
      return made > 0;
    }
    case 'turret': {
      for (const e of w.enemies) if (e.team === 'ally' && !e.dead && e.tag === 'sentinela') e.life = 0.01;
      const n = tier + 1;
      const face = Math.atan2(p.fy, p.fx);
      let made = 0;
      for (let i = 0; i < n; i++) {
        const a = face + (n === 1 ? 0 : (i - (n - 1) / 2) * 1.4);
        const ally = w.spawnEnemy('sentinela', p.x + Math.cos(a) * 1.4, p.y + Math.sin(a) * 1.4, game.state.player.level, { team: 'ally', life: def.duration ?? 14, tag: 'sentinela' });
        if (!ally) continue;
        made++;
        ally.dmg = 4 + power * 0.55;
        ally.maxHp = Math.round(50 + power * 3);
        ally.hp = ally.maxHp;
        if (tier === 2) ally.cdMul = 0.6;
        w.fx.pillar(ally.x, ally.y, tier === 2 ? 0xffe08a : 0x7ab8ff, 1, 600);
        w.fx.ring(ally.x, ally.y, 0.9, 0x9ad0ff, 360, 'shock');
      }
      sfx.play('magic');
      return made > 0;
    }
    /* ------------------------------------------------------------ sombras */
    case 'blink': {
      const range = def.range ?? 6;
      const hops = [1, 2, 4][tier];
      const first = w.autoTarget(range);
      if (!first) {
        w.fx.label(p.x, p.y, 'Sem alvo', '#c8c8e8');
        return false;
      }
      const seen = new Set<number>();
      p.invulnT = Math.max(p.invulnT, hops * 0.16 + 0.3);
      const hop = (target: Enemy, k: number) => {
        if (target.dead || p.dead) return finish();
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const pos = w.grid.nearestFree(target.x + (dx / d) * 0.9, target.y + (dy / d) * 0.9, p.radius, 2);
        if (!pos) return finish();
        w.ghost();
        w.fx.burst(p.x, p.y, 0x9a7aff, 10);
        p.x = pos.x;
        p.y = pos.y;
        p.faceTo(target.x, target.y);
        p.syncView();
        w.fx.burst(p.x, p.y, 0x9a7aff, 10);
        sfx.play('magic');
        seen.add(target.uid);
        if (tier > 0) {
          p.view.swing('reverse', 0.18);
          const s1 = toScreen(p.x, p.y);
          const s2 = toScreen(target.x, target.y);
          w.fx.slash(target.x, target.y, Math.atan2(s2.y - s1.y, s2.x - s1.x), 1, 0xb48cff, 'thin', k % 2 === 1);
          w.hitActor(target, power, { crit: true, source: p });
        }
        const next = nearest(w, target.x, target.y, 4.5, seen)[0];
        if (k + 1 < hops && next) at(150, () => hop(next, k + 1));
        else finish();
      };
      const finish = () => {
        p.guaranteedCrit = 3;
      };
      hop(first, 0);
      return true;
    }
    case 'fan': {
      const range = def.range ?? 7;
      const t = w.autoTarget(range);
      const dir = w.aimDirection(t);
      const n = [3, 5, 8][tier];
      const spread = tier === 1 ? 1.1 : 0.6;
      const base = Math.atan2(dir.y, dir.x);
      p.view.swing('reverse', 0.22);
      sfx.play('swing');
      for (let i = 0; i < n; i++) {
        const a = tier === 2 ? base + (i * Math.PI * 2) / n : base + (i / (n - 1) - 0.5) * spread;
        w.spawnProjectile({
          x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), speed: 14, range, dmg: power, team: 'player', frame: 'dagger',
          tint: tier === 2 ? 0xe0b0ff : 0xb48cff, crit, source: p, trail: tier === 2 ? 0xc08aff : 0x8a6ab0, scale: 1.1 + tier * 0.12, pierce: tier === 2,
        });
      }
      return true;
    }
    /* ------------------------------------------------------------ proteção */
    case 'barrier': {
      p.barrier = Math.round((20 + power * 2.2) * (tier > 0 ? 1.2 : 1));
      p.barrierT = def.duration ?? 6;
      p.barrierReflect = tier >= 1 ? 0.4 : 0;
      p.barrierBurst = tier === 2 ? power * 1.6 : 0;
      if (!p.bubble) {
        p.bubble = w.add.image(0, 0, 'fx', 'bubble').setScale(ART_SCALE).setAlpha(0.8);
        w.tweens.add({ targets: p.bubble, alpha: { from: 0.55, to: 0.85 }, duration: 400, yoyo: true, repeat: -1 });
      }
      p.bubble.setTint(TIER_TINT[tier]).setScale(ART_SCALE * (tier === 2 ? 1.15 : 1));
      w.fx.ring(p.x, p.y, 1.3, tier === 2 ? 0xffd24a : 0xffe9a0, 380, 'shock');
      if (tier === 2) w.fx.pillar(p.x, p.y, 0xffd24a, 1, 600);
      w.fx.label(p.x, p.y, `${tier === 0 ? 'Barreira' : tier === 1 ? 'Égide' : 'Égide Radiante'} ${p.barrier}`, '#ffe9a0');
      sfx.play('heal');
      return true;
    }
    case 'hammer': {
      const tp = w.targetPoint(def.range ?? 7);
      const r = (def.radius ?? 1.4) * (tier === 2 ? 1.6 : 1);
      const size = tier === 2 ? 1.7 : 1;
      const spots = [{ x: tp.x, y: tp.y }];
      if (tier === 1) spots.push(secondSpot(w, tp.x, tp.y, tp.target));
      p.view.swing('cast', 0.3);
      sfx.play('magic');
      spots.forEach((sp, i) => {
        w.fx.telegraph(sp.x, sp.y, r, 0xffe08a, 0.32 + i * 0.32, 'disk');
        at(i * 320, () =>
          w.fx.dropHammer(sp.x, sp.y, size, tier === 2 ? 0xfff0b0 : 0xffe08a, () => {
            sfx.play('explosion');
            w.fx.shake(tier === 2 ? 0.01 : 0.006, 200);
            let any = false;
            for (const e of enemiesIn(w, sp.x, sp.y, r)) {
              any = true;
              w.hitActor(e, power * (tier === 2 ? 1.3 : 1), { crit, kind: 'magic', stun: 1.2, knock: 0.3, source: p });
            }
            if (any) w.hitStop(0.06);
            if (tier === 2) {
              const st = game.state.player;
              const heal = Math.round(power * 0.8);
              st.hp = Math.min(game.derived.maxHp, st.hp + heal);
              w.fx.heal(p.x, p.y);
              w.fx.number(p.x, p.y, `+${heal}`, 0x7dff9a);
            }
          }),
        );
      });
      return true;
    }
    /* ------------------------------------------------------------ alquimia */
    case 'bomb': {
      const range = def.range ?? 6;
      const tp = w.targetPoint(range);
      const radius = def.radius ?? 1.8;
      p.view.swing('ranged', 0.2);
      sfx.play('swing');
      const throwAt = (tx: number, ty: number, dmg: number, rad: number, scale: number) => {
        w.spawnProjectile({
          x: p.x, y: p.y, dx: 0, dy: 0, speed: 9, range: 99, dmg, team: 'player', frame: 'bomb', crit, source: p, scale,
          lob: { tx, ty, radius: rad, burn: { t: 3, dps: power * 0.15 } },
        });
        at(Math.max(250, (dist(p.x, p.y, tx, ty) / 9) * 1000), () => sfx.play('explosion'));
      };
      if (tier === 0) throwAt(tp.x, tp.y, power, radius, 1);
      else if (tier === 1) {
        const a = Math.atan2(tp.y - p.y, tp.x - p.x) + Math.PI / 2;
        throwAt(tp.x, tp.y, power * 0.75, radius * 0.85, 1);
        throwAt(tp.x + Math.cos(a) * 1.4, tp.y + Math.sin(a) * 1.4, power * 0.75, radius * 0.85, 1);
        throwAt(tp.x - Math.cos(a) * 1.4, tp.y - Math.sin(a) * 1.4, power * 0.75, radius * 0.85, 1);
      } else {
        const big = radius * 1.6;
        throwAt(tp.x, tp.y, power * 1.5, big, 1.7);
        const land = Math.max(250, (dist(p.x, p.y, tp.x, tp.y) / 9) * 1000);
        at(land, () => {
          w.fx.shake(0.01, 260);
          w.fx.pillar(tp.x, tp.y, 0xffb040, 2.4, 700);
        });
        // chão em chamas
        for (let k = 0; k < 9; k++) {
          at(land + 150 + k * 350, () => {
            for (let j = 0; j < 4; j++) {
              const a = rand(0, Math.PI * 2);
              const d = big * Math.sqrt(Math.random());
              w.fx.flame(tp.x + Math.cos(a) * d, tp.y + Math.sin(a) * d, 650);
            }
            for (const e of enemiesIn(w, tp.x, tp.y, big)) w.hitActor(e, power * 0.22, { kind: 'fire', burn: { t: 2, dps: power * 0.2 }, source: p, light: true });
          });
        }
      }
      return true;
    }
    case 'buff': {
      const dur = (def.duration ?? 8) * (tier === 2 ? 1.4 : 1);
      p.fury = { t: dur, speed: tier === 2 ? 1.45 : 1.35, dmg: tier === 2 ? 1.3 : 1.2, leech: tier >= 1 ? 0.1 : 0, titan: tier === 2 };
      const color = tier === 2 ? 0xffb030 : tier === 1 ? 0xff3060 : 0xff5040;
      if (!p.furyAura) {
        p.furyAura = w.fx.attached('glow', color).setAlpha(0.55);
        w.tweens.add({ targets: p.furyAura, alpha: { from: 0.35, to: 0.65 }, duration: 300, yoyo: true, repeat: -1 });
      }
      p.furyAura.setTint(color).setScale(ART_SCALE * (tier === 2 ? 1.4 : 1.1), ART_SCALE * (tier === 2 ? 0.9 : 0.7));
      if (p.fury.titan) w.tweens.add({ targets: p.view.root, scale: ART_SCALE * 1.25, duration: 300, ease: 'Back.easeOut' });
      w.fx.ring(p.x, p.y, 1.5, color, 380, 'shock');
      w.fx.rise(p.x, p.y, 'mote', color, 10, true);
      w.fx.label(p.x, p.y, tier === 2 ? 'Força do Titã!' : 'Fúria!', '#ffb0a0');
      sfx.play('magic');
      return true;
    }
  }
  return false;
}

/** Fim da fúria: tira a aura e volta ao tamanho normal. */
export function endFury(w: WorldScene): void {
  const p = w.player;
  if (p.fury?.titan) w.tweens.add({ targets: p.view.root, scale: ART_SCALE * p.view.scale, duration: 300 });
  p.fury = null;
  if (p.furyAura) {
    w.tweens.killTweensOf(p.furyAura);
    p.furyAura.destroy();
    p.furyAura = null;
  }
}

/** Fim da barreira: a Égide Radiante explode em luz. */
export function endBarrier(w: WorldScene): void {
  const p = w.player;
  const burst = p.barrierBurst;
  p.barrier = 0;
  p.barrierT = 0;
  p.barrierReflect = 0;
  p.barrierBurst = 0;
  if (p.bubble) {
    w.tweens.killTweensOf(p.bubble);
    p.bubble.destroy();
    p.bubble = null;
  }
  if (burst > 0 && !p.dead) {
    w.fx.explosion(p.x, p.y, 2.2, 0xffe08a);
    w.fx.pillar(p.x, p.y, 0xffd24a, 1.6, 600);
    sfx.play('explosion');
    for (const e of enemiesIn(w, p.x, p.y, 2.2)) w.hitActor(e, burst, { kind: 'magic', knock: 0.6, source: p });
  }
}
