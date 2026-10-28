import { bus } from '../core/events';
import type { GameState, QuestState, WorldPoi } from '../core/types';
import { dist } from '../core/util';
import { ITEMS } from '../data/items';
import type { DialogueCtx } from '../data/npcs';
import { QUESTS, QUEST_LIST, type Action, type QuestDef, type QuestStepDef } from '../data/quests';
import { count } from './inventory';

export interface QuestHost {
  state: GameState;
  poi(id: string): WorldPoi | undefined;
  runActions(actions: Action[]): void;
  grantQuestRewards(def: QuestDef): void;
  toast(text: string, kind?: 'info' | 'good' | 'warn' | 'quest' | 'item' | 'level'): void;
  playTime(): number;
}

/** Missões que só ficam disponíveis depois de liberadas por outra. */
const LOCKED = new Set<string>(['q_fragmento']);
for (const q of QUEST_LIST) for (const u of q.unlocks ?? []) LOCKED.add(u);

export type QuestStatus = 'none' | 'available' | 'active' | 'done' | 'failed' | 'closed';

export class QuestSystem {
  constructor(private host: QuestHost) {}

  private get s(): GameState {
    return this.host.state;
  }

  status(id: string): QuestStatus {
    const q = this.s.quests[id];
    if (q) return q.status;
    if (!QUESTS[id]) return 'none';
    if (!LOCKED.has(id) || this.s.flags[`avail_${id}`]) return 'available';
    return 'none';
  }

  step(id: string): number {
    return this.s.quests[id]?.step ?? -1;
  }

  currentStep(id: string): QuestStepDef | null {
    const q = this.s.quests[id];
    if (!q || q.status !== 'active') return null;
    return QUESTS[id].steps[q.step] ?? null;
  }

  active(): string[] {
    return Object.entries(this.s.quests)
      .filter(([, q]) => q.status === 'active')
      .map(([id]) => id);
  }

  start(id: string): boolean {
    const def = QUESTS[id];
    if (!def) return false;
    const st = this.status(id);
    if (st === 'active' || st === 'done' || st === 'closed' || st === 'failed') return false;
    const q: QuestState = { status: 'active', step: 0, progress: 0, startedAt: this.host.playTime(), log: [] };
    this.s.quests[id] = q;
    for (const ex of def.excludes ?? []) {
      const other = this.s.quests[ex];
      if (!other || other.status === 'active') {
        this.s.quests[ex] = { status: 'closed', step: 0, progress: 0, startedAt: this.host.playTime(), log: ['Rota fechada pela sua escolha.'] };
        this.host.toast(`Rota fechada: ${QUESTS[ex].name}`, 'warn');
      }
    }
    this.host.toast(`Nova missão: ${def.name}`, 'quest');
    if (!this.s.tracked || def.type === 'main' || this.status(this.s.tracked) !== 'active') this.s.tracked = id;
    bus.emit('quest:changed', { id });
    this.checkCollect();
    return true;
  }

  /** Conclui a etapa atual. */
  advance(id: string): void {
    const q = this.s.quests[id];
    const def = QUESTS[id];
    if (!q || q.status !== 'active' || !def) return;
    const step = def.steps[q.step];
    q.log.push(step.text);
    if (step.onDone) this.host.runActions(step.onDone);
    // runActions pode ter mexido no estado; confere de novo
    if (q.status !== 'active') return;
    q.step += 1;
    q.progress = 0;
    if (q.step >= def.steps.length) {
      this.complete(id);
      return;
    }
    this.host.toast(`${def.name}: ${def.steps[q.step].text}`, 'quest');
    bus.emit('quest:changed', { id });
    this.checkCollect();
  }

  private complete(id: string): void {
    const q = this.s.quests[id];
    const def = QUESTS[id];
    q.status = 'done';
    this.host.toast(`Missão concluída: ${def.name}`, 'good');
    this.host.grantQuestRewards(def);
    for (const u of def.unlocks ?? []) {
      this.s.flags[`avail_${u}`] = true;
      if (QUESTS[u]?.autoStart) this.start(u);
    }
    if (this.s.tracked === id) this.s.tracked = this.active()[0] ?? null;
    bus.emit('quest:completed', { id });
    bus.emit('quest:changed', { id });
  }

