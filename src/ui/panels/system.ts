import { GAME_VERSION } from '../../config';
import { formatDate, formatTime } from '../../core/util';
import { ARCHETYPES } from '../../data/archetypes';
import { game } from '../../game';
import { SLOTS, SLOT_LABEL, type SaveRecord, type SlotId } from '../../systems/save';
import type { Settings } from '../../systems/settings';
import { sfx } from '../../systems/sfx';
import { clear, downloadText, h, isTouchDevice, pickFile } from '../dom';
import { toggleFullscreen } from '../Hud';
import type { PanelCtx } from '../Menu';
import { alertBox, confirmBox } from '../modal';

export function renderSystem(el: HTMLElement, ctx: PanelCtx): void {
  const savesBox = h('div', null, h('p', { class: 'muted' }, 'Carregando salvamentos…'));
  const left = h(
    'div',
    { class: 'col', style: 'gap:12px' },
    h('div', { class: 'card' }, h('h3', null, 'Salvar e carregar'), savesBox),
    h(
      'div',
      { class: 'card' },
      h('h3', null, 'Backup'),
      h('p', { class: 'muted', style: 'font-size:13px;margin-top:0' }, 'O progresso fica no navegador (IndexedDB). Exporte um arquivo para guardar ou levar para outro aparelho.'),
      h(
        'div',
        { class: 'row', style: 'flex-wrap:wrap' },
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              const name = `cronicas-${game.state.player.name.replace(/\W+/g, '_')}-nv${game.state.player.level}.json`;
              downloadText(name, game.exportBackup());
              game.toast('Backup exportado.', 'good');
            },
          },
          '⬇️ Exportar backup',
        ),
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              const text = await pickFile();
              if (!text) return;
              try {
                const preview = game.saves.parseBackup(text);
                const ok = await confirmBox('Importar backup', `Carregar ${preview.player.name}, nível ${preview.player.level}? O jogo atual será substituído (salve antes, se quiser).`, 'Importar');
                if (!ok) return;
                await game.importBackup(text);
                game.toast('Backup importado.', 'good');
                ctx.close();
              } catch (err) {
                await alertBox('Não foi possível importar', (err as Error).message);
              }
            },
          },
          '⬆️ Importar backup',
        ),
      ),
    ),
  );

  const right = h('div', { class: 'col', style: 'gap:12px' }, settingsCard(ctx), controlsCard(), aboutCard(ctx));
  el.appendChild(h('div', { class: 'grid2' }, left, right));
  void fillSaves(savesBox, ctx);
}

async function fillSaves(box: HTMLElement, ctx: PanelCtx): Promise<void> {
  const all = await game.saves.list();
  clear(box);
  for (const slot of SLOTS) {
    const rec = all[slot];
    box.appendChild(slotCard(slot, rec, ctx));
  }
  box.appendChild(h('small', { class: 'muted' }, 'O salvamento automático acontece em pontos seguros: pedras-guia, missões concluídas, chegada às vilas e a cada 2 minutos fora de combate.'));
}

function slotCard(slot: SlotId, rec: SaveRecord | undefined, ctx: PanelCtx): HTMLElement {
  const arch = rec ? ARCHETYPES.find((a) => a.id === rec.meta.archetype)?.name : '';
  const info = h(
    'div',
    { class: 'info' },
    h('b', null, SLOT_LABEL[slot]),
    rec
      ? h('span', null, `${rec.meta.name} · Nv. ${rec.meta.level} ${arch ? '· ' + arch : ''}`, h('br'), h('span', { class: 'muted' }, `${rec.meta.area} · ${formatDate(rec.savedAt)} · ${formatTime(rec.meta.playtime)}`))
      : h('span', { class: 'muted' }, 'Vazio'),
  );
  const actions = h('div', { class: 'row', style: 'flex-wrap:wrap' });
  if (slot !== 'auto') {
    actions.appendChild(
      h(
        'button',
        {
          class: 'btn small primary',
          onclick: async () => {
            if (rec && !(await confirmBox('Sobrescrever', `Substituir o salvamento em “${SLOT_LABEL[slot]}”?`, 'Sobrescrever'))) return;
            if (await game.save(slot)) {
              game.toast(`Jogo salvo em ${SLOT_LABEL[slot]}.`, 'good');
              sfx.play('quest');
              ctx.rerender();
            }
          },
        },
        'Salvar aqui',
      ),
    );
  }
  if (rec) {
    actions.appendChild(
      h(
        'button',
        {
          class: 'btn small',
          onclick: async () => {
            if (!(await confirmBox('Carregar jogo', 'O progresso não salvo desde então será perdido. Continuar?', 'Carregar'))) return;
            if (await game.loadSlot(slot)) {
              game.toast('Jogo carregado.', 'good');
              ctx.close();
            }
          },
        },
        'Carregar',
      ),
    );
    if (slot !== 'auto') {
      actions.appendChild(
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: async () => {
              if (!(await confirmBox('Apagar salvamento', `Apagar “${SLOT_LABEL[slot]}” para sempre?`, 'Apagar', true))) return;
              await game.saves.delete(slot);
              ctx.rerender();
            },
          },
          '🗑',
        ),
      );
    }
  }
  return h('div', { class: 'slot-card' }, info, actions);
}

