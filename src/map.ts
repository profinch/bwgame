/**
 * Debug map: the address space, one cell at a time.
 *
 * Nothing here is the game — it is the coordinate module made visible, so the
 * rule can be checked by eye before anything is rendered in three dimensions.
 * Click a cell to descend into it, backspace to come back up.
 */
import {
  DEPTH,
  GRID,
  digitToCell,
  isWithin,
  localPosition,
  normalizeAddress,
  normalizePrefix,
} from './coord';
import { LANDMARKS, type Landmark } from './landmarks';

const DOT = 3.5;
const LABEL_GAP = 9;

/**
 * Marks closer together than this share one dot. Whole neighbourhoods collapse
 * to a point at shallow depth — every address starting with zeros lands in the
 * same corner — and overlapping labels would say less than a count does.
 */
const CLUSTER = 14;

export interface MapView {
  canvas: HTMLCanvasElement;
  prefix: string;
  marks: Landmark[];
}

export function createMap(host: HTMLElement): MapView {
  const canvas = document.createElement('canvas');
  canvas.className = 'map';
  host.append(canvas);
  return { canvas, prefix: '', marks: [...LANDMARKS] };
}

/** Everything standing inside the cell the view is showing. */
export function visible(view: MapView): Landmark[] {
  return view.marks.filter((mark) => isWithin(view.prefix, mark.address));
}

export function descend(view: MapView, cellX: number, cellY: number): void {
  if (view.prefix.length >= DEPTH) return;
  const digit = ((cellX << 2) | cellY).toString(16);
  view.prefix += digit;
}

export function ascend(view: MapView): void {
  view.prefix = view.prefix.slice(0, -1);
}

/** Drop into an address, deep enough that its neighbourhood is worth looking at. */
export function goTo(view: MapView, address: string, depth = 4): void {
  const hex = normalizeAddress(address);
  if (!view.marks.some((mark) => normalizeAddress(mark.address) === hex)) {
    view.marks = [...view.marks, { name: `0x${hex.slice(0, 4)}…${hex.slice(-4)}`, address: hex }];
  }
  view.prefix = hex.slice(0, Math.min(depth, DEPTH));
}

export function draw(view: MapView): void {
  const context = view.canvas.getContext('2d');
  if (!context) return;

  const ratio = window.devicePixelRatio || 1;
  const size = Math.floor(view.canvas.clientWidth);
  view.canvas.width = size * ratio;
  view.canvas.height = size * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size, size);

  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue('--fg').trim() || '#0a0a0a';
  const muted = style.getPropertyValue('--mut').trim() || '#8a877d';
  const step = size / GRID;

  // the 4x4 grid this one hex digit chooses from
  context.strokeStyle = muted;
  context.globalAlpha = 0.35;
  context.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    const at = Math.round(i * step) + 0.5;
    context.beginPath();
    context.moveTo(at, 0);
    context.lineTo(at, size);
    context.moveTo(0, at);
    context.lineTo(size, at);
    context.stroke();
  }
  context.globalAlpha = 1;
  context.strokeStyle = ink;
  context.strokeRect(0.5, 0.5, size - 1, size - 1);

  // the digit each cell stands for
  context.fillStyle = muted;
  context.font = '10px "Helvetica Neue", Helvetica, Arial, sans-serif';
  context.textBaseline = 'top';
  for (let digit = 0; digit < 16; digit++) {
    const cell = digitToCell(digit);
    context.fillText(digit.toString(16), cell.x * step + 5, cell.y * step + 4);
  }

  // whatever stands inside this cell
  context.fillStyle = ink;
  context.textBaseline = 'middle';
  context.font = '11px "Helvetica Neue", Helvetica, Arial, sans-serif';
  for (const group of cluster(view, size)) {
    const label = group.marks.length === 1 ? group.marks[0]!.name : `${group.marks.length} places`;
    context.beginPath();
    context.arc(group.x, group.y, group.marks.length === 1 ? DOT : DOT + 1.5, 0, Math.PI * 2);
    context.fill();

    // dots stay exactly where the address puts them; only the label is nudged
    // back into view, or a corner cluster would write itself off the canvas
    const width = context.measureText(label).width;
    const toTheLeft = group.x + LABEL_GAP + width > size;
    context.textAlign = toTheLeft ? 'right' : 'left';
    const labelX = group.x + (toTheLeft ? -LABEL_GAP : LABEL_GAP);
    context.fillText(
      label,
      Math.min(Math.max(labelX, toTheLeft ? width : 0), toTheLeft ? size : size - width),
      Math.min(Math.max(group.y, LABEL_GAP), size - LABEL_GAP),
    );
  }
  context.textAlign = 'left';
}

export interface Cluster {
  x: number;
  y: number;
  marks: Landmark[];
}

/** Marks grouped by where they land on screen, so a dense corner reads as a count. */
export function cluster(view: MapView, size: number): Cluster[] {
  const groups: Cluster[] = [];
  for (const mark of visible(view)) {
    const at = localPosition(mark.address, view.prefix);
    const x = at.x * size;
    const y = at.y * size;
    const near = groups.find((group) => Math.hypot(group.x - x, group.y - y) < CLUSTER);
    if (near) near.marks.push(mark);
    else groups.push({ x, y, marks: [mark] });
  }
  return groups;
}

/** Which cell of the shown grid a click landed in. */
export function cellAt(view: MapView, offsetX: number, offsetY: number): { x: number; y: number } {
  const size = view.canvas.clientWidth;
  const clamp = (value: number) => Math.max(0, Math.min(GRID - 1, Math.floor((value / size) * GRID)));
  return { x: clamp(offsetX), y: clamp(offsetY) };
}

/** `0xa0b8` with the digits still ahead greyed out, for the header. */
export function prefixLabel(prefix: string): { shown: string; rest: string } {
  const hex = normalizePrefix(prefix);
  return { shown: `0x${hex}`, rest: '·'.repeat(DEPTH - hex.length) };
}
