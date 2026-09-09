/**
 * What stands in the world.
 *
 * Nothing here is invented any more. A structure is an account, and its size
 * and colour come from what that account actually is: how much code it carries,
 * what that code hashes to, how much it holds. An address with nothing at it
 * has nothing standing on it, which is the case for very nearly all of them.
 *
 * The world is therefore mostly empty, and that is not a gap to be filled with
 * scenery — it is what the address space is like. What fills it is people:
 * ground somebody mined a place for and put a contract on.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import type { Account } from './chain';
import { offsetOf } from './engine/land';

/**
 * What kind of thing stands here.
 *
 * A contract is a thing: it has code, behaviour, bulk, and a building is the
 * right shape for it. A wallet is not a thing but a key — no code, no
 * behaviour, nothing to stand up. So it is not built but written: a plate set
 * into the ground with its own address cut into it.
 *
 * Things are built upward; people are written into the earth.
 *
 * An address nobody has ever touched gets neither, because there is nothing
 * there. Almost all of them are like that.
 *
 * And a plot — a contract deployed by the factory, which the world knows by
 * its code — is a thing that has not been said yet. Its address fixes where it
 * stands, how big it is and which way it turns, and nothing else about it is
 * decided until its owner writes into it. So until then it is framed: drawn
 * in ink as the plan of the building it will be, and not built.
 */
export type Kind = 'built' | 'written' | 'framed';

export interface Structure {
  kind: Kind;
  address: string;
  /** Where it stands, in metres from home. */
  x: number;
  z: number;
  wide: number;
  deep: number;
  tall: number;
  turn: number;
  albedo: number;
  roughness: number;
  /** For a stone: one post a token held. */
  posts?: Post[];
  /** For a stone: how far it has to reach down to meet the hill it sits on. */
  sink?: number;
  /** How much of it stands yet, from the ground up: 0 to 1, and 1 if unset. */
  grown?: number;
}


const encoder = new TextEncoder();

/**
 * An alphabet, cut into stone.
 *
 * Thirty-eight signs — the digits, the letters, a full stop and a dash — which
 * is enough to write an address, a token's name and how much of it is held.
 * They come out looking like runes because they are built the way runes were: a
 * line to cut along and strokes across it.
 *
 * How a sign is put together is not explained here and is not written down
 * anywhere in this repository. It is regular, it is short, and it is meant to
 * be worked out from the stones — that is part of the game. Nothing is lost on
 * the way in or on the way out: a stone says exactly what the chain said.
 */
export const CHARS = '0123456789abcdefghijklmnopqrstuvwxyz.-';

/** A stroke on a sign, in its own coordinates: -0.5 to 0.5 either way. */
export type Stroke = readonly [number, number, number, number];

const STEM: Stroke = [0, -0.44, 0, 0.44];

/** The strokes a sign is made of, in the order they are taken. */
const STROKES: readonly Stroke[] = [
  [-0.3, 0.44, 0.3, 0.44], // a bar across the foot
  [-0.3, -0.44, 0.3, -0.44], // a bar across the head
  [0, 0.3, 0.34, 0.02], // and the four branches
  [0, 0.3, -0.34, 0.02],
  [0, -0.02, 0.34, -0.32],
  [0, -0.02, -0.34, -0.32],
];

/** Which character this is, or -1 for anything that cannot be written. */
export function codeOf(char: string): number {
  return CHARS.indexOf(char.toLowerCase());
}

/** The strokes that spell one character. */
export function signOf(char: string): Stroke[] {
  const code = codeOf(char);
  if (code < 0) return [];
  const strokes: Stroke[] = [STEM];
  for (let bit = 0; bit < STROKES.length; bit++) {
    if (code & (1 << (STROKES.length - 1 - bit))) strokes.push(STROKES[bit]!);
  }
  return strokes;
}

/** How many cells across a sign is laid. */
export const GRID = 9;

/** Cells of blank between signs. */
const GAP = 2;

/** How near a cell has to be to a stroke to be cut away. */
const BITE = 0.075;

