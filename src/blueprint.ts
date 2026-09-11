/**
 * A plot nobody has written into is not a building. It is the ghost of one.
 *
 * So it is not built out of stone: it is drawn, in the same ink the traffic is
 * drawn in — no light on it, dark against the sky and the ground alike. Its
 * edges are dashed, the way a drawing marks what is to be built and is not
 * there yet, and its faces are panes of smoked glass, dark enough to see that
 * a volume stands there and thin enough to see the ground through it. Where
 * two panes lie one behind the other the glass is darker, which is what gives
 * it depth without a single lit surface. The address has fixed all of it —
 * where, how large, which way round — and the walls are what the owner has not
 * said yet. When they write into the plot, the ghost becomes the building.
 *
 * It is drawn the way a drawing is made: the pen goes round the plan, up each
 * corner, round the roof, dash by dash; then the glass comes up in the frame it
 * has drawn. A plot just claimed is seen appearing this way from wherever the
 * digging was done. `grown` is how far along that is.
 */
import type { Structure } from './places';

type Point = [number, number, number];

export interface Stroke {
  from: Point;
  to: Point;
  /** How dark. */
  ink: number;
}

/** The narrowest a line is drawn, in metres; and how much wider with distance, so it stays a line. */
const PEN = 0.08;
const PEN_FAR = 0.0028;
/** How dark the ink is: the dashed outline, and each pane of glass. */
const INK = 0.85;
const GLASS = 0.16;
/** A dash and the gap after it, in metres. */
const DASH = 1.1;
const GAP = 0.7;
/** The dot of the pen itself, while it is drawing. */
const NIB = 0.22;
/** What share of the drawing is the outline; the glass comes up in the rest. */
const OUTLINED_AT = 0.75;

/**
 * The corners of the drawing: the plan just above the ground, and the roof.
 *
 * On a slope the building is drawn as it will be built — from the lowest
 * ground under it, the foundation included (`sink`), to its roof — or its
 * downhill side would hang in the air.
 */
function cornersOf(structure: Structure, base: number, origin = { x: 0, z: 0 }): { plan: Point[]; top: Point[] } {
  const cx = structure.x - origin.x;
  const cz = structure.z - origin.z;
  const c = Math.cos(structure.turn);
  const s = Math.sin(structure.turn);
  // the same turn the shader gives a box, so the drawing and the building agree
  const corner = (lx: number, lz: number, y: number): Point => [cx + c * lx + s * lz, y, cz + c * lz - s * lx];
  const hw = structure.wide / 2;
  const hd = structure.deep / 2;
  const ring = (y: number): Point[] => [corner(-hw, -hd, y), corner(hw, -hd, y), corner(hw, hd, y), corner(-hw, hd, y)];
  return { plan: ring(base - (structure.sink ?? 0) + 0.04), top: ring(base + structure.tall) };
}

/**
 * The strokes of the outline, in the order the pen takes them, in the patch's
 * metres, cut into dashes: the plan first, then each corner up in turn, then
 * the roof round.
 */
export function strokesOf(structure: Structure, base: number, origin = { x: 0, z: 0 }): Stroke[] {
  const { plan, top } = cornersOf(structure, base, origin);
  const strokes: Stroke[] = [];
  const dashed = (from: Point, to: Point) => {
    const run = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    for (let at = 0; at < run; at += DASH + GAP) {
      const t0 = at / run;
      const t1 = Math.min(1, (at + DASH) / run);
      strokes.push({
        from: [from[0] + (to[0] - from[0]) * t0, from[1] + (to[1] - from[1]) * t0, from[2] + (to[2] - from[2]) * t0],
        to: [from[0] + (to[0] - from[0]) * t1, from[1] + (to[1] - from[1]) * t1, from[2] + (to[2] - from[2]) * t1],
        ink: INK,
      });
    }
  };
  for (let i = 0; i < 4; i++) dashed(plan[i]!, plan[(i + 1) % 4]!);
  for (let i = 0; i < 4; i++) dashed(plan[i]!, top[i]!);
  for (let i = 0; i < 4; i++) dashed(top[i]!, top[(i + 1) % 4]!);
  return strokes;
}

/**
 * The glass: four walls and the roof as panes, appended to `out` as ink with
 * `GLASS` alpha, coming up from nothing over the last part of the drawing.
 */
export function glassOf(structure: Structure, base: number, origin: { x: number; z: number }, grown: number, out: number[]): void {
  const risen = Math.max(0, Math.min(1, (grown - OUTLINED_AT) / (1 - OUTLINED_AT)));
  if (risen <= 0) return;
  const alpha = GLASS * risen;
  const { plan, top } = cornersOf(structure, base, origin);
  const pane = (a: Point, b: Point, c: Point, d: Point) =>
    out.push(...a, alpha, ...b, alpha, ...c, alpha, ...a, alpha, ...c, alpha, ...d, alpha);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    pane(plan[i]!, plan[j]!, top[j]!, top[i]!);
  }
  pane(top[0]!, top[1]!, top[2]!, top[3]!);
}

