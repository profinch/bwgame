/**
 * Knowing a plot when you see one.
 *
 * Every plot is deployed from the same source by the same factory, and nothing
 * about its owner is written into its code — the owner lives in storage — so
 * every plot's runtime code is the same, byte for byte. Its hash is how the
 * world tells a plot from any other small contract without asking anybody: the
 * code is on the chain, and the chain is what the world reads.
 *
 * The same code alone is not proof, though. Anyone can deploy these bytes from
 * a factory of their own and stand a thing in the world that hashes like a
 * plot. So the world only calls a plot what the factory says it made: the code
 * says *what* it is, the factory's `Claimed` events say *that* it is.
 *
 * The constants come from the compiled `Plot`, whose creation code hashes to
 * what the factory reports as `plotCodeHash()` — so they describe the plots
 * that factory actually deploys. If the contract changes, they change with it.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { call, readString, rpc } from './chain';
import { chain } from './chains';

/** Bytes of runtime code a plot has. */
export const PLOT_CODE_SIZE = 1263;

/** keccak of that code. */
const PLOT_CODE_HASH = '8a2b92030edfaf1921297f0b762b4b9f2ecd92e3e295e21165cdb1ec8cf5e635';

/** Whether this code is a plot's. `code` is hex, with or without the 0x. */
export function isPlot(code: string): boolean {
  const body = code.replace(/^0x/, '').toLowerCase();
  if (body.length !== PLOT_CODE_SIZE * 2) return false;
  const bytes = new Uint8Array(PLOT_CODE_SIZE);
  for (let i = 0; i < PLOT_CODE_SIZE; i++) bytes[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return [...keccak_256(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('') === PLOT_CODE_HASH;
}

/** `note()`, as the chain hears it. */
const NOTE = '0x26d111f5';

/** What its owner has written into a plot. Empty if nothing yet, or if nothing answered. */
export async function noteOf(address: string): Promise<string> {
  return readString(await call(address, NOTE)) ?? '';
}

// --- every plot there is --------------------------------------------------

/** `Claimed(address indexed plot, address indexed owner, bytes32 salt)`, as a topic. */
const CLAIMED = '0xc32f9ef6676124cd4f64af9a81204b2f81c2dcd73e9f170cd114df97eb7c8fe4';

/** The most blocks a public gateway will search in one go. */
const RANGE = 50_000;

export interface Claimed {
  plot: string;
  owner: string;
}

/** The plots named in a batch of `Claimed` logs. */
export function plotsIn(logs: readonly { topics: string[] }[]): Claimed[] {
  const out: Claimed[] = [];
  for (const log of logs) {
    const [topic, plot, owner] = log.topics;
    if (topic !== CLAIMED || !plot || !owner) continue;
    out.push({ plot: `0x${plot.slice(-40)}`, owner: `0x${owner.slice(-40)}` });
  }
  return out;
}

let known: Claimed[] = [];
let seenUpTo = 0;

/**
 * Every plot the factory has ever deployed, read off its `Claimed` events.
 *
 * The world cannot list the contracts on a chain, and does not try — but the
 * factory is one contract, young, and it says what it has made. Its logs are
 * asked for from the block it was deployed in, in the pieces a public gateway
 * allows, and only the new blocks on each call after the first. It is what an
 * indexer will do for it later, done by hand while the history is short.
 */
export async function claimedPlots(): Promise<Claimed[]> {
  if (!chain.plots) return [];
  const head = await rpc<string>('eth_blockNumber', []);
  if (!head) return known;
  const latest = Number(BigInt(head));
  let from = seenUpTo ? seenUpTo + 1 : (chain.plotsSince ?? 0);
  while (from <= latest) {
    const to = Math.min(latest, from + RANGE - 1);
    const logs = await rpc<{ topics: string[] }[]>('eth_getLogs', [
      { address: chain.plots, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [CLAIMED] },
    ]);
    if (!logs) break; // nothing answered: try again from here next time
    for (const claimed of plotsIn(logs)) {
      if (!known.some((had) => had.plot.toLowerCase() === claimed.plot.toLowerCase())) known.push(claimed);
    }
    seenUpTo = to;
    from = to + 1;
  }
  return known;
}

/** Whether the factory says it made a plot at this address. */
export async function isClaimed(address: string): Promise<boolean> {
  const wanted = address.toLowerCase();
  return (await claimedPlots()).some((claimed) => claimed.plot.toLowerCase() === wanted);
}