function toStroke(u: number, v: number, [x1, z1, x2, z2]: Stroke): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const run = dx * dx + dz * dz;
  const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((u - x1) * dx + (v - z1) * dz) / run));
  return Math.hypot(u - (x1 + dx * t), v - (z1 + dz * t));
}

/** How many cells wide a line of writing is. */
export function widthOf(line: string): number {
  return line.length * (GRID + GAP) - GAP;
}

/**
 * A line of writing as the cells cut out of the stone.
 *
 * The signs are not painted on and not stuck on: they are what is missing. The
 * face of the slab is laid as small raised cells and the ones a stroke passes
 * through are left out, so the writing is a groove. Nothing about it is a
 * different colour — it reads because the wall and floor of a groove take less
 * light than the face of a stone, which is why carving works on real stone too.
 *
 * Row-major, one byte a cell, 1 where the stone is cut away.
 */
export function cutOf(line: string): { cut: Uint8Array; wide: number } {
  const wide = widthOf(line);
  const cut = new Uint8Array(Math.max(0, wide) * GRID);
  for (let i = 0; i < line.length; i++) {
    const strokes = signOf(line[i]!);
    if (strokes.length === 0) continue; // a space, or something unwritable
    const at = i * (GRID + GAP);
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const u = (col + 0.5) / GRID - 0.5;
        const v = (row + 0.5) / GRID - 0.5;
        for (const stroke of strokes) {
          if (toStroke(u, v, stroke) < BITE) {
            cut[row * wide + at + col] = 1;
            break;
          }
        }
      }
    }
  }
  return { cut, wide };
}

