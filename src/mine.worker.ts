/**
 * One thread of the search.
 *
 * Nothing here decides anything: it is given a place to aim at and a lane to
 * count in, and it hashes until it is told to stop, reporting how many attempts
 * it has made and the closest it has come. The deciding — which of the threads'
 * bests is the best, and when to stop — belongs to whoever started them.
 *
 * The keccak comes from WebAssembly rather than from the same library the rest
 * of the world uses: measured on this machine it is thirteen times faster, and
 * a search is nothing but that one call.
 */
import { createKeccak } from 'hash-wasm';
import { type Dig, type Found, dig } from './mine';

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

let stopped = false;

async function run(task: Task): Promise<void> {
  const keccak = await createKeccak(256);
  const hash = (input: Uint8Array): Uint8Array => {
    keccak.init();
    keccak.update(input);
    return keccak.digest('binary');
  };

  let from = BigInt(task.from);
  const step = BigInt(task.step);
  let best: Found | null = null;

  while (!stopped) {
    const round = dig(hash, task.spec, from, step);
    from = round.next;
    if (round.best && (best === null || round.best.away < best.away)) best = round.best;
    const report: Report = { tries: round.tries, best, close: round.close };
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
  void run(event.data);
};
