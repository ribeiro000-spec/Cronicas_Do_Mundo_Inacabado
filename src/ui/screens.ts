import { GAME_VERSION } from '../config';
import type { HumanoidLook, PlayerLook } from '../core/types';
import { formatDate, formatTime } from '../core/util';
import { ARCHETYPES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from '../data/archetypes';
import { ITEMS } from '../data/items';
import { game } from '../game';
import { fullFigureCanvas } from '../render/characterArt';
import { TitleScene } from '../render/titleArt';
import { SLOT_LABEL, SLOTS, type SlotId } from '../systems/save';
import { sfx } from '../systems/sfx';
import type { WorldData } from '../world/WorldData';
import { clear, h, pickFile } from './dom';
import { alertBox, confirmBox, openModal, pushPause } from './modal';

/* Telas fora do jogo: título, criação de personagem, morte e fim do Ato I. */

function archetypeLook(archId: string, look: PlayerLook): HumanoidLook {
  const a = ARCHETYPES.find((x) => x.id === archId) ?? ARCHETYPES[0];
  const vis = (id?: string) => (id ? ITEMS[id]?.visual ?? null : null);
  return {
    ...look,
    head: vis(a.equipment.head),
    chest: vis(a.equipment.chest),
    legs: vis(a.equipment.legs),
    gloves: vis(a.equipment.gloves),
    cape: vis(a.equipment.cape),
    main: vis(a.equipment.mainHand),
    off: vis(a.equipment.offHand),
  };
}

/** Os quatro heróis da tela inicial, com a aparência inicial de cada arquétipo. */
function titleHeroes(): HTMLCanvasElement[] {
  const looks: Record<string, PlayerLook> = {
    guerreiro: { skin: '#e3b48c', hair: '#6b3f22', hairStyle: 'curto' },
    maga: { skin: '#f2d1b0', hair: '#e2c26b', hairStyle: 'longo' },
    arqueira: { skin: '#c68d63', hair: '#2a2a3a', hairStyle: 'rabo' },
    clerigo: { skin: '#9a6440', hair: '#c9c9c9', hairStyle: 'curto' },
  };
  return ['arqueira', 'guerreiro', 'maga', 'clerigo'].map((id) => fullFigureCanvas(archetypeLook(id, looks[id]), 1));
}

export function showTitle(_world: WorldData, onNew: () => void, onLoad: (slot: SlotId) => void, onImport: (text: string) => void): HTMLElement {
  const root = document.getElementById('ui')!;
  const continueBtn = h('button', { class: 'btn primary', disabled: true }, 'Continuar');
  const art = h('canvas', { class: 'title-art' }) as HTMLCanvasElement;
  const scene = new TitleScene(art, titleHeroes());
  const content = h(
    'div',
    { class: 'title-content' },
    h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-top' }, 'Crônicas do'),
      h('h1', { class: 'logo-main' }, 'Mundo Inacabado'),
      h('div', { class: 'logo-rule' }, h('i'), h('span', null, '✦'), h('i')),
      h('div', { class: 'logo-sub' }, 'Ato I · A Estrada que se Dobra'),
    ),
    h(
      'div',
      { class: 'title-menu' },
      continueBtn,
      h('button', { class: 'btn', onclick: () => (sfx.unlock(), onNew()) }, 'Novo jogo'),
      h('button', { class: 'btn', onclick: () => (sfx.unlock(), openLoadList(onLoad)) }, 'Carregar'),
      h(
        'button',
        {
          class: 'btn ghost small',
          onclick: async () => {
            const text = await pickFile();
            if (text) onImport(text);
          },
        },
        'Importar backup (.json)',
      ),
    ),
    h('p', { class: 'title-tip' }, 'Dica: no celular, deite o aparelho e use “Adicionar à tela inicial” para jogar em tela cheia.'),
  );
  const screen = h('div', { class: 'screen title-screen' }, art, h('div', { class: 'title-vignette' }), content, h('div', { class: 'version' }, `v${GAME_VERSION}`));
  root.appendChild(screen);
  scene.start();
  void game.saves.list().then((all) => {
    let best: SlotId | null = null;
    let at = 0;
    for (const s of SLOTS) {
      const r = all[s];
      if (r && r.savedAt > at) {
        at = r.savedAt;
        best = s;
      }
    }
    if (best) {
      const r = all[best]!;
      continueBtn.disabled = false;
      continueBtn.append(h('span', { class: 'save-info' }, ` · ${r.meta.name}, Nv. ${r.meta.level}`));
      continueBtn.onclick = () => {
        sfx.unlock();
        onLoad(best!);
      };
    } else {
      continueBtn.classList.add('hidden');
    }
  });
  return screen;
}

