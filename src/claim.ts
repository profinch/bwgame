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
}

/** A search in progress. Stopping it leaves the best it found standing. */
export interface Search {
  stop(): void;
  readonly progress: Progress;
}

/** Told when a thread cannot work, because a silent search looks like a slow one. */
export type OnTrouble = (what: string) => void;

/**
 * How many threads to set on it: half the machine.
 *
 * Every one of them runs a hash loop flat out, so all-but-one turns a laptop
 * into a heater and the fans tell everyone about it. Half leaves the machine
 * usable and costs a factor of two in a search where a factor of two is
 * √2 in distance — hours of digging, not the difference between having a plot
 * and not.
 */
export function threadsAvailable(): number {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.floor(cores / 2));
}

export function search(
  spec: Dig,
  onProgress: (progress: Progress) => void,
  onTrouble: OnTrouble = () => {},
): Search {
  const threads = threadsAvailable();
  const workers: Worker[] = [];
  const progress: Progress = { tries: 0, rate: 0, best: null, threads };

  let since = performance.now();
  let counted = 0;
  let stopped = false;

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
    // each thread counts in its own lane: lane, lane + threads, lane + 2·threads…
    const task: Task = { spec, from: String(lane), step: String(threads) };
    worker.postMessage(task);
    workers.push(worker);
  }

  return {
    progress,
    stop() {
      stopped = true;
      for (const worker of workers) {
        worker.postMessage('stop');
        worker.terminate();
      }
      workers.length = 0;
    },
  };
}
