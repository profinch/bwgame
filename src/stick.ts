/**
 * Walking with a thumb.
 *
 * On a phone there are no keys, so the left thumb gets a stick: put it down
 * anywhere on the pad, push, and you walk that way — further from the centre,
 * faster, and at the rim you run. The right thumb keeps the canvas, which
 * already turns the head when dragged. A jump and the change of view are
 * buttons, because a gesture for either would fight with looking.
 *
 * Nothing here decides how walking works: it only says how hard and which way
 * the thumb is pushing, and the walker reads that alongside the keys.
 */

/** Past this share of the pad's radius, you are running. */
const RUNS_AT = 0.85;

/** Whether this is a device driven by touch rather than by a mouse and keys. */
export function coarse(): boolean {
  try {
    return matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export class Stick {
  /** -1..1: forward is up on the pad. */
  forward = 0;
  /** -1..1: right is right. */
  side = 0;
  run = false;
  private jumped = false;
  private pointer: number | null = null;

  constructor(
    private readonly pad: HTMLElement,
    private readonly knob: HTMLElement,
    jump: HTMLElement,
  ) {
    pad.addEventListener('pointerdown', (event) => {
      if (this.pointer !== null) return;
      this.pointer = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      this.push(event);
      event.preventDefault();
    });
    pad.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.pointer) return;
      this.push(event);
      event.preventDefault();
    });
    const let_go = (event: PointerEvent) => {
      if (event.pointerId !== this.pointer) return;
      this.pointer = null;
      this.forward = 0;
      this.side = 0;
      this.run = false;
      this.knob.style.transform = '';
    };
    pad.addEventListener('pointerup', let_go);
    pad.addEventListener('pointercancel', let_go);

    jump.addEventListener('pointerdown', (event) => {
      this.jumped = true;
      event.preventDefault();
    });
  }

  /** Whether a jump was asked for since the last time anyone looked. */
  takeJump(): boolean {
    const asked = this.jumped;
    this.jumped = false;
    return asked;
  }

  private push(event: PointerEvent): void {
    const box = this.pad.getBoundingClientRect();
    const radius = box.width / 2;
    let dx = (event.clientX - (box.left + radius)) / radius;
    let dy = (event.clientY - (box.top + radius)) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    this.side = dx;
    this.forward = -dy;
    this.run = length >= RUNS_AT;
    // the knob follows the thumb, as far as the rim
    this.knob.style.transform = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
  }
}
