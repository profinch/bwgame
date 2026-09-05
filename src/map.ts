/**
 * The map: the address space as one continuous plane.
 *
 * Drag to move, wheel to zoom. There are no levels to step through — the grid
 * subdivides as you come closer, and places stay on screen until they genuinely
 * fall off the edge.
 */
import { DEPTH, SIDE, addressToPoint, normalizeAddress } from './coord';
import {
  type Camera,
  cellSize,
  gridDepth,
  toScreen,
  worldFraction,
} from './camera';
import { LANDMARKS, type Landmark } from './landmarks';

const DOT = 2.5;
const LABEL_GAP = 8;

/** Marks closer together than this share one dot and report a count instead. */
const CLUSTER = 15;

/** How near the pointer has to be to pick a place up. */
export const REACH = 14;

/** Cells thinner than this are not worth a line. */
const MIN_CELL_PX = 26;

export interface Placed {
  mark: Landmark;
  x: number;
  y: number;
}

export interface Cluster {
  x: number;
  y: number;
  marks: Landmark[];
}

export interface World {
  marks: Landmark[];
  /** Last address brought onto the map, drawn with a ring around it. */
  pinned?: string;
}

export function createWorld(): World {
  return { marks: [...LANDMARKS] };
}

/**
 * Put an address on the map without going anywhere. Pasting a wallet should
 * show it standing among the rest, not carry you off to an empty square.
 */
export function addMark(world: World, address: string, name?: string): Landmark {
  const hex = normalizeAddress(address);
  const existing = world.marks.find((mark) => normalizeAddress(mark.address) === hex);
  const mark = existing ?? { name: name ?? `0x${hex.slice(0, 4)}…${hex.slice(-4)}`, address: hex };
  if (!existing) world.marks = [...world.marks, mark];
  world.pinned = hex;
  return mark;
}

/** Take an address back off the map. */
export function removeMark(world: World, address: string): void {
  const hex = normalizeAddress(address);
  world.marks = world.marks.filter((mark) => normalizeAddress(mark.address) !== hex);
  if (world.pinned === hex) world.pinned = undefined;
}

/** Everything on screen, in pixels, however far out we are. */
export function place(world: World, camera: Camera, size: number): Placed[] {
  const margin = 120;
  const placed: Placed[] = [];
  for (const mark of world.marks) {
    const at = toScreen(camera, addressToPoint(mark.address), size);
    if (at.x < -margin || at.y < -margin || at.x > size + margin || at.y > size + margin) continue;
    placed.push({ mark, x: at.x, y: at.y });
  }
  return placed;
}

/** Marks grouped by where they land, so a dense corner reads as a count. */
export function cluster(placed: readonly Placed[]): Cluster[] {
  const groups: Cluster[] = [];
  for (const item of placed) {
    const near = groups.find((group) => Math.hypot(group.x - item.x, group.y - item.y) < CLUSTER);
    if (near) near.marks.push(item.mark);
    else groups.push({ x: item.x, y: item.y, marks: [item.mark] });
  }
  return groups;
}

function prepare(canvas: HTMLCanvasElement): { context: CanvasRenderingContext2D; size: number } | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ratio = window.devicePixelRatio || 1;
  const size = Math.floor(canvas.clientWidth);
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size, size);
  return { context, size };
}

function palette(): { ink: string; muted: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    ink: style.getPropertyValue('--fg').trim() || '#0a0a0a',
    muted: style.getPropertyValue('--mut').trim() || '#8a877d',
  };
}

/**
 * Grid lines for one depth, faded by how well that depth fits the zoom. Two
 * depths are drawn at once, so the subdivision appears gradually rather than
 * snapping from one level to the next.
 */
function drawGrid(
  context: CanvasRenderingContext2D,
  camera: Camera,
  size: number,
  depth: number,
  colour: string,
): void {
  if (depth < 1 || depth > DEPTH) return;
  const cell = cellSize(depth);
  const px = (Number(cell) / camera.span) * size;
  if (px < MIN_CELL_PX) return;

  const alpha = Math.min(1, (px - MIN_CELL_PX) / (MIN_CELL_PX * 2));
  const half = BigInt(Math.round(camera.span / 2));
  const first = (camera.x - half) / cell - 1n;
  const last = (camera.x + half) / cell + 1n;
  const firstY = (camera.y - half) / cell - 1n;
  const lastY = (camera.y + half) / cell + 1n;

  context.save();
  context.globalAlpha = alpha * 0.45;
  context.strokeStyle = colour;
  context.lineWidth = 1;
  context.beginPath();
  for (let i = first; i <= last; i++) {
    const at = toScreen(camera, { x: i * cell, y: camera.y }, size);
    const x = Math.round(at.x) + 0.5;
    if (x < 0 || x > size) continue;
    context.moveTo(x, 0);
    context.lineTo(x, size);
  }
  for (let i = firstY; i <= lastY; i++) {
    const at = toScreen(camera, { x: camera.x, y: i * cell }, size);
    const y = Math.round(at.y) + 0.5;
    if (y < 0 || y > size) continue;
    context.moveTo(0, y);
    context.lineTo(size, y);
  }
  context.stroke();
  context.restore();
}

/**
 * A frame around the view that never goes away, drawn like the grid rather than
 * like the world's edge. Zoomed in there is no edge to see, and a map without a
 * border stops reading as a map.
 */
