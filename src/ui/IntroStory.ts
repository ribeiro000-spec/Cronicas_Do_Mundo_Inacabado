import type { HumanoidLook } from '../core/types';
import { fullFigureCanvas } from '../render/characterArt';
import { STORY_H, STORY_W, drawStoryScene, type StoryScene } from '../render/storyArt';
import { sfx } from '../systems/sfx';
import { h } from './dom';

/* Introdução de um jogo novo: quatro quadros ilustrados contam o que é Avarra,
 * o que são as Costuras e quem é o personagem (cada arquétipo tem a sua origem). */

interface Page {
  scene: StoryScene;
  title: string;
  text: string;
}

const ORIGINS: Record<string, { title: string; text: string }> = {
  guerreiro: {
    title: 'O guarda que voltou sozinho',
    text: 'Você, {nome}, foi guarda de caravanas na Estrada Leste. Numa noite sem lua, a sua caravana entrou numa curva que não existia no mapa — e só você saiu do outro lado, sem lembrar de como. Desde então, cada estrada parece um pouco mais longa do que deveria.',
  },
  maga: {
    title: 'A aprendiz dos livros que se reescrevem',
    text: 'Você, {nome}, era aprendiz na Academia de Lúmen e estudava as Costuras em tomos proibidos. Quando as páginas começaram a se reescrever sozinhas, contando coisas que ainda não tinham acontecido, você fechou os livros e partiu para ver com os próprios olhos.',
  },
  arqueira: {
    title: 'A caçadora da floresta silenciosa',
    text: 'Você, {nome}, cresceu caçando na Floresta dos Sinos Mudos. Os sinos pararam de tocar no mesmo dia em que os lobos começaram a uivar em uníssono, como se repetissem uma única voz. Ninguém na vila quis ouvir. Você decidiu seguir o rastro.',
  },
  clerigo: {
    title: 'O peregrino do Último Marco',
    text: 'Você, {nome}, é peregrino da Ordem do Último Marco, guardiã do que restou do mundo escrito. Seu juramento é simples: onde a crônica se rasga, alguém precisa ficar de pé. A luz do Marco apontou para o leste — e você obedeceu.',
  },
};

function pages(name: string, archetype: string): Page[] {
  const o = ORIGINS[archetype] ?? ORIGINS.guerreiro;
  const fill = (s: string) => s.replace(/\{nome\}/g, name);
  return [
    {
      scene: 'mundo',
      title: 'Avarra, o mundo inacabado',
      text: 'Dizem os antigos que o Criador escreveu o mundo como quem escreve uma crônica — e parou no meio de uma frase. Avarra ficou assim: montanhas que terminam em esboço, mapas com bordas em branco, histórias sem final.',
    },
    {
      scene: 'costuras',
      title: 'As Costuras',
      text: 'Onde a escrita parou, ficaram as Costuras: lugares em que a estrada se dobra sobre si mesma, em que as vozes se repetem e coisas esquecidas voltam a andar. Nos últimos meses, elas começaram a se abrir mais perto das vilas.',
    },
    { scene: archetype as StoryScene, title: fill(o.title), text: fill(o.text) },
    {
      scene: 'eldenor',
      title: 'Eldenor',
      text: fill('Agora você chega a Eldenor, uma vila à beira das Costuras. Uma caravana de Valedouro desapareceu e o Prefeito Aldren procura alguém disposto a investigar. Talvez seja a hora de terminar esta história, {nome} — ou de escrevê-la de novo.'),
    },
  ];
}

export function showIntroStory(name: string, archetype: string, look: HumanoidLook, onDone: () => void): HTMLElement {
  const list = pages(name, archetype);
  const figure = fullFigureCanvas(look, 1);
  const canvas = h('canvas', { class: 'intro-art', width: STORY_W, height: STORY_H }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const title = h('h2', { class: 'intro-title' });
  const text = h('p', { class: 'intro-text' });
  const dots = h('div', { class: 'intro-dots' }, list.map(() => h('i')));
  const next = h('button', { class: 'btn primary' }, 'Continuar ▸');
  const skip = h('button', { class: 'btn ghost small' }, 'Pular introdução');
  const card = h(
    'div',
    { class: 'intro-card panel' },
    h('div', { class: 'intro-frame' }, canvas),
    h('div', { class: 'intro-body' }, title, text, h('div', { class: 'intro-nav' }, dots, h('div', { class: 'row' }, skip, next))),
  );
  const el = h('div', { class: 'screen intro' }, card);
  document.getElementById('ui')!.appendChild(el);

  let idx = 0;
  let typing: number | null = null;
  let full = '';
  let raf = 0;
  let last = 0;
  const t0 = performance.now();
  let done = false;

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < 80) return; // ~12 quadros por segundo bastam
    last = now;
    drawStoryScene(ctx, list[idx].scene, (now - t0) / 1000, figure);
  };
  raf = requestAnimationFrame(loop);

  const type = () => {
    if (typing) clearInterval(typing);
    text.textContent = '';
    let i = 0;
    typing = window.setInterval(() => {
      i += 2;
      text.textContent = full.slice(0, i);
      if (i >= full.length && typing) {
        clearInterval(typing);
        typing = null;
      }
    }, 18);
  };

  const show = () => {
    const pg = list[idx];
    title.textContent = pg.title;
    full = pg.text;
    card.classList.remove('turn');
    void card.offsetWidth;
    card.classList.add('turn');
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === idx));
    next.textContent = idx === list.length - 1 ? 'Começar a jornada ▸' : 'Continuar ▸';
    drawStoryScene(ctx, pg.scene, (performance.now() - t0) / 1000, figure);
    type();
  };

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    if (typing) clearInterval(typing);
    window.removeEventListener('keydown', onKey, true);
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
    onDone();
  };

  const advance = () => {
    if (typing) {
      clearInterval(typing);
      typing = null;
      text.textContent = full;
      return;
    }
    sfx.play('click');
    if (idx >= list.length - 1) finish();
    else {
      idx++;
      show();
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      advance();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  };

  next.onclick = advance;
  skip.onclick = () => {
    sfx.play('click');
    finish();
  };
  canvas.onclick = advance;
  text.onclick = advance;
  window.addEventListener('keydown', onKey, true);
  show();
  return el;
}
