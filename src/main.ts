import * as Phaser from 'phaser';
import './ui/styles.css';
import { game } from './game';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { UI } from './ui/UI';
import { WorldData } from './world/WorldData';

/* Ponto de entrada: baixa o manifesto do mundo, prepara a arte e abre a tela de título. */

function progress(t: number, text?: string): void {
  const fill = document.getElementById('boot-bar-fill');
  if (fill) fill.style.width = `${Math.round(t * 100)}%`;
  if (text) {
    const el = document.getElementById('boot-text');
    if (el) el.textContent = text;
  }
}

function fail(err: unknown): void {
  console.error(err);
  progress(1, `Não foi possível iniciar: ${(err as Error)?.message ?? err}. Verifique a conexão e recarregue a página.`);
}

async function start(): Promise<void> {
  progress(0.05, 'Baixando o mapa de Avarra…');
  const world = await WorldData.load((t) => progress(t));
  game.setManifest(world.manifest);
  progress(0.45, 'Desenhando o mundo…');

  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0b1220',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    input: { activePointers: 4 },
    fps: { target: 60, smoothStep: true },
    render: { powerPreference: 'high-performance', batchSize: 4096 },
    scene: [BootScene, WorldScene],
  });

  await new Promise<void>((resolve) => phaser.events.once('art-ready', () => resolve()));
  progress(1, 'Pronto!');
  const ui = new UI(phaser, world);
  ui.showTitle();
  const boot = document.getElementById('boot-loading');
  boot?.classList.add('hide');
  setTimeout(() => boot?.remove(), 500);

  // atalho para depuração no console do navegador
  (window as unknown as { cronicas: unknown }).cronicas = { game, phaser };
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sem cache offline — o jogo funciona normalmente */
    });
  });
}

start().catch(fail);
