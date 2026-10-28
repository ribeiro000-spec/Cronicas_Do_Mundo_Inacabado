import { BALANCE, ENGINE } from './config';
import { bus } from './core/events';
import type { Attrs, DerivedStats, EquipSlot, GameState, PlayerLook, WorldManifest, WorldPoi } from './core/types';
import { clamp, dist, uid } from './core/util';
import { CODEX } from './data/codex';
import { FACTIONS } from './data/factions';
import { ITEMS } from './data/items';
import { CHESTS, SHOPS } from './data/loot';
import { NPCS, type DialogueEntry } from './data/npcs';
import { QUESTS, type Action, type QuestDef } from './data/quests';
import { Fog } from './systems/fog';
import * as inv from './systems/inventory';
import { createNewState } from './systems/newgame';
import * as prog from './systems/progression';
import { QuestSystem } from './systems/quests';
import { SaveManager, type SlotId } from './systems/save';
import { loadSettings, saveSettings, type Settings } from './systems/settings';
import { sfx } from './systems/sfx';
import { derive } from './systems/stats';

/** O que o jogo precisa da cena do mundo (implementado por WorldScene). */
export interface SceneApi {
  teleport(x: number, y: number): Promise<void>;
  rebuildPlayer(): void;
  resetWorld(): Promise<void>;
  spawnEchoes(x: number, y: number): void;
  weakenBoss(): void;
  refreshPoi(id: string): void;
  playerPos(): { x: number; y: number };
  effect(kind: 'heal' | 'levelup' | 'pickup', text?: string): void;
}

export type ToastKind = 'info' | 'good' | 'warn' | 'quest' | 'item' | 'level';

/**
 * Núcleo do jogo: guarda o estado, aplica as regras (sistemas) e conversa com a cena e a interface.
 * A interface nunca altera o estado diretamente — sempre chama métodos daqui.
 */
