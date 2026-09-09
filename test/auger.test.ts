import { describe, expect, it } from 'vitest';
import { POINT, SLICES, auger } from '../src/auger';
import { CELLS_ACROSS, GRID, carve, signCut } from '../src/places';

describe('the auger', () => {
  const shape = auger();
  const triangles = shape.indices.length / 3;

  it('comes to a point at the foot and stands a person tall', () => {
    let lowest = Infinity;
    let highest = -Infinity;
    let atTheFoot = 0;
    for (let i = 0; i < shape.positions.length; i += 3) {
      const y = shape.positions[i + 1]!;
      lowest = Math.min(lowest, y);
      highest = Math.max(highest, y);
      if (y === 0) atTheFoot++;
    }
    expect(lowest).toBe(0);
    expect(highest).toBeCloseTo(1.8, 6);
    // whatever touches the ground is the tip itself, on the axis
    expect(atTheFoot).toBeGreaterThan(0);
    for (let i = 0; i < shape.positions.length; i += 3) {
      if (shape.positions[i + 1] === 0) {
        expect(Math.abs(shape.positions[i]!)).toBeLessThan(1e-9);
        expect(Math.abs(shape.positions[i + 2]!)).toBeLessThan(1e-9);
      }
    }
  });

  it('is a screw at the foot: the corners turn on the way down', () => {
    // the corner of the lowest slices lies off the axes the top square sits on
    let turned = 0;
    for (let i = 0; i < shape.positions.length; i += 3) {
      const y = shape.positions[i + 1]!;
      if (y > 0.05 && y < POINT * 0.5) {
        const x = Math.abs(shape.positions[i]!);
        const z = Math.abs(shape.positions[i + 2]!);
        if (Math.abs(x - z) > 0.01) turned++;
      }
    }
    expect(turned).toBeGreaterThan(0);
  });

  it('carries the same word on all four faces, cut the same way as a post', () => {
    const { patches } = carve(['digging'], 1.42 - POINT, 0.32, true);
    // eight triangles a slice of screw; twelve each of collar, top and body;
    // twelve a patch, four faces of patches
    expect(triangles).toBe(SLICES * 8 + 12 * 3 + 12 * patches.length * 4);
    // and the cut is real writing: seven signs' worth of stone is missing
    const cells = CELLS_ACROSS * Math.max(1, ...patches.map((p) => p.row + p.rows));
    const standing = patches.reduce((sum, p) => sum + p.cols * p.rows, 0);
    const oneSign = signCut('g', GRID).reduce((sum, cell) => sum + cell, 0);
    expect(cells - standing).toBeGreaterThan(oneSign * 6);
  });

  it('has the word at the point end, not under the collar', () => {
    const { patches, high } = carve(['digging'], 1.42 - POINT, 0.32, true);
    // a row is plain if the pieces of stone cover it wholly
    const covered = new Array<number>(high).fill(0);
    for (const p of patches) for (let r = p.row; r < p.row + p.rows; r++) covered[r] = covered[r]! + p.cols;
    const plain = covered.map((cols) => cols === CELLS_ACROSS);
    const firstCut = plain.indexOf(false);
    const lastCut = plain.lastIndexOf(false);
    // more plain stone above the word than below it, and below it only the edge
    expect(firstCut).toBeGreaterThan(4);
    expect(high - 1 - lastCut).toBe(4);
  });

  it('is written to be read from the outside on every face', () => {
    // no piece of any face reaches inside the body's core
    const core = 0.32 / 2 - 0.02;
    // (the collar is wider than the body and does not count)
    let onFaces = 0;
    for (let i = 0; i < shape.positions.length; i += 3) {
      const x = Math.abs(shape.positions[i]!);
      const z = Math.abs(shape.positions[i + 2]!);
      if (Math.max(x, z) > core) onFaces++;
    }
    expect(onFaces).toBeGreaterThan(0);
  });
});
