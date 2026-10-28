import { bus } from '../../core/events';
import { clamp, uid } from '../../core/util';
import { game } from '../../game';
import { h } from '../dom';
import { MapRenderer, type MapFeature, type MapView } from '../mapRender';
import type { PanelCtx } from '../Menu';
import { promptBox } from '../modal';

/* Mapa completo: arrastar para mover, pinça/roda para zoom, toque para selecionar.
 * Distingue locais descobertos de pontos de viagem ativados (GDD §11). */

let view: MapView | null = null;

export function renderMap(el: HTMLElement, ctx: PanelCtx): () => void {
  const renderer = new MapRenderer(ctx.world);
  const scene = game.scene as unknown as { player: { x: number; y: number; fx: number; fy: number } } | null;
  const pl = scene?.player ?? { x: game.state.player.x, y: game.state.player.y, fx: 1, fy: 0 };
  const focus = ctx.arg as { x: number; y: number } | undefined;
  if (!view || focus) view = { cx: focus?.x ?? pl.x, cy: focus?.y ?? pl.y, scale: view?.scale ?? 3 };
  const v = view;

  const canvas = h('canvas') as HTMLCanvasElement;
  const wrap = h('div', { class: 'map-wrap' }, canvas);
  wrap.style.height = 'calc(100% - 0px)';
  let selected: MapFeature | null = null;
  let markerMode = false;
  const card = h('div', { class: 'map-card panel hidden' });
  const markBtn = h('button', { class: 'icon-btn', title: 'Adicionar marcador' }, '📍');

  const w = game.state.world;
  const totalWs = ctx.world.manifest.pois.filter((p) => p.type === 'waystone').length;
  const stats = h(
    'div',
    { class: 'map-stats' },
    h('div', null, `Explorado: ${Math.round(game.fog.revealedFraction() * 100)}%`),
    h('div', null, `Pedras-guia ativas: ${w.waystonesActive.length}/${totalWs}`),
    h('div', null, `Fragmentos de mapa: ${w.fragments.length}/${ctx.world.manifest.mapFragments.length}`),
  );
  const legend = h(
    'div',
    { class: 'map-legend' },
    h('div', null, h('span', { style: 'color:#7cf0ff' }, '◆'), ' Pedra-guia ativada (viagem rápida)'),
    h('div', null, h('span', { style: 'color:#6a7486' }, '◆'), ' Descoberta, ainda não ativada'),
    h('div', null, h('span', { style: 'color:#e8c66a' }, '⬤'), ' Objetivo de missão · ', h('span', { style: 'color:#ff6b6b' }, '⬤'), ' Seu marcador'),
  );
  const tools = h(
    'div',
    { class: 'map-tools' },
    h('button', { class: 'icon-btn', title: 'Aproximar', onclick: () => zoom(1.3) }, '+'),
    h('button', { class: 'icon-btn', title: 'Afastar', onclick: () => zoom(1 / 1.3) }, '−'),
    h('button', { class: 'icon-btn', title: 'Centralizar em você', onclick: () => ((v.cx = pl.x), (v.cy = pl.y), draw()) }, '⌖'),
    markBtn,
  );
  markBtn.onclick = () => {
    markerMode = !markerMode;
    markBtn.style.borderColor = markerMode ? 'var(--gold)' : '';
    markBtn.style.background = markerMode ? 'rgba(232,198,106,.25)' : '';
    if (markerMode) game.toast('Toque no mapa para colocar um marcador.', 'info');
  };
  wrap.append(stats, legend, tools, card);
  el.appendChild(wrap);

  const fit = () => {
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(10, Math.round(r.width * dpr));
    canvas.height = Math.max(10, Math.round(r.height * dpr));
    draw();
  };

  const draw = () => {
    const c = canvas.getContext('2d');
    if (!c) return;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const vv: MapView = { cx: v.cx, cy: v.cy, scale: v.scale * dpr };
    renderer.draw(c, canvas.width, canvas.height, vv, { player: pl, labels: true, selected: selected?.id ?? null });
  };

  const zoom = (f: number, sx?: number, sy?: number) => {
    const r = canvas.getBoundingClientRect();
    const px = sx ?? r.width / 2;
    const py = sy ?? r.height / 2;
    const before = renderer.unproject(v, r.width, r.height, px, py);
    v.scale = clamp(v.scale * f, 1, 14);
    const after = renderer.unproject(v, r.width, r.height, px, py);
    v.cx += before.x - after.x;
    v.cy += before.y - after.y;
    draw();
  };

  const showCard = (f: MapFeature | null) => {
    selected = f;
    card.innerHTML = '';
    if (!f) {
      card.classList.add('hidden');
      draw();
      return;
    }
    card.classList.remove('hidden');
    const title = h('div', { class: 'mc-title' }, f.kind === 'npc' ? (f.label === '?' ? 'Missão para entregar' : 'Missão disponível') : f.label);
    const body = h('div', { class: 'muted', style: 'font-size:13px;margin:4px 0 8px' });
    const actions = h('div', { class: 'row', style: 'flex-wrap:wrap' });
    if (f.kind === 'waystone') {
      body.textContent = f.active ? 'Ponto de viagem ativado. Viajar recupera vida e mana.' : 'Descoberto no mapa, mas ainda não ativado. Visite-o e toque nele para ativar.';
      if (f.active) {
        actions.appendChild(
          h(
            'button',
            {
              class: 'btn primary small',
              onclick: async () => {
                ctx.close();
                await game.travelTo(f.id!);
              },
            },
            '✨ Viajar',
          ),
        );
      }
    } else if (f.kind === 'quest') {
      body.textContent = game.quests.stepLabel(f.id!);
      actions.appendChild(h('button', { class: 'btn small', onclick: () => ((game.state.tracked = f.id!), bus.emit('quest:changed', { id: f.id! }), showCard(f)) }, game.state.tracked === f.id ? 'Rastreando' : 'Rastrear'));
      actions.appendChild(h('button', { class: 'btn small ghost', onclick: () => ctx.goTab('missoes', f.id) }, 'Ver missão'));
    } else if (f.kind === 'marker') {
      body.textContent = 'Seu marcador pessoal.';
      actions.appendChild(
        h(
          'button',
          {
            class: 'btn small',
            onclick: async () => {
              const mk = game.state.world.markers.find((m) => m.id === f.id);
              if (!mk) return;
              const note = await promptBox('Editar marcador', 'Anotação', mk.note);
              if (note !== null) mk.note = note;
              showCard(null);
            },
          },
          'Editar',
        ),
      );
      actions.appendChild(
        h(
          'button',
          {
            class: 'btn small danger',
            onclick: () => {
              game.state.world.markers = game.state.world.markers.filter((m) => m.id !== f.id);
              showCard(null);
            },
          },
          'Remover',
        ),
      );
    } else if (f.kind === 'npc') {
      body.textContent = 'Fale com esta pessoa.';
    }
    actions.appendChild(h('button', { class: 'btn small ghost', onclick: () => showCard(null) }, 'Fechar'));
    card.append(title, body, actions);
    draw();
  };

  // ---------------------------------------------------- gestos
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch0 = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const a = renderer.unproject(v, 0, 0, 0, 0);
      const b = renderer.unproject(v, 0, 0, dx, dy);
      v.cx -= b.x - a.x;
      v.cy -= b.y - a.y;
      draw();
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, cur);
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) {
        const r = canvas.getBoundingClientRect();
        zoom(d / pinch0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      pinch0 = d;
      moved += 10;
      return;
    }
    pointers.set(e.pointerId, cur);
  });
  const up = async (e: PointerEvent) => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (!wasSingle || moved > 8) return;
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    if (markerMode) {
      markerMode = false;
      markBtn.style.borderColor = '';
      markBtn.style.background = '';
      const pos = renderer.unproject(v, r.width, r.height, sx, sy);
      const note = await promptBox('Novo marcador', 'Anotação (opcional)', '');
      if (note !== null) {
        game.state.world.markers.push({ id: uid('mk'), x: pos.x, y: pos.y, note });
        draw();
      }
      return;
    }
    showCard(renderer.pick(v, r.width, r.height, sx, sy));
  };
  canvas.addEventListener('pointerup', (e) => void up(e));
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );

  const ro = new ResizeObserver(() => fit());
  ro.observe(wrap);
  requestAnimationFrame(fit);
  const off = bus.on('map:changed', () => draw());
  return () => {
    ro.disconnect();
    off();
  };
}
