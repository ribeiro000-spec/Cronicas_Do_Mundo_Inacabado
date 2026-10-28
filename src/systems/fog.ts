import { b64ToBytes, bytesToB64 } from '../core/util';

/* Névoa do mapa: o mundo é dividido em células; cada bit diz se a célula já foi revelada
 * (andando por perto ou lendo um fragmento de mapa). Cabe em poucas centenas de bytes no save. */
export class Fog {
  readonly cols: number;
  readonly rows: number;
  private bits: Uint8Array;
  version = 0;

  constructor(
    worldW: number,
    worldH: number,
    readonly cell: number,
  ) {
    this.cols = Math.ceil(worldW / cell);
    this.rows = Math.ceil(worldH / cell);
    this.bits = new Uint8Array(Math.ceil((this.cols * this.rows) / 8));
  }

  load(b64: string): void {
    this.bits.fill(0);
    if (!b64) return;
    try {
      const src = b64ToBytes(b64);
      this.bits.set(src.subarray(0, this.bits.length));
    } catch {
      /* save antigo ou corrompido: começa sem névoa revelada */
    }
    this.version++;
  }

  save(): string {
    return bytesToB64(this.bits);
  }

  private setCell(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    const i = r * this.cols + c;
    const byte = i >> 3;
    const mask = 1 << (i & 7);
    if (this.bits[byte] & mask) return false;
    this.bits[byte] |= mask;
    return true;
  }

  isCellRevealed(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    const i = r * this.cols + c;
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  isRevealed(x: number, y: number): boolean {
    return this.isCellRevealed(Math.floor(x / this.cell), Math.floor(y / this.cell));
  }

  revealCircle(x: number, y: number, r: number): boolean {
    let changed = false;
    const c0 = Math.floor((x - r) / this.cell);
    const c1 = Math.floor((x + r) / this.cell);
    const r0 = Math.floor((y - r) / this.cell);
    const r1 = Math.floor((y + r) / this.cell);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const cx = (cc + 0.5) * this.cell;
        const cy = (rr + 0.5) * this.cell;
        if (Math.hypot(cx - x, cy - y) <= r + this.cell * 0.5 && this.setCell(cc, rr)) changed = true;
      }
    }
    if (changed) this.version++;
    return changed;
  }

  revealRect(x0: number, y0: number, x1: number, y1: number): boolean {
    let changed = false;
    for (let rr = Math.floor(y0 / this.cell); rr <= Math.floor(y1 / this.cell); rr++)
      for (let cc = Math.floor(x0 / this.cell); cc <= Math.floor(x1 / this.cell); cc++) if (this.setCell(cc, rr)) changed = true;
    if (changed) this.version++;
    return changed;
  }

  revealedFraction(): number {
    let n = 0;
    for (let i = 0; i < this.cols * this.rows; i++) if (this.bits[i >> 3] & (1 << (i & 7))) n++;
    return n / (this.cols * this.rows);
  }
}