  /** NPC é o alvo da etapa atual? */
  ready(id: string, npcId: string): boolean {
    const step = this.currentStep(id);
    return !!step && step.obj.type === 'talk' && step.obj.npc === npcId;
  }

  onKill(enemyId: string): void {
    for (const id of this.active()) {
      const step = this.currentStep(id);
      if (!step || step.obj.type !== 'kill' || !step.obj.enemy.includes(enemyId)) continue;
      const q = this.s.quests[id];
      q.progress += 1;
      if (q.progress >= step.obj.count) this.advance(id);
      else bus.emit('quest:changed', { id });
    }
  }

  checkCollect(): void {
    for (const id of this.active()) {
      const step = this.currentStep(id);
      if (!step || step.obj.type !== 'collect') continue;
      const q = this.s.quests[id];
      const have = Math.min(step.obj.count, count(this.s, step.obj.item));
      if (have !== q.progress) {
        q.progress = have;
        if (have >= step.obj.count) this.advance(id);
        else bus.emit('quest:changed', { id });
      }
    }
  }

  onReach(x: number, y: number): void {
    for (const id of this.active()) {
      const step = this.currentStep(id);
      if (!step || step.obj.type !== 'reach') continue;
      if (dist(x, y, step.obj.x, step.obj.y) <= step.obj.r) this.advance(id);
    }
  }

  /** Devolve true se a interação fazia parte de uma missão. */
  onInteract(poiId: string): boolean {
    let used = false;
    for (const id of this.active()) {
      const step = this.currentStep(id);
      if (step && step.obj.type === 'interact' && step.obj.poi === poiId) {
        this.advance(id);
        used = true;
      }
    }
    return used;
  }

  /** O ponto de interesse pode ser usado agora por alguma missão? */
  wantsInteract(poiId: string): boolean {
    return this.active().some((id) => {
      const step = this.currentStep(id);
      return !!step && step.obj.type === 'interact' && step.obj.poi === poiId;
    });
  }

  /** Posição do objetivo atual para mapa e bússola. */
  marker(id: string): { x: number; y: number } | null {
    const step = this.currentStep(id);
    if (!step) return null;
    if (step.marker) return step.marker;
    const o = step.obj;
    if (o.type === 'reach') return { x: o.x, y: o.y };
    if (o.type === 'talk') {
      const p = this.host.poi(o.npc);
      return p ? { x: p.x, y: p.y } : null;
    }
    if (o.type === 'interact') {
      const p = this.host.poi(o.poi);
      return p ? { x: p.x, y: p.y } : null;
    }
    return null;
  }

  stepLabel(id: string): string {
    const q = this.s.quests[id];
    const step = this.currentStep(id);
    if (!q || !step) return '';
    const o = step.obj;
    if (o.type === 'kill' || o.type === 'collect') return `${step.text} (${q.progress}/${o.count})`;
    return step.text;
  }

  /** Marcadores “!” (missão disponível) e “?” (entregar) em cima dos NPCs. */
  npcMarker(npcId: string): '!' | '?' | null {
    for (const id of this.active()) if (this.ready(id, npcId)) return '?';
    for (const def of QUEST_LIST) {
      if (def.giver !== npcId || def.autoStart) continue;
      if (this.status(def.id) === 'available' && this.offeredBy(def.id) === npcId) return '!';
    }
    return null;
  }

  /** quem oferece a missão (q_fragmento é dada pelo prefeito na entrega de q_ecos) */
  private offeredBy(id: string): string | null {
    if (id === 'q_fragmento') return null;
    return QUESTS[id]?.giver ?? null;
  }

  ctx(npcId: string): DialogueCtx {
    return {
      status: (id) => this.status(id),
      step: (id) => this.step(id),
      ready: (id) => this.ready(id, npcId),
      has: (item, qty = 1) => count(this.s, item) >= qty,
      flag: (k) => this.s.flags[k],
    };
  }

  rewardText(def: QuestDef): string {
    const parts = [`${def.rewards.xp} XP`];
    if (def.rewards.gold) parts.push(`${def.rewards.gold} ouro`);
    for (const it of def.rewards.items ?? []) parts.push(`${it.qty > 1 ? it.qty + '× ' : ''}${ITEMS[it.id]?.name ?? it.id}`);
    for (const f of def.rewards.fragments ?? []) parts.push(`fragmento de mapa (${f.replace('frag_', '')})`);
    return parts.join(' · ');
  }
}