/** A rectangle of stone left standing: from this cell, so many across and down. */
export interface Patch {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/**
 * The face of a sign or a line, as the fewest rectangles that leave the groove.
 *
 * The obvious way to lay a carved face is a box a cell, which for one sign is
 * eighty boxes and for a wallet with forty tokens is tens of thousands. So the
 * uncut cells are merged greedily into rectangles instead — right as far as the
 * row allows, then down as far as the rows match — which is the same stone in
 * about a tenth of the pieces. The groove is untouched: it is still what is
 * missing.
 */
export function reliefOf(line: string): { patches: Patch[]; wide: number } {
  const { cut, wide } = cutOf(line);
  return { patches: mergeOf(cut, wide, GRID), wide };
}

/** The uncut cells of a mask, merged greedily into as few rectangles as it takes. */
export function mergeOf(cut: Uint8Array, wide: number, high: number): Patch[] {
  const used = new Uint8Array(cut.length);
  const patches: Patch[] = [];
  for (let row = 0; row < high; row++) {
    for (let col = 0; col < wide; col++) {
      const at = row * wide + col;
      if (cut[at] === 1 || used[at] === 1) continue;
      let cols = 0;
      while (col + cols < wide && cut[at + cols] === 0 && used[at + cols] === 0) cols++;
      let rows = 1;
      while (row + rows < high) {
        let whole = true;
        for (let i = 0; i < cols; i++) {
          const below = (row + rows) * wide + col + i;
          if (cut[below] === 1 || used[below] === 1) {
            whole = false;
            break;
          }
        }
        if (!whole) break;
        rows++;
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) used[(row + r) * wide + col + c] = 1;
      patches.push({ col, row, cols, rows });
    }
  }
  return patches;
}

/** How much of something is held, short enough to carve. */
export function amountText(amount: bigint, decimals: number): string {
  if (amount === 0n) return '0';
  const scale = 10n ** BigInt(Math.max(0, decimals - 6));
  const value = Number(amount / scale) / 1e6;
  const trim = (text: string) => text.replace(/\.?0+$/, '');
  if (value >= 1e12) return `${trim((value / 1e12).toFixed(2))}t`;
  if (value >= 1e9) return `${trim((value / 1e9).toFixed(2))}b`;
  if (value >= 1e6) return `${trim((value / 1e6).toFixed(2))}m`;
  if (value >= 1e3) return `${trim((value / 1e3).toFixed(2))}k`;
  if (value >= 1) return trim(value.toFixed(2));
  // four figures is as much as a post can carry at a readable size, and more
  // than that is not what anybody reads off a stone anyway
  const small = trim(value.toFixed(4));
  return small === '0' ? 'dust' : small;
}

/** Only what the alphabet can spell, so nothing is faked into a sign. */
function sayable(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .filter((char) => char === ' ' || codeOf(char) >= 0)
    .join('');
}

/** Something an account holds, and enough about the token to place it. */
export interface Holding {
  symbol: string;
  amount: bigint;
  decimals: number;
  /**
   * How much of that token there is in the world, so a holding can be read as
   * a share of it rather than as a number without a scale. A million of a token
   * that minted a trillion is dust; a million of a token that minted two
   * million is half of everything.
   */
  supply?: bigint;
}

/**
 * The coin a chain runs on, when nobody said which chain this is.
 *
 * Every other supply here is read off the token itself; this is the one you
 * cannot call for, so it is a figure written down. Which chain's figure it is
 * comes from the chain: ether on Ethereum, bnb on BNB Chain.
 */
export const ETHER_SUPPLY = 120_500_000n * 10n ** 18n;
const NATIVE = { symbol: 'eth', supply: ETHER_SUPPLY };

/** A holding as a share of all there is of it, from 0 to 1. */
export function shareOf(held: Holding): number {
  if (!held.supply || held.supply <= 0n) return 0;
  if (held.amount >= held.supply) return 1;
  return Number((held.amount * 10n ** 12n) / held.supply) / 1e12;
}

/** How many orders of magnitude of share a post is tall enough to tell apart. */
const DECADES = 12;



/** A post: one token, standing as high as the share of it that is held. */
export interface Post {
  symbol: string;
  amount: string;
  share: number;
  tall: number;
  /** How wide the stone is, which is decided by how many stand on the plate. */
  wide: number;
  /** Where it stands, from the middle of the plate, and which way it faces. */
  dx: number;
  dz: number;
  turn: number;
}

/** A post's footprint, and how far apart posts stand. */
export const POST = 0.5;
const PITCH = 0.95;

/**
 * How many posts a plate has room for.
 *
 * Every plate is the same size, because every plate is one address and one
 * address is one piece of ground. A wallet holding one token has an almost
 * empty plate and a wallet holding forty has a full one — the difference shows
 * as what stands on the ground, not as how much ground somebody got.
 */
const ACROSS = 8;
const DEEP = 6;

/**
 * What happens when a wallet holds more than a plate has room for.
 *
 * Not a bigger plate: the plate is the address and every address is the same
 * piece of ground. The stones get smaller instead — halve them and the same
 * ground holds four times as many, with the writing cut down to match, because
 * the writing is sized off the stone it is on. Three sizes cover a wallet
 * holding one token and a wallet holding seven hundred; past that the rest are
 * counted on one stone rather than raised.
 *
 * A wallet with hundreds of tokens is mostly holding somebody else's
 * advertising, and this says so plainly: the airdrops are the field of little
 * stones, and whatever the wallet really holds towers over them.
 */
const TIERS = [1, 2, 4] as const;

/**
 * How far a plate goes down into the ground when nobody has measured the hill.
 *
 * A plate is metres across and the ground under it is not flat, so a plate of
 * its own thickness alone would have the hill coming up through the middle of
 * it. It is set with its face above the highest ground it covers and buried at
 * the low side — by exactly the drop, which whoever knows the terrain writes
 * into `sink`, or by this much when nothing did.
 */
const SKIRT = 0.6;

/**
 * The face of a post, as a grid of cells.
 *
 * Thirty cells across, and a sign is nine of them, so a sign takes under a
 * third of the wall — writing cut into a stone rather than a pattern covering
 * it. The whole wall is laid from this grid, not one plaque a sign: if only the
 * signs were laid, each of them would stand out of the stone as a raised tile
 * and the writing would read the wrong way round. Laying all of it means the
 * wall is flush and the strokes are the only thing missing, which is what
 * carving is.
 */
const WALL = 30;

/** Cells of plain stone round the writing on a wall. */
const EDGE = 4;

/**
 * The smallest stone worth writing on.
 *
 * At an eighth of a metre a sign is four centimetres and its strokes are
 * millimetres — you could not read it standing over it, and cutting it would
 * cost more boxes than everything else on the plate together. A wallet holding
 * hundreds of tokens gets those as bare pegs: a field of little stones, which
 * is an honest picture of what a heap of airdrops is.
 */
const WORTH_WRITING = 0.2;

/** One sign, cut at whatever size the wall gives it. 1 where the stone is gone. */
export function signCut(char: string, size: number): Uint8Array {
  const cut = new Uint8Array(size * size);
  const strokes = signOf(char);
  if (strokes.length === 0) return cut;
  // a stroke must always take at least a cell, however small the sign is cut
  const bite = Math.max(BITE, 0.62 / size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const u = (col + 0.5) / size - 0.5;
      const v = (row + 0.5) / size - 0.5;
      for (const stroke of strokes) {
        if (toStroke(u, v, stroke) < bite) {
          cut[row * size + col] = 1;
          break;
        }
      }
    }
  }
  return cut;
}

