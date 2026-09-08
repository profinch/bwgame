import { describe, expect, it } from 'vitest';
import type { Account } from '../src/chain';
import { INSTANCE_FLOATS } from '../src/engine/renderer';
import {
  CHARS,
  ETHER_SUPPLY,
  GRID,
  type Holding,
  amountText,
  codeOf,
  cutOf,
  POST,
  reliefOf,
  piecesOf,
  placeOfPost,
  postFor,
  postsOf,
  standingOn,
  shareOf,
  signOf,
  stands,
  structureOf,
  widthOf,
  writingOn,
} from '../src/places';

const HELD: Holding[] = [
  { symbol: 'usdc', amount: 250_500_000n, decimals: 6, supply: 34_000_000_000n * 10n ** 6n },
  { symbol: 'weth', amount: 10n ** 18n, decimals: 18, supply: 2_600_000n * 10n ** 18n },
];

const WALLET: Account = {
  address: '0x9d25b864a22e36ca8fe285237b1a22b33cefbcc5',
  codeSize: 0,
  code: '',
  balance: 29_609_334_952_849_830n,
  nonce: 121,
};

const CONTRACT: Account = {
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  codeSize: 12_000,
  code: '60806040',
  balance: 0n,
  nonce: 1,
};

const pieces = (data: Float32Array) => data.length / INSTANCE_FLOATS;

/** How many rectangles all the walls of a set of posts come to. */
const countedWriting = (posts: readonly { symbol: string; amount: string; tall: number }[]) => {
  let patches = 0;
  for (const post of posts) patches += writingOn(post.symbol, post.amount, post.tall).patches.length;
  return patches;
};

