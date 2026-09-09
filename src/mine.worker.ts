/**
 * One thread of the search.
 *
 * Nothing here decides anything: it is given a place to aim at and a lane to
 * count in, and it hashes until it is told to stop, reporting how many attempts
 * it has made and the closest it has come. The deciding — which of the threads'
 * bests is the best, and when to stop — belongs to whoever started them.
 *
 * The hashing is done in a WebAssembly module of our own (`wasm/mine.ts`) that
 * runs the whole attempt — counter, hash, address, distance — without coming
 * back to JavaScript. Measured against a hashing library called once per
 * attempt, it is three times as fast, because the boundary was the cost.
 */
import { type Dig, type Found, type MineExports, miner } from './mine';
import instantiate from './mine.wasm?init';

export interface Task {
  spec: Dig;
  /** Which lane of the count this thread takes, so no two repeat each other. */
  from: string;
  step: string;
}

export interface Report {
  tries: number;
  best: Found | null;
  close: boolean;
}

/** A thread that cannot work says so, rather than going quiet. */
export interface Trouble {
  trouble: string;
}

let stopped = false;

async function run(task: Task): Promise<void> {
  const instance = await instantiate();
  const mine = miner(instance.exports as unknown as MineExports, task.spec);

  let from = BigInt(task.from);
  const step = BigInt(task.step);

  while (!stopped) {
    const round = mine.run(from, step);
    from = round.next;
    const report: Report = { tries: round.tries, best: round.best, close: round.close };
    postMessage(report);
    if (round.close) return;
    // let the thread breathe, so a stop message gets through between batches
    await new Promise((wake) => setTimeout(wake, 0));
  }
}

onmessage = (event: MessageEvent<Task | 'stop'>) => {
  if (event.data === 'stop') {
    stopped = true;
    return;
  }
  void run(event.data).catch((error: unknown) => {
    const trouble: Trouble = { trouble: (error as Error)?.message ?? String(error) };
    postMessage(trouble);
  });
};