function toggle(label: string, hint: string, key: keyof Settings): HTMLElement {
  const on = !!game.settings[key];
  const b = h('button', { class: `toggle${on ? ' on' : ''}`, 'aria-pressed': String(on), 'aria-label': label });
  b.onclick = () => {
    const v = !game.settings[key];
    game.applySettings({ [key]: v } as Partial<Settings>);
    b.classList.toggle('on', v);
    if (key === 'leftHanded') document.getElementById('ui')!.classList.toggle('lefty', v);
  };
  return h('div', { class: 'setting' }, h('div', { class: 's-label' }, label, hint ? h('small', null, hint) : null), b);
}

function settingsCard(ctx: PanelCtx): HTMLElement {
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(game.settings.volume) }) as HTMLInputElement;
  vol.oninput = () => game.applySettings({ volume: Number(vol.value) });
  vol.onchange = () => sfx.play('coin');
  const size = h('input', { type: 'range', min: 0.8, max: 1.3, step: 0.05, value: String(game.settings.controlsScale) }) as HTMLInputElement;
  size.oninput = () => {
    game.applySettings({ controlsScale: Number(size.value) });
    window.dispatchEvent(new Event('controls-resize'));
  };
  const zooms: [number, string][] = [
    [0, 'Auto'],
    [2, '2×'],
    [3, '3×'],
    [4, '4×'],
    [5, '5×'],
  ];
  const zoomChips = h(
    'div',
    { class: 'chips' },
    zooms.map(([z, l]) => h('button', { class: `chip${game.settings.zoom === z ? ' sel' : ''}`, onclick: () => (game.applySettings({ zoom: z }), ctx.rerender()) }, l)),
  );
  return h(
    'div',
    { class: 'card' },
    h('h3', null, 'Configurações'),
    h('div', { class: 'setting' }, h('div', { class: 's-label' }, 'Volume'), h('div', { style: 'width:50%' }, vol)),
    h('div', { class: 'setting' }, h('div', { class: 's-label' }, 'Escala do jogo', h('small', null, 'Zoom da câmera')), zoomChips),
    h('div', { class: 'setting' }, h('div', { class: 's-label' }, 'Tamanho dos botões'), h('div', { style: 'width:50%' }, size)),
    toggle('Modo canhoto', 'Joystick à direita, botões à esquerda', 'leftHanded'),
    toggle('Mira automática', 'Ataques e habilidades miram no inimigo mais próximo', 'autoAim'),
    toggle('Vibração', 'Ao receber dano (celulares compatíveis)', 'vibration'),
    toggle('Números de dano', '', 'damageNumbers'),
    toggle('Partículas e ambiente', 'Desligue para ganhar desempenho', 'particles'),
    toggle('Tremor de tela', '', 'screenShake'),
    toggle('Mostrar FPS', '', 'showFps'),
    h('div', { class: 'setting' }, h('div', { class: 's-label' }, 'Idioma'), h('span', { class: 'muted' }, 'Português (Brasil)')),
  );
}

function controlsCard(): HTMLElement {
  const touch = isTouchDevice();
  const rows: [string, string][] = touch
    ? [
        ['Joystick', 'Toque e arraste em qualquer ponto da metade esquerda'],
        ['⚔️ Ataque', 'Toque ou segure para atacar sem parar (mira automática)'],
        ['1–4', 'Habilidades em arco ao redor do ataque'],
        ['💨', 'Esquiva com invencibilidade breve'],
        ['🧪', 'Usa a poção mais útil'],
        ['Botão dourado', 'Aparece perto de NPCs, baús e pedras-guia'],
        ['Minimapa', 'Toque para abrir o mapa'],
      ]
    : [
        ['WASD / setas', 'Mover'],
        ['J ou clique', 'Atacar (mira no cursor)'],
        ['1 2 3 4', 'Habilidades'],
        ['Espaço', 'Esquivar'],
        ['E', 'Interagir / conversar'],
        ['Q', 'Poção'],
        ['I · M · C · K · L', 'Inventário · Mapa · Personagem · Habilidades · Missões'],
        ['Esc', 'Menu'],
      ];
  return h(
    'div',
    { class: 'card' },
    h('h3', null, 'Controles'),
    h('div', { class: 'controls-help' }, rows.map(([k, d]) => [h('span', { class: 'kbd', style: 'font-size:11px;padding:3px 6px' }, k), h('span', null, d)])),
  );
}

function aboutCard(ctx: PanelCtx): HTMLElement {
  return h(
    'div',
    { class: 'card' },
    h('h3', null, 'Jogo'),
    h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn small', onclick: () => toggleFullscreen() }, '⛶ Tela cheia'), h('button', { class: 'btn small danger', onclick: async () => {
      if (!(await confirmBox('Voltar ao título', 'O jogo será salvo automaticamente antes. Continuar?', 'Voltar'))) return;
      await game.save('auto');
      ctx.toTitle();
    } }, 'Voltar ao título')),
    h('p', { class: 'muted', style: 'font-size:12px;margin-bottom:0' }, `Crônicas do Mundo Inacabado · demo do Ato I · v${GAME_VERSION}. Arte gerada por código (pixel art procedural); substitua pelos seus atlas em public/assets.`),
  );
}