describe('what stands where', () => {
  it('builds a contract and writes a wallet', () => {
    expect(structureOf(CONTRACT).kind).toBe('built');
    expect(structureOf(WALLET).kind).toBe('written');
  });

  it('leaves an untouched address alone', () => {
    expect(stands({ address: `0x${'11'.repeat(20)}`, codeSize: 0, code: '', balance: 0n, nonce: 0 }))
      .toBe(false);
    expect(stands(WALLET)).toBe(true);
    expect(stands(CONTRACT)).toBe(true);
  });

  it('a building is one block', () => {
    expect(pieces(piecesOf(structureOf(CONTRACT), 0))).toBe(1);
  });

  /** A sign is its character's number written in strokes: no two are alike. */
  it('gives every character its own sign', () => {
    const shapes = new Set<string>();
    for (const char of CHARS) {
      const strokes = signOf(char);
      let ones = 0;
      for (let bit = 0; bit < 6; bit++) if (codeOf(char) & (1 << bit)) ones++;
      expect(strokes.length).toBe(1 + ones);
      shapes.add(JSON.stringify(strokes));
    }
    expect(shapes.size).toBe(CHARS.length);
    expect(signOf('0')).toHaveLength(1); // a bare stem
    expect(signOf(' ')).toHaveLength(0); // and a space says nothing
    expect(signOf('_')).toHaveLength(0);
  });

  /** The writing is the groove, so every character cuts a different pattern. */
  it('cuts a different groove for every character', () => {
    const grooves = new Set<string>();
    for (const char of CHARS) {
      const { cut, wide } = cutOf(char);
      expect(wide).toBe(GRID);
      const gone = cut.reduce((sum, cell) => sum + cell, 0);
      expect(gone).toBeGreaterThan(0);
      expect(gone).toBeLessThan(GRID * GRID * 0.6); // the stone survives
      grooves.add(cut.join(''));
    }
    expect(grooves.size).toBe(CHARS.length);
    const bare = cutOf('0').cut.reduce((sum, cell) => sum + cell, 0);
    const full = cutOf(CHARS[CHARS.length - 1]!).cut.reduce((sum, cell) => sum + cell, 0);
    expect(bare).toBeLessThan(full);
    // a space leaves the stone whole
    expect(cutOf(' ').cut.reduce((sum, cell) => sum + cell, 0)).toBe(0);
  });

  it('leaves blank between signs, so words read as words', () => {
    expect(widthOf('ab')).toBeGreaterThan(GRID * 2);
    const { cut, wide } = cutOf('ab');
    for (let row = 0; row < GRID; row++) {
      for (let col = GRID; col < wide - GRID; col++) expect(cut[row * wide + col]).toBe(0);
    }
  });

  it('stands a post for the native coin and one for every token held', () => {
    const posts = postsOf(WALLET, HELD);
    expect(posts.map((post) => post.symbol).sort()).toEqual(['eth', 'usdc', 'weth']);
    // height is the share of that token's whole supply, and they are not
    // lined up by it: the order is shuffled and each post turned off square
    const byShare = [...posts].sort((one, two) => two.share - one.share);
    expect(byShare.map((post) => post.tall)).toEqual(
      [...byShare].sort((one, two) => two.tall - one.tall).map((post) => post.tall),
    );
    expect(posts.some((post) => post.turn !== 0)).toBe(true);
    expect(posts.some((post) => post.dx !== 0 || post.dz !== 0)).toBe(true);
    const eth = posts.find((post) => post.symbol === 'eth')!;
    expect(eth.amount).toBe('0.0296');
    expect(shareOf({ symbol: 'eth', amount: WALLET.balance, decimals: 18, supply: ETHER_SUPPLY }))
      .toBeCloseTo(2.45e-10, 12);
  });

  it('leaves the plate itself plain: what is written is written on the posts', () => {
    const stone = structureOf(WALLET, HELD);
    const data = piecesOf(stone, 0, { x: stone.x, z: stone.z });
    // one box for the plate, then only posts and their writing
    expect(data[3]).toBeCloseTo(stone.wide, 5);
    expect(data[5]).toBeCloseTo(stone.deep, 5);
    expect(pieces(data)).toBe(1 + stone.posts!.length + countedWriting(stone.posts!));
  });

  it('writes an amount short enough to carve', () => {
    expect(amountText(0n, 18)).toBe('0');
    expect(amountText(10n ** 18n, 18)).toBe('1');
    expect(amountText(1_500_000n * 10n ** 18n, 18)).toBe('1.5m');
    expect(amountText(2_345n * 10n ** 18n, 18)).toBe('2.35k');
    expect(amountText(4n * 10n ** 30n, 18)).toBe('4t');
    expect(amountText(1n, 18)).toBe('dust');
    // never longer than a post can carry
    for (const amount of [1n, 10n ** 9n, 10n ** 24n, 7n * 10n ** 33n]) {
      expect(amountText(amount, 18).length).toBeLessThanOrEqual(8);
    }
  });

  it('says nothing of a token nobody holds', () => {
    expect(postsOf({ ...WALLET, balance: 0n }, [{ ...HELD[0]!, amount: 0n }])).toEqual([]);
  });

  /** A million of one token and a million of another are not comparable. */
  it('cuts a post to the share, not to the number', () => {
    const supply = 10n ** 6n * 10n ** 18n;
    const half = postsOf({ ...WALLET, balance: 0n }, [
      { symbol: 'a', amount: supply / 2n, decimals: 18, supply },
    ])[0]!;
    const speck = postsOf({ ...WALLET, balance: 0n }, [
      { symbol: 'b', amount: supply / 10n ** 8n, decimals: 18, supply },
    ])[0]!;
    expect(half.tall).toBeGreaterThan(speck.tall * 1.6);
    // the same share of two different tokens stands the same height
    const other = 10n ** 12n * 10n ** 18n;
    const twin = postsOf({ ...WALLET, balance: 0n }, [
      { symbol: 'c', amount: other / 2n, decimals: 18, supply: other },
    ])[0]!;
    expect(twin.tall).toBeCloseTo(half.tall, 6);
    // and a token that would not say its supply claims no height at all
    const mute = postsOf({ ...WALLET, balance: 0n }, [
      { symbol: 'd', amount: supply, decimals: 18 },
    ])[0]!;
    expect(mute.share).toBe(0);
    expect(mute.tall).toBeLessThanOrEqual(speck.tall);
  });

  it('gives every wallet the same plate, however much it holds', () => {
    const bare = structureOf({ ...WALLET, balance: 0n });
    const held = structureOf(WALLET, HELD);
    const many: Holding[] = [];
    for (let i = 0; i < 40; i++) {
      many.push({ symbol: `t${i}`, amount: 10n ** 20n, decimals: 18, supply: 10n ** 24n });
    }
    const full = structureOf(WALLET, many);
    for (const stone of [held, full]) {
      expect(stone.wide).toBe(bare.wide);
      expect(stone.deep).toBe(bare.deep);
    }
  });

  /** A plate that fills up puts up smaller stones; it never takes more ground. */
  it('shrinks the stones rather than the plate as a wallet fills up', () => {
    const holdings = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        symbol: `t${i}`,
        amount: BigInt(i + 1) * 10n ** 18n,
        decimals: 18,
        supply: 10n ** 24n,
      }));
    const few = structureOf({ ...WALLET, balance: 0n }, holdings(20));
    const many = structureOf({ ...WALLET, balance: 0n }, holdings(120));
    const heap = structureOf({ ...WALLET, balance: 0n }, holdings(400));

    expect(few.posts!.length).toBe(20);
    expect(many.posts!.length).toBe(120);
    expect(heap.posts!.length).toBe(400);
    expect(many.posts![0]!.wide).toBeLessThan(few.posts![0]!.wide);
    expect(heap.posts![0]!.wide).toBeLessThan(many.posts![0]!.wide);
    for (const stone of [few, many, heap]) {
      expect(stone.wide).toBe(few.wide);
      expect(stone.deep).toBe(few.deep);
      // and every stone stands on its own plate, not over the edge of it
      for (const post of stone.posts!) {
        expect(Math.abs(post.dx) + post.wide / 2).toBeLessThanOrEqual(stone.wide / 2);
        expect(Math.abs(post.dz) + post.wide / 2).toBeLessThanOrEqual(stone.deep / 2);
      }
    }
  });

  it('counts the rest rather than dropping them once even that runs out', () => {
    const many: Holding[] = [];
    for (let i = 0; i < 900; i++) {
      many.push({ symbol: `t${i}`, amount: BigInt(i + 1) * 10n ** 15n, decimals: 18, supply: 10n ** 24n });
    }
    const stone = structureOf({ ...WALLET, balance: 0n }, many);
    const posts = stone.posts!;
    expect(posts.length).toBeLessThan(900);
    const rest = posts.find((post) => post.symbol === 'more')!;
    expect(rest).toBeDefined();
    expect(Number(rest.amount)).toBe(900 - (posts.length - 1));
    // a plate no bigger than the ground it is on, however much is on it
    expect(stone.wide).toBeLessThan(16);
    expect(stone.deep).toBeLessThan(16);
  });

  /** What is drawn, what you walk into and what lands on it are one place. */
  it(`says where each token's post stands, and stands it there`, () => {
    const stone = structureOf(WALLET, HELD);
    const usdc = postFor(stone, 'usdc')!;
    expect(usdc).toBeDefined();
    expect(postFor(stone, 'nope')).toBe(null);
    const where = placeOfPost(usdc);

    // the drawn body of that post is at exactly that place
    const data = piecesOf(stone, 0, { x: stone.x, z: stone.z });
    let nearest = Infinity;
    for (let i = 0; i < pieces(data); i++) {
      const at = i * INSTANCE_FLOATS;
      if (Math.abs(data[at + 3]! - POST) > 1e-6 || Math.abs(data[at + 4]! - usdc.tall) > 1e-6) continue;
      nearest = Math.min(nearest, Math.hypot(data[at]! - where.dx, data[at + 2]! - where.dz));
    }
    // a body stands there, set back from its written wall by the depth of the cut
    expect(nearest).toBeLessThan(0.05);

    // and it is something you walk into and can land on
    const standing = standingOn(stone, 0, { x: stone.x, z: stone.z });
    const box = standing.find((post) => post.symbol === 'usdc')!;
    expect(box.x).toBeCloseTo(where.dx, 6);
    expect(box.z).toBeCloseTo(where.dz, 6);
    expect(box.top).toBeCloseTo(stone.tall + usdc.tall, 6);
    expect(box.turn).toBe(usdc.turn);
  });

  it('makes a plate out of one box and a rectangle for every patch of stone', () => {
    const stone = structureOf(WALLET, HELD);
    const data = piecesOf(stone, 0, { x: stone.x, z: stone.z });
    // the plate, then a body and a laid wall for every post
    expect(pieces(data)).toBe(1 + stone.posts!.length + countedWriting(stone.posts!));
    // merging cells into rectangles is why writing on stone is affordable
    expect(reliefOf('0').patches.length).toBeLessThan(GRID * 2);
    expect(pieces(data)).toBeLessThan(400);
  });

  it('keeps the plate and every bar inside the ground it belongs to', () => {
    const stone = structureOf(WALLET, HELD);
    // asked for in the patch's own coordinates, as the world always asks: a
    // float holds barely a metre of resolution out where this address lies
    const data = piecesOf(stone, 0, { x: stone.x, z: stone.z });
    for (let i = 0; i < pieces(data); i++) {
      const x = data[i * INSTANCE_FLOATS]!;
      const z = data[i * INSTANCE_FLOATS + 2]!;
      const wide = data[i * INSTANCE_FLOATS + 3]!;
      const deep = data[i * INSTANCE_FLOATS + 5]!;
      expect(Math.abs(x) + wide / 2).toBeLessThanOrEqual(stone.wide / 2 + 1e-6);
      expect(Math.abs(z) + deep / 2).toBeLessThanOrEqual(stone.deep / 2 + 1e-6);
    }
  });

  it('is a stone rather than a building: low, flat, not turned', () => {
    const stone = structureOf(WALLET, HELD);
    expect(stone.turn).toBe(0);
    expect(stone.tall).toBeLessThan(1);
    expect(stone.wide).toBeGreaterThan(stone.tall * 4);
    // and small enough to read as writing: an address across a few metres
    expect(stone.wide).toBeLessThan(10);
  });

  it('raises a post for what stands on the plate and nothing for an empty wallet', () => {
    const bare = structureOf({ ...WALLET, balance: 0n });
    const held = structureOf(WALLET, HELD);
    expect(bare.posts).toEqual([]);
    expect(held.posts!.length).toBe(3);
  });

  /** Nothing written on a post reaches over its head. */
  it('keeps the writing on the wall of a post, not on top of it', () => {
    const stone = structureOf(WALLET, HELD);
    const data = piecesOf(stone, 0, { x: stone.x, z: stone.z });
    const tallest = Math.max(...stone.posts!.map((post) => post.tall));
    for (let i = 0; i < pieces(data); i++) {
      const y = data[i * INSTANCE_FLOATS + 1]!;
      const high = data[i * INSTANCE_FLOATS + 4]!;
      expect(y + high).toBeLessThanOrEqual(stone.tall + tallest + 1e-6);
    }
  });
});
