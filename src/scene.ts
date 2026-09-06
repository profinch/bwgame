/**
 * A stretch of country, built from addresses.
 *
 * Nothing is authored: an address is twenty bytes, and twenty bytes are enough
 * to say where a mass stands, how big it is, which way it faces and what it is
 * made of. The ground it sits on comes out of a noise field, so the same seed
 * always makes the same hills.
 */
import { normalizeAddress } from './coord';
import { INSTANCE_FLOATS } from './engine/renderer';
import { groundUnder } from './engine/shapes';
import { LANDMARKS } from './landmarks';

/** Deterministic stream of bytes from an address, cycling if it runs out. */
function bytes(address: string): (index: number) => number {
  const hex = normalizeAddress(address);
  const values = new Uint8Array(20);
  for (let i = 0; i < 20; i++) values[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return (index: number) => values[index % 20]! / 255;
}

/** What a walker has to go round, or climb onto. */
export interface Obstacle {
  x: number;
  z: number;
  halfWide: number;
  halfDeep: number;
  turn: number;
  /** Where its roof is, so anything low enough can be stood on. */
  top: number;
}

export interface Patch {
  /** One buffer per shape, in the same order the shapes are made. */
  masses: Float32Array[];
  obstacles: Obstacle[];
  groundSize: number;
  shapes: number;
}

const SHAPES = 3;

/**
 * Masses scattered over the ground, sunk into it a little so they belong to it
 * rather than rest on top. Placement wanders off the grid by up to most of a
 * pitch, which is what stops the rows from showing.
 */
export function patch(surfaceAt: (x: number, z: number) => number, spread = 340): Patch {
  const rows: number[][] = Array.from({ length: SHAPES }, () => []);
  const obstacles: Obstacle[] = [];
  const marks = LANDMARKS;
  const across = Math.ceil(Math.sqrt(marks.length));
  const pitch = spread / across;

  const place = (shape: number, x: number, z: number, size: number, squat: number, at: (i: number) => number, byte: number) => {
    const turn = at(byte) * Math.PI * 2;
    const albedo = 0.12 + at(byte + 1) * 0.6;
    const roughness = 0.4 + at(byte + 2) * 0.55;
    const wide = size * (0.8 + at(byte + 3) * 0.5);
    const deep = size * (0.8 + at(byte + 4) * 0.5);
    const tall = size * squat;

    // sit it on the lowest ground its footprint covers and then sink it a
    // little: anything else leaves a corner hanging over a slope
    const base = groundUnder(surfaceAt, x, z, Math.max(wide, deep) / 2, turn) - tall * 0.04;
    rows[shape]!.push(x, base, z, wide, tall, deep, turn, albedo, roughness);
    obstacles.push({ x, z, halfWide: wide / 2, halfDeep: deep / 2, turn, top: base + tall });
  };

  marks.forEach((mark, index) => {
    const at = bytes(mark.address);
    const gx = (index % across) - (across - 1) / 2;
    const gz = Math.floor(index / across) - (across - 1) / 2;
    const x = gx * pitch + (at(0) - 0.5) * pitch * 0.8;
    const z = gz * pitch + (at(1) - 0.5) * pitch * 0.8;

    place(index % SHAPES, x, z, 9 + at(2) * 20, 0.7 + at(3) * 0.9, at, 4);

    const around = 3 + Math.floor(at(6) * 5);
    for (let i = 0; i < around; i++) {
      const angle = at(7 + i) * Math.PI * 2;
      const distance = pitch * (0.15 + at(10 + i) * 0.45);
      place(
        (index + i) % SHAPES,
        x + Math.cos(angle) * distance,
        z + Math.sin(angle) * distance,
        2 + at(13 + i) * 7,
        0.55 + at(15 + i) * 0.8,
        at,
        11 + i,
      );
    }
  });

  return {
    masses: rows.map((values) => new Float32Array(values)),
    obstacles,
    // far enough that the edge dissolves into the air rather than ending in a line
    groundSize: spread * 5,
    shapes: SHAPES,
  };
}

export function massCount(patch: Patch): number {
  return patch.masses.reduce((sum, buffer) => sum + buffer.length / INSTANCE_FLOATS, 0);
}
