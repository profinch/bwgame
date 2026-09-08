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
import type { Report, Task } from './mine.worker';

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

/** How many threads to set on it: all of them but one, so the world still draws. */
export function threadsAvailable(): number {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, cores - 1);
}

export function search(spec: Dig, onProgress: (progress: Progress) => void): Search {
  const threads = threadsAvailable();
  const workers: Worker[] = [];
  const progress: Progress = { tries: 0, rate: 0, best: null, threads };

  let since = performance.now();
  let counted = 0;
  let stopped = false;

  for (let lane = 0; lane < threads; lane++) {
    const worker = new Worker(new URL('./mine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Report>) => {
      if (stopped) return;
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
