/**
 * The chain, passing overhead.
 *
 * A transaction is two addresses and an outcome. Both addresses are places on
 * this map, so a transaction is a line between them — and since it is an event
 * rather than a thing, the line arrives, crosses, and goes. Nothing about it is
 * kept: what lasts is the state it left behind, not the transaction.
 *
 * One honest difficulty. Two unrelated addresses lie some 2^80 metres apart, so
 * a literal line between them passes nowhere near anybody and would never be
 * seen. Any visible traffic needs a convention, and the one that lies least is:
 * **the bearing is true, the distance is folded to the horizon**. Where an
 * address is genuinely close it is drawn where it is, and the two cases meet in
 * the middle without a seam.
 *
 * What falls out of that for free: the distances are so large that the bearing
 * to a busy address is near enough the same from anywhere in a neighbourhood.
 * Constant directions build up over a lived-in place, like trade winds — the
 * sky starts to say who this ground talks to.
 */
import { offsetOf } from './land';

export interface Passing {
  /** Both ends, in metres from home. Huge numbers; only differences matter. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Whether it did anything. A revert happened, cost gas, and changed nothing. */
  ok: boolean;
  /** Seconds since it arrived. */
  age: number;
  /**
   * A number of its own, from the two addresses.
   *
   * Everything that must differ between one streak and the next hangs off this:
   * how high it flies, how far out its folded ends sit, which way a broken one
   * forks. Held at one value they all bottom out together and draw a second,
   * false horizon across the sky — which is what they did.
   */
  seed: number;
}

export interface BlockTraffic {
  number: number;
  passing: Moved[];
}

/** One movement between two addresses. */
export interface Moved {
  from: string;
  to: string;
  ok: boolean;
}

/** How long a good streak lives, and how long its head takes to cross. */
const LIFE_OK = 7;

/**
 * A failed one runs out, stops, waits, and then draws itself back in.
 *
 * This is the difference worth showing. A revert happened and cost gas, and
 * then everything it did was undone — so it is the one thing in this world that
 * goes backwards. Nothing else does, which makes it unmistakable without having
 * to be loud about it.
 */
const FAILED_OUT = 1.3;
const FAILED_HOLD = 0.9;
const FAILED_BACK = 2.4;
const LIFE_FAILED = FAILED_OUT + FAILED_HOLD + FAILED_BACK;
const CROSSING = 2.2;

/**
 * A failed call still went the whole way — it reached the address and changed
 * nothing. Cutting it short in mid-air was a guess at where it broke, which
 * needs traces to know, and it left the streak hanging with neither end.
 */
const FAILS_AT = 1;

/** Beyond this, an address is drawn as a direction rather than a place. */
export const HORIZON = 1400;

/** How high the folded sky sits over the ground, before the streak's own scatter. */
const ALTITUDE = 300;

/** Segments along a good streak. Enough that a bend reads as a curve, not a corner. */
const JOINTS = 72;

/**
 * And along a failed one, which is drawn as a waveform and needs the room for
 * it. They are rare — a live block had one in two hundred and sixty-one — so
 * the extra work is nothing.
 */
const SHAKEN_JOINTS = 176;

/** Half-width of the ribbon, in metres. Wider and a close pass fills the screen. */
const WIDTH = 0.38;

/** More than this on screen and the sky is noise rather than weather. */
const MOST = 150;

/**
 * How long a block's worth is let out over.
 *
 * A block lands all at once, but the traffic in it was sent across the slot
 * before it. Tipping two hundred lines into the sky together and watching them
 * all die together is neither how it happened nor pleasant to look at, so they
 * are released at the rate they arrived: one every slot divided by their number.
 */
const SLOT = 12;

export class Traffic {
  private streaks: Passing[] = [];
  private waiting: Moved[] = [];
  private pace = 0;
  private owed = 0;
  private lastBlock = 0;