export class Game {
  state!: GameState;
  manifest!: WorldManifest;
  settings: Settings = loadSettings();
  saves = new SaveManager();
  quests: QuestSystem;
  fog!: Fog;
  derived!: DerivedStats;
  scene: SceneApi | null = null;
  running = false;
  paused = false;
  fps = 0;
  dead = false;
  inCombat = false;
  currentArea = '';
  private lastCombatAt = -999;
  private autosaveTimer = 0;
  private poiIndex = new Map<string, WorldPoi>();
  /** buff temporário de regeneração (pão de mel, cura natural) */
  regen: { perSec: number; left: number } | null = null;
  /** recarga das habilidades (não vai para o save) */
  cooldowns: Record<string, { left: number; total: number }> = {};

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.quests = new QuestSystem({
      get state() {
        return self.state;
      },
      poi: (id) => this.poi(id),
      runActions: (a) => this.runActions(a),
      grantQuestRewards: (d) => this.grantQuestRewards(d),
      toast: (t, k) => this.toast(t, k),
      playTime: () => this.state.meta.playtime,
    });
    sfx.setVolume(this.settings.volume);
  }

  setManifest(m: WorldManifest): void {
    this.manifest = m;
    this.poiIndex.clear();
    for (const p of m.pois) this.poiIndex.set(p.id, p);
    this.fog = new Fog(m.width, m.height, ENGINE.fogCell);
  }

  poi(id: string): WorldPoi | undefined {
    return this.poiIndex.get(id);
  }

  toast(text: string, kind: ToastKind = 'info'): void {
    bus.emit('toast', { text, kind });
  }

  /* ------------------------------------------------------------ ciclo de vida */

  newGame(name: string, archetype: string, look: PlayerLook): void {
    const st = createNewState({ name, archetype, look, spawn: this.manifest.spawn });
    this.applyState(st);
    this.fog.revealCircle(st.player.x, st.player.y, 18);
    this.persistFog();
  }

  applyState(st: GameState): void {
    this.state = st;
    this.dead = false;
    this.inCombat = false;
    this.regen = null;
    this.fog.load(st.world.fog);
    this.recalc();
    bus.emit('state:changed');
    bus.emit('inventory:changed');
    bus.emit('equipment:changed');
    bus.emit('skills:changed');
    bus.emit('map:changed');
  }

  recalc(): void {
    this.derived = derive(this.state);
    const p = this.state.player;
    p.hp = clamp(p.hp, 0, this.derived.maxHp);
    p.mp = clamp(p.mp, 0, this.derived.maxMp);
  }

  persistFog(): void {
    this.state.world.fog = this.fog.save();
  }

  /** Chamado todo frame pela cena (dt em segundos). */
  tick(dt: number): void {
    if (!this.running || this.dead) return;
    const p = this.state.player;
    this.state.meta.playtime += dt;
    // regeneração natural (mais rápida fora de combate)
    const d = this.derived;
    const hpRate = this.inCombat ? 0.003 : 0.02;
    const mpRate = this.inCombat ? 0.012 : 0.04;
    p.hp = Math.min(d.maxHp, p.hp + d.maxHp * hpRate * dt);
    p.mp = Math.min(d.maxMp, p.mp + d.maxMp * mpRate * dt);
    if (this.regen) {
      p.hp = Math.min(d.maxHp, p.hp + this.regen.perSec * dt);
      this.regen.left -= dt;
      if (this.regen.left <= 0) this.regen = null;
    }
    if (this.inCombat && this.state.meta.playtime - this.lastCombatAt > BALANCE.combatTimeout) {
      this.inCombat = false;
      bus.emit('combat:state', { inCombat: false });
    }
    this.autosaveTimer += dt;
    if (this.autosaveTimer > BALANCE.autosaveSeconds && !this.inCombat) void this.autosave('tempo');
  }

  markCombat(): void {
    this.lastCombatAt = this.state.meta.playtime;
    if (!this.inCombat) {
      this.inCombat = true;
      bus.emit('combat:state', { inCombat: true });
    }
  }

  /* ------------------------------------------------------------ itens */

  giveItem(id: string, qty = 1, silent = false): number {
    const def = ITEMS[id];
    if (!def) return 0;
    const added = inv.addItem(this.state, id, qty);
    if (added < qty) this.toast(`Inventário cheio: ${qty - added}× ${def.name} ficou para trás.`, 'warn');
    if (added > 0 && !silent) {
      this.toast(`+${added > 1 ? added + '× ' : ''}${def.name}`, 'item');
      sfx.play('pickup');
    }
    bus.emit('inventory:changed');
    this.quests.checkCollect();
    return added;
  }

  hasItem(id: string, qty = 1): boolean {
    return inv.count(this.state, id) >= qty;
  }

  takeItem(id: string, qty = 1): boolean {
    const ok = inv.removeItem(this.state, id, qty);
    if (ok) {
      bus.emit('inventory:changed');
      this.quests.checkCollect();
    }
    return ok;
  }

  addGold(n: number, silent = false): void {
    this.state.player.gold = Math.max(0, this.state.player.gold + Math.round(n));
    if (!silent && n > 0) sfx.play('coin');
    bus.emit('inventory:changed');
  }

  equip(index: number, slot?: EquipSlot): void {
    const r = inv.equipFromInventory(this.state, index, slot);
    if (!r.ok) {
      this.toast(r.reason, 'warn');
      sfx.play('deny');
      return;
    }
    if (r.msg) this.toast(r.msg, 'info');
    sfx.play('click');
    this.afterEquipChange();
  }

  unequip(slot: EquipSlot): void {
    const r = inv.unequip(this.state, slot);
    if (!r.ok) {
      this.toast(r.reason, 'warn');
      return;
    }
    this.afterEquipChange();
  }

  private afterEquipChange(): void {
    this.recalc();
    this.scene?.rebuildPlayer();
    bus.emit('inventory:changed');
    bus.emit('equipment:changed');
  }

  useItem(index: number): void {
    const e = this.state.inventory[index];
    if (!e) return;
    const def = ITEMS[e.id];
    if (!def?.use) return;
    const p = this.state.player;
    const d = this.derived;
    if (def.use.heal && p.hp >= d.maxHp && !def.use.mana) {
      this.toast('Sua vida já está cheia.', 'info');
      return;
    }
    if (def.use.mana && p.mp >= d.maxMp && !def.use.heal) {
      this.toast('Sua mana já está cheia.', 'info');
      return;
    }
    inv.removeAt(this.state, index, 1);
    if (def.use.heal) p.hp = Math.min(d.maxHp, p.hp + def.use.heal);
    if (def.use.mana) p.mp = Math.min(d.maxMp, p.mp + def.use.mana);
    if (def.use.regen) this.regen = { perSec: def.use.regen / 10, left: 10 };
    sfx.play('heal');
    this.scene?.effect('heal', def.use.heal ? `+${def.use.heal}` : undefined);
    bus.emit('inventory:changed');
    this.quests.checkCollect();
  }

  /** Atalho do botão de poção: usa a menor poção que resolva. */
  quickPotion(): void {
    const p = this.state.player;
    const d = this.derived;
    const needHp = p.hp < d.maxHp * 0.98;
    const order = needHp ? ['pocao_vida', 'pocao_grande', 'pao_mel', 'pocao_mana'] : ['pocao_mana', 'pocao_vida', 'pocao_grande'];
    for (const id of order) {
      const idx = this.state.inventory.findIndex((e) => e.id === id);
      if (idx >= 0) {
        if (id === 'pocao_mana' && p.mp >= d.maxMp * 0.98) continue;
        this.useItem(idx);
        return;
      }
    }
    this.toast('Sem poções úteis agora.', 'warn');
    sfx.play('deny');
  }

  potionCount(): number {
    return inv.count(this.state, 'pocao_vida') + inv.count(this.state, 'pocao_grande') + inv.count(this.state, 'pocao_mana');
  }

  dropItem(index: number, qty = 1): void {
    const e = this.state.inventory[index];
    if (!e) return;
    const def = ITEMS[e.id];
    if (def.category === 'quest') {
      this.toast('Itens de missão não podem ser descartados.', 'warn');
      return;
    }
    inv.removeAt(this.state, index, Math.min(qty, e.qty));
    bus.emit('inventory:changed');
    this.quests.checkCollect();
  }

  /* ------------------------------------------------------------ loja */

  priceMultiplier(shopId: string): number {
    const shop = SHOPS[shopId];
    const rep = this.state.rep[shop?.faction ?? 'liga'] ?? 0;
    return 1 - clamp(rep, -100, 100) * 0.002;
  }

  buyPrice(shopId: string, itemId: string): number {
    return Math.max(1, Math.ceil(ITEMS[itemId].price * this.priceMultiplier(shopId)));
  }

  sellPrice(itemId: string): number {
    const def = ITEMS[itemId];
    if (!def || def.category === 'quest') return 0;
    return Math.max(1, Math.floor(def.price * BALANCE.sellFactor));
  }

  buy(shopId: string, itemId: string): void {
    const price = this.buyPrice(shopId, itemId);
    if (this.state.player.gold < price) {
      this.toast('Ouro insuficiente.', 'warn');
      sfx.play('deny');
      return;
    }
    if (inv.room(this.state, itemId) < 1) {
      this.toast('Inventário cheio.', 'warn');
      return;
    }
    this.state.player.gold -= price;
    this.giveItem(itemId, 1, true);
    this.toast(`Comprou ${ITEMS[itemId].name} por ${price} ouro.`, 'item');
    sfx.play('coin');
  }

  sell(index: number, qty = 1): void {
    const e = this.state.inventory[index];
    if (!e) return;
    const price = this.sellPrice(e.id);
    if (price <= 0) {
      this.toast('Este item não pode ser vendido.', 'warn');
      return;
    }
    const n = Math.min(qty, e.qty);
    const name = ITEMS[e.id].name;
    inv.removeAt(this.state, index, n);
    this.addGold(price * n);
    this.toast(`Vendeu ${n > 1 ? n + '× ' : ''}${name} por ${price * n} ouro.`, 'item');
    this.quests.checkCollect();
    bus.emit('inventory:changed');
  }

  /* ------------------------------------------------------------ progressão */

  gainXp(amount: number): void {
    if (amount <= 0) return;
    const r = prog.gainXp(this.state, amount);
    bus.emit('xp:gained', { amount: r.gained });
    if (r.leveledUp) {
      this.recalc();
      const p = this.state.player;
      p.hp = this.derived.maxHp;
      p.mp = this.derived.maxMp;
      this.toast(`Nível ${p.level}! +${BALANCE.attrPointsPerLevel} pontos de atributo, +${BALANCE.skillPointsPerLevel} de habilidade.`, 'level');
      sfx.play('levelup');
      this.scene?.effect('levelup');
      bus.emit('level:up', { level: p.level });
    }
    bus.emit('state:changed');
  }

  allocate(delta: Partial<Attrs>): boolean {
    const ok = prog.allocate(this.state, delta);
    if (ok) {
      this.recalc();
      sfx.play('click');
      bus.emit('state:changed');
    }
    return ok;
  }

  learnSkill(id: string): void {
    const c = prog.canLearn(this.state, id);
    if (!c.ok) {
      this.toast(c.reason ?? 'Não é possível.', 'warn');
      sfx.play('deny');
      return;
    }
    prog.learnOrUpgrade(this.state, id);
    sfx.play('magic');
    bus.emit('skills:changed');
    bus.emit('state:changed');
  }

  setHotbar(index: number, skillId: string | null): void {
    const hb = this.state.player.hotbar;
    if (skillId) {
      const prev = hb.indexOf(skillId);
      if (prev >= 0) hb[prev] = hb[index];
    }
    hb[index] = skillId;
    bus.emit('skills:changed');
  }

  changeRep(faction: string, amount: number): void {
    const f = FACTIONS.find((x) => x.id === faction);
    if (!f) return;
    this.state.rep[faction] = clamp((this.state.rep[faction] ?? 0) + amount, -100, 100);
    this.toast(`${f.name}: ${amount > 0 ? '+' : ''}${amount} reputação`, amount > 0 ? 'good' : 'warn');
  }

  unlockCodex(id: string): void {
    if (!CODEX[id] || this.state.codex.includes(id)) return;
    this.state.codex.push(id);
    this.toast(`Diário: ${CODEX[id].title}`, 'info');
  }

  revealFragment(id: string): void {
    const frag = this.manifest.mapFragments.find((f) => f.id === id);
    if (!frag) return;
    if (!this.state.world.fragments.includes(id)) this.state.world.fragments.push(id);
    const [x0, y0, x1, y1] = frag.rect;
    this.fog.revealRect(x0, y0, x1, y1);
    this.persistFog();
    this.toast(`Fragmento de mapa: ${frag.name}`, 'item');
    this.gainXp(40);
    bus.emit('map:changed');
  }

  /* ------------------------------------------------------------ ações de diálogo / missão */

  runActions(actions: Action[]): void {
    for (const a of actions) {
      switch (a.t) {
        case 'startQuest':
          if (this.quests.start(a.id)) sfx.play('quest');
          break;
        case 'advance':
          this.quests.advance(a.id);
          break;
        case 'give':
          this.giveItem(a.id, a.qty ?? 1);
          break;
        case 'take':
          this.takeItem(a.id, a.qty ?? 1);
          break;
        case 'gold':
          this.addGold(a.amount);
          break;
        case 'shop':
          bus.emit('shop:open', { shopId: a.id });
          break;
        case 'flag':
          this.state.flags[a.key] = a.value ?? true;
          break;
        case 'rep':
          this.changeRep(a.id, a.amount);
          break;
        case 'heal':
          this.fullHeal();
          break;
        case 'codex':
          this.unlockCodex(a.id);
          break;
        case 'fragment':
          this.revealFragment(a.id);
          break;
        case 'xp':
          this.gainXp(a.amount);
          break;
        case 'spawnEchoes':
          this.scene?.spawnEchoes(a.x, a.y);
          break;
        case 'weakenBoss':
          this.scene?.weakenBoss();
          break;
        case 'ending':
          this.state.flags.ato1_fim = true;
          void this.autosave('fim do ato');
          bus.emit('demo:ending');
          break;
      }
    }
    bus.emit('state:changed');
  }

  grantQuestRewards(def: QuestDef): void {
    const r = def.rewards;
    sfx.play('quest');
    if (r.gold) this.addGold(r.gold, true);
    for (const it of r.items ?? []) this.giveItem(it.id, it.qty);
    for (const [f, n] of Object.entries(r.rep ?? {})) this.changeRep(f, n);
    for (const fr of r.fragments ?? []) this.revealFragment(fr);
    for (const c of r.codex ?? []) this.unlockCodex(c);
    this.gainXp(r.xp);
    void this.autosave('missão');
  }

  dialogueFor(npcId: string): DialogueEntry | null {
    const npc = NPCS[npcId];
    if (!npc) return null;
    const ctx = this.quests.ctx(npcId);
    return npc.dialogue.find((d) => !d.cond || d.cond(ctx)) ?? null;
  }

  /* ------------------------------------------------------------ interação com o mundo */

  interactLabel(poi: WorldPoi): string | null {
    const w = this.state.world;
    switch (poi.type) {
      case 'npc':
        return 'Falar';
      case 'chest':
        return w.chests.includes(poi.id) ? null : 'Abrir';
      case 'waystone':
        return w.waystonesActive.includes(poi.id) ? 'Viajar' : 'Ativar';
      case 'herb':
        return this.herbReady(poi.id) ? 'Colher' : null;
      case 'cargo':
      case 'altar':
        return 'Examinar';
      default:
        return null;
    }
  }

  herbReady(id: string): boolean {
    const t = this.state.world.picked[id];
    return t === undefined || this.state.meta.playtime - t > BALANCE.herbRegrowSeconds;
  }

  interact(poi: WorldPoi): void {
    const w = this.state.world;
    switch (poi.type) {
      case 'npc': {
        if (!w.npcMet.includes(poi.id)) w.npcMet.push(poi.id);
        bus.emit('dialogue:open', { npcId: poi.id });
        break;
      }
      case 'chest': {
        if (w.chests.includes(poi.id)) return;
        const loot = CHESTS[poi.id] ?? { gold: 10, items: [] };
        w.chests.push(poi.id);
        sfx.play('chest');
        if (loot.gold) {
          this.addGold(loot.gold, true);
          this.toast(`+${loot.gold} ouro`, 'item');
        }
        for (const it of loot.items) this.giveItem(it.id, it.qty);
        if (loot.fragment) this.revealFragment(loot.fragment);
        this.gainXp(15);
        this.scene?.refreshPoi(poi.id);
        break;
      }
      case 'waystone': {
        if (!w.waystonesActive.includes(poi.id)) {
          w.waystonesActive.push(poi.id);
          sfx.play('waystone');
          this.toast(`Ponto de viagem ativado: ${poi.name ?? ''}`, 'good');
          this.gainXp(30);
          this.fullHeal();
          this.scene?.refreshPoi(poi.id);
          bus.emit('map:changed');
          void this.autosave('pedra-guia');
        } else {
          this.fullHeal();
          bus.emit('menu:open', { tab: 'mapa' });
        }
        break;
      }
      case 'herb': {
        if (!this.herbReady(poi.id)) return;
        w.picked[poi.id] = this.state.meta.playtime;
        this.giveItem('erva_orvalho', 1);
        this.scene?.refreshPoi(poi.id);
        break;
      }
      case 'cargo':
      case 'altar': {
        if (this.quests.wantsInteract(poi.id)) {
          this.quests.onInteract(poi.id);
          this.scene?.refreshPoi(poi.id);
        } else if (poi.type === 'cargo') {
          this.toast('Caixas quebradas e rastros de luta. Nada mais aqui.', 'info');
        } else {
          this.toast(
            this.state.quests.q_fragmento?.status === 'done' || this.quests.step('q_fragmento') > 1
              ? 'O altar está frio agora.'
              : 'Uma luz pulsa por baixo das pedras. Algo aqui ainda não é para você.',
            'info',
          );
        }
        break;
      }
    }
    bus.emit('state:changed');
  }

  fullHeal(): void {
    this.state.player.hp = this.derived.maxHp;
    this.state.player.mp = this.derived.maxMp;
    this.scene?.effect('heal');
  }

  async travelTo(wsId: string): Promise<boolean> {
    const ws = this.poi(wsId);
    if (!ws || ws.type !== 'waystone') return false;
    if (!this.state.world.waystonesActive.includes(wsId)) {
      this.toast('Este ponto ainda não foi ativado. Visite-o primeiro.', 'warn');
      return false;
    }
    if (this.inCombat) {
      this.toast('Não é possível viajar durante o combate.', 'warn');
      sfx.play('deny');
      return false;
    }
    if (!this.scene) return false;
    bus.emit('travel:start');
    sfx.play('waystone');
    await this.scene.teleport(ws.x, ws.y + 1.2);
    bus.emit('travel:end');
    return true;
  }

  /* ------------------------------------------------------------ morte */

  onPlayerDeath(): void {
    if (this.dead) return;
    this.dead = true;
    this.state.meta.lastDeathId = uid('morte-');
    sfx.play('death');
    bus.emit('player:died');
  }

  /** Volta ao último save e aplica a penalidade (uma única vez por morte). */
  async recoverFromDeath(): Promise<{ lost: number; remaining: number; fromSave: boolean }> {
    const deathId = this.state.meta.lastDeathId ?? uid('morte-');
    const rec = await this.saves.latest();
    let result: { lost: number; remaining: number; fromSave: boolean };
    if (rec) {
      const st = rec.state;
      const r = prog.applyDeathPenalty(st, deathId);
      const d = derive(st);
      st.player.hp = d.maxHp;
      st.player.mp = d.maxMp;
      this.applyState(st);
      await this.saves.save('auto', st, this.areaName(st.player.x, st.player.y));
      result = { lost: r.lost, remaining: r.remaining, fromSave: true };
    } else {
      const st = this.state;
      const r = prog.applyDeathPenalty(st, deathId);
      st.player.x = this.manifest.spawn.x;
      st.player.y = this.manifest.spawn.y;
      this.applyState(st);
      this.fullHeal();
      result = { lost: r.lost, remaining: r.remaining, fromSave: false };
    }
    await this.scene?.resetWorld();
    return result;
  }

  /* ------------------------------------------------------------ salvamento */

  areaName(x: number, y: number): string {
    for (const a of this.manifest.areas) if (dist(x, y, a.x, a.y) <= a.r) return a.name;
    return this.manifest.defaultArea;
  }

  private syncPosition(): void {
    const pos = this.scene?.playerPos();
    if (pos) {
      this.state.player.x = pos.x;
      this.state.player.y = pos.y;
    }
    this.persistFog();
  }

  async save(slot: SlotId): Promise<boolean> {
    if (this.dead) return false;
    this.syncPosition();
    try {
      await this.saves.save(slot, this.state, this.areaName(this.state.player.x, this.state.player.y));
      this.autosaveTimer = 0;
      bus.emit('saved', { slot });
      return true;
    } catch (err) {
      console.error(err);
      this.toast('Não foi possível salvar (armazenamento do navegador indisponível).', 'warn');
      return false;
    }
  }

  async autosave(_reason: string): Promise<void> {
    if (!this.running || this.dead || this.inCombat) return;
    this.autosaveTimer = 0;
    await this.save('auto');
  }

  async loadSlot(slot: SlotId): Promise<boolean> {
    const rec = await this.saves.load(slot);
    if (!rec) {
      this.toast('Este salvamento não pôde ser carregado.', 'warn');
      return false;
    }
    this.applyState(rec.state);
    await this.scene?.resetWorld();
    return true;
  }

  exportBackup(): string {
    this.syncPosition();
    return this.saves.exportJson(this.state);
  }

  async importBackup(text: string): Promise<void> {
    const st = this.saves.parseBackup(text);
    this.applyState(st);
    await this.scene?.resetWorld();
    await this.save('auto');
  }

  applySettings(s: Partial<Settings>): void {
    this.settings = { ...this.settings, ...s };
    saveSettings(this.settings);
    sfx.setVolume(this.settings.volume);
    bus.emit('state:changed');
  }

  questName(id: string): string {
    return QUESTS[id]?.name ?? id;
  }
}

export const game = new Game();
