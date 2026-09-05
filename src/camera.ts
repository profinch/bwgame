/**
 * A camera over the address space.
 *
 * The world is 4^40 cells across, which no double can hold, so the camera keeps
 * its centre as a pair of bigints and only ever converts *differences* to
 * screen numbers. A difference that overflows a double is already thousands of
 * screens away, where the error is far below a pixel.
 *
 * There are no levels here on purpose. Zoom is continuous; the grid a viewer
 * sees is chosen from how far out they are, not from a step they took.
 */
import { DEPTH, GRID, SIDE, addressToPoint, pointToAddress, type Point } from './coord';

/** Closest you can get: sixteen leaf cells across. */
export const MIN_SPAN = 16;

/** Furthest out: the whole world, filling the frame exactly. */
export const MAX_SPAN = Number(SIDE);

export interface Camera {
  /** Centre of the view, in leaf cells. */
  x: bigint;
  y: bigint;
  /** How many leaf cells fit across the viewport. */
  span: number;
}

export function wholeWorld(): Camera {
  const half = SIDE / 2n;
  return { x: half, y: half, span: MAX_SPAN };
}

/** A double turned into a bigint without going through an integer overflow. */
function toBig(value: number): bigint {
  return BigInt(Math.round(Math.max(-1e30, Math.min(1e30, value))));
}

/** Where a world point lands on screen, in pixels. */
export function toScreen(camera: Camera, point: Point, size: number): { x: number; y: number } {
  const scale = size / camera.span;
  return {
    x: size / 2 + Number(point.x - camera.x) * scale,
    y: size / 2 + Number(point.y - camera.y) * scale,
  };
}

/** Which world point sits under a pixel. */
export function fromScreen(camera: Camera, px: number, py: number, size: number): Point {
  const scale = camera.span / size;
  return {
    x: camera.x + toBig((px - size / 2) * scale),
    y: camera.y + toBig((py - size / 2) * scale),
  };
}

export function clampSpan(span: number): number {
  return Math.max(MIN_SPAN, Math.min(MAX_SPAN, span));
}

/**
 * Keep the view over the world. Zoomed all the way out the world fits exactly,
 * so there is nowhere to go; closer in, the edges stop you rather than letting
 * you drift into a void that does not exist.
 */
export function clampToWorld(camera: Camera): Camera {
  const span = clampSpan(camera.span);
  const half = BigInt(Math.round(span / 2));
  if (half * 2n >= SIDE) return { x: SIDE / 2n, y: SIDE / 2n, span };
  const bound = (value: bigint) => (value < half ? half : value > SIDE - half ? SIDE - half : value);
  return { x: bound(camera.x), y: bound(camera.y), span };
}

/** Zoom by a factor while holding one pixel over the same piece of world. */
export function zoomAt(camera: Camera, px: number, py: number, factor: number, size: number): Camera {
  const anchor = fromScreen(camera, px, py, size);
  const span = clampSpan(camera.span * factor);
  const scale = span / size;
  return clampToWorld({
    x: anchor.x - toBig((px - size / 2) * scale),
    y: anchor.y - toBig((py - size / 2) * scale),
    span,
  });
}

/** Drag the world under the pointer. */
export function pan(camera: Camera, dxPixels: number, dyPixels: number, size: number): Camera {
  const scale = camera.span / size;
  return clampToWorld({
    x: camera.x - toBig(dxPixels * scale),
    y: camera.y - toBig(dyPixels * scale),
    span: camera.span,
  });
}

/** A view that holds all of these points at once, with a little room to spare. */
export function fit(points: readonly Point[], padding = 2.4): Camera {
  if (points.length === 0) return wholeWorld();
  let minX = points[0]!.x;
  let maxX = points[0]!.x;
  let minY = points[0]!.y;
  let maxY = points[0]!.y;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const width = Number(maxX - minX);
  const height = Number(maxY - minY);
  return clampToWorld({
    x: (minX + maxX) / 2n,
    y: (minY + maxY) / 2n,
    span: clampSpan(Math.max(width, height) * padding),
  });
}

/** Put an address in the middle, at a span that shows its neighbourhood. */
export function focus(address: string, span: number): Camera {
  const point = addressToPoint(address);
  return clampToWorld({ x: point.x, y: point.y, span: clampSpan(span) });
}

/** Side of a cell at this depth, in leaf cells. */
export function cellSize(depth: number): bigint {
  return 4n ** BigInt(DEPTH - depth);
}

/**
 * The depth whose cells read as a grid at this zoom — around sixteen across.
 * One level coarser and finer are drawn too, so the subdivision fades in
 * instead of switching.
 */
export function gridDepth(span: number): number {
  const depth = Math.round(Math.log(Number(SIDE) / span) / Math.log(GRID)) + 2;
  return Math.max(1, Math.min(DEPTH, depth));
}

/** The address prefix the centre of the view falls inside. */
export function centrePrefix(camera: Camera, depth: number): string {
  const clamped = Math.max(0, Math.min(DEPTH, depth));
  const x = camera.x < 0n ? 0n : camera.x >= SIDE ? SIDE - 1n : camera.x;
  const y = camera.y < 0n ? 0n : camera.y >= SIDE ? SIDE - 1n : camera.y;
  return pointToAddress({ x, y }).slice(0, clamped);
}

/** How much of the world is on screen, as "1 / n of the world across". */
export function worldFraction(span: number): number {
  return Number(SIDE) / span;
}
