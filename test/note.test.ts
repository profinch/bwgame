import { describe, expect, it } from 'vitest';
import { INSTANCE_FLOATS } from '../src/engine/renderer';
import { type Structure, piecesOf } from '../src/places';

const noted = (note: string, grown?: number, notes?: string[]) =>
  ({
    kind: 'built',
    address: '0x3095c27de366b76074b604d83c7440d22fa33aad',
    x: 0,
    z: 0,
    wide: 6,
    tall: 9,
    deep: 5,
    turn: 0,
    albedo: 0.5,
    roughness: 0.6,
    grown,
    plot: { owner: '0x', note, notes, implementation: null, salt: null, name: null },
  }) as unknown as Structure;

const across = 0.5 / 30;
const cutIn = 1.6 * across;
/** The pieces on the front face: flush slabs, and the dark floors just behind them. */
const front = (pieces: Float32Array) => {
  const slabs: number[][] = [];
  const floors: number[][] = [];
  for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) {
    const piece = [...pieces.subarray(i, i + INSTANCE_FLOATS)];
    if (Math.abs(piece[2]! - (2.5 - cutIn / 2)) < 1e-4) slabs.push(piece);
    else if (Math.abs(piece[2]! - (2.5 - cutIn)) < 1e-4) floors.push(piece);
  }
  return { slabs, floors };
};

describe('a note on a building', () => {
  it('is cut into the front wall: the wall pulled in, its face laid back flush but for the strokes', () => {
    const pieces = piecesOf(noted('profinch was here'), 10);
    expect(pieces.length / INSTANCE_FLOATS).toBeGreaterThan(20);
    // the body is pulled in by the cut on every side
    expect(pieces[3]).toBeCloseTo(6 - cutIn, 5);
    expect(pieces[5]).toBeCloseTo(5 - cutIn, 5);
    const { slabs, floors } = front(pieces);
    // three words, three dark floors; and the stone between the strokes in small pieces about head height
    expect(floors.length).toBe(3);
    const small = slabs.filter((p) => p[3]! < 0.1).map((p) => p[1]!);
    expect(small.length).toBeGreaterThan(10);
    expect(Math.min(...small)).toBeGreaterThan(10 + 1.2);
    expect(Math.max(...small)).toBeLessThan(10 + 4);
  });
  it('a plain building is one box', () => {
    expect(piecesOf(noted(''), 10).length / INSTANCE_FLOATS).toBe(1);
  });
  it('every note ever written is on the walls, the latest lowest, the rest climbing', () => {
    const one = front(piecesOf(noted('here', undefined, ['here']), 10));
    const two = front(piecesOf(noted('here', undefined, ['first words', 'here']), 10));
    expect(two.floors.length).toBe(3);
    const lowest = (floors: number[][]) => Math.min(...floors.map((p) => p[1]!));
    const highest = (floors: number[][]) => Math.max(...floors.map((p) => p[1]! + p[4]!));
    expect(lowest(two.floors)).toBeCloseTo(lowest(one.floors), 5);
    expect(highest(two.floors)).toBeGreaterThan(highest(one.floors));
  });
  it('when the front is full the writing goes round the building, and the oldest is left off at the end', () => {
    const many = Array.from({ length: 40 }, (_, i) => `note number ${i}`);
    const pieces = piecesOf(noted(many[39]!, undefined, many), 10);
    // more than the front alone can hold: floors on other walls too
    let onFront = 0;
    let elsewhere = 0;
    for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) {
      if (Math.abs(pieces[i + 7]! - 0.08) > 1e-6) continue;
      if (Math.abs(pieces[i + 2]! - (2.5 - cutIn)) < 1e-4) onFront++;
      else elsewhere++;
    }
    expect(onFront).toBeGreaterThan(0);
    expect(elsewhere).toBeGreaterThan(0);
    // and not all forty found room: the building was not made bigger
    expect(onFront + elsewhere).toBeLessThan(40 * 3);
  });
  it('going up, the wall rises to its height; being written, the words are cut in one at a time', () => {
    const low = piecesOf(noted('profinch was here', 0.1), 10);
    expect(low[4]).toBeCloseTo(9 * 0.1, 5);
    const none = { ...noted('profinch was here'), inked: 0 } as Structure;
    const half = { ...noted('profinch was here'), inked: 0.5 } as Structure;
    const whole = { ...noted('profinch was here'), inked: 1 } as Structure;
    expect(front(piecesOf(none, 10)).floors.length).toBe(0);
    expect(front(piecesOf(half, 10)).floors.length).toBe(2);
    expect(front(piecesOf(whole, 10)).floors.length).toBe(3);
  });
});
