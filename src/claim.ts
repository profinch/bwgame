/**
 * Taking ground.
 *
 * Every thread the machine has, all counting in different lanes of the same
 * search, all aiming at the same spot. What comes back is the closest any of
 * them has come and how many attempts that took — and that is the whole state
 * of it, because there is nothing to unlock and nothing to wait for: whatever
 * is best when you stop is what you may claim.
 */
import type { Dig, Found } from './mine';
import type { Report, Task, Trouble } from './mine.worker';

export interface Progress {
  /** Attempts made by every thread together. */
  tries: number;
  /** Attempts a second, over the last little while. */
  rate: number;
  /** The closest anything has come, and what it would cost to claim it. */
  best: Found | null;
  /** Threads at work. */
  threads: number;
  /** Whether the threads are standing still because the tab is out of sight. */
  paused: boolean;
}

/** A search in progress. Stopping it leaves the best it found standing. */
export interface Search {
  stop(): void;
  readonly progress: Progress;
}

/** Told when a thread cannot work, because a silent search looks like a slow one. */
export type OnTrouble = (what: string) => void;

/** Threads the machine has to offer. */
export function coresAvailable(): number {
  return navigator.hardwareConcurrency || 4;
}

const CORES_KEY = 'gs:cores';

/**
 * How many threads to set on it. The person's choice if they have made one;
 * otherwise half the machine.
 *
 * Every thread runs a hash loop flat out, so all of them turns a laptop into a
 * heater and the fans tell everyone about it. Half leaves the machine usable
 * and costs a factor of two in a search where a factor of two is √2 in
 * distance — hours of digging, not the difference between having a plot and
 * not. But it is their machine: the panel has a slider, and what it is set to
 * is kept.
 */
export function threadsChosen(): number {
  const cores = coresAvailable();
  try {
    const chosen = Number(localStorage.getItem(CORES_KEY));
    if (chosen >= 1 && chosen <= cores) return Math.floor(chosen);
  } catch {
    // no storage: the default, then
  }
  return Math.max(1, Math.floor(cores / 2));
}

export function chooseThreads(threads: number): void {
  try {
    localStorage.setItem(CORES_KEY, String(Math.max(1, Math.min(coresAvailable(), Math.floor(threads)))));
  } catch {
    // no storage: the choice holds for this page
  }
}

/**
 * Where to start counting: anywhere at all.
 *
 * The search is deterministic from its start — the same counter against the
 * same target makes the same attempt — and arriving at an address puts you on
 * exactly the same spot every time. So a search that always began at zero
 * would make exactly the same attempts as the last one from here, and find
 * exactly the same best again, and again. Beginning somewhere random means the
 * work is new work. The counter has sixty-three bits to grow into from there,
 * which is more than any machine will use.
 */
export function randomStart(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  bytes[0]! &= 0x7f;
  let start = 0n;
  for (const byte of bytes) start = (start << 8n) | BigInt(byte);
  return start;
}

export function search(
  spec: Dig,
  onProgress: (progress: Progress) => void,
  onTrouble: OnTrouble = () => {},
): Search {
  const threads = threadsChosen();
  const workers: Worker[] = [];
  const progress: Progress = { tries: 0, rate: 0, best: null, threads, paused: false };

  let since = performance.now();
  let counted = 0;
  let stopped = false;
  const start = randomStart();

  for (let lane = 0; lane < threads; lane++) {
    const worker = new Worker(new URL('./mine.worker.ts', import.meta.url), { type: 'module' });
    // a thread that dies says nothing on its own, and a search that reports
    // nothing looks exactly like a search that is simply slow
    worker.onerror = (event) => onTrouble(event.message || 'a thread died');
    worker.onmessageerror = () => onTrouble('a thread sent something unreadable');
    worker.onmessage = (event: MessageEvent<Report | Trouble>) => {
      if (stopped) return;
      if ('trouble' in event.data) {
        onTrouble(event.data.trouble);
        return;
      }
      const report = event.data;
      progress.tries += report.tries;
      counted += report.tries;
      if (report.best && (progress.best === null || report.best.away < progress.best.away)) {
        progress.best = report.best;
      }
      const now = performance.now();
      if (now - since > 500) {
        progress.rate = (counted / (now - since)) * 1000;
        counted = 0;
        since = now;
      }
      onProgress(progress);
    };
    // each thread counts in its own lane from the shared start: start + lane,
    // start + lane + threads, start + lane + 2·threads…
    const task: Task = { spec, from: String(start + BigInt(lane)), step: String(threads) };
    worker.postMessage(task);
    workers.push(worker);
  }

  /**
   * Out of sight, the threads stand still.
   *
   * A hidden tab still burns every core it was given, with nobody watching the
   * number go up — and a laptop lid closed on a search is a laptop that is hot
   * in the bag. So the threads pause with the tab and pick up where they were
   * when it comes back. The rate window is restarted then, so the first report
   * back does not average the work over the time nothing was done.
   */
  const onVisibility = () => {
    const hidden = document.hidden;
    for (const worker of workers) worker.postMessage(hidden ? 'pause' : 'resume');
    if (!hidden) {
      since = performance.now();
      counted = 0;
    }
    progress.paused = hidden;
    onProgress(progress);
  };
  document.addEventListener('visibilitychange', onVisibility);
  if (document.hidden) onVisibility();

  return {
    progress,
    stop() {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      for (const worker of workers) {
        worker.postMessage('stop');
        worker.terminate();
      }
      workers.length = 0;
    },
  };
}
