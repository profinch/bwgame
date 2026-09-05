import { describe, expect, it } from 'vitest';
import { SIDE, addressToPoint } from '../src/coord';
import {
  type Camera,
  MAX_SPAN,
  MIN_SPAN,
  clampToWorld,
  fit,
  focus,
  fromScreen,
  gridDepth,
  pan,
  toScreen,
  wholeWorld,
  zoomAt,
} from '../src/camera';

const SIZE = 800;
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const NULL = `0x${'0'.repeat(40)}`;

describe('screen and world', () => {
  it('puts the centre of the camera in the centre of the view', () => {
    const camera = wholeWorld();
    const at = toScreen(camera, { x: camera.x, y: camera.y }, SIZE);
    expect(at.x).toBeCloseTo(SIZE / 2, 6);
    expect(at.y).toBeCloseTo(SIZE / 2, 6);
  });

  it('fits the whole world in the frame exactly, corner to corner', () => {
    const camera = wholeWorld();
    const topLeft = toScreen(camera, { x: 0n, y: 0n }, SIZE);
    const bottomRight = toScreen(camera, { x: SIDE, y: SIDE }, SIZE);
    expect(topLeft.x).toBeCloseTo(0, 6);
    expect(topLeft.y).toBeCloseTo(0, 6);
    expect(bottomRight.x).toBeCloseTo(SIZE, 6);
    expect(bottomRight.y).toBeCloseTo(SIZE, 6);
  });

  it('reads a pixel back as the world under it', () => {
    const camera = focus(USDC, MIN_SPAN * 64);
    for (const [px, py] of [
      [0, 0],
      [SIZE / 2, SIZE / 2],
      [SIZE, SIZE],
      [123, 456],
    ] as const) {
      const point = fromScreen(camera, px, py, SIZE);
      const back = toScreen(camera, point, SIZE);
      // a leaf cell is smaller than a pixel here, so agreement is within one
      expect(Math.abs(back.x - px)).toBeLessThan(1);
      expect(Math.abs(back.y - py)).toBeLessThan(1);
    }
  });
});

describe('staying over the world', () => {
  it('never lets the view leave the plane', () => {
    let camera: Camera = focus(NULL, MIN_SPAN * 1024);
    for (let step = 0; step < 40; step++) camera = pan(camera, 900, 900, SIZE);
    const topLeft = fromScreen(camera, 0, 0, SIZE);
    const bottomRight = fromScreen(camera, SIZE, SIZE, SIZE);
    expect(topLeft.x >= 0n).toBe(true);
    expect(topLeft.y >= 0n).toBe(true);
    expect(bottomRight.x <= SIDE).toBe(true);
    expect(bottomRight.y <= SIDE).toBe(true);
  });

  it('centres the world once it fits, so there is nowhere left to drift', () => {
    const drifted = pan({ x: 10n, y: 10n, span: MAX_SPAN }, 4000, 4000, SIZE);
    expect(drifted.x).toBe(SIDE / 2n);
    expect(drifted.y).toBe(SIDE / 2n);
  });

  it('holds zoom between the closest and the whole world', () => {
    // the world is 4^40 cells across, so it takes some eighty halvings to cross
    let camera = wholeWorld();
    for (let step = 0; step < 120; step++) camera = zoomAt(camera, SIZE / 2, SIZE / 2, 1 / 2, SIZE);
    expect(camera.span).toBe(MIN_SPAN);
    for (let step = 0; step < 200; step++) camera = zoomAt(camera, SIZE / 2, SIZE / 2, 2, SIZE);
    expect(camera.span).toBe(MAX_SPAN);
  });

  it('keeps the pixel you zoomed on over the same piece of world', () => {
    const camera = focus(USDC, MIN_SPAN * 4096);
    const before = fromScreen(camera, 620, 180, SIZE);
    const after = zoomAt(camera, 620, 180, 1 / 4, SIZE);
    const at = toScreen(after, before, SIZE);
    expect(Math.abs(at.x - 620)).toBeLessThan(2);
    expect(Math.abs(at.y - 180)).toBeLessThan(2);
  });
});

describe('fit', () => {
  it('holds every point it was given, with room to spare', () => {
    const points = [USDC, WETH, DAI].map(addressToPoint);
    const camera = fit(points);
    for (const point of points) {
      const at = toScreen(camera, point, SIZE);
      expect(at.x).toBeGreaterThan(0);
      expect(at.y).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(SIZE);
      expect(at.y).toBeLessThan(SIZE);
    }
  });

  it('still holds them when the padding would run off the edge of the world', () => {
    // staying over the world wins over leaving a margin, so a point in the
    // corner lands on the border rather than a little way in from it
    const points = [USDC, WETH, NULL].map(addressToPoint);
    const camera = fit(points);
    for (const point of points) {
      const at = toScreen(camera, point, SIZE);
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(SIZE);
      expect(at.y).toBeLessThanOrEqual(SIZE);
    }
  });

  it('falls back to the whole world when given nothing', () => {
    expect(fit([])).toEqual(wholeWorld());
  });
});

describe('gridDepth', () => {
  it('goes deeper as the view narrows, and never past the leaves', () => {
    let previous = 0;
    for (let depth = 0; depth <= 40; depth++) {
      const here = gridDepth(Number(SIDE) / 4 ** depth);
      expect(here).toBeGreaterThanOrEqual(previous);
      expect(here).toBeLessThanOrEqual(40);
      previous = here;
    }
  });
});

describe('clampToWorld', () => {
  it('leaves a view that is already inside alone', () => {
    const camera = focus(USDC, MIN_SPAN * 64);
    expect(clampToWorld(camera)).toEqual(camera);
  });
});
