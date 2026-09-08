/**
 * Where things are: the patch of address space this world sits on, the height
 * of its ground, and the tiles everything about it is filed under.
 *
 * One metre of ground is one leaf cell of the map, the finest a full address can
 * name. The middle of the patch is a real address, so walking here is walking
 * somewhere in particular — and the ground under your feet reads back as forty
 * hex digits at every step.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { addressToPoint, pointToAddress } from '../coord';
import { chain } from '../chains';

/**
 * The address this patch is built around, and `?home=0x…` to stand somewhere
 * else. A different address is a different place: the ground is hashed from it,
 * so choosing it rebuilds the hills as well as the view.
 *
 * The default comes from the chain: on mainnet the address traffic actually
 * lands on, on Sepolia one of the few things that stands there at all.
 *
 * Worth knowing before choosing: at the top level a place only ever has one
 * side. The sender of a transaction is always a wallet and the receiver is
 * almost always a contract, and contracts send nothing of their own — they
 * appear only inside other calls. So standing on a contract, everything flies
 * in; standing on a busy wallet, everything flies out. Both at once needs
 * traces, which is a different source of data.
 */
const DEFAULT_HOME = chain.home;

function chosenHome(): string {
  try {
    const asked = new URLSearchParams(location.search).get('home');
    if (asked && /^0x[0-9a-fA-F]{40}$/.test(asked)) return asked;
  } catch {
    // no location: a test, or somewhere without a page
  }
  return DEFAULT_HOME;
}

export const HOME = chosenHome();

/**
 * How deep the walkable world sits in the address tree.
 *
 * One metre of ground is one cell at this depth, so the position of your feet
 * fixes this many digits of an address and leaves the rest open. It is the one
 * number that decides what kind of place this is:
 *
 *   depth 13 — the world is 67 000 km across, a metre holds 2·10^16 addresses,
 *              and mining a spot within a kilometre of a chosen one costs about
 *              ten minutes on eight threads.
 *   depth 12 — four times smaller, sixteen times cheaper to mine into.
 *   depth 40 — one metre is one address. Nothing can be mined at that scale
 *              (it would take longer than the universe has run) but the fine
 *              structure is visible: the precompiles stand a metre apart.
 *
 * Change it here. Everything below is written in terms of it.
 */
export const DEPTH = 13;

/** Leaf cells to a metre at this depth. A metre is a whole cell of its own. */
const PER_METRE = 4n ** BigInt(40 - DEPTH);
const home = addressToPoint(HOME);

/**
 * The land is the address space, hashed.
 *
 * Ordinary terrain stacks octaves of noise: broad shapes first, finer ones on
 * top. The address space is already built that way — the first digit cuts the
 * world in quarters, the second cuts those in quarters, forty times over — so
 * the octaves are not invented, they are the depths of the tree. The height of
 * an octave is the keccak hash of the prefix its cell falls in.
 *
 * Nothing is stored and nothing is authored: anybody can work out the height of
 * a hill from the address underneath it, and it comes out the same everywhere.
 */
const OCTAVES: readonly { depth: number; metres: number; height: number }[] = [
  { depth: DEPTH - 6, metres: 4096, height: 58 },
  { depth: DEPTH - 5, metres: 1024, height: 27 },
  { depth: DEPTH - 4, metres: 256, height: 12 },
  { depth: DEPTH - 3, metres: 64, height: 5 },
  { depth: DEPTH - 2, metres: 16, height: 2 },
].filter((octave) => octave.depth >= 1);

/**
 * The cell an octave's grid starts from. Constant per octave, and a bigint, so
 * a lookup key can be the small offset from it rather than the huge number
 * itself — building map keys out of bigints costs more than the hashing does.
 */
/** Where each octave's grid starts, in its own cells, counted from home. */
const BASES = OCTAVES.map((octave) => ({
  x: home.x / (PER_METRE * BigInt(octave.metres)),
  z: home.y / (PER_METRE * BigInt(octave.metres)),
}));

const encoder = new TextEncoder();
const heights = new Map<string, number>();

/** The address prefix a cell stands for: its coordinates, read as digits. */
export function prefixOf(depth: number, cx: bigint, cz: bigint): string {
  let hex = '';
  for (let i = depth - 1; i >= 0; i--) {
    const scale = 4n ** BigInt(i);
    const x = Number((((cx % (scale * 4n)) + scale * 4n) / scale) % 4n);
    const z = Number((((cz % (scale * 4n)) + scale * 4n) / scale) % 4n);
    hex += ((x << 2) | z).toString(16);
  }
  return hex;
}

