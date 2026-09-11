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
import { call, readAddress, readString, rpc } from './chain';
import { chain } from './chains';

/** Bytes of runtime code a plot has. */
export const PLOT_CODE_SIZE = 2271;

/** keccak of that code. */
const PLOT_CODE_HASH = '3289e6f9fe8a6dd8f65d770e7490741664af1e039b6deeffd4c9fdd374fdef31';

/**
 * The plots of the factories before this one: relics.
 *
 * The first ground (08.09.2026) wrote its owner into the code as an immutable,
 * so its plots differ by twenty bytes each and are known by the hash with
 * those bytes blanked. The second ground (09.09.2026) kept the owner in
 * storage, so one hash knows them all. Neither can be pointed at code, and the
 * first cannot change hands: they stand in the world as what they are, stones
 * from before.
 */
const RELICS: { version: 1 | 2; size: number; hash: string; blank?: number[] }[] = [
  { version: 1, size: 1068, hash: 'b0dc3338391728367b8f32503f039a389267d41ccb31aa029c9ead66a76d33ef', blank: [102, 331] },
  { version: 2, size: 1263, hash: '8a2b92030edfaf1921297f0b762b4b9f2ecd92e3e295e21165cdb1ec8cf5e635' },
];

function hashOf(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return [...keccak_256(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether this code is a plot's. `code` is hex, with or without the 0x. */
export function isPlot(code: string): boolean {
  const body = code.replace(/^0x/, '').toLowerCase();
  return body.length === PLOT_CODE_SIZE * 2 && hashOf(body) === PLOT_CODE_HASH;
}

/** Which earlier ground this code is a plot of, or null if it is none of them. */
export function relicOf(code: string): 1 | 2 | null {
  const body = code.replace(/^0x/, '').toLowerCase();
  for (const relic of RELICS) {
    if (body.length !== relic.size * 2) continue;
    let masked = body;
    for (const at of relic.blank ?? []) masked = masked.slice(0, at * 2) + '0'.repeat(64) + masked.slice(at * 2 + 64);
    if (hashOf(masked) === relic.hash) return relic.version;
  }
  return null;
}

/** `note()`, `implementation()` and `owner()`, as the chain hears them. */
const NOTE = '0x26d111f5';
const IMPLEMENTATION = '0x5c60da1b';
const OWNER = '0x8da5cb5b';

/** `nameOf(address)` on Names. */
const NAME_OF = '0xf5c57382';

/** What a plot is named under groundstate.eth, or empty. */
export async function plotNameOf(address: string): Promise<string> {
  if (!chain.ens) return '';
  return readString(await call(chain.ens.names, NAME_OF + address.replace(/^0x/, '').toLowerCase().padStart(64, '0'))) ?? '';
}

/** Whose a plot is, asked of the plot itself. */
export async function ownerOf(address: string): Promise<string | null> {
  return readAddress(await call(address, OWNER));
}

/** The code a plot has been pointed at, or null if none. */
export async function implementationOf(address: string): Promise<string | null> {
  return readAddress(await call(address, IMPLEMENTATION));
}

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
  /** What is written into it, if whoever answered knew. */
  note?: string;
  /** The block it last changed in, if whoever answered knew. */
  updatedIn?: number;
  /** The code it is pointed at, if whoever answered knew: null for none, undefined for unknown. */
  implementation?: string | null;
  /** The salt that made it, if whoever answered knew: what naming it needs. */
  salt?: string;
  /** Its name under groundstate.eth, if whoever answered knew. */
  name?: string;
  /** Which factory made it (1, 2, 3), if whoever answered knew. */
  generation?: number;
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

/** What a subgraph answers, read into plots. Null if it is not an answer at all. */
export function plotsInGraph(answer: unknown): { plots: Claimed[]; block: number } | null {
  const data = (answer as { data?: { plots?: unknown; _meta?: { block?: { number?: number } } } })?.data;
  if (!data || !Array.isArray(data.plots)) return null;
  const plots: Claimed[] = [];
  for (const row of data.plots as {
    id?: string;
    owner?: { id?: string };
    note?: string;
    updatedIn?: string;
    implementation?: string | null;
    salt?: string;
    name?: string | null;
    generation?: number;
  }[]) {
    if (typeof row.id !== 'string' || typeof row.owner?.id !== 'string') continue;
    plots.push({
      plot: row.id,
      owner: row.owner.id,
      note: typeof row.note === 'string' ? row.note : undefined,
      updatedIn: row.updatedIn !== undefined ? Number(row.updatedIn) : undefined,
      implementation: row.implementation === undefined ? undefined : row.implementation,
      salt: typeof row.salt === 'string' ? row.salt : undefined,
      name: row.name === undefined ? undefined : (row.name ?? ''),
      generation: typeof row.generation === 'number' ? row.generation : undefined,
    });
  }
  return { plots, block: data._meta?.block?.number ?? 0 };
}

/** The most plots asked for in one query. */
const PAGE = 1000;

/** The subgraph's block as of the last answer: only what changed after it is asked for next. */
let graphSeen = 0;

/**
 * What has changed, from the subgraph, or null if it did not answer.
 *
 * The first ask brings every plot; every ask after brings only the plots that
 * changed since the block the last answer was current at — claimed, written
 * into or handed on — so asking again costs the same with a thousand plots as
 * with one. One query says everything the logs would, and more: what is
 * written into each plot, which the logs cannot say without a call per plot.
 */
async function fromGraph(): Promise<Claimed[] | null> {
  if (!chain.subgraph) return null;
  const changed: Claimed[] = [];
  let current = 0;
  for (let skip = 0; ; skip += PAGE) {
    try {
      const response = await fetch(chain.subgraph, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query:
            `{ _meta { block { number } } ` +
            `plots(first: ${PAGE}, skip: ${skip}, orderBy: updatedIn, where: { updatedIn_gt: ${graphSeen} }) ` +
            `{ id owner { id } note updatedIn implementation salt name } }`,
        }),
      });
      if (!response.ok) return null;
      const page = plotsInGraph(await response.json());
      if (page === null) return null;
      // the block of the first page is the one every page is read as of
      if (skip === 0) current = page.block;
      changed.push(...page.plots);
      if (page.plots.length < PAGE) break;
    } catch {
      return null;
    }
  }
  graphSeen = Math.max(graphSeen, current);
  return changed;
}