/**
 * What is written on a post, and the stone left standing around it.
 *
 * Two columns down the wall, read top to bottom: the token's name on the left,
 * how much of it is held on the right. The signs are cut as large as the wall
 * allows — nine cells of thirty — and smaller if that is what it takes for the
 * column to fit the post's height, so a knee-high post says the whole thing in
 * tiny letters rather than half of it in big ones.
 */
export function writingOn(symbol: string, amount: string, tall: number, wide = POST) {
  return carve([symbol, amount], tall, wide);
}

/** How wide a wall of `wide` metres is in cells, and how tall in metres per cell. */
export const CELLS_ACROSS = WALL;

/**
 * Columns of writing cut down a wall, side by side and centred, read top to
 * bottom. This is the carving itself; `writingOn` is the two-column case a
 * post uses, and anything else that has a word to cut into stone comes here.
 * The writing hangs from the top of the wall unless `foot` is set, in which
 * case it stands on the bottom edge.
 */
export function carve(words: readonly string[], tall: number, wide: number, foot = false) {
  const columns = words.map((word) => [...word]);
  const lines = Math.max(1, ...columns.map((column) => column.length));
  const across = wide / WALL;
  const high = Math.max(GRID + EDGE * 2, Math.floor(tall / across));
  const down = tall / high;

  const room = Math.max(1, high - EDGE * 2);
  const size = Math.max(3, Math.min(GRID, Math.floor(room / lines) - 1));
  const pitch = size + Math.max(1, Math.round(size / 5));
  const gap = Math.max(2, Math.round(size / 2));
  const left = Math.max(0, Math.floor((WALL - (size * columns.length + gap * (columns.length - 1))) / 2));
  // the writing hangs from the top of the wall, or stands on its foot
  const written = lines * pitch - (pitch - size);
  const top = foot ? Math.max(EDGE, high - EDGE - written) : EDGE;

  const cut = new Uint8Array(WALL * high);
  for (let side = 0; side < columns.length; side++) {
    const letters = columns[side]!;
    for (let i = 0; i < letters.length; i++) {
      const sign = signCut(letters[i]!, size);
      const atCol = left + side * (size + gap);
      const atRow = top + i * pitch;
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (sign[row * size + col] === 1) cut[(atRow + row) * WALL + atCol + col] = 1;
        }
      }
    }
  }

  return { columns, lines, size, across, down, high, patches: mergeOf(cut, WALL, high) };
}

/** How many posts fit at each size, and how many get raised at all. */
const ROOM = TIERS.map((tier) => ACROSS * DEEP * tier * tier);
const MOST = ROOM[ROOM.length - 1]!;

/** How small the stones have to be to hold this many, and how they then stand. */
export function tierFor(count: number) {
  const step = TIERS[Math.min(TIERS.length - 1, ROOM.findIndex((room) => count <= room))] ?? 1;
  const tier = step < 1 ? 1 : step;
  return { columns: ACROSS * tier, rows: DEEP * tier, pitch: PITCH / tier, wide: POST / tier };
}

