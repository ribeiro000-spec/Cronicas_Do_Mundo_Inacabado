import * as Phaser from 'phaser';
import './ui/styles.css';
import { computeDpr, display } from './core/display';
import { bus } from './core/events';
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

  // o canvas é desenhado em pixels reais da tela (até 2×) e exibido no tamanho da janela
  display.dpr = computeDpr(game.settings.hiRes);
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0b1220',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round(window.innerWidth * display.dpr),
      height: Math.round(window.innerHeight * display.dpr),
      zoom: 1 / display.dpr,
    },
    input: { activePointers: 4 },
    fps: { target: 60, smoothStep: true },
    render: { powerPreference: 'high-performance', batchSize: 4096 },
    scene: [BootScene, WorldScene],
  });

  const fit = () => {
    const dpr = computeDpr(game.settings.hiRes);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (dpr === display.dpr && phaser.scale.width === w && phaser.scale.height === h) return;
    display.dpr = dpr;
    phaser.scale.resize(w, h);
    phaser.scale.setZoom(1 / dpr);
  };
  let fitTimer = 0;
  const fitSoon = () => {
    clearTimeout(fitTimer);
    fitTimer = window.setTimeout(fit, 60);
  };
  window.addEventListener('resize', fitSoon);
  window.addEventListener('orientationchange', () => setTimeout(fit, 250));
  window.visualViewport?.addEventListener('resize', fitSoon);
  bus.on('state:changed', fitSoon);

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
