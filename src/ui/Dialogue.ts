import { NPCS, type DialogueEntry, type DialogueNode } from '../data/npcs';
import type { Action } from '../data/quests';
import { game } from '../game';
import { portraitCanvas } from '../render/characterArt';
import { sfx } from '../systems/sfx';
import { clear, h } from './dom';
import { popPause, pushPause } from './modal';

/* Caixa de diálogo com opções grandes (toque) e atalhos 1-4 (teclado). */
export class Dialogue {
  private el: HTMLElement | null = null;
  private typing: number | null = null;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private optionButtons: HTMLButtonElement[] = [];

  get isOpen(): boolean {
    return !!this.el;
  }

  open(npcId: string): void {
    const npc = NPCS[npcId];
    const entry = game.dialogueFor(npcId);
    if (!npc || !entry) return;
    if (this.el) this.close();
    pushPause();
    const portrait = h('div', { class: 'd-portrait' }, portraitCanvas(npc.look, 3));
    const name = h('div', { class: 'd-name' }, npc.name, h('small', null, npc.title));
    const text = h('div', { class: 'd-text' });
    const opts = h('div', { class: 'd-options' });
    this.el = h('div', { class: 'dialogue panel' }, portrait, h('div', { style: 'min-width:0' }, name, text, opts));
    document.getElementById('ui')!.appendChild(this.el);
    window.addEventListener('keydown', this.onKey, true);
    this.show(entry, entry.start ?? 'start', text, opts);
  }

  private show(entry: DialogueEntry, nodeId: string, text: HTMLElement, opts: HTMLElement): void {
    const node: DialogueNode | undefined = entry.nodes[nodeId];
    if (!node) {
      this.close();
      return;
    }
    const full = node.text.replace(/\{nome\}/g, game.state.player.name);
    clear(opts);
    this.optionButtons = [];
    this.type(text, full);
    text.onclick = () => this.finishTyping(text, full);
    const ctx = game.quests.ctx('');
    const options = (node.options ?? [{ text: 'Continuar' }]).filter((o) => !o.cond || o.cond(ctx));
    options.forEach((o, i) => {
      const b = h('button', { class: 'btn' }, h('span', { class: 'kbd' }, String(i + 1)), o.text) as HTMLButtonElement;
      b.onclick = () => {
        sfx.play('click');
        const actions: Action[] = o.actions ?? [];
        if (o.next) {
          if (actions.length) game.runActions(actions);
          if (this.el) this.show(entry, o.next, text, opts);
        } else {
          this.close();
          if (actions.length) game.runActions(actions);
        }
      };
      opts.appendChild(b);
      this.optionButtons.push(b);
    });
  }

  private type(el: HTMLElement, full: string): void {
    if (this.typing) clearInterval(this.typing);
    el.textContent = '';
    let i = 0;
    const step = Math.max(1, Math.round(full.length / 90));
    this.typing = window.setInterval(() => {
      i += step;
      el.textContent = full.slice(0, i);
      if (i >= full.length && this.typing) {
        clearInterval(this.typing);
        this.typing = null;
      }
    }, 16);
  }

  private finishTyping(el: HTMLElement, full: string): void {
    if (this.typing) {
      clearInterval(this.typing);
      this.typing = null;
    }
    el.textContent = full;
  }

  private key(e: KeyboardEvent): void {
    if (!this.el || e.repeat) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      this.close();
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= this.optionButtons.length) {
      e.stopPropagation();
      e.preventDefault();
      this.optionButtons[n - 1].click();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E') && this.optionButtons.length === 1) {
      e.stopPropagation();
      e.preventDefault();
      this.optionButtons[0].click();
    }
  }

  close(): void {
    if (!this.el) return;
    if (this.typing) clearInterval(this.typing);
    this.typing = null;
    this.el.remove();
    this.el = null;
    window.removeEventListener('keydown', this.onKey, true);
    popPause();
  }
}
