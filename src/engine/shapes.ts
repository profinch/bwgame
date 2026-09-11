/**
 * The shapes the world is made of.
 *
 * Nothing here is modelled. The ground is a height field and the masses on it
 * are spheres pushed out of shape by noise — both come out of a function, so
 * they cost nothing to store and are the same on every machine.
 */
import { heightAt } from './land';
import { fbm3 } from './noise';

export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/**
 * The lowest ground a footprint covers.
 *
 * A block set on the height of its middle hangs over the downhill side, which
 * on a slope is exactly where the eye looks. Sampling the corners and taking
 * the lowest costs five lookups and removes the problem.
 */
export function groundUnder(
  at: (x: number, z: number) => number,
  x: number,
  z: number,
  reach: number,
  turn = 0,
): number {
  const c = Math.cos(turn) * reach;
  const s = Math.sin(turn) * reach;
  return Math.min(
    at(x, z),
    at(x + c - s, z + s + c),
    at(x - c - s, z - s + c),
    at(x + c + s, z + s - c),
    at(x - c + s, z - s - c),
  );
}

export interface Terrain {
  geometry: Geometry;
  /**
   * The height of the ground as it is actually drawn.
   *
   * Not the same as heightAt: the mesh is flat triangles between grid points,
   * and a triangle cuts the corner off a hilltop. Anything set on the true
   * curve therefore floats where the ground is convex. This reads the drawn
   * surface instead, by the same triangle split the mesh uses.
   */
  surfaceAt(x: number, z: number): number;
}

/**
 * A height field, `size` across, `segments` squares to a side.
 *
 * The world is 67,000 km wide and this mesh is a couple of kilometres, so it is
 * not the world — it is the piece of it you are standing on, and it has to be
 * built again when you go somewhere else.
 *
 * Its vertices are laid out around zero and the heights are sampled at
 * `around` plus that. Everything drawn is therefore near the origin, whatever
 * corner of the world it came from — a single-precision float has about a metre
 * and a half of resolution at seventeen million, and a mesh whose steps are five
 * metres tears itself to pieces at that scale. Ask a card to draw far from zero
 * and it does not draw far, it draws wrong.
 */
export function terrain(size: number, segments: number, around = { x: 0, z: 0 }): Terrain {
  const positions = new Float32Array((segments + 1) ** 2 * 3);
  const normals = new Float32Array((segments + 1) ** 2 * 3);
  const indices = new Uint32Array(segments * segments * 6);
  const step = size / segments;
  const half = size / 2;
  const originX = around.x;
  const originZ = around.z;

  // heights first, then slopes read off the grid: asking the hash again for
  // every neighbour costs five times as much and says the same thing
  const field = new Float32Array((segments + 1) ** 2);
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      field[row * (segments + 1) + col] = heightAt(originX - half + col * step, originZ - half + row * step);
    }
  }

  const at = (col: number, row: number) =>
    field[Math.min(segments, Math.max(0, row)) * (segments + 1) + Math.min(segments, Math.max(0, col))]!;

  let p = 0;
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const dx = at(col + 1, row) - at(col - 1, row);
      const dz = at(col, row + 1) - at(col, row - 1);
      const length = Math.hypot(dx, 2 * step, dz);
      positions[p] = -half + col * step;
      positions[p + 1] = at(col, row);
      positions[p + 2] = -half + row * step;
      normals[p] = -dx / length;
      normals[p + 1] = (2 * step) / length;
      normals[p + 2] = -dz / length;
      p += 3;
    }
  }

  let i = 0;
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * (segments + 1) + col;
      const b = a + segments + 1;
      indices[i] = a;
      indices[i + 1] = b;
      indices[i + 2] = b + 1;
      indices[i + 3] = a;
      indices[i + 4] = b + 1;
      indices[i + 5] = a + 1;
      i += 6;
    }
  }

  /** Takes a point in the patch's own coordinates, not the world's. */
  const surfaceAt = (x: number, z: number): number => {
    const col = (x + half) / step;
    const row = (z + half) / step;
    const c0 = Math.max(0, Math.min(segments - 1, Math.floor(col)));
    const r0 = Math.max(0, Math.min(segments - 1, Math.floor(row)));
    const u = Math.max(0, Math.min(1, col - c0));
    const v = Math.max(0, Math.min(1, row - r0));
    const h = (dc: number, dr: number) => field[(r0 + dr) * (segments + 1) + (c0 + dc)]!;
    const h00 = h(0, 0);
    // the same split the triangles use, so the reading is the surface itself
    return u <= v
      ? h00 + (v - u) * (h(0, 1) - h00) + u * (h(1, 1) - h00)
      : h00 + v * (h(1, 1) - h00) + (u - v) * (h(1, 0) - h00);
  };

  return { geometry: { positions, normals, indices }, surfaceAt };
}

/**
 * A plain block, sitting on y = 0.
 *
 * A placeholder, deliberately: what stands on this land should be worked out
 * from what an account is, and until those rules exist a box says nothing,
 * which is more honest than a boulder saying the wrong thing.
 */
