import { describe, expect, it } from 'vitest';
import { strokesOf } from '../src/blueprint';
import { INSTANCE_FLOATS } from '../src/engine/renderer';
import { type Structure, bouldersOf, piecesOf } from '../src/places';

/**
 * Whatever stands on a slope reaches the ground on its downhill side: the
 * lowest point of what is drawn is at or below the lowest ground under it.
 */
const slope = (x: number, z: number) => 100 + x * 0.3 + z * 0.1; // one in three

function on(kind: Structure['kind'], relic?: 1 | 2): Structure {
  const s = {
    kind,
    address: '0x3095c19c92551bba70bcfa9aafa99d145347b5f8',
    x: 10,
    z: 20,
    wide: 8,
    tall: 12,
    deep: 6,
    turn: 0.3,
    albedo: 0.5,
    roughness: 0.6,
    relic,
    plot: { owner: '0x3095c19c92551bba70bcfa9aafa99d145347b5f8', note: '', implementation: null, salt: null, name: null },
  } as unknown as Structure;
  return s;
}

/** As the world sets a base: the highest ground under the footprint, and the drop into `sink`. */
function baseOf(s: Structure): number {
  let high = -Infinity;
  let low = Infinity;
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
    const at = slope(s.x + (ix * s.wide) / 2, s.z + (iz * s.deep) / 2);
    high = Math.max(high, at);
    low = Math.min(low, at);
  }
  s.sink = high - low + 0.1;
  return high + 0.02;
}

function lowestGround(s: Structure): number {
  let low = Infinity;
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) low = Math.min(low, slope(s.x + (ix * s.wide) / 2, s.z + (iz * s.deep) / 2));
  return low;
}

function lowestOf(instances: Float32Array): number {
  let low = Infinity;
  for (let i = 0; i < instances.length; i += INSTANCE_FLOATS) low = Math.min(low, instances[i + 1]!);
  return low;
}

describe('footing on a slope', () => {
  it('a building reaches the lowest ground under it', () => {
    const s = on('built');
    const base = baseOf(s);
    expect(lowestOf(piecesOf(s, base))).toBeLessThanOrEqual(lowestGround(s) + 0.05);
  });
  it('a plate reaches the lowest ground under it', () => {
    const s = on('written');
    const base = baseOf(s);
    expect(lowestOf(piecesOf(s, base))).toBeLessThanOrEqual(lowestGround(s) + 0.05);
  });
  it('a gate\'s piers reach the lowest ground under it', () => {
    const s = on('relic', 2);
    const base = baseOf(s);
    expect(lowestOf(piecesOf(s, base))).toBeLessThanOrEqual(lowestGround(s) + 0.05);
  });
  it('a drawing is drawn from the lowest ground under it', () => {
    const s = on('framed');
    const base = baseOf(s);
    const strokes = strokesOf(s, base);
    let low = Infinity;
    for (const stroke of strokes) for (const p of [stroke.from, stroke.to]) low = Math.min(low, p[1]);
    expect(low).toBeLessThanOrEqual(lowestGround(s) + 0.15);
  });
  it('a boulder sits in the ground', () => {
    const s = on('relic', 1);
    // as the world sets a boulder: the lowest ground under it, and a fifth of its height into it
    const base = lowestGround(s) - s.tall * 0.18;
    const stones = bouldersOf([s], () => base);
    expect(stones.length / INSTANCE_FLOATS).toBe(1);
    expect(stones[1]).toBeLessThan(lowestGround(s));
  });
});
