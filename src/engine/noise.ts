/**
 * Deterministic noise, so the same world comes back every time.
 *
 * Value noise with a smooth interpolant, stacked into a few octaves. Not the
 * fastest kind and not the prettiest, but it needs no tables, no dependency and
 * no shader — and terrain is built once, at load.
 */

/** A hash, not a random number: the same input always gives the same output. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smoothstep on both axes, which is what keeps the field free of creases. */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

export function value2(x: number, y: number, seed = 1): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = ease(x - x0);
  const fy = ease(y - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Octaves piled up: broad shapes first, detail on top, each half the weight. */
export function fbm2(x: number, y: number, octaves = 4, seed = 1): number {
  let sum = 0;
  let weight = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += value2(x * frequency, y * frequency, seed + i * 101) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03; // off two on purpose, so octaves do not line up
  }
  return sum / weight;
}

/** The same in three dimensions, for pushing a sphere out of shape. */
export function fbm3(x: number, y: number, z: number, octaves = 4, seed = 1): number {
  let sum = 0;
  let weight = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    const a = value2(x * frequency, y * frequency, seed + i * 71);
    const b = value2(y * frequency + 19.7, z * frequency, seed + i * 131);
    const c = value2(z * frequency + 7.3, x * frequency, seed + i * 197);
    sum += ((a + b + c) / 3) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / weight;
}
