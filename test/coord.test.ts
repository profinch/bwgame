import { describe, expect, it } from 'vitest';
import {
  DEPTH,
  SIDE,
  addressToPath,
  addressToPoint,
  cellToDigit,
  commonDepth,
  digitToCell,
  isWithin,
  localPosition,
  normalizeAddress,
  pathToAddress,
  pointToAddress,
  prefixRect,
} from '../src/coord';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DEAD = '0x000000000000000000000000000000000000dEaD';
const ECRECOVER = '0x0000000000000000000000000000000000000001';

/** Deterministic pseudo-random addresses, so a failure can be reproduced. */
function* sampleAddresses(count: number): Generator<string> {
  let seed = 0x9e3779b9;
  for (let i = 0; i < count; i++) {
    let hex = '';
    while (hex.length < DEPTH) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      hex += seed.toString(16).padStart(8, '0');
    }
    yield hex.slice(0, DEPTH);
  }
}

describe('normalizeAddress', () => {
  it('strips 0x and lowercases', () => {
    expect(normalizeAddress(USDC)).toBe('a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  it('refuses anything that is not an address', () => {
    expect(() => normalizeAddress('0xdead')).toThrow();
    expect(() => normalizeAddress(`0x${'z'.repeat(40)}`)).toThrow();
    expect(() => normalizeAddress(`0x${'a'.repeat(41)}`)).toThrow();
  });
});

describe('digits and cells', () => {
  it('round-trips every hex digit', () => {
    for (let digit = 0; digit < 16; digit++) {
      expect(cellToDigit(digitToCell(digit))).toBe(digit);
    }
  });

  it('splits high bits into x and low bits into y', () => {
    expect(digitToCell(0x0)).toEqual({ x: 0, y: 0 });
    expect(digitToCell(0xa)).toEqual({ x: 2, y: 2 });
    expect(digitToCell(0xf)).toEqual({ x: 3, y: 3 });
  });

  it('refuses cells outside the grid', () => {
    expect(() => cellToDigit({ x: 4, y: 0 })).toThrow();
    expect(() => digitToCell(16)).toThrow();
  });
});

describe('address to point and back', () => {
  it('round-trips known addresses', () => {
    for (const address of [USDC, WETH, DEAD, ECRECOVER]) {
      expect(pointToAddress(addressToPoint(address))).toBe(normalizeAddress(address));
    }
  });

  it('round-trips sampled addresses', () => {
    for (const address of sampleAddresses(200)) {
      expect(pointToAddress(addressToPoint(address))).toBe(address);
    }
  });

  it('puts the corners where they belong', () => {
    expect(addressToPoint(`0x${'0'.repeat(40)}`)).toEqual({ x: 0n, y: 0n });
    expect(addressToPoint(`0x${'f'.repeat(40)}`)).toEqual({ x: SIDE - 1n, y: SIDE - 1n });
  });

  it('refuses points outside the world', () => {
    expect(() => pointToAddress({ x: SIDE, y: 0n })).toThrow();
    expect(() => pointToAddress({ x: 0n, y: -1n })).toThrow();
  });
});

describe('path', () => {
  it('has one cell per digit and reads back as the address', () => {
    const path = addressToPath(USDC);
    expect(path).toHaveLength(DEPTH);
    expect(pathToAddress(path)).toBe(normalizeAddress(USDC));
  });

  it('starts with the route the address spells out', () => {
    expect(addressToPath(USDC).slice(0, 4)).toEqual([
      { x: 2, y: 2 },
      { x: 0, y: 0 },
      { x: 2, y: 3 },
      { x: 2, y: 0 },
    ]);
  });

  it('sends the zero addresses into one corner', () => {
    expect(addressToPath(DEAD).slice(0, 8)).toEqual(Array(8).fill({ x: 0, y: 0 }));
    expect(addressToPath(ECRECOVER).slice(0, 8)).toEqual(Array(8).fill({ x: 0, y: 0 }));
  });
});

describe('neighbourhood', () => {
  it('counts shared leading digits', () => {
    expect(commonDepth(USDC, USDC)).toBe(DEPTH);
    expect(commonDepth(USDC, WETH)).toBe(0);
    expect(commonDepth(`0x${'a'.repeat(40)}`, `0xaaaaaab${'0'.repeat(33)}`)).toBe(6);
  });

  it('knows which cell an address stands in', () => {
    expect(isWithin('0xa0b8', USDC)).toBe(true);
    expect(isWithin('0xa0b9', USDC)).toBe(false);
    expect(isWithin('', USDC)).toBe(true);
  });
});

describe('prefixRect', () => {
  it('covers the whole world at depth zero', () => {
    expect(prefixRect('')).toEqual({ x: 0, y: 0, size: 1 });
  });

  it('shrinks by four on each side per digit', () => {
    expect(prefixRect('a').size).toBeCloseTo(1 / 4);
    expect(prefixRect('a0').size).toBeCloseTo(1 / 16);
    expect(prefixRect('a0b').size).toBeCloseTo(1 / 64);
  });

  it('nests each square inside its parent', () => {
    const parent = prefixRect('a0');
    const child = prefixRect('a0b');
    expect(child.x).toBeGreaterThanOrEqual(parent.x);
    expect(child.y).toBeGreaterThanOrEqual(parent.y);
    expect(child.x + child.size).toBeLessThanOrEqual(parent.x + parent.size);
    expect(child.y + child.size).toBeLessThanOrEqual(parent.y + parent.size);
  });
});

describe('localPosition', () => {
  it('stays inside the cell', () => {
    for (const address of sampleAddresses(100)) {
      const { x, y } = localPosition(address, address.slice(0, 4));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      expect(y).toBeLessThan(1);
    }
  });

  it('lands inside every square the address passes through', () => {
    const hex = normalizeAddress(USDC);
    const outer = prefixRect(hex.slice(0, 3));
    const local = localPosition(USDC, hex.slice(0, 3));
    const worldX = outer.x + local.x * outer.size;
    const worldY = outer.y + local.y * outer.size;

    for (let depth = 3; depth <= 12; depth++) {
      const square = prefixRect(hex.slice(0, depth));
      expect(worldX).toBeGreaterThanOrEqual(square.x);
      expect(worldY).toBeGreaterThanOrEqual(square.y);
      expect(worldX).toBeLessThan(square.x + square.size);
      expect(worldY).toBeLessThan(square.y + square.size);
    }
  });

  it('is the parent cell plus a quarter of the child position', () => {
    const hex = normalizeAddress(USDC);
    for (let depth = 0; depth < 8; depth++) {
      const parent = localPosition(USDC, hex.slice(0, depth));
      const child = localPosition(USDC, hex.slice(0, depth + 1));
      const cell = digitToCell(parseInt(hex[depth]!, 16));
      expect(parent.x).toBeCloseTo((cell.x + child.x) / 4, 12);
      expect(parent.y).toBeCloseTo((cell.y + child.y) / 4, 12);
    }
  });

  it('refuses an address that stands elsewhere', () => {
    expect(() => localPosition(USDC, '0xffff')).toThrow();
  });
});
