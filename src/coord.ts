/**
 * The map is the address space.
 *
 * An address is 40 hex digits. Each digit is four bits: the high two are a step
 * along X, the low two a step along Y, so one digit picks one cell of a 4x4 grid.
 * Reading an address left to right is therefore a route — the first digit picks a
 * quarter of the world, the second a quarter of that, forty times over.
 *
 * Every address has exactly one point and every point reads back as an address.
 */

/** Hex digits in an address, and levels of the map. */
export const DEPTH = 40;

/** Cells per side at every level. */
export const GRID = 4;

/** World side length, measured in leaf cells: 4^40 = 2^80. */
export const SIDE = 4n ** 40n;

/** One step of the route: a cell of a 4x4 grid, each coordinate 0..3. */
export interface Cell {
  x: number;
  y: number;
}

/** A point on the world grid, 0..SIDE-1 on each axis. */
export interface Point {
  x: bigint;
  y: bigint;
}

/** A square in whole-world coordinates, normalised to [0, 1]. */
export interface Rect {
  x: number;
  y: number;
  size: number;
}

const ADDRESS = /^[0-9a-f]{40}$/;
const PREFIX = /^[0-9a-f]{0,40}$/;

/**
 * Doubles hold integers exactly up to 2^53. Positions inside a cell are
 * accumulated in base 4, so 26 digits (4^26 < 2^53) is the honest limit —
 * past that the extra digits cannot change the number anyway.
 */
const MAX_LOCAL_DIGITS = 26;

/** Lowercase, strip `0x`, and refuse anything that is not an address. */
export function normalizeAddress(address: string): string {
  const hex = address.trim().replace(/^0x/i, '').toLowerCase();
  if (!ADDRESS.test(hex)) throw new Error(`not an address: ${address}`);
  return hex;
}

/** Lowercase, strip `0x`, and refuse anything that is not an address prefix. */
export function normalizePrefix(prefix: string): string {
  const hex = prefix.trim().replace(/^0x/i, '').toLowerCase();
  if (!PREFIX.test(hex)) throw new Error(`not an address prefix: ${prefix}`);
  return hex;
}

/** Split one hex digit into its cell: high two bits are X, low two are Y. */
export function digitToCell(digit: number): Cell {
  if (!Number.isInteger(digit) || digit < 0 || digit > 15) {
    throw new Error(`not a hex digit: ${digit}`);
  }
  return { x: digit >> 2, y: digit & 3 };
}

/** Join a cell back into the hex digit it came from. */
export function cellToDigit(cell: Cell): number {
  const { x, y } = cell;
  if (!Number.isInteger(x) || x < 0 || x > 3 || !Number.isInteger(y) || y < 0 || y > 3) {
    throw new Error(`cell out of range: (${x}, ${y})`);
  }
  return (x << 2) | y;
}

/** The route an address describes, one cell per digit. */
export function addressToPath(address: string): Cell[] {
  return [...normalizeAddress(address)].map((c) => digitToCell(parseInt(c, 16)));
}

/** The address (or prefix) a route describes. */
export function pathToAddress(path: readonly Cell[]): string {
  if (path.length > DEPTH) throw new Error(`route longer than an address: ${path.length}`);
  return path.map((cell) => cellToDigit(cell).toString(16)).join('');
}

/** Where an address stands on the world grid. */
export function addressToPoint(address: string): Point {
  let x = 0n;
  let y = 0n;
  for (const c of normalizeAddress(address)) {
    const digit = parseInt(c, 16);
    x = x * 4n + BigInt(digit >> 2);
    y = y * 4n + BigInt(digit & 3);
  }
  return { x, y };
}

/** Which address stands on a point. Inverse of {@link addressToPoint}. */
export function pointToAddress(point: Point): string {
  const { x, y } = point;
  if (x < 0n || x >= SIDE || y < 0n || y >= SIDE) {
    throw new Error(`point outside the world: (${x}, ${y})`);
  }
  let hex = '';
  for (let i = DEPTH - 1; i >= 0; i--) {
    const scale = 4n ** BigInt(i);
    const cell = { x: Number((x / scale) % 4n), y: Number((y / scale) % 4n) };
    hex += cellToDigit(cell).toString(16);
  }
  return hex;
}

/** How many leading digits two addresses share — how close they stand. */
export function commonDepth(a: string, b: string): number {
  const left = normalizeAddress(a);
  const right = normalizeAddress(b);
  let depth = 0;
  while (depth < DEPTH && left[depth] === right[depth]) depth++;
  return depth;
}

/** Whether an address stands inside the cell named by a prefix. */
export function isWithin(prefix: string, address: string): boolean {
  const cell = normalizePrefix(prefix);
  return normalizeAddress(address).startsWith(cell);
}

/**
 * The square a prefix names, in whole-world coordinates.
 *
 * Exact for the shallow levels a map view actually shows; past ~26 digits the
 * square is smaller than a double can place, and only {@link localPosition}
 * stays meaningful.
 */
export function prefixRect(prefix: string): Rect {
  const cell = normalizePrefix(prefix);
  let x = 0;
  let y = 0;
  let size = 1;
  for (const c of cell) {
    const { x: cx, y: cy } = digitToCell(parseInt(c, 16));
    size /= GRID;
    x += cx * size;
    y += cy * size;
  }
  return { x, y, size };
}

/**
 * Where an address stands inside the cell named by a prefix, as [0, 1) on each
 * axis. This is what a zoomed-in view draws: the whole-world number is far too
 * large to hold in a double, but the part of it below the current cell is not.
 */
export function localPosition(address: string, prefix = ''): { x: number; y: number } {
  const hex = normalizeAddress(address);
  const cell = normalizePrefix(prefix);
  if (!hex.startsWith(cell)) {
    throw new Error(`${address} does not stand inside ${prefix || 'the world'}`);
  }
  let x = 0;
  let y = 0;
  let size = 1;
  const digits = hex.slice(cell.length, cell.length + MAX_LOCAL_DIGITS);
  for (const c of digits) {
    const { x: cx, y: cy } = digitToCell(parseInt(c, 16));
    size /= GRID;
    x += cx * size;
    y += cy * size;
  }
  return { x, y };
}