/** How far through the drawing the outline is done and the glass begins. */
export const OUTLINED = OUTLINED_AT;

function length(stroke: Stroke): number {
  return Math.hypot(stroke.to[0] - stroke.from[0], stroke.to[1] - stroke.from[1], stroke.to[2] - stroke.from[2]);
}

/**
 * The outline so far, as ink: position and alpha, four floats a vertex, six
 * vertices a dash, appended to `out`. `grown` is how far the whole drawing has
 * got, of which the outline is the first `OUTLINED` share; while the pen is
 * still going it is drawn as a dot at the point it has reached. Every line is
 * turned to face the eye, which is what makes a strip read as a line from
 * anywhere.
 */
export function inkOf(strokes: readonly Stroke[], grown: number, eye: Point, out: number[]): Point | null {
  const total = strokes.reduce((sum, stroke) => sum + length(stroke), 0);
  // the outline is the first part of the drawing; the glass takes the rest
  const drawn = Math.max(0, Math.min(1, grown / OUTLINED_AT));
  let budget = drawn * total;
  let pen: Point | null = null;

  for (const stroke of strokes) {
    if (budget <= 0) break;
    const run = length(stroke);
    if (run === 0) continue;
    const share = Math.min(1, budget / run);
    budget -= run;
    const end: Point =
      share >= 1
        ? stroke.to
        : [
            stroke.from[0] + (stroke.to[0] - stroke.from[0]) * share,
            stroke.from[1] + (stroke.to[1] - stroke.from[1]) * share,
            stroke.from[2] + (stroke.to[2] - stroke.from[2]) * share,
          ];
    strip(stroke.from, end, eye, stroke.ink, out);
    if (share < 1) pen = end;
  }
  if (drawn < 1) {
    pen = pen ?? (strokes.length ? strokes[strokes.length - 1]!.to : null);
    if (pen) dot(pen, eye, out);
  }
  return drawn < 1 ? pen : null;
}

/** A line from a to b as a thin strip facing the eye. */
function strip(a: Point, b: Point, eye: Point, ink: number, out: number[]): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const mx = (a[0] + b[0]) / 2 - eye[0];
  const my = (a[1] + b[1]) / 2 - eye[1];
  const mz = (a[2] + b[2]) / 2 - eye[2];
  const away = Math.hypot(mx, my, mz) || 1;
  // across the line and across the view: the strip's width, edge-on to nobody
  let ax = dy * mz - dz * my;
  let ay = dz * mx - dx * mz;
  let az = dx * my - dy * mx;
  let across = Math.hypot(ax, ay, az);
  if (across < 1e-6) {
    // looking straight along the line: any perpendicular will do
    ax = -dz;
    ay = 0;
    az = dx;
    across = Math.hypot(ax, ay, az) || 1;
    if (across < 1e-6) {
      ax = 1;
      az = 0;
      across = 1;
    }
  }
  const half = Math.max(PEN, away * PEN_FAR) / 2;
  ax = (ax / across) * half;
  ay = (ay / across) * half;
  az = (az / across) * half;
  out.push(
    a[0] - ax, a[1] - ay, a[2] - az, ink,
    a[0] + ax, a[1] + ay, a[2] + az, ink,
    b[0] + ax, b[1] + ay, b[2] + az, ink,
    a[0] - ax, a[1] - ay, a[2] - az, ink,
    b[0] + ax, b[1] + ay, b[2] + az, ink,
    b[0] - ax, b[1] - ay, b[2] - az, ink,
  );
}

/** The pen: a small square facing the eye. */
function dot(at: Point, eye: Point, out: number[]): void {
  const vx = at[0] - eye[0];
  const vy = at[1] - eye[1];
  const vz = at[2] - eye[2];
  const away = Math.hypot(vx, vy, vz) || 1;
  // right lies flat, across the view; up is across right and the view
  const r = Math.hypot(vz, vx) || 1;
  const rx = -vz / r;
  const rz = vx / r;
  let ux = -rz * vy;
  let uy = rz * vx - rx * vz;
  let uz = rx * vy;
  const u = Math.hypot(ux, uy, uz) || 1;
  const half = Math.max(NIB, away * PEN_FAR * 3) / 2;
  ux = (ux / u) * half;
  uy = (uy / u) * half;
  uz = (uz / u) * half;
  const Rx = rx * half;
  const Rz = rz * half;
  const p = (sx: number, sy: number): Point => [at[0] + sx * Rx + sy * ux, at[1] + sy * uy, at[2] + sx * Rz + sy * uz];
  const q = [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
  out.push(...q[0]!, 1, ...q[1]!, 1, ...q[2]!, 1, ...q[0]!, 1, ...q[2]!, 1, ...q[3]!, 1);
}
