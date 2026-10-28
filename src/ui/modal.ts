import { input } from '../core/input';
import { game } from '../game';
import { sfx } from '../systems/sfx';
import { h } from './dom';

/* Janelas modais e controle de pausa (qualquer janela aberta pausa o mundo). */

let pauseCount = 0;

function sync(): void {
  game.paused = pauseCount > 0;
  document.getElementById('ui')?.classList.toggle('paused', game.paused);
  input.reset();
}

export function pushPause(): void {
  pauseCount++;
  sync();
}

export function popPause(): void {
  pauseCount = Math.max(0, pauseCount - 1);
  sync();
}

export function resetPause(): void {
  pauseCount = 0;
  sync();
}

export interface ModalHandle {
  el: HTMLElement;
  close(): void;
}

export function openModal(content: HTMLElement, opts: { wide?: boolean; onClose?: () => void; dismissable?: boolean } = {}): ModalHandle {
  const root = document.getElementById('ui')!;
  const box = h('div', { class: `modal panel${opts.wide ? ' wide' : ''}` }, content);
  const back = h('div', { class: 'modal-back' }, box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    window.removeEventListener('keydown', onKey, true);
    popPause();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismissable !== false) {
      e.stopPropagation();
      close();
    }
  };
  if (opts.dismissable !== false) {
    back.addEventListener('pointerdown', (e) => {
      if (e.target === back) close();
    });
  }
  window.addEventListener('keydown', onKey, true);
  root.appendChild(back);
  pushPause();
  return { el: box, close };
}

export function confirmBox(title: string, text: string, okLabel = 'Confirmar', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}` }, okLabel);
    const cancel = h('button', { class: 'btn ghost' }, 'Cancelar');
    const m = openModal(h('div', null, h('h2', null, title), h('p', null, text), h('div', { class: 'm-actions' }, cancel, ok)), {
      onClose: () => resolve(result),
    });
    ok.onclick = () => {
      sfx.play('click');
      result = true;
      m.close();
    };
    cancel.onclick = () => m.close();
  });
}

export function promptBox(title: string, label: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    let result: string | null = null;
    const field = h('input', { type: 'text', value: initial, maxlength: 60 }) as HTMLInputElement;
    const ok = h('button', { class: 'btn primary' }, 'Salvar');
    const cancel = h('button', { class: 'btn ghost' }, 'Cancelar');
    const m = openModal(
      h('div', null, h('h2', null, title), h('div', { class: 'field' }, h('label', null, label), field), h('div', { class: 'm-actions' }, cancel, ok)),
      { onClose: () => resolve(result) },
    );
    ok.onclick = () => {
      result = field.value.trim();
      m.close();
    };
    cancel.onclick = () => m.close();
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok.click();
      e.stopPropagation();
    });
    setTimeout(() => field.focus(), 50);
  });
}

export function alertBox(title: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    const ok = h('button', { class: 'btn primary' }, 'Entendi');
    const m = openModal(h('div', null, h('h2', null, title), h('p', null, text), h('div', { class: 'm-actions' }, ok)), { onClose: () => resolve() });
    ok.onclick = () => m.close();
  });
}