  /** Room for the worst case, filled in place: rebuilding this every frame was
   *  what dragged the whole thing down to a few frames a second. */
  private readonly buffer = new Float32Array(MOST * SHAKEN_JOINTS * 6 * 4);

  get flying(): number {
    return this.streaks.length;
  }

  get queued(): number {
    return this.waiting.length;
  }

  get block(): number {
    return this.lastBlock;
  }

  /** Take a block's worth of transactions and queue them to be let out. */
  arrive(block: BlockTraffic): void {
    this.lastBlock = block.number;
    this.waiting = block.passing.slice(0, MOST * 3);
    // at least one a second, or a quiet block would trickle out over the slot
    this.pace = this.waiting.length > 0 ? Math.max(this.waiting.length / SLOT, 1) : 0;
    this.owed = 0;
  }

  private launch(one: Moved): void {
    const a = offsetOf(one.from);
    const b = offsetOf(one.to);
    let seed = 0;
    const text = one.from + one.to;
    for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    this.streaks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ok: one.ok, age: 0, seed });
  }

  /** A steady number in [0, 1) from a streak's seed and a counter. */
  private static wobble(seed: number, n: number): number {
    let h = (seed ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  step(seconds: number): void {
    // let out as many as the slot has earned, so the sky is a stream not a burst
    this.owed += this.pace * seconds;
    while (this.owed >= 1 && this.waiting.length > 0 && this.streaks.length < MOST) {
      this.owed -= 1;
      this.launch(this.waiting.shift()!);
    }
    if (this.waiting.length === 0) this.owed = 0;

    // age and drop, in place: a new array every frame is a new array every frame
    let kept = 0;
    for (const streak of this.streaks) {
      streak.age += seconds;
      if (streak.age < (streak.ok ? LIFE_OK : LIFE_FAILED)) this.streaks[kept++] = streak;
    }
    this.streaks.length = kept;
  }

  /**
   * Fold one end into view: its own place if it is close, otherwise its
   * direction, held at the horizon.
   */
  private fold(
    x: number,
    z: number,
    vx: number,
    vz: number,
    reach: number,
  ): { x: number; z: number; far: boolean } {
    const dx = x - vx;
    const dz = z - vz;
    const away = Math.hypot(dx, dz);
    if (away <= reach) return { x: dx, z: dz, far: false };
    return { x: (dx / away) * reach, z: (dz / away) * reach, far: true };
  }

  /**
   * Build the ribbons, in world metres around the viewer.
   *
   * Two triangles a joint, laid flat and lofted in the middle, with the head
   * bright and the tail thinning out behind it. A failed one stops where it
   * broke and comes apart from the far end back, because the change it was
   * making was undone.
   */
  build(
    vx: number,
    vy: number,
    vz: number,
    /**
     * The middle of the patch, in world metres. Streaks are kept in world
     * coordinates and drawn in the patch's, because a card cannot hold the
     * former: everything it is given must be near zero or it comes out torn.
     */
    origin: { x: number; z: number },
    /**
     * How high to come down to at a point — the middle of whatever stands
     * there, not the dirt at its foot. A transaction is for the thing, so it
     * goes into it; landing at the base makes it look like it missed.
     */
    landingAt: (x: number, z: number) => number = () => 0,
  ): { vertices: Float32Array; count: number } {
    const out = this.buffer;
    let at = 0;
    const room = out.length - SHAKEN_JOINTS * 6 * 4;

    for (const streak of this.streaks) {
      if (at > room) break;
      const life = streak.ok ? LIFE_OK : LIFE_FAILED;
      const gone = streak.age / life;

      let head: number;
      let withdrawn = 0;
      if (streak.ok) {
        head = Math.min(1, streak.age / CROSSING);
      } else {
        // out as far as it got, a pause, then back the way it came
        const back = streak.age - FAILED_OUT - FAILED_HOLD;
        head = FAILS_AT * Math.min(1, streak.age / FAILED_OUT);
        if (back > 0) withdrawn = Math.min(1, back / FAILED_BACK);
      }
      if (head <= 0) continue;

      // its own sky and its own distance, or they all pin to one circle
      const sky = ALTITUDE * (0.35 + Traffic.wobble(streak.seed, 0) * 1.5);
      const reach = HORIZON * (0.5 + Traffic.wobble(streak.seed, 1) * 0.5);

      // both ends in the patch's metres, then folded around the viewer
      const a = this.fold(streak.ax - origin.x, streak.az - origin.z, vx, vz, reach);
      const b = this.fold(streak.bx - origin.x, streak.bz - origin.z, vx, vz, reach);
      const runX = b.x - a.x;
      const runZ = b.z - a.z;
      const run = Math.hypot(runX, runZ);
      if (run < 1) continue;
      const acrossX = -runZ / run;
      const acrossZ = runX / run;

      /**
       * Everything travels in the sky. An end that was folded to the horizon
       * stays up there; an end that is a real place is come down to, steeply and
       * late, so a transaction dives into the thing it is for rather than
       * skimming across the ground towards it.
       *
       * The two are blended along the run rather than swapped halfway — swapping
       * put a vertical kink in the middle of every mixed streak, which is what
       * the sharp spikes were.
       */
      /**
       * The last part of the run is the descent.
       *
       * Level across the sky, then bending over and dropping in almost straight
       * down onto the roof. The curve has to leave the flat part with no change
       * of slope, or the join shows as a corner — so it is flat where it meets
       * the sky and steepest where it arrives.
       */
      // The descent is a distance, not a share of the run: a fifth of a long
      // chord is hundreds of metres, and the line then comes down across the
      // whole roof instead of onto it.
      const DIVE = Math.min(0.35, 70 / run);
      const drop = (t: number) => {
        const u = 1 - Math.max(0, Math.min(1, t / DIVE));
        return 1 - u * u * u;
      };
      const arch = Math.min(sky * 0.35, run * 0.2);
      // where each end comes to rest, if it is a place rather than a bearing
      const restA = a.far ? 0 : landingAt(vx + a.x, vz + a.z) - vy;
      const restB = b.far ? 0 : landingAt(vx + b.x, vz + b.z) - vy;
      const rise = (t: number) => {
        const inA = a.far ? 1 : drop(t);
        const inB = b.far ? 1 : drop(1 - t);
        const rest = restA * (1 - inA) + restB * (1 - inB);
        return vy + rest + (sky + Math.sin(Math.PI * t) * arch) * inA * inB;
      };

      const joints = streak.ok ? JOINTS : SHAKEN_JOINTS;
      let previous: { x: number; y: number; z: number; a: number; w: number } | null = null;
      for (let joint = 0; joint <= joints; joint++) {
        /**
         * Points crowd towards the ends and thin out in the middle.
         *
         * Everything worth drawing happens at the ends — the climb away and the
         * dive in — and the dive is now measured in metres, so on a long chord
         * evenly spaced points give it one or two of them and it comes out as an
         * elbow. In the middle the line only flies straight, and can be sampled
         * as sparsely as you like.
         */
        const even = joint / joints;
        // Crowding everything at the ends starves the middle, which is where
        // the flight arches — so it is half crowded and half even, and dense
        // enough either way that no part of it is drawn in straight pieces.
        const crowded = 0.5 - 0.5 * Math.cos(Math.PI * even);
        const t = (even * 0.45 + crowded * 0.55) * head;
        // folded around the viewer, drawn in the patch: the two are a walk
        // apart, and left unconverted every streak lands that far off the
        // address it belongs to
        let x = vx + a.x + runX * t;
        let z = vz + a.z + runZ * t;
        let y = rise(t);

        // Bright at the head, lighter behind it, and the whole thing fading out.
        // The tail keeps a share of its weight rather than going to nothing: it
        // used to vanish at the origin, which hid the climb away from a roof and
        // made outgoing traffic look like it began in mid-air.
        const behind = Math.max(0, head - t) / Math.max(0.08, head);
        let alpha = (0.4 + 0.6 * (1 - behind * behind)) * (1 - gone) * 0.8;
        let width = WIDTH;

        if (!streak.ok) {
          /**
           * A failed one shakes.
           *
           * It runs the same way as any other and then does two things nothing
           * else does: it trembles along its whole length, and it draws itself
           * back in. One of those is visible at a glance from any distance, the
           * other says what actually happened — it went, it cost gas, and every
           * bit of it was undone.
           */
          const along = t / head;
          /**
           * Up and down about its own path, the way a waveform is drawn.
           *
           * The phase belongs to the path, not to how much of it is drawn yet.
           * Hung off the fraction travelled, the wave stretched as the line grew
           * — every crest sliding forward — instead of the line simply reaching
           * further along a wave that was already there.
           */
          const envelope = Math.sin(Math.PI * Math.min(1, t)) ** 0.7;
          const swing = Math.min(run * 0.009, sky * 0.03) * envelope;
          y += Math.sin(t * Math.PI * 22) * swing;

          width = WIDTH * 1.3;
          // it holds its weight all the way home rather than fading where it
          // stopped: the point is that it goes back, not that it wears out
          alpha = Math.min(0.95, (0.5 + 0.5 * (1 - behind * behind)) * 1.15);
          // and the far end is drawn in, until there is nothing left of it
          if (along > 1 - withdrawn) alpha = 0;
        }

        const here = { x, y, z, a: alpha, w: width };
        if (previous) {
          const put = (p: typeof here, sign: number) => {
            out[at] = p.x + acrossX * p.w * sign;
            out[at + 1] = p.y;
            out[at + 2] = p.z + acrossZ * p.w * sign;
            out[at + 3] = p.a;
            at += 4;
          };
          put(previous, -1);
          put(previous, 1);
          put(here, 1);
          put(previous, -1);
          put(here, 1);
          put(here, -1);
        }
        previous = here;
      }
    }

    // a view of the filled part, not a copy of it
    return { vertices: out.subarray(0, at), count: at / 4 };
  }
}

/**
 * Blocks from a public gateway, polled.
 *
 * Deliberately behind an interface. This is the right shape for one player and
 * the wrong one for a hundred — the head of the chain is the same for everybody,
 * so eventually one reader takes it and hands it round. Swapping this for a
 * socket changes nothing else.
 */
export interface BlockSource {
  start(onBlock: (block: BlockTraffic) => void): () => void;
}

const DEAD = '0x000000000000000000000000000000000000dEaD';

export function pollBlocks(urls: readonly string[], every = 6000): BlockSource {
  return {
    start(onBlock) {
      let seen = 0;
      let stopped = false;

      const ask = async <T>(method: string, params: unknown[]): Promise<T | null> => {
        for (const url of urls) {
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            });
            const answer = (await response.json()) as { result?: T };
            if (answer.result !== undefined && answer.result !== null) return answer.result;
          } catch {
            // next gateway
          }
        }
        return null;
      };

      const tick = async () => {
        if (stopped) return;
        const block = await ask<{
          number: string;
          transactions: { from: string; to: string | null }[];
        }>('eth_getBlockByNumber', ['latest', true]);

        if (block && !stopped) {
          const number = parseInt(block.number, 16);
          if (number > seen) {
            seen = number;
            const receipts = await ask<{ status: string; contractAddress: string | null }[]>(
              'eth_getBlockReceipts',
              [block.number],
            );
            const passing = block.transactions.map((tx, index) => ({
              from: tx.from,
              // a contract creation lands on the address it made; if the receipts
              // did not arrive, it goes to the burn address, which is at least a place
              to: tx.to ?? receipts?.[index]?.contractAddress ?? DEAD,
              ok: receipts?.[index]?.status !== '0x0',
            }));
            if (!stopped) onBlock({ number, passing });
          }
        }
        if (!stopped) setTimeout(tick, every);
      };

      void tick();
      return () => {
        stopped = true;
      };
    },
  };
}