function openLoadList(onLoad: (slot: SlotId) => void): void {
  const list = h('div', null, h('p', { class: 'muted' }, 'Carregando…'));
  const m = openModal(h('div', null, h('h2', null, 'Carregar jogo'), list));
  void game.saves.list().then((all) => {
    clear(list);
    let any = false;
    for (const s of SLOTS) {
      const r = all[s];
      if (!r) continue;
      any = true;
      list.appendChild(
        h(
          'div',
          { class: 'slot-card' },
          h('div', { class: 'info' }, h('b', null, SLOT_LABEL[s]), `${r.meta.name} · Nv. ${r.meta.level}`, h('br'), h('span', { class: 'muted' }, `${r.meta.area} · ${formatDate(r.savedAt)} · ${formatTime(r.meta.playtime)}`)),
          h('button', { class: 'btn small primary', onclick: () => (m.close(), onLoad(s)) }, 'Carregar'),
        ),
      );
    }
    if (!any) list.appendChild(h('p', { class: 'muted' }, 'Nenhum salvamento neste navegador.'));
  });
}

export function showCreate(onStart: (name: string, archetype: string, look: PlayerLook) => void, onBack: () => void): HTMLElement {
  const root = document.getElementById('ui')!;
  let arch = ARCHETYPES[0].id;
  const look: PlayerLook = { skin: SKIN_TONES[1], hair: HAIR_COLORS[1], hairStyle: 'curto' };
  const nameInput = h('input', { type: 'text', maxlength: 18, placeholder: 'Seu nome', value: '' }) as HTMLInputElement;
  nameInput.addEventListener('keydown', (e) => e.stopPropagation());
  const preview = h('div', { class: 'preview-box panel' });
  const archGrid = h('div', { class: 'arch-grid' });
  const skinRow = h('div', { class: 'swatches' });
  const hairRow = h('div', { class: 'swatches' });
  const styleRow = h('div', { class: 'chips' });
  const desc = h('p', { class: 'muted', style: 'margin:0;text-align:center;font-size:13px' });

  const render = () => {
    clear(preview);
    const a = ARCHETYPES.find((x) => x.id === arch)!;
    const cv = fullFigureCanvas(archetypeLook(arch, look), 6);
    preview.append(h('h2', { style: 'margin:0' }, a.name), cv, desc);
    desc.textContent = `${a.desc} O arquétipo só orienta o começo: depois você pode aprender qualquer escola de habilidade.`;
    const stats = Object.entries(a.attrs)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    preview.appendChild(h('div', { class: 'muted', style: 'font-size:12px' }, stats));

    clear(archGrid);
    for (const x of ARCHETYPES) {
      const c = fullFigureCanvas(archetypeLook(x.id, look), 2);
      archGrid.appendChild(
        h('button', { class: `arch${x.id === arch ? ' sel' : ''}`, onclick: () => ((arch = x.id), sfx.play('click'), render()) }, c, h('div', null, h('b', null, x.name), h('small', null, x.desc))),
      );
    }
    clear(skinRow);
    for (const c of SKIN_TONES) skinRow.appendChild(h('button', { class: `swatch${look.skin === c ? ' sel' : ''}`, style: `background:${c}`, 'aria-label': 'Tom de pele', onclick: () => ((look.skin = c), render()) }));
    clear(hairRow);
    for (const c of HAIR_COLORS) hairRow.appendChild(h('button', { class: `swatch${look.hair === c ? ' sel' : ''}`, style: `background:${c}`, 'aria-label': 'Cor do cabelo', onclick: () => ((look.hair = c), render()) }));
    clear(styleRow);
    for (const s of HAIR_STYLES) styleRow.appendChild(h('button', { class: `chip${look.hairStyle === s.id ? ' sel' : ''}`, onclick: () => ((look.hairStyle = s.id), render()) }, s.name));
  };

  const start = h('button', { class: 'btn primary', style: 'width:100%;margin-top:6px' }, 'Começar a jornada');
  start.onclick = () => {
    sfx.unlock();
    sfx.play('quest');
    onStart(nameInput.value.trim() || 'Viajante', arch, { ...look });
  };
  const form = h(
    'div',
    { class: 'panel', style: 'padding:16px' },
    h('h2', null, 'Novo personagem'),
    h('div', { class: 'field' }, h('label', null, 'Nome'), nameInput),
    h('div', { class: 'field' }, h('label', null, 'Arquétipo inicial'), archGrid),
    h('div', { class: 'field' }, h('label', null, 'Pele'), skinRow),
    h('div', { class: 'field' }, h('label', null, 'Cabelo'), hairRow, styleRow),
    start,
    h('button', { class: 'btn ghost', style: 'width:100%;margin-top:6px', onclick: () => onBack() }, 'Voltar'),
  );
  const screen = h('div', { class: 'screen create' }, h('div', { class: 'create-inner' }, preview, form));
  root.appendChild(screen);
  render();
  return screen;
}

