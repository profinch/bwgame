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

export const HOME = '0x1F98431c8aD98523631AE4a59f267346ea31F984'; // uniswap v3 factory
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
  { depth: 34, metres: 4096, height: 58 },
  { depth: 35, metres: 1024, height: 27 },
  { depth: 36, metres: 256, height: 12 },
  { depth: 37, metres: 64, height: 5 },
  { depth: 38, metres: 16, height: 2 },
];

/**
 * The cell an octave's grid starts from. Constant per octave, and a bigint, so
 * a lookup key can be the small offset from it rather than the huge number
 * itself — building map keys out of bigints costs more than the hashing does.
 */
const BASES = OCTAVES.map((octave) => ({
  x: home.x / BigInt(octave.metres),
  z: home.y / BigInt(octave.metres),
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

/** How high the ground stands at a point. */
export function heightAt(x: number, z: number): number {
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

/** The address of the ground under a point — one metre is one address across. */
export function addressUnder(x: number, z: number): string {
  return pointToAddress({
    x: home.x + BigInt(Math.floor(x)),
    y: home.y + BigInt(Math.floor(z)),
  });
}

// --- tiles ----------------------------------------------------------------

/**
 * Everything known about the world is filed by tile, and a tile is an address
 * prefix — the same tree the map is built on, at the depth whose cells are 256
 * metres across. A tile is not a way of drawing anything; it is a way of
 * storing it, so that an endless world can be kept in pieces and only the
 * pieces near somebody need to be in hand.
 */
export const TILE_DEPTH = 36;
export const TILE_METRES = 256; // 4 ** (40 - TILE_DEPTH)
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
