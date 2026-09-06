import { describe, expect, it } from 'vitest';
import { pack, unpack } from '../src/engine/coverage';

/** A tile as it usually is: mostly untouched, with a stood-in patch in it. */
function tile(): Uint8Array {
  const bytes = new Uint8Array(64 * 64);
  for (let y = 20; y < 40; y++) {
    for (let x = 18; x < 44; x++) {
      bytes[y * 64 + x] = Math.min(255, (x - 18) * 9 + (y - 20) * 4);
    }
  }
  return bytes;
}

describe('storing a tile', () => {
  it('comes back exactly as it went in', () => {
    const before = tile();
    const after = new Uint8Array(before.length);
    expect(unpack(pack(before), after)).toBe(true);
    expect([...after]).toEqual([...before]);
  });

  it('round-trips the extremes', () => {
    for (const fill of [0, 255, 1]) {
      const before = new Uint8Array(64 * 64).fill(fill);
      const after = new Uint8Array(before.length);
      unpack(pack(before), after);
      expect([...after]).toEqual([...before]);
    }
  });

  it('is far smaller than the tile, which is the point of storing it at all', () => {
    // a tile is nearly all one value, so runs do most of the work
    expect(pack(tile()).length).toBeLessThan(64 * 64);
    expect(pack(new Uint8Array(64 * 64)).length).toBeLessThan(100);
  });

  it('refuses nonsense instead of throwing', () => {
    expect(unpack('not base64 !!!', new Uint8Array(16))).toBe(false);
  });
});
