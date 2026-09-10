import { afterEach, describe, expect, it } from 'vitest';
import { HOME_METRES, WORLD, addressUnder, heightAt, levelOff, levelled, rawHeightAt, unlevel, withinWorld } from '../src/engine/land';

afterEach(() => unlevel());

describe('ground somebody levelled', () => {
  it('is the hash and nothing else until somebody levels it', () => {
    expect(levelled()).toBe(0);
    for (const [x, z] of [[0, 0], [12, -40], [1e6, 4e5]]) {
      expect(heightAt(x!, z!)).toBe(rawHeightAt(x!, z!));
    }
  });

  it('is flat over a pad and the hill again away from it', () => {
    const pad = { x: 120, z: -80, halfWide: 4, halfDeep: 3, level: 17.5 };
    levelOff(pad);
    expect(levelled()).toBe(1);

    // flat over the whole pad, whatever the hill was doing there
    for (const [dx, dz] of [[0, 0], [3.9, 2.9], [-3.9, -2.9], [-2, 1]]) {
      expect(heightAt(pad.x + dx!, pad.z + dz!)).toBeCloseTo(pad.level, 6);
    }
    // and untouched once the ramp is behind you
    expect(heightAt(pad.x + 60, pad.z)).toBe(rawHeightAt(pad.x + 60, pad.z));

    // the ramp between them is a ramp: it only ever goes one way
    const heights = Array.from({ length: 12 }, (_, i) =>
      heightAt(pad.x + pad.halfWide + (i * 5) / 11, pad.z),
    );
    const up = heights[0]! < heights[heights.length - 1]!;
    for (let i = 1; i < heights.length; i++) {
      if (up) expect(heights[i]!).toBeGreaterThanOrEqual(heights[i - 1]! - 1e-9);
      else expect(heights[i]!).toBeLessThanOrEqual(heights[i - 1]! + 1e-9);
    }
  });

  it('levels the same spot once, however many times it is asked', () => {
    levelOff({ x: 0, z: 0, halfWide: 4, halfDeep: 4, level: 3 });
    levelOff({ x: 0, z: 0, halfWide: 4, halfDeep: 4, level: 9 });
    expect(levelled()).toBe(1);
    expect(heightAt(0, 0)).toBeCloseTo(9, 6);
  });
});

describe('the edge of the world', () => {
  it('keeps a point inside, and leaves one already inside alone', () => {
    expect(withinWorld(10, -20)).toEqual({ x: 10, z: -20 });
    const west = withinWorld(-HOME_METRES.x - 1000, 0);
    expect(west.x + HOME_METRES.x).toBeCloseTo(0.5, 6);
    const far = withinWorld(WORLD, WORLD);
    expect(far.x + HOME_METRES.x).toBeCloseTo(WORLD - 0.5, 6);
  });

  it('names the ground under feet that are past the edge, instead of throwing', () => {
    expect(() => addressUnder(-1e9, -1e9)).not.toThrow();
    expect(addressUnder(-1e9, -1e9)).toBe('0'.repeat(13));
  });
});
