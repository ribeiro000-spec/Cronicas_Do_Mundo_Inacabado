/* Estado de entrada unificado: joystick virtual, botões de toque, teclado e mouse
 * escrevem aqui; a cena só lê. Assim os controles são iguais em todas as plataformas. */

export type ActionName = 'attack' | 'skill0' | 'skill1' | 'skill2' | 'skill3' | 'dodge' | 'interact' | 'potion';

class InputState {
  /** direção de movimento na tela (-1..1), já com zona morta */
  moveX = 0;
  moveY = 0;
  private keyX = 0;
  private keyY = 0;
  private stickX = 0;
  private stickY = 0;
  attackHeld = false;
  private keyAttack = false;
  private touchAttack = false;
  private pressed = new Set<ActionName>();
  /** posição do mouse no mundo (para mirar), quando o jogador usa mouse */
  aim: { x: number; y: number } | null = null;
  enabled = true;

  setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
    this.recompute();
  }

  setKeys(x: number, y: number): void {
    this.keyX = x;
    this.keyY = y;
    this.recompute();
  }

  private recompute(): void {
    let x = this.stickX + this.keyX;
    let y = this.stickY + this.keyY;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.moveX = x;
    this.moveY = y;
  }

  setAttackKey(down: boolean): void {
    this.keyAttack = down;
    this.attackHeld = this.keyAttack || this.touchAttack;
  }

  setAttackTouch(down: boolean): void {
    this.touchAttack = down;
    this.attackHeld = this.keyAttack || this.touchAttack;
  }

  press(a: ActionName): void {
    if (this.enabled) this.pressed.add(a);
  }

  consume(a: ActionName): boolean {
    if (!this.pressed.has(a)) return false;
    this.pressed.delete(a);
    return true;
  }

  reset(): void {
    this.stickX = this.stickY = this.keyX = this.keyY = 0;
    this.keyAttack = this.touchAttack = false;
    this.attackHeld = false;
    this.pressed.clear();
    this.recompute();
  }
}

export const input = new InputState();