export function showDeath(onRecover: () => Promise<void>): HTMLElement {
  const root = document.getElementById('ui')!;
  const btn = h('button', { class: 'btn primary' }, 'Voltar ao último salvamento');
  const screen = h(
    'div',
    { class: 'screen death' },
    h('h1', null, 'Você caiu'),
    h('p', { style: 'max-width:440px' }, 'O mundo continua sem você por um instante… Ao voltar, você retorna ao último salvamento e perde 20% do XP guardado do nível atual. Seu nível, atributos e habilidades não mudam.'),
    btn,
  );
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Costurando…';
    await onRecover();
    screen.remove();
  };
  root.appendChild(screen);
  pushPause();
  return screen;
}

export function showEnding(onContinue: () => void): void {
  const st = game.state;
  const root = document.getElementById('ui')!;
  const route = st.quests.q_lumen?.status === 'done' ? 'Você confiou o fragmento à Academia de Lúmen.' : st.quests.q_marco?.status === 'done' ? 'Você jurou guardar o fragmento com a Ordem do Último Marco.' : '';
  const explored = Math.round(game.fog.revealedFraction() * 100);
  const screen = h(
    'div',
    { class: 'screen ending' },
    h('div', { class: 'muted', style: 'letter-spacing:3px;text-transform:uppercase;font-size:12px' }, 'Fim do Ato I'),
    h('h1', null, 'A Estrada para Fora'),
    h('p', { style: 'max-width:520px;line-height:1.6' }, `O Cavaleiro Sem Brasão descansa e a estrada leste voltou a ter um único caminho. ${route} Mas uma Costura rompida nunca é a única. Avarra inteira está esperando.`),
    h('div', { class: 'card', style: 'text-align:left;min-width:260px' }, h('div', null, `Nível ${st.player.level}`), h('div', null, `Tempo de jogo: ${formatTime(st.meta.playtime)}`), h('div', null, `Mapa explorado: ${explored}%`), h('div', null, `Mortes: ${st.meta.deaths}`), h('div', null, `Descobertas no diário: ${st.codex.length}`)),
    h('p', { class: 'muted', style: 'font-size:13px' }, 'Você pode continuar explorando, completar missões secundárias e abrir todos os baús.'),
  );
  const btn = h('button', { class: 'btn primary' }, 'Continuar explorando');
  btn.onclick = () => {
    screen.remove();
    onContinue();
  };
  screen.appendChild(btn);
  root.appendChild(screen);
}

export async function confirmNewGameOverwrite(): Promise<boolean> {
  const all = await game.saves.list();
  if (!all.auto) return true;
  return confirmBox('Novo jogo', 'O salvamento automático atual será substituído quando o novo jogo salvar. Os espaços manuais continuam intactos. Continuar?', 'Começar');
}

export { alertBox };
