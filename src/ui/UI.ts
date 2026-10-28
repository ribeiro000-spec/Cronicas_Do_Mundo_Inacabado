import type * as Phaser from 'phaser';
import { bus } from '../core/events';
import { input } from '../core/input';
import { game } from '../game';
import { sfx } from '../systems/sfx';
import type { WorldData } from '../world/WorldData';
import { Controls } from './Controls';
import { Dialogue } from './Dialogue';
import { h, isTouchDevice } from './dom';
import { Hud } from './Hud';
import { Menu } from './Menu';
import { alertBox, pushPause, resetPause } from './modal';
import { confirmNewGameOverwrite, showCreate, showDeath, showEnding, showTitle } from './screens';
import { openShop } from './Shop';
import type { SlotId } from '../systems/save';

/* Raiz da interface: alterna entre telas (título, criação) e o jogo (HUD + controles),
 * e conecta eventos do jogo às janelas (diálogo, loja, menu, morte, fim do ato). */
export class UI {
  private root = document.getElementById('ui')!;
  private hud: Hud | null = null;
  private controls: Controls | null = null;
  private dialogue = new Dialogue();
  private menu: Menu;
  private veil = h('div', { class: 'travel-veil hide' }, 'Costurando o caminho…');
  private screen: HTMLElement | null = null;
  private inGame = false;
  private lastFrame = performance.now();
  private rotateHintShown = false;

  constructor(
    private phaser: Phaser.Game,
    private world: WorldData,
  ) {
    if (!isTouchDevice()) this.root.classList.add('no-touch');
    if (game.settings.leftHanded) this.root.classList.add('lefty');
    this.menu = new Menu(world, () => this.toTitle());
    document.body.appendChild(this.veil);

    bus.on('dialogue:open', ({ npcId }) => this.dialogue.open(npcId));
    bus.on('shop:open', ({ shopId }) => openShop(shopId));
    bus.on('menu:open', ({ tab }) => this.openMenu(tab));
    bus.on('player:died', () => {
      this.dialogue.close();
      this.menu.close();
      setTimeout(
        () =>
          showDeath(async () => {
            const r = await game.recoverFromDeath();
            resetPause();
            game.toast(r.lost > 0 ? `Você perdeu ${r.lost} XP (restam ${r.remaining}).` : 'Você voltou ao último salvamento.', 'warn');
          }),
        900,
      );
    });
    bus.on('demo:ending', () => {
      setTimeout(() => {
        pushPause();
        showEnding(() => {
          resetPause();
        });
      }, 600);
    });
    bus.on('travel:start', () => this.veil.classList.remove('hide'));
    bus.on('travel:end', () => this.veil.classList.add('hide'));
    bus.on('level:up', () => {
      if (game.state.player.level === 2) game.toast('Abra o menu (☰) para distribuir seus pontos.', 'info');
    });

    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        input.reset();
        if (this.inGame && !game.dead) void game.autosave('segundo plano');
      }
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    if (this.inGame) {
      this.hud?.update(dt);
      this.controls?.update();
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  openMenu(tab?: string): void {
    if (!this.inGame || game.dead) return;
    if (this.dialogue.isOpen) return;
    this.menu.open(tab);
  }

  private clearScreen(): void {
    this.screen?.remove();
    this.screen = null;
  }

  showTitle(): void {
    this.clearScreen();
    this.setInGame(false);
    this.screen = showTitle(
      this.world,
      () => void this.newGameFlow(),
      (slot) => void this.loadSlot(slot),
      (text) => void this.importText(text),
    );
  }

  private async newGameFlow(): Promise<void> {
    if (!(await confirmNewGameOverwrite())) return;
    this.clearScreen();
    this.screen = showCreate(
      (name, arch, look) => {
        game.newGame(name, arch, look);
        this.enterWorld();
        setTimeout(() => {
          game.toast('Bem-vindo a Eldenor. Fale com o Prefeito Aldren (!).', 'quest');
          void game.save('auto');
        }, 1200);
      },
      () => this.showTitle(),
    );
  }

  private async loadSlot(slot: SlotId): Promise<void> {
    const rec = await game.saves.load(slot);
    if (!rec) {
      await alertBox('Não foi possível carregar', 'O salvamento está corrompido ou é de uma versão incompatível.');
      return;
    }
    game.applyState(rec.state);
    this.enterWorld();
  }

  private async importText(text: string): Promise<void> {
    try {
      const st = game.saves.parseBackup(text);
      game.applyState(st);
      this.enterWorld();
      setTimeout(() => void game.save('auto'), 1500);
    } catch (err) {
      await alertBox('Não foi possível importar', (err as Error).message);
    }
  }

  private setInGame(v: boolean): void {
    this.inGame = v;
    if (v) {
      if (!this.hud) {
        this.hud = new Hud(this.world, (tab) => this.openMenu(tab));
        this.controls = new Controls((tab) => this.openMenu(tab));
        this.root.append(this.hud.el, this.controls.el);
      }
      this.hud.el.classList.remove('hidden');
      this.controls!.el.classList.remove('hidden');
      this.hud.refreshPortrait();
      this.controls!.layoutButtons();
      requestAnimationFrame(() => window.dispatchEvent(new Event('controls-resize')));
      this.maybeRotateHint();
    } else {
      this.hud?.el.classList.add('hidden');
      this.controls?.el.classList.add('hidden');
    }
  }

  private maybeRotateHint(): void {
    if (this.rotateHintShown || !isTouchDevice() || window.innerWidth > window.innerHeight) return;
    this.rotateHintShown = true;
    const tip = h('div', { class: 'rotate-hint' }, '↻ Gire o celular para jogar deitado — a visão fica bem maior.', h('br'), h('small', { class: 'muted' }, 'Toque para fechar'));
    tip.onclick = () => tip.remove();
    this.root.appendChild(tip);
    setTimeout(() => tip.remove(), 6000);
  }

  enterWorld(): void {
    this.clearScreen();
    resetPause();
    input.reset();
    this.setInGame(true);
    this.phaser.scene.start('world', { world: this.world });
  }

  toTitle(): void {
    this.dialogue.close();
    this.menu.close();
    if (this.phaser.scene.isActive('world')) this.phaser.scene.stop('world');
    game.running = false;
    bus.emit('boss:update', null);
    bus.emit('interact:hint', { label: null });
    this.showTitle();
  }
}