export function box(): Geometry {
  const faces: [number[], number[]][] = [
    [[-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, 0.5], [0, 0, 1]],
    [[0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, -0.5, 0.5, 1, -0.5], [0, 0, -1]],
    [[0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, -0.5, 0.5, 1, 0.5], [1, 0, 0]],
    [[-0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0.5, -0.5, 1, -0.5], [-1, 0, 0]],
    [[-0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, -0.5, -0.5, 1, -0.5], [0, 1, 0]],
    [[-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], [0, -1, 0]],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach(([corners, normal], face) => {
    positions.push(...corners);
    for (let i = 0; i < 4; i++) normals.push(...normal);
    const base = face * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

/**
 * A box whose faces are cut into a grid, for a building whose walls move.
 *
 * The plain box has four corners a face; a wall can only lean with those. Cut
 * into `segments` squares a side, a face has enough points for the vertex
 * shader to bend it on a wave, and the edges stay closed because both faces
 * meeting there hold the same points and are bent by the same field.
 */
export function facade(segments = 6): Geometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  // each face: its normal, and the two axes that span it (in the box frame)
  const faces: [number[], number[], number[]][] = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ];
  for (const [normal, along, up] of faces) {
    const first = positions.length / 3;
    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        const a = i / segments - 0.5;
        const b = j / segments - 0.5;
        // the box stands on y = 0 and rises to y = 1; it is centred in x and z
        const x = normal[0]! * 0.5 + along[0]! * a + up[0]! * b;
        const y = (normal[1]! * 0.5 + along[1]! * a + up[1]! * b) + 0.5;
        const z = normal[2]! * 0.5 + along[2]! * a + up[2]! * b;
        positions.push(x, y, z);
        normals.push(...normal);
      }
    }
    const row = segments + 1;
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const o = first + j * row + i;
        indices.push(o, o + 1, o + row + 1, o, o + row + 1, o + row);
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

/** Append one axis-aligned box, given its two corners, to a growing mesh. */
export function addBox(
  into: { positions: number[]; normals: number[]; indices: number[] },
  min: [number, number, number],
  max: [number, number, number],
): void {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces: [number[], number[]][] = [
    [[x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], [0, 0, -1]],
    [[x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], [1, 0, 0]],
    [[x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], [-1, 0, 0]],
    [[x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], [0, 1, 0]],
    [[x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], [0, -1, 0]],
  ];
  for (const [corners, normal] of faces) {
    const base = into.positions.length / 3;
    into.positions.push(...corners);
    for (let i = 0; i < 4; i++) into.normals.push(...normal);
    into.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * The walker: a body and a head, standing on y = 0, facing -z.
 *
 * Deliberately plain. Whoever is walking here is a person, not a thing this
 * world is made of, and the difference should be obvious at a glance.
 */
export function figure(): Geometry {
  const parts = { positions: [] as number[], normals: [] as number[], indices: [] as number[] };
  addBox(parts, [-0.27, 0, -0.17], [0.27, 1.42, 0.17]);
  addBox(parts, [-0.18, 1.46, -0.16], [0.18, 1.8, 0.16]);
  return {
    positions: new Float32Array(parts.positions),
    normals: new Float32Array(parts.normals),
    indices: new Uint32Array(parts.indices),
  };
}

/**
 * A square post drawn to a point and twisted on the way down: a screw.
 *
 * Built in slices. Each slice is a square that is a little smaller and a
 * little more turned than the one above it, and the four walls between two
 * neighbouring squares are quads — so the corners of the post run down to the
 * tip as four helical edges, and when the whole thing turns about its axis it
 * looks like it is going in. `turns` is how many times round the edges go over
 * the height; the top square is square with the axes so a body can sit on it.
 */
export function addScrew(
  into: { positions: number[]; normals: number[]; indices: number[] },
  half: number,
  height: number,
  turns: number,
  slices: number,
): void {
  const square = (y: number): number[][] => {
    const size = (half * y) / height;
    const angle = turns * 2 * Math.PI * (y / height - 1);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
      [-size, size],
      [size, size],
      [size, -size],
      [-size, -size],
    ].map(([x, z]) => [c * x! - s * z!, y, s * x! + c * z!]);
  };
  for (let i = 0; i < slices; i++) {
    const below = square((height * i) / slices);
    const above = square((height * (i + 1)) / slices);
    for (let k = 0; k < 4; k++) {
      const quad = [below[k]!, below[(k + 1) % 4]!, above[(k + 1) % 4]!, above[k]!];
      // Newell's normal, which does not mind that the bottom edge of the
      // lowest slice is a point
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let v = 0; v < 4; v++) {
        const a = quad[v]!;
        const b = quad[(v + 1) % 4]!;
        nx += (a[1]! - b[1]!) * (a[2]! + b[2]!);
        ny += (a[2]! - b[2]!) * (a[0]! + b[0]!);
        nz += (a[0]! - b[0]!) * (a[1]! + b[1]!);
      }
      const length = Math.hypot(nx, ny, nz) || 1;
      const base = into.positions.length / 3;
      for (const corner of quad) into.positions.push(...corner);
      for (let v = 0; v < 4; v++) into.normals.push(nx / length, ny / length, nz / length);
      into.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
}

const GOLDEN = (1 + Math.sqrt(5)) / 2;

/** An icosahedron, the roundest thing you can start from with twenty faces. */
function icosahedron(): { points: number[][]; faces: number[][] } {
  const points = [
    [-1, GOLDEN, 0], [1, GOLDEN, 0], [-1, -GOLDEN, 0], [1, -GOLDEN, 0],
    [0, -1, GOLDEN], [0, 1, GOLDEN], [0, -1, -GOLDEN], [0, 1, -GOLDEN],
    [GOLDEN, 0, -1], [GOLDEN, 0, 1], [-GOLDEN, 0, -1], [-GOLDEN, 0, 1],
  ].map((p) => {
    const length = Math.hypot(p[0]!, p[1]!, p[2]!);
    return [p[0]! / length, p[1]! / length, p[2]! / length];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { points, faces };
}

/**
 * A boulder: a subdivided sphere pushed in and out by noise, resting on y = 0.
 *
 * Normals are averaged across the faces that meet at each vertex, so the light
 * runs over it instead of breaking on every edge — which is the whole
 * difference between a rock and a die. Refused once as scenery, and back for
 * the one thing in this world that is a stone and not a building: the relics
 * of the first ground. `dressedAt` flattens the front (+z) of the stone at that
 * distance from its centre, the way a mason dresses one face of a boulder to
 * cut into it.
 */
export function boulder(subdivisions = 2, seed = 1, roughness = 0.34, dressedAt?: number): Geometry {
  let { points, faces } = icosahedron();
  const middles = new Map<string, number>();

  const middle = (a: number, b: number): number => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const found = middles.get(key);
    if (found !== undefined) return found;
    const p = points[a]!;
    const q = points[b]!;
    const m = [p[0]! + q[0]!, p[1]! + q[1]!, p[2]! + q[2]!];
    const length = Math.hypot(m[0]!, m[1]!, m[2]!);
    points.push([m[0]! / length, m[1]! / length, m[2]! / length]);
    const index = points.length - 1;
    middles.set(key, index);
    return index;
  };

  for (let step = 0; step < subdivisions; step++) {
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = middle(a!, b!);
      const bc = middle(b!, c!);
      const ca = middle(c!, a!);
      next.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
    }
    faces = next;
    middles.clear();
  }

  // push each point along its own direction, then squash and sit it on the floor;
  // and if one face is to be dressed, cut everything past that plane back to it,
  // so the stone has a flat front that can be written on
  const displaced = points.map(([x, y, z]) => {
    const push = 1 + (fbm3(x! * 1.7 + 5, y! * 1.7 + 5, z! * 1.7 + 5, 3, seed) - 0.5) * roughness * 2;
    const front = z! * push;
    return [x! * push, y! * push * 0.78, dressedAt === undefined ? front : Math.min(front, dressedAt)];
  });
  const lowest = Math.min(...displaced.map((p) => p[1]!));

  const positions = new Float32Array(displaced.length * 3);
  const normals = new Float32Array(displaced.length * 3);
  displaced.forEach((p, index) => {
    positions[index * 3] = p[0]!;
    positions[index * 3 + 1] = p[1]! - lowest;
    positions[index * 3 + 2] = p[2]!;
  });

  // area-weighted vertex normals: sum the face normals that touch each point
  for (const [a, b, c] of faces) {
    const pa = displaced[a!]!;
    const pb = displaced[b!]!;
    const pc = displaced[c!]!;
    const ux = pb[0]! - pa[0]!, uy = pb[1]! - pa[1]!, uz = pb[2]! - pa[2]!;
    const vx = pc[0]! - pa[0]!, vy = pc[1]! - pa[1]!, vz = pc[2]! - pa[2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const index of [a!, b!, c!]) {
      normals[index * 3] = (normals[index * 3] ?? 0) + nx;
      normals[index * 3 + 1] = (normals[index * 3 + 1] ?? 0) + ny;
      normals[index * 3 + 2] = (normals[index * 3 + 2] ?? 0) + nz;
    }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index]!, normals[index + 1]!, normals[index + 2]!) || 1;
    normals[index] = normals[index]! / length;
    normals[index + 1] = normals[index + 1]! / length;
    normals[index + 2] = normals[index + 2]! / length;
  }

  const indices = new Uint32Array(faces.length * 3);
  faces.forEach((face, index) => {
    indices[index * 3] = face[0]!;
    indices[index * 3 + 1] = face[1]!;
    indices[index * 3 + 2] = face[2]!;
  });

  return { positions, normals, indices };
}
