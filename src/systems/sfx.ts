/* Efeitos sonoros sintetizados com Web Audio — nenhum arquivo de áudio para baixar.
 * Quando houver áudio de verdade, troque play() por um carregamento de public/assets/audio. */

export type SfxName =
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'arrow'
  | 'magic'
  | 'explosion'
  | 'heal'
  | 'pickup'
  | 'coin'
  | 'chest'
  | 'levelup'
  | 'quest'
  | 'click'
  | 'deny'
  | 'death'
  | 'step'
  | 'waystone'
  | 'boss';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.6;
  private last: Partial<Record<SfxName, number>> = {};

  /** Precisa ser chamado depois de um toque/clique (política de autoplay). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName): void {
    if (!this.ctx || this.volume <= 0) return;
    const now = performance.now();
    if ((this.last[name] ?? 0) > now - 45) return; // evita empilhar o mesmo som
    this.last[name] = now;
    switch (name) {
      case 'swing':
        this.noise(0.12, 0.25, 1800, 0.8);
        break;
      case 'hit':
        this.noise(0.08, 0.35, 900, 1.2);
        this.tone(160, 0.08, 'square', 0.12, 90);
        break;
      case 'hurt':
        this.tone(220, 0.18, 'sawtooth', 0.15, 110);
        break;
      case 'arrow':
        this.noise(0.1, 0.18, 3000, 2);
        this.tone(900, 0.08, 'triangle', 0.05, 500);
        break;
      case 'magic':
        this.tone(520, 0.22, 'sine', 0.14, 1040);
        this.tone(780, 0.18, 'triangle', 0.06, 1300, 0.03);
        break;
      case 'explosion':
        this.noise(0.45, 0.5, 300, 0.6);
        this.tone(90, 0.35, 'sine', 0.25, 40);
        break;
      case 'heal':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.1, undefined, i * 0.07));
        break;
      case 'pickup':
        this.tone(660, 0.08, 'square', 0.07);
        this.tone(990, 0.1, 'square', 0.06, undefined, 0.06);
        break;
      case 'coin':
        this.tone(1320, 0.07, 'square', 0.05);
        this.tone(1760, 0.12, 'square', 0.05, undefined, 0.05);
        break;
      case 'chest':
        this.tone(330, 0.12, 'triangle', 0.12);
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'square', 0.05, undefined, 0.1 + i * 0.06));
        break;
      case 'levelup':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, 'square', 0.07, undefined, i * 0.09));
        break;
      case 'quest':
        [659, 784, 988].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.1, undefined, i * 0.1));
        break;
      case 'click':
        this.tone(880, 0.04, 'square', 0.04);
        break;
      case 'deny':
        this.tone(180, 0.12, 'square', 0.08, 140);
        break;
      case 'death':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.12, undefined, i * 0.22));
        break;
      case 'step':
        this.noise(0.04, 0.05, 500, 1);
        break;
      case 'waystone':
        [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.08, undefined, i * 0.08));
        break;
      case 'boss':
        this.tone(73, 1.2, 'sawtooth', 0.18, 55);
        this.noise(0.8, 0.2, 200, 0.5);
        break;
    }
  }
}

export const sfx = new Sfx();