/** The shortest and tallest a post gets, whatever share it stands for. */
const LOW = 1.3;
const HIGH = 3.8;

/**
 * What an account holds, as posts.
 *
 * One post a token, the native coin among them, tallest first. Height is the
 * share of that token's whole supply, on a log scale: everything of it stands
 * as high as a house, a hundred-millionth of it stands knee high, and two
 * wallets holding the same share of different tokens stand the same. A number
 * on its own would say nothing — a million of one token and a million of
 * another are not comparable — so the post is cut to the share and the number
 * is written on it.
 *
 * A wallet with more tokens than will fit gets the largest holdings of them and
 * a last post saying how many were left off. Nothing is silently dropped.
 *
 * They are not lined up by height and they do not fill up from one edge. Once
 * it is settled which tokens stand here, the plate's places are shuffled from
 * the address and the posts take them in that order, each turned and nudged off
 * the middle of its place. So five tokens stand about the plate rather than in
 * the front row of it, and a plate looks like stones somebody stood up one at a
 * time — which is what it is — rather than a bar chart.
 */
export function postsOf(
  account: Account,
  holdings: readonly Holding[] = [],
  coin: { symbol: string; supply: bigint } = NATIVE,
): Post[] {
  const all: Holding[] = [];
  if (account.balance > 0n) {
    all.push({ symbol: coin.symbol, amount: account.balance, decimals: 18, supply: coin.supply });
  }
  for (const held of holdings) if (held.amount > 0n) all.push(held);

  const standing = all.map((held) => {
    const share = shareOf(held);
    const high = share <= 0 ? 0 : Math.max(0, Math.min(1, 1 + Math.log10(share) / DECADES));
    return {
      symbol: sayable(held.symbol),
      amount: amountText(held.amount, held.decimals),
      share,
      tall: LOW + (HIGH - LOW) * high,
    };
  });

  // which of them stand here is decided by share, so nothing big is dropped
  standing.sort((one, two) => two.share - one.share || one.symbol.localeCompare(two.symbol));
  const posts =
    standing.length <= MOST
      ? standing
      : [
          ...standing.slice(0, MOST - 1),
          { symbol: 'more', amount: String(standing.length - (MOST - 1)), share: 0, tall: LOW },
        ];

  // and then they are scattered, because ground is not a chart
  const { columns, rows, pitch, wide } = tierFor(posts.length);
  const seed = keccak_256(encoder.encode(`${account.address.toLowerCase()}/posts`));
  const byte = (i: number) => seed[i % 32]! / 255;
  const places = Array.from({ length: columns * rows }, (_, i) => i);
  for (let i = places.length - 1; i > 0; i--) {
    const swap = Math.floor(byte(i * 3 + 1) * (i + 1));
    [places[i], places[swap]] = [places[swap]!, places[i]!];
  }
  return posts.map((post, i) => {
    const place = places[i]!;
    const slack = (pitch - wide) * 0.9;
    return {
      ...post,
      wide,
      dx: ((place % columns) + 0.5 - columns / 2) * pitch + (byte(i * 7 + 3) - 0.5) * slack,
      dz: (Math.floor(place / columns) + 0.5 - rows / 2) * pitch + (byte(i * 11 + 5) - 0.5) * slack,
      // turned, but not so far that the writing has its back to you
      turn: (byte(i * 5 + 2) - 0.5) * 1.4,
    };
  });
}

/**
 * How big the plate is and how the posts stand on it.
 *
 * The size is the same for every plate: one address, one piece of ground. The
 * plate itself says nothing — it is plain stone. What is written is written on
 * the posts standing on it, because a post is a token and the writing is that
 * token's name and how much of it is held.
 */
export function layoutOf() {
  return {
    columns: ACROSS,
    rows: DEEP,
    wide: ACROSS * PITCH + PITCH * 0.6,
    deep: DEEP * PITCH + PITCH * 0.6,
  };
}