/** Hash of one cell's prefix, in [0, 1). Cached: the same cells come up often. */
function cellHeight(octave: number, rx: number, rz: number): number {
  const key = `${octave}:${rx}:${rz}`;
  const known = heights.get(key);
  if (known !== undefined) return known;
  const base = BASES[octave]!;
  const prefix = prefixOf(OCTAVES[octave]!.depth, base.x + BigInt(rx), base.z + BigInt(rz));
  const digest = keccak_256(encoder.encode(prefix));
  const value = ((digest[0]! << 16) | (digest[1]! << 8) | digest[2]!) / 0x1000000;
  heights.set(key, value);
  return value;
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Ground somebody levelled.
 *
 * Land here is hashed out of address prefixes and is therefore never flat, and
 * a stone laid on a slope either has the hill coming up through it or stands on
 * a wall of its own foundation — which you then cannot walk up to. Real ground
 * gets levelled before anything is built on it, so this world levels it too:
 * a claimed address is a flat pad with the hill ramped down to it over a few
 * metres. The hash still decides where the hills are; this only says that
 * somebody took a shovel to one spot.
 */
export interface Flat {
  x: number;
  z: number;
  halfWide: number;
  halfDeep: number;
  level: number;
}

/** How far out the ground ramps to meet a levelled pad. */
const RAMP = 5;

const flats: Flat[] = [];

/** Level the ground over a pad. Nothing happens twice in the same place. */
export function levelOff(flat: Flat): void {
  const already = flats.findIndex(
    (was) => Math.abs(was.x - flat.x) < 0.5 && Math.abs(was.z - flat.z) < 0.5,
  );
  if (already >= 0) flats[already] = flat;
  else flats.push(flat);
}

/** Whether anything has been levelled at all, which is usually not the case. */
export function levelled(): number {
  return flats.length;
}

/** Forget every pad. For tests, and for starting a world over. */
export function unlevel(): void {
  flats.length = 0;
}

/** How high the ground stands at a point, before anybody levelled it. */
export function rawHeightAt(x: number, z: number): number {
  let sum = 0;
  for (let i = 0; i < OCTAVES.length; i++) {
    const octave = OCTAVES[i]!;
    const rx = Math.floor(x / octave.metres);
    const rz = Math.floor(z / octave.metres);
    const fx = ease(x / octave.metres - rx);
    const fz = ease(z / octave.metres - rz);

    const a = cellHeight(i, rx, rz);
    const b = cellHeight(i, rx + 1, rz);
    const c = cellHeight(i, rx, rz + 1);
    const d = cellHeight(i, rx + 1, rz + 1);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    sum += (top + (bottom - top) * fz - 0.5) * octave.height;
  }
  return sum;
}

/**
 * How high the ground stands at a point.
 *
 * The hashed land, and then any pad somebody levelled: flat over the pad, and
 * eased from the hill to it over the ramp, so you can walk on from any side.
 */
export function heightAt(x: number, z: number): number {
  const raw = rawHeightAt(x, z);
  if (flats.length === 0) return raw;
  let height = raw;
  for (const flat of flats) {
    const outX = Math.max(0, Math.abs(x - flat.x) - flat.halfWide);
    const outZ = Math.max(0, Math.abs(z - flat.z) - flat.halfDeep);
    const out = Math.hypot(outX, outZ);
    if (out >= RAMP) continue;
    const pull = ease(1 - out / RAMP);
    height = height + (flat.level - height) * pull;
  }
  return height;
}

/**
 * The ground under a point, as far as it is pinned down.
 *
 * A metre fixes the first DEPTH digits of an address and says nothing about the
 * rest — there are 4^(40 - DEPTH) addresses under your feet. So this is a
 * prefix, not an address, and it is the honest thing to show.
 */
export function addressUnder(x: number, z: number): string {
  const full = pointToAddress({
    x: home.x + BigInt(Math.floor(x)) * PER_METRE,
    y: home.y + BigInt(Math.floor(z)) * PER_METRE,
  });
  return full.slice(0, DEPTH);
}

/**
 * Where an address lies relative to home, in metres.
 *
 * Still enormous — the world is 4^DEPTH metres across — so only differences and
 * directions mean anything, which a double carries well enough.
 */
export function offsetOf(address: string): { x: number; z: number } {
  const point = addressToPoint(address);
  return {
    x: Number(point.x - home.x) / Number(PER_METRE),
    z: Number(point.y - home.y) / Number(PER_METRE),
  };
}

/** How wide the whole world is, in metres. */
export const WORLD = 4 ** DEPTH;

// --- tiles ----------------------------------------------------------------

/**
 * Everything known about the world is filed by tile, and a tile is an address
 * prefix — the same tree the map is built on, at the depth whose cells are 256
 * metres across. A tile is not a way of drawing anything; it is a way of
 * storing it, so that an endless world can be kept in pieces and only the
 * pieces near somebody need to be in hand.
 */
export const TILE_METRES = 256;
export const TILE_DEPTH = DEPTH - 4; // 256 metres is 4^4 cells across
export const TILE_TEXELS = 64; // four metres to a texel

/** Which tile a point falls in, counted from home rather than from the corner of the world. */
export function tileIndex(x: number, z: number): { tx: number; tz: number } {
  return { tx: Math.floor(x / TILE_METRES), tz: Math.floor(z / TILE_METRES) };
}

/** The world coordinates of a tile's near corner. */
export function tileOrigin(tx: number, tz: number): { x: number; z: number } {
  return { x: tx * TILE_METRES, z: tz * TILE_METRES };
}

/** A tile's name: the address prefix it covers. */
export function tileName(tx: number, tz: number): string {
  const base = BASES[2]!; // the 256-metre octave is the tile grid
  return prefixOf(TILE_DEPTH, base.x + BigInt(tx), base.z + BigInt(tz));
}

/** Metres to leaf cells, for anything that has to speak to the map. */
export function metresToCells(metres: number): bigint {
  return BigInt(Math.round(metres)) * PER_METRE;
}