/** Fold what changed into what is known: a plot already known is replaced. */
function fold(into: Claimed[], changed: readonly Claimed[]): Claimed[] {
  const out = into.slice();
  for (const plot of changed) {
    const wanted = plot.plot.toLowerCase();
    const at = out.findIndex((had) => had.plot.toLowerCase() === wanted);
    if (at >= 0) out[at] = plot;
    else out.push(plot);
  }
  return out;
}

/** A factory's Claimed logs, read from where the last read stopped. */
interface Reader {
  factory: string;
  /** The next block to read from. */
  from: number;
  known: Claimed[];
}

/**
 * Read a factory's `Claimed` events from where the last read stopped, in the
 * pieces a public gateway allows. Leaves `from` where it got to, so a gateway
 * refusing halfway costs nothing but another try later.
 */
async function readClaims(reader: Reader): Promise<Claimed[]> {
  const head = await rpc<string>('eth_blockNumber', []);
  if (!head) return reader.known;
  const latest = Number(BigInt(head));
  while (reader.from <= latest) {
    const to = Math.min(latest, reader.from + RANGE - 1);
    const logs = await rpc<{ topics: string[] }[]>('eth_getLogs', [
      {
        address: reader.factory,
        fromBlock: `0x${reader.from.toString(16)}`,
        toBlock: `0x${to.toString(16)}`,
        topics: [CLAIMED],
      },
    ]);
    if (!logs) break; // nothing answered: try again from here next time
    reader.known = fold(reader.known, plotsIn(logs));
    reader.from = to + 1;
  }
  return reader.known;
}

const current: Reader = { factory: chain.plots ?? '', from: chain.plotsSince ?? 0, known: [] };
const former: Reader[] = (chain.former ?? []).map((it) => ({ factory: it.plots, from: it.since, known: [] }));

let known: Claimed[] = [];

/**
 * Every plot the factory has ever deployed.
 *
 * From the subgraph when the chain has one. Otherwise off the factory's own
 * `Claimed` events: the world cannot list the contracts on a chain, and does
 * not try — but the factory is one contract, young, and it says what it has
 * made. That is the indexer's job done by hand, and it holds only while the
 * history is short.
 */
export async function claimedPlots(): Promise<Claimed[]> {
  if (!chain.plots) return [];
  const changed = await fromGraph();
  if (changed) {
    known = fold(known, changed);
    return known;
  }
  known = fold(known, await readClaims(current));
  return known;
}

/**
 * What the factories before this one made: contracts, standing where they were
 * put, and nothing more to this world — but the ground shows what stands on it.
 */
export async function formerPlots(): Promise<Claimed[]> {
  // the subgraph indexes the earlier factories too, and unlike a public
  // gateway it does not quietly answer "no logs" for blocks it never kept
  if (graphSeen > 0) return [];
  const out: Claimed[] = [];
  for (const reader of former) out.push(...(await readClaims(reader)));
  return out;
}

/** What the factory says about a plot at this address, or null if it made none there. */
export async function claimAt(address: string): Promise<Claimed | null> {
  const wanted = address.toLowerCase();
  return (await claimedPlots()).find((claimed) => claimed.plot.toLowerCase() === wanted) ?? null;
}