/** Bytes of the code hash, or of the address for something with no code. */
function seedOf(account: Account): Uint8Array {
  const text = account.codeSize > 0 ? account.code : account.address.toLowerCase();
  return keccak_256(encoder.encode(text));
}

/**
 * An account, as a thing standing on the ground.
 *
 * Code makes it big: a contract carrying twelve kilobytes is a large building
 * and one carrying two hundred bytes is a hut. The shape and the turn come from
 * the hash of that code, so two contracts deployed from the same factory are
 * identical — which they are. What it holds darkens it.
 */
export function structureOf(
  account: Account,
  holdings: readonly Holding[] = [],
  coin: { symbol: string; supply: bigint } = NATIVE,
  /** If this is a plot: what has been written into it, which may be nothing. */
  plot: { note: string } | null = null,
): Structure {
  const at = offsetOf(account.address);
  const seed = seedOf(account);
  const byte = (i: number) => seed[i % 32]! / 255;
  const held = Number(account.balance / 10n ** 15n) / 1000; // in ether, roughly

  if (account.codeSize === 0) {
    // A plate, and it is not turned: this is writing, and writing has a way up.
    // Its size is its writing's and its posts' — the stone is cut to fit what
    // it says, not the other way round. What it has sent wears the marks deeper.
    const posts = postsOf(account, holdings, coin);
    const laid = layoutOf();
    const worn = Math.min(1, Math.log10(1 + account.nonce) / 4);
    return {
      kind: 'written',
      address: account.address,
      x: at.x,
      z: at.z,
      wide: laid.wide,
      deep: laid.deep,
      tall: 0.14 + worn * 0.12,
      turn: 0,
      albedo: 0.64 - worn * 0.14,
      roughness: 0.75,
      posts,
    };
  }

  // code size runs from a few hundred bytes to about twenty five thousand
  const bulk = Math.log2(Math.max(64, account.codeSize)) / Math.log2(24576);
  // a plot with nothing said into it yet is the drawing of a building, and a
  // drawing is smaller than the thing: seven tenths of what will stand here
  const drawn = plot !== null && plot.note.length === 0;
  const scale = drawn ? 0.7 : 1;

  return {
    kind: drawn ? 'framed' : 'built',
    address: account.address,
    x: at.x,
    z: at.z,
    wide: (6 + bulk * 26 * (0.7 + byte(0) * 0.6)) * scale,
    deep: (6 + bulk * 26 * (0.7 + byte(1) * 0.6)) * scale,
    tall: (8 + bulk * 90 * (0.6 + byte(2) * 0.8)) * scale,
    turn: byte(3) * Math.PI * 2,
    // what it holds makes it heavier to look at, on a scale where a hundred
    // ether is already dark; nothing at all leaves it pale
    albedo: 0.72 - Math.min(0.55, Math.log10(1 + held) / 4),
    roughness: 0.35 + byte(4) * 0.5,
  };
}

/**
 * One structure as the renderer wants it, in the patch's own coordinates.
 *
 * Never in the world's: a float loses whole metres out at seventeen million,
 * and anything drawn there comes out torn.
 */
export function instanceOf(structure: Structure, base: number, origin = { x: 0, z: 0 }): Float32Array {
  return new Float32Array([
    structure.x - origin.x,
    base,
    structure.z - origin.z,
    structure.wide,
    structure.tall,
    structure.deep,
    structure.turn,
    structure.albedo,
    structure.roughness,
  ]);
}

/**
 * Where one post stands on its plate, relative to the middle of the stone.
 *
 * Worked out once, when the posts are made, because three things need the same
 * answer: what to draw, what you walk into, and where a transaction in that
 * token has to come out of. A transaction in usdc that landed on the plate in
 * general would be a lie about which stone it concerns.
 */
export function placeOfPost(post: Post): { dx: number; dz: number } {
  return { dx: post.dx, dz: post.dz };
}