function drawFrame(context: CanvasRenderingContext2D, size: number, colour: string): void {
  context.save();
  context.globalAlpha = 0.45;
  context.strokeStyle = colour;
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, size - 1, size - 1);
  context.restore();
}

/**
 * The edge of the world, so it is clear the plane is not endless.
 *
 * Each side is drawn on its own and pulled half a pixel inside the canvas: at
 * full zoom the world fits the frame exactly, and a stroke sitting on the
 * boundary would fall outside it and never be seen.
 */
function drawBounds(
  context: CanvasRenderingContext2D,
  camera: Camera,
  size: number,
  colour: string,
): void {
  const topLeft = toScreen(camera, { x: 0n, y: 0n }, size);
  const bottomRight = toScreen(camera, { x: SIDE, y: SIDE }, size);
  const inside = (value: number) => Math.min(Math.max(value, 0.5), size - 0.5);
  const near = (value: number) => value >= -1 && value <= size + 1;

  context.save();
  context.strokeStyle = colour;
  context.lineWidth = 1;
  context.beginPath();
  if (near(topLeft.x)) {
    context.moveTo(inside(topLeft.x), 0);
    context.lineTo(inside(topLeft.x), size);
  }
  if (near(bottomRight.x)) {
    context.moveTo(inside(bottomRight.x), 0);
    context.lineTo(inside(bottomRight.x), size);
  }
  if (near(topLeft.y)) {
    context.moveTo(0, inside(topLeft.y));
    context.lineTo(size, inside(topLeft.y));
  }
  if (near(bottomRight.y)) {
    context.moveTo(0, inside(bottomRight.y));
    context.lineTo(size, inside(bottomRight.y));
  }
  context.stroke();
  context.restore();
}

/** The place under the pointer, if the pointer is close enough to mean it. */
export function hit(groups: readonly Cluster[], px: number, py: number): Cluster | null {
  let best: Cluster | null = null;
  let bestDistance = REACH;
  for (const group of groups) {
    const distance = Math.hypot(group.x - px, group.y - py);
    if (distance <= bestDistance) {
      best = group;
      bestDistance = distance;
    }
  }
  return best;
}

export function draw(
  canvas: HTMLCanvasElement,
  world: World,
  camera: Camera,
  hovered?: Cluster | null,
): Cluster[] {
  const ready = prepare(canvas);
  if (!ready) return [];
  const { context, size } = ready;
  const { ink, muted } = palette();

  // the grid belongs to the world, so it stops where the world does
  const topLeft = toScreen(camera, { x: 0n, y: 0n }, size);
  const bottomRight = toScreen(camera, { x: SIDE, y: SIDE }, size);
  context.save();
  context.beginPath();
  context.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  context.clip();
  const depth = gridDepth(camera.span);
  drawGrid(context, camera, size, depth - 1, muted);
  drawGrid(context, camera, size, depth, muted);
  drawGrid(context, camera, size, depth + 1, muted);
  context.restore();
  drawFrame(context, size, muted);
  drawBounds(context, camera, size, ink);

  context.textBaseline = 'middle';
  context.font = '10.5px "Helvetica Neue", Helvetica, Arial, sans-serif';

  const groups = cluster(place(world, camera, size));
  for (const group of groups) {
    const alone = group.marks.length === 1;
    const active =
      group === hovered ||
      (world.pinned !== undefined &&
        group.marks.some((mark) => normalizeAddress(mark.address) === world.pinned));

    context.fillStyle = ink;
    context.strokeStyle = ink;
    context.beginPath();
    context.arc(group.x, group.y, alone ? DOT : DOT + 1, 0, Math.PI * 2);
    context.fill();

    if (active) {
      context.beginPath();
      context.arc(group.x, group.y, DOT + 5, 0, Math.PI * 2);
      context.stroke();
    }

    // names sit back in grey until you reach for one, so a busy view stays calm
    const label = alone ? group.marks[0]!.name : `${group.marks.length} places`;
    context.fillStyle = active ? ink : muted;
    const width = context.measureText(label).width;
    const toTheLeft = group.x + LABEL_GAP + width > size;
    context.textAlign = toTheLeft ? 'right' : 'left';
    context.fillText(
      label,
      group.x + (toTheLeft ? -LABEL_GAP : LABEL_GAP),
      Math.min(Math.max(group.y, 10), size - 10),
    );
  }
  context.textAlign = 'left';
  return groups;
}

/** The whole world in a thumbnail, with the viewport marked on it. */
export function drawOverview(canvas: HTMLCanvasElement, world: World, camera: Camera): void {
  const ready = prepare(canvas);
  if (!ready) return;
  const { context, size } = ready;
  const { ink, muted } = palette();
  const scale = size / Number(SIDE);

  context.strokeStyle = muted;
  context.globalAlpha = 0.5;
  context.strokeRect(0.5, 0.5, size - 1, size - 1);
  context.globalAlpha = 1;

  context.fillStyle = muted;
  for (const mark of world.marks) {
    const point = addressToPoint(mark.address);
    context.fillRect(Number(point.x) * scale - 0.5, Number(point.y) * scale - 0.5, 1.5, 1.5);
  }

  const box = Math.max(camera.span * scale, 3);
  const left = Number(camera.x) * scale - box / 2;
  const top = Number(camera.y) * scale - box / 2;
  context.strokeStyle = ink;
  context.strokeRect(
    Math.min(Math.max(left, 0), size - box) + 0.5,
    Math.min(Math.max(top, 0), size - box) + 0.5,
    box,
    box,
  );
}

export { worldFraction };
