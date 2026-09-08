import { describe, expect, it } from 'vitest';
import type { Account } from '../src/chain';
import { INSTANCE_FLOATS } from '../src/engine/renderer';
import { piecesOf, stands, structureOf } from '../src/places';

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

  /** The marks are the address in binary, so there are as many as it has ones. */
  it('cuts exactly the bits of the address into the plate', () => {
    const digits = WALLET.address.replace(/^0x/, '');
    let ones = 0;
    for (const digit of digits) {
      let value = parseInt(digit, 16);
      while (value) {
        ones += value & 1;
        value >>= 1;
      }
    }

    const plate = structureOf(WALLET);
    // the slab itself, and one raised square for every bit that is set
    expect(pieces(piecesOf(plate, 0))).toBe(1 + ones);
  });

  it('keeps every mark on the plate it belongs to', () => {
    const plate = structureOf(WALLET);
    const data = piecesOf(plate, 0);
    for (let i = 1; i < pieces(data); i++) {
      const x = data[i * INSTANCE_FLOATS]!;
      const z = data[i * INSTANCE_FLOATS + 2]!;
      expect(Math.abs(x - plate.x)).toBeLessThanOrEqual(plate.wide / 2);
      expect(Math.abs(z - plate.z)).toBeLessThanOrEqual(plate.deep / 2);
    }
  });

  it('a plate lies flat and is not turned, because writing has a way up', () => {
    const plate = structureOf(WALLET);
    expect(plate.turn).toBe(0);
    expect(plate.tall).toBeLessThan(2);
    expect(plate.wide).toBeGreaterThan(plate.tall * 4);
  });
});