/** The post a token stands on, if this stone has one for it. */
export function postFor(structure: Structure, token: string): Post | null {
  const want = token.toLowerCase();
  return structure.posts?.find((post) => post.symbol === want) ?? null;
}

/**
 * The posts of a stone as things you can walk into and land on.
 *
 * In the patch's own coordinates, like everything else given to the world.
 */
export function standingOn(
  structure: Structure,
  base: number,
  origin = { x: 0, z: 0 },
): { symbol: string; x: number; z: number; halfWide: number; halfDeep: number; turn: number; top: number }[] {
  const foot = base + structure.tall;
  return (structure.posts ?? []).map((post) => {
    const { dx, dz } = placeOfPost(post);
    return {
      symbol: post.symbol,
      x: structure.x - origin.x + dx,
      z: structure.z - origin.z + dz,
      halfWide: post.wide / 2,
      halfDeep: post.wide / 2,
      turn: post.turn,
      top: foot + post.tall,
    };
  });
}

/**
 * The pieces a structure is made of, as the renderer wants them.
 *
 * A building is one block. A stone is a plain plate and a post for every token
 * held, each post's wall laid in rectangles that go round its writing.
 */
export function piecesOf(structure: Structure, base: number, origin = { x: 0, z: 0 }): Float32Array {
  // a drawing is not made of stone: see blueprint.ts
  if (structure.kind === 'framed') return new Float32Array(0);
  if (structure.kind !== 'written') return instanceOf(structure, base, origin);

  const posts = structure.posts ?? [];
  const cx = structure.x - origin.x;
  const cz = structure.z - origin.z;

  const out: number[] = [];
  const put = (x: number, y: number, z: number, w: number, h: number, d: number, turn = 0) =>
    out.push(x, y, z, w, h, d, turn, structure.albedo, structure.roughness);

  // the plate: plain stone, reaching down far enough to meet the hill rather
  // than hover over it
  const sink = structure.sink ?? SKIRT;
  put(cx, base - sink, cz, structure.wide, structure.tall + sink, structure.deep);

  // a post for every token, in rows, tallest at the back
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]!;
    const { dx, dz } = placeOfPost(post);
    const px = cx + dx;
    const pz = cz + dz;
    const foot = base + structure.tall;
    // the shader spins xz by mat2(c, -s, s, c), so anything laid on a turned
    // post has to be carried round the post the same way
    const c = Math.cos(post.turn);
    const sn = Math.sin(post.turn);
    const round = (lx: number, lz: number): [number, number] => [
      c * lx + sn * lz,
      c * lz - sn * lx,
    ];

    // its writing is cut into the wall that looks back at whoever is reading:
    // the body stops a groove short of that wall, and the wall is laid on in
    // rectangles that go round the strokes, so the strokes are the gap
    if (post.wide < WORTH_WRITING) {
      // too small to write on: a bare peg, and the readout still names it
      put(px, foot, pz, post.wide, post.tall, post.wide, post.turn);
      continue;
    }

    const { across, down, patches } = writingOn(post.symbol, post.amount, post.tall, post.wide);
    const cutIn = Math.max(across * 1.6, 0.003);
    const [bx, bz] = round(0, -cutIn / 2);
    put(px + bx, foot, pz + bz, post.wide, post.tall, post.wide - cutIn, post.turn);

    for (const { col, row, cols, rows } of patches) {
      const [lx, lz] = round((col + cols / 2 - WALL / 2) * across, post.wide / 2 - cutIn / 2);
      put(
        px + lx,
        foot + post.tall - (row + rows) * down,
        pz + lz,
        cols * across,
        rows * down,
        cutIn,
        post.turn,
      );
    }
  }

  return new Float32Array(out);
}

/** Whether an account leaves anything on the ground at all. */
export function stands(account: Account): boolean {
  return account.codeSize > 0 || account.balance > 0n || account.nonce > 0;
}


export function instancesOf(
  structures: readonly Structure[],
  baseOf: (s: Structure) => number,
  origin = { x: 0, z: 0 },
): Float32Array {
  const parts = structures.map((structure) => piecesOf(structure, baseOf(structure), origin));
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

