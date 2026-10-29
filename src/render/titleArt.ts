import { Pix, bayer, hash, noise1, rgb } from './storyArt';

/* Cena animada da tela inicial, em pixel art feita por código:
 * céu ao entardecer rasgado por uma Costura luminosa, montanhas em camadas, o castelo
 * de Eldenor ao longe, a borda do mundo virando pergaminho e esboço, e os quatro heróis
 * num penhasco. As camadas fixas são desenhadas uma vez; estrelas, Costura, vaga-lumes,
 * fragmentos e nuvens são animados por cima (~15 quadros por segundo). */

export class TitleScene {
  private base: HTMLCanvasElement | null = null;
  private W = 384;
  private H = 216;
  private raf = 0;
  private last = 0;
  private t0 = performance.now();
  private running = false;
  private groundY = 0;
  private heroX = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private heroes: HTMLCanvasElement[],
  ) {}

  /** Ajusta a resolução interna à proporção da tela (mais alta no celular em pé). */
  resize(): void {
    const aspect = window.innerHeight / Math.max(1, window.innerWidth);
    const portrait = aspect > 1;
    this.W = portrait ? 216 : 384;
    this.H = Math.round(Math.max(150, Math.min(portrait ? 470 : 260, this.W * aspect)));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.groundY = Math.round(this.H * (portrait ? 0.7 : 0.8));
    this.heroX = Math.round(this.W * (portrait ? 0.5 : 0.3));
    this.base = this.paintBase();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    const onResize = () => (this.canvas.isConnected ? this.resize() : window.removeEventListener('resize', onResize));
    window.addEventListener('resize', onResize);
    const loop = (now: number) => {
      if (!this.running) return;
      // a tela saiu do documento: para a animação
      if (!this.canvas.isConnected && now - this.t0 > 1000) {
        this.stop();
        window.removeEventListener('resize', onResize);
        return;
      }
      this.raf = requestAnimationFrame(loop);
      if (now - this.last < 66) return;
      this.last = now;
      this.frame((now - this.t0) / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private get horizon(): number {
    return this.groundY - Math.round(this.H * 0.16);
  }

  private paintBase(): HTMLCanvasElement {
    const W = this.W;
    const H = this.H;
    const p = new Pix(W, H);
    const hz = this.horizon;
    // céu ao entardecer
    p.sky(
      [
        [0, '#0b0a20'],
        [0.38, '#261d48'],
        [0.64, '#5e3566'],
        [0.84, '#c8685a'],
        [1, '#ffc27a'],
      ],
      0,
      hz + 6,
    );
    // sol baixo atrás das montanhas
    const sx = Math.round(W * 0.64);
    p.glow(sx, hz, Math.round(W * 0.22), '#ffb060', 0.5);
    p.disc(sx, hz, Math.round(W * 0.055), '#ffd88a');
    // montanhas em três camadas
    p.ridge(hz + 2, H * 0.14, 0.03, 101, '#5a3f72');
    const mid = p.ridge(hz + 10, H * 0.1, 0.045, 103, '#3a2b55');
    p.ridge(hz + 20, H * 0.07, 0.07, 107, '#251c3c');
    // castelo de Eldenor sobre a colina do meio
    const cx = Math.round(W * (W > H ? 0.57 : 0.72));
    const g = (mid[cx] ?? hz) + 2;
    const castle = rgb('#2c2246');
    p.rect(cx - 9, g - 14, 18, 14, castle);
    p.rect(cx - 13, g - 22, 5, 22, castle);
    p.rect(cx + 8, g - 26, 5, 26, castle);
    p.rect(cx - 2, g - 30, 4, 16, castle);
    for (let i = 0; i < 6; i++) p.rect(cx - 13 + i * 5, g - 24 - (i % 2) * 3, 2, 3, castle);
    p.rect(cx - 1, g - 33, 2, 3, castle);
    for (const [wx, wy] of [[cx + 9, g - 20], [cx - 11, g - 16], [cx - 4, g - 9], [cx + 3, g - 9], [cx, g - 24]] as [number, number][]) {
      p.rect(wx, wy, 1, 2, rgb('#ffd27a'));
      p.glow(wx, wy, 4, '#ffb84a', 0.25);
    }
    // vale com a estrada sinuosa que leva ao castelo
    p.sky([[0, '#1c2a2a'], [1, '#101a18']], hz + 18, H);
    for (let y = hz + 20; y < this.groundY + 6; y++) {
      const k = (y - hz - 20) / Math.max(1, this.groundY - hz - 14);
      const x = cx - 10 + Math.sin(k * 5) * W * 0.06 - k * W * 0.25;
      const w = 1 + k * 5;
      p.rect(x - w / 2, y, w, 1, rgb('#6a5a48'), 0.75);
    }
    // lamparinas ao longo da estrada
    for (let i = 0; i < 5; i++) {
      const k = 0.15 + i * 0.17;
      const y = hz + 20 + k * (this.groundY - hz - 14);
      const x = cx - 10 + Math.sin(k * 5) * W * 0.06 - k * W * 0.25 + 4;
      p.rect(x, y - 2, 1, 1, rgb('#ffd27a'));
      p.glow(x, y - 2, 4, '#ffb84a', 0.3);
    }
    // árvores distantes no vale
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(hash(i, 51) * W);
      const y = hz + 22 + Math.floor(hash(i, 52) * (this.groundY - hz - 26));
      p.tree(x, y, 6 + Math.floor(hash(i, 53) * 6), i % 3 ? '#16231c' : '#1d2c22', i % 2 === 0);
    }
    // borda inacabada do mundo: pergaminho e esboço à direita
    const paper = rgb('#e8dcb5');
    const grid = rgb('#cbbd94');
    for (let y = 0; y < this.groundY; y++) {
      const edge = W * 0.9 + noise1(y * 0.1, 9) * W * 0.05 - (this.groundY - y) * 0.04;
      for (let x = Math.floor(edge); x < W; x++) {
        const d = x - edge;
        if (d < 3 && bayer(x, y) > d / 3) continue;
        p.set(x, y, x % 9 === 0 || y % 9 === 0 ? grid : paper);
      }
      p.set(Math.floor(edge) - 1, y, rgb('#2a1a10'), 0.6);
    }
    for (let x = Math.floor(W * 0.88); x < W; x++) {
      const n = noise1(x * 0.03, 101) * 0.65 + noise1(x * 0.081, 108) * 0.35;
      const y = Math.round(hz + 2 - n * H * 0.14);
      if (x % 2 === 0) p.set(x, y, rgb('#8a7a5a'));
    }
    // penhasco do primeiro plano onde estão os heróis
    const rock = rgb('#120e1e');
    const rock2 = rgb('#1c1730');
    for (let x = 0; x < W; x++) {
      const k = Math.abs(x - this.heroX) / (W * 0.5);
      const top = this.groundY - 4 + Math.round(k * k * H * 0.12 + noise1(x * 0.12, 77) * 3);
      for (let y = top; y < H; y++) p.set(x, y, y < top + 2 ? rock2 : rock);
      // tufos de grama na borda
      if (hash(x, 5) > 0.7) for (let i = 1; i <= 2 + Math.floor(hash(x, 6) * 3); i++) p.set(x, top - i, rock2);
    }
    // placa da estrada
    const px0 = this.heroX + Math.round(W * (W > H ? 0.14 : 0.3));
    const pt = this.groundY - 4;
    p.rect(px0, pt - 12, 1, 12, rock2);
    p.rect(px0 - 4, pt - 12, 9, 3, rock2);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    p.put(c.getContext('2d')!);
    return c;
  }

  private frame(t: number): void {
    const ctx = this.canvas.getContext('2d')!;
    const W = this.W;
    const H = this.H;
    const hz = this.horizon;
    ctx.imageSmoothingEnabled = false;
    if (this.base) ctx.drawImage(this.base, 0, 0);
    const dot = (x: number, y: number, color: string, a: number, s = 1) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    };
    // estrelas piscando
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash(i, 3) * W * 0.88);
      const y = Math.floor(hash(i, 4) * hz * 0.6);
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash(i, 5) * 3) + i);
      dot(x, y, '#fff6e0', 0.25 + tw * 0.7);
      if (hash(i, 6) > 0.92 && tw > 0.8) {
        dot(x - 1, y, '#fff6e0', 0.45);
        dot(x + 1, y, '#fff6e0', 0.45);
        dot(x, y - 1, '#fff6e0', 0.45);
        dot(x, y + 1, '#fff6e0', 0.45);
      }
    }
    // a Costura no céu: um rasgo de luz com pontos de linha, pulsando
    const pulse = 0.65 + 0.35 * Math.sin(t * 2.2);
    const seamY = (x: number) => hz * (W > H ? 0.3 : 0.46) + Math.sin(x * 0.035 + 1) * hz * 0.06 + (x - W / 2) * 0.08;
    for (let x = Math.floor(W * 0.08); x < W * 0.9; x++) {
      const y = seamY(x);
      const fade = Math.min(1, (x - W * 0.08) / 30, (W * 0.9 - x) / 30);
      dot(x, y - 2, '#7a4ad0', 0.25 * pulse * fade);
      dot(x, y - 1, '#b48cff', 0.6 * pulse * fade);
      dot(x, y, '#f0e0ff', 0.95 * fade);
      dot(x, y + 1, '#b48cff', 0.55 * pulse * fade);
      if (x % 7 === 0) {
        for (let k = -3; k <= 3; k++) dot(x + k * 0.4, y + k, '#f0e0ff', 0.7 * fade);
      }
    }
    // fiapos de luz caindo da Costura
    for (let i = 0; i < 14; i++) {
      const x = W * 0.12 + hash(i, 21) * W * 0.74;
      const sp = 4 + hash(i, 22) * 6;
      const y = seamY(x) + ((t * sp + hash(i, 23) * 60) % 60);
      dot(x + Math.sin(t + i) * 2, y, '#d8b8ff', 0.8 - ((t * sp + hash(i, 23) * 60) % 60) / 70);
    }
    // fragmentos do mundo se soltando na borda de pergaminho
    for (let i = 0; i < 18; i++) {
      const sp = 2 + hash(i, 31) * 5;
      const x = W * 0.86 + ((hash(i, 32) * 40 + t * sp) % (W * 0.2));
      const y = hash(i, 33) * this.groundY - ((t * sp * 0.4) % 30);
      const s = 1 + Math.floor(hash(i, 34) * 2);
      dot(x, y, ['#5a3f72', '#ffd27a', '#3a2b55', '#c8685a'][i % 4], 1 - (x - W * 0.86) / (W * 0.2), s);
    }
    ctx.globalAlpha = 1;
    // heróis no penhasco (respiração alternada)
    const n = this.heroes.length;
    const gap = W > H ? 34 : 26;
    this.heroes.forEach((hcv, i) => {
      const bob = Math.sin(t * 2 + i * 1.3) > 0.6 ? -1 : 0;
      const x = Math.round(this.heroX + (i - (n - 1) / 2) * gap - hcv.width / 2);
      const y = Math.round(this.groundY - 2 - hcv.height + 10 + bob);
      // sombra
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#05040a';
      ctx.fillRect(x + hcv.width / 2 - 9, this.groundY + 6, 18, 2);
      ctx.globalAlpha = 1;
      ctx.drawImage(hcv, x, y);
    });
    // vaga-lumes perto do chão
    for (let i = 0; i < 16; i++) {
      const x = (hash(i, 41) * W + Math.sin(t * 0.6 + i) * 10 + W) % W;
      const y = this.groundY - 6 - hash(i, 42) * H * 0.18 + Math.cos(t * 0.9 + i * 2) * 4;
      dot(x, y, '#d8ff7a', 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.5 + i * 1.7)));
    }
    ctx.globalAlpha = 1;
  }
}
