/**
 * Ground coming up from under the auger.
 *
 * The screw is half sunk, and something has to come out of the hole. What does
 * is the ground itself: little cubes of it, thrown out from the rim, up and
 * outward and a little round with the turning, that fall back and are gone
 * where they land. More of them the faster the threads go, none when the
 * threads stand still — so the spray is the rate, made visible from across
 * the plate.
 *
 * Nothing here is kept. A chip lives for the second it is in the air, and the
 * ground it fell on is exactly as it was.
 */
import { INSTANCE_FLOATS } from './engine/renderer';

/** Chips in the air at once, at most. */
const MOST = 48;

/** How far out from the axis a chip starts: the rim of the screw at the ground. */
const RIM = 0.17;

interface Chip {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Where the ground is for this one; it is gone when it comes back to it. */
  floor: number;
  size: number;
  turn: number;
}

export interface Source {
  x: number;
  /** Ground level at the hole. */
  y: number;
  z: number;
}

export class Chips {
  private readonly chips: Chip[] = [];
  /** Chips owed and not yet thrown, carried between frames. */
  private due = 0;
  /** One instance a chip, and zeros where there is none. */
  readonly instances = new Float32Array(MOST * INSTANCE_FLOATS);

  /**
   * Move everything a frame on. `source` is where the auger stands, or null
   * when nothing is being dug; `rate` is attempts a second, which sets how
   * many chips come up; `gravity` is the world's, so a chip falls the way a
   * walker does.
   */
  step(seconds: number, source: Source | null, rate: number, gravity: number): void {
    // the ones in the air move first, then new ones are thrown: a chip is seen
    // at the rim for a frame before gravity has a say, whatever the frame is
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const chip = this.chips[i]!;
      chip.vy -= gravity * seconds;
      chip.x += chip.vx * seconds;
      chip.y += chip.vy * seconds;
      chip.z += chip.vz * seconds;
      if (chip.vy < 0 && chip.y <= chip.floor) {
        this.chips[i] = this.chips[this.chips.length - 1]!;
        this.chips.pop();
      }
    }

    if (source && rate > 0) {
      const perSecond = 8 + 28 * Math.min(1, rate / 4e7);
      this.due += seconds * perSecond;
      while (this.due >= 1) {
        this.due -= 1;
        if (this.chips.length < MOST) this.chips.push(this.throwFrom(source));
      }
    } else {
      this.due = 0;
    }

    this.instances.fill(0);
    for (let i = 0; i < this.chips.length; i++) {
      const chip = this.chips[i]!;
      const at = i * INSTANCE_FLOATS;
      this.instances[at] = chip.x;
      this.instances[at + 1] = chip.y;
      this.instances[at + 2] = chip.z;
      this.instances[at + 3] = chip.size;
      this.instances[at + 4] = chip.size;
      this.instances[at + 5] = chip.size;
      this.instances[at + 6] = chip.turn;
      this.instances[at + 7] = 0.34; // the ground, as the ground is drawn
      this.instances[at + 8] = 1;
      this.instances[at + 9] = 0;
    }
  }

  /** How many are in the air. */
  get flying(): number {
    return this.chips.length;
  }

  private throwFrom(source: Source): Chip {
    const angle = Math.random() * 2 * Math.PI;
    const out = Math.cos(angle);
    const across = Math.sin(angle);
    // up and outward mostly, and a little round with the turning of the screw
    const outward = 0.7 + Math.random() * 1.5;
    const round = 0.5 + Math.random() * 1.0;
    return {
      x: source.x + out * RIM,
      y: source.y + 0.02,
      z: source.z + across * RIM,
      vx: out * outward - across * round,
      vy: 1.6 + Math.random() * 1.9,
      vz: across * outward + out * round,
      floor: source.y,
      size: 0.03 + Math.random() * 0.06,
      turn: Math.random() * Math.PI,
    };
  }
}
