import { describe, expect, it } from 'vitest';
import { HOME, offsetOf } from '../src/engine/land';
import { HORIZON, Traffic } from '../src/engine/traffic';

/** The patch these tests are standing in: the middle of the world's own grid. */
const ORIGIN = { x: 0, z: 0 };

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

function block(passing: { from: string; to: string; ok: boolean }[]) {
  return { number: 1, passing };
}

/** Every vertex is four floats: x, y, z, alpha. */
function vertices(built: { vertices: Float32Array; count: number }) {
  const out: { x: number; y: number; z: number; a: number }[] = [];
  for (let i = 0; i < built.count; i++) {
    out.push({
      x: built.vertices[i * 4]!,
      y: built.vertices[i * 4 + 1]!,
      z: built.vertices[i * 4 + 2]!,
      a: built.vertices[i * 4 + 3]!,
    });
  }
  return out;
}

describe('traffic', () => {
  /**
   * The ends are folded around the viewer and drawn in the patch, and the two
   * are a walk apart. Left unconverted, every streak came down as far from the
   * address as the viewer was from the middle of the patch — which is exactly
   * how far you stand off an address when you arrive at one.
   */
  it('lands on the address, wherever the viewer is standing in the patch', () => {
    const here = offsetOf(WETH);
    for (const stand of [
      { x: 0, z: 0 },
      { x: 14, z: -30 },
      { x: -45, z: 60 },
    ]) {
      const traffic = new Traffic();
      traffic.arrive(block([{ from: USDC, to: WETH, ok: true }]));
      for (let i = 0; i < 14; i++) traffic.step(0.25);
      const built = traffic.build(stand.x, 1.7, stand.z, here, () => 2);
      const last = vertices(built).at(-1)!;
      // the far end of the run is the address itself, at the top of what stands
      // on it rather than at the dirt beside it
      expect(Math.hypot(last.x, last.z)).toBeLessThan(1.5);
      expect(last.y).toBeCloseTo(2, 1);
    }
  });

  it('queues a block rather than tipping it into the sky at once', () => {
    const traffic = new Traffic();
    traffic.arrive(block([{ from: USDC, to: WETH, ok: true }]));
    expect(traffic.block).toBe(1);
    expect(traffic.queued).toBe(1);
    expect(traffic.flying).toBe(0);

    traffic.step(1);
    expect(traffic.flying).toBe(1);
    expect(traffic.queued).toBe(0);

    traffic.step(3);
    expect(traffic.flying).toBe(1);
    traffic.step(10);
    expect(traffic.flying).toBe(0);
  });

  it('lets a busy block out over the slot instead of all at once', () => {
    const traffic = new Traffic();
    traffic.arrive(block(Array.from({ length: 240 }, () => ({ from: USDC, to: WETH, ok: true }))));
    traffic.step(1);
    // twenty a second, give or take: a twelve second slot, not one frame
    expect(traffic.flying).toBeGreaterThan(10);
    expect(traffic.flying).toBeLessThan(40);
    expect(traffic.queued).toBeGreaterThan(150);
  });

  it('shakes a failed one along its whole length', () => {
    const good = new Traffic();
    const bad = new Traffic();
    good.arrive(block([{ from: USDC, to: WETH, ok: true }]));
    bad.arrive(block([{ from: USDC, to: WETH, ok: false }]));
    for (const traffic of [good, bad]) {
      traffic.step(1);
      traffic.step(1.5);
    }

    // each segment writes six vertices, so every sixth is one point of the path;
    // a waveform turns up and down many times, a flight climbs and descends once
    const turns = (traffic: Traffic) => {
      const points = vertices(traffic.build(0, 0, 0, ORIGIN));
      const heights: number[] = [];
      for (let i = 0; i < points.length; i += 6) heights.push(points[i]!.y);

      let changes = 0;
      let last = 0;
      for (let i = 1; i < heights.length; i++) {
        const step = heights[i]! - heights[i - 1]!;
        if (Math.abs(step) < 1e-6) continue;
        const way = Math.sign(step);
        if (last !== 0 && way !== last) changes++;
        last = way;
      }
      return changes;
    };

    expect(turns(good)).toBeLessThan(3);
    expect(turns(bad)).toBeGreaterThan(8);
  });

  it('draws a failed one back in instead of letting it fade where it stopped', () => {
    const bad = new Traffic();
    bad.arrive(block([{ from: USDC, to: WETH, ok: false }]));
    bad.step(1);

    // how far the drawn part reaches, end to end
    const reach = () => {
      const points = vertices(bad.build(0, 0, 0, ORIGIN)).filter((p) => p.a > 0.01);
      let most = 0;
      for (const a of points) {
        for (const b of points) most = Math.max(most, Math.hypot(a.x - b.x, a.z - b.z));
      }
      return most;
    };

    bad.step(1.2); // out as far as it gets
    const stretched = reach();
    expect(stretched).toBeGreaterThan(0);

    bad.step(2.4); // and then back the way it came
    expect(reach()).toBeLessThan(stretched * 0.7);

    bad.step(2);
    expect(bad.flying).toBe(0);
  });

  it('folds distant ends to the horizon and keeps their bearing', () => {
    const traffic = new Traffic();
    traffic.arrive(block([{ from: USDC, to: WETH, ok: true }]));
    traffic.step(1);
    traffic.step(3);

    const points = vertices(traffic.build(0, 0, 0, ORIGIN));
    expect(points.length).toBeGreaterThan(0);
    // both ends lie some 2^80 metres off; nothing may be drawn further than the sky
    for (const point of points) {
      expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(HORIZON * 1.05);
      expect(point.a).toBeGreaterThanOrEqual(0);
      expect(point.a).toBeLessThanOrEqual(1);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('draws a near end where it actually is', () => {
    const traffic = new Traffic();
    // home is the middle of the patch, so this end is a place rather than a bearing
    // (and it moves when the patch does, hence taking it from the land itself)
    traffic.arrive(block([{ from: HOME, to: WETH, ok: true }]));
    traffic.step(1);
    traffic.step(3);

    const points = vertices(traffic.build(0, 0, 0, ORIGIN));
    const nearest = Math.min(...points.map((p) => Math.hypot(p.x, p.z)));
    expect(nearest).toBeLessThan(50);
  });

  it('draws nothing before anything has been let out', () => {
    const traffic = new Traffic();
    traffic.arrive(block([{ from: USDC, to: WETH, ok: true }]));
    expect(traffic.build(0, 0, 0, ORIGIN).count).toBe(0);
  });
});
