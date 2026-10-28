import type { WorldPoi } from '../core/types';
import { game } from '../game';
import type { WorldData } from '../world/WorldData';

/* Desenha o mapa (minimapa e mapa completo) na mesma projeção isométrica do jogo.
 * A base é uma imagem de 1 pixel por tile com a névoa aplicada; ela é redesenhada
 * só quando a névoa muda. */

export interface MapView {
  cx: number;
  cy: number;
  /** pixels de tela por tile */
  scale: number;
}

export interface MapFeature {
  kind: 'player' | 'waystone' | 'quest' | 'marker' | 'npc' | 'area';
  x: number;
  y: number;
  label: string;
  id?: string;
  active?: boolean;
}

export class MapRenderer {
  private base: HTMLCanvasElement;
  private fogVersion = -1;
  private palette: [number, number, number][];

  constructor(private world: WorldData) {
    const m = world.manifest;
    this.base = document.createElement('canvas');
    this.base.width = m.width;
    this.base.height = m.height;
    this.palette = m.overviewPalette.map((hex) => {
      const v = hex.replace('#', '');
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    });
  }

  private rebuild(): void {
    const m = this.world.manifest;
    const fog = game.fog;
    if (fog.version === this.fogVersion) return;
    this.fogVersion = fog.version;
    const ctx = this.base.getContext('2d')!;
    const img = ctx.createImageData(m.width, m.height);
    const ov = this.world.overview();
    const d = img.data;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const i = y * m.width + x;
        const o = i * 4;
        if (!fog.isRevealed(x, y)) {
          const n = ((x * 7 + y * 13) % 5) * 2;
          d[o] = 16 + n;
          d[o + 1] = 22 + n;
          d[o + 2] = 38 + n;
          d[o + 3] = 255;
          continue;
        }
        const [r, g, b] = this.palette[ov[i]] ?? [255, 0, 255];
        // leve sombreamento para dar relevo
        const shade = (x + y) % 2 === 0 ? 1 : 0.94;
        d[o] = r * shade;
        d[o + 1] = g * shade;
        d[o + 2] = b * shade;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Projeção mundo → tela para uma vista. */
  project(v: MapView, w: number, h: number, x: number, y: number): { x: number; y: number } {
    const s = v.scale;
    return { x: w / 2 + (x - v.cx - (y - v.cy)) * s * 0.7071, y: h / 2 + (x - v.cx + (y - v.cy)) * s * 0.3536 };
  }

  unproject(v: MapView, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
    const s = v.scale;
    const a = (sx - w / 2) / (s * 0.7071);
    const b = (sy - h / 2) / (s * 0.3536);
    return { x: v.cx + (a + b) / 2, y: v.cy + (b - a) / 2 };
  }

  features(): MapFeature[] {
    const out: MapFeature[] = [];
    const st = game.state;
    const fog = game.fog;
    for (const p of this.world.manifest.pois) {
      if (p.type === 'waystone' && (fog.isRevealed(p.x, p.y) || st.world.waystonesActive.includes(p.id))) {
        out.push({ kind: 'waystone', x: p.x, y: p.y, label: p.name ?? 'Pedra-guia', id: p.id, active: st.world.waystonesActive.includes(p.id) });
      }
      if (p.type === 'npc' && fog.isRevealed(p.x, p.y)) {
        const mk = game.quests.npcMarker(p.id);
        if (mk) out.push({ kind: 'npc', x: p.x, y: p.y, label: mk, id: p.id });
      }
    }
    for (const a of this.world.manifest.areas) {
      if (fog.isRevealed(a.x, a.y) && !out.some((f) => f.kind === 'area' && f.label === a.name)) {
        out.push({ kind: 'area', x: a.x, y: a.y, label: a.name, id: a.id });
      }
    }
    for (const id of game.quests.active()) {
      const m = game.quests.marker(id);
      if (m) out.push({ kind: 'quest', x: m.x, y: m.y, label: game.questName(id), id, active: st.tracked === id });
    }
    for (const mk of st.world.markers) out.push({ kind: 'marker', x: mk.x, y: mk.y, label: mk.note || 'Marcador', id: mk.id });
    return out;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, v: MapView, opts: { player: { x: number; y: number; fx: number; fy: number }; labels?: boolean; circle?: boolean; selected?: string | null }): void {
    this.rebuild();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0f1c';
    ctx.fillRect(0, 0, w, h);
    if (opts.circle) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    // base isométrica
    const s = v.scale;
    const a = s * 0.7071;
    const b = s * 0.3536;
    const o = this.project(v, w, h, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(a, b, -a, b, o.x, o.y);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // elementos
    const feats = this.features();
    const small = s < 3;
    for (const f of feats) {
      const p = this.project(v, w, h, f.x, f.y);
      if (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) continue;
      switch (f.kind) {
        case 'area':
          if (opts.labels && s >= 1.6) {
            ctx.font = `600 ${Math.round(Math.min(15, 9 + s))}px Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(5,8,15,0.85)';
            ctx.strokeText(f.label, p.x, p.y);
            ctx.fillStyle = '#f0dca0';
            ctx.fillText(f.label, p.x, p.y);
          }
          break;
        case 'waystone': {
          const r = small ? 3.5 : 6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - r * 1.4);
          ctx.lineTo(p.x + r, p.y);
          ctx.lineTo(p.x, p.y + r * 1.4);
          ctx.lineTo(p.x - r, p.y);
          ctx.closePath();
          ctx.fillStyle = f.active ? '#7cf0ff' : '#6a7486';
          ctx.fill();
          ctx.lineWidth = opts.selected === f.id ? 3 : 1.5;
          ctx.strokeStyle = opts.selected === f.id ? '#ffffff' : '#0a0f1c';
          ctx.stroke();
          break;
        }
        case 'npc': {
          const r = small ? 4 : 7;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = f.label === '?' ? '#8ad8ff' : '#ffd23a';
          ctx.fill();
          ctx.strokeStyle = '#1b1a24';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#1b1a24';
          ctx.font = `800 ${small ? 7 : 10}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(f.label, p.x, p.y + 0.5);
          ctx.textBaseline = 'alphabetic';
          break;
        }
        case 'quest': {
          const r = small ? 4 : 7;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-r, -r * 1.6);
          ctx.arc(0, -r * 1.7, r, Math.PI, 0);
          ctx.closePath();
          ctx.fillStyle = f.active ? '#e8c66a' : 'rgba(232,198,106,0.55)';
          ctx.fill();
          ctx.strokeStyle = '#1b1408';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'marker': {
          const r = small ? 3.5 : 6;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-r, -r * 1.6);
          ctx.arc(0, -r * 1.7, r, Math.PI, 0);
          ctx.closePath();
          ctx.fillStyle = opts.selected === f.id ? '#ffffff' : '#ff6b6b';
          ctx.fill();
          ctx.strokeStyle = '#1b1a24';
          ctx.stroke();
          ctx.restore();
          break;
        }
      }
    }
    // jogador
    const pp = this.project(v, w, h, opts.player.x, opts.player.y);
    const dir = this.project(v, w, h, opts.player.x + opts.player.fx, opts.player.y + opts.player.fy);
    const ang = Math.atan2(dir.y - pp.y, dir.x - pp.x);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(ang);
    const r = small ? 5 : 8;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.7, -r * 0.65);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.7, r * 0.65);
    ctx.closePath();
    ctx.fillStyle = '#ffe9a0';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1b1408';
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  /** Elemento clicável mais próximo de um ponto da tela. */
  pick(v: MapView, w: number, h: number, sx: number, sy: number): MapFeature | null {
    let best: MapFeature | null = null;
    let bd = 22;
    for (const f of this.features()) {
      if (f.kind === 'area') continue;
      const p = this.project(v, w, h, f.x, f.y);
      const d = Math.hypot(p.x - sx, p.y - (sy + (f.kind === 'quest' || f.kind === 'marker' ? 8 : 0)));
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }
}

export function poiName(p: WorldPoi): string {
  return p.name ?? p.id;
}
