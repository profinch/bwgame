import { describe, expect, it } from 'vitest';
import { INSTANCE_FLOATS } from '../src/engine/renderer';
import { type Structure, piecesOf } from '../src/places';

const noted = (note: string, grown?: number) =>
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
    plot: { owner: '0x', note, implementation: null, salt: null, name: null },
  }) as unknown as Structure;

describe('a note on a building', () => {
  it('is cut into the front wall: the wall pulled in, its face laid back flush but for the strokes', () => {
    const pieces = piecesOf(noted('profinch was here'), 10);
    const count = pieces.length / INSTANCE_FLOATS;
    expect(count).toBeGreaterThan(20);
    const across = 0.5 / 30;
    const cutIn = 1.6 * across;
    // the body is pulled in by the cut; every other piece is a slab of the face, flush with where the wall was
    expect(pieces[5]).toBeCloseTo(5 - cutIn, 5);
    for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) {
      // the dark floors of the grooves sit just off the pulled-in wall; the face slabs are flush
      if (pieces[i + 7]! < 0.1) {
        expect(pieces[i + 2]).toBeCloseTo(2.5 - cutIn + 0.001, 5);
        continue;
      }
      expect(pieces[i + 2]).toBeCloseTo(2.5 - cutIn / 2, 5);
      expect(pieces[i + 5]).toBeCloseTo(cutIn, 5);
    }
    // some of the face is in small pieces about head height: the stone between the strokes
    const small = [];
    for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) if (pieces[i + 3]! < 0.1) small.push(pieces[i + 1]!);
    expect(small.length).toBeGreaterThan(10);
    expect(Math.min(...small)).toBeGreaterThan(10 + 1.2);
    expect(Math.max(...small)).toBeLessThan(10 + 4);
  });
  it('a plain building is one box', () => {
    expect(piecesOf(noted(''), 10).length / INSTANCE_FLOATS).toBe(1);
  });
  it('going up, the wall rises to its height; being written, the words are cut in one at a time', () => {
    const low = piecesOf(noted('profinch was here', 0.1), 10);
    expect(low[4]).toBeCloseTo(9 * 0.1, 5);
    const none = { ...noted('profinch was here'), inked: 0 } as Structure;
    const half = { ...noted('profinch was here'), inked: 0.5 } as Structure;
    const whole = { ...noted('profinch was here'), inked: 1 } as Structure;
    expect(piecesOf(none, 10).length).toBeLessThan(piecesOf(half, 10).length);
    expect(piecesOf(half, 10).length).toBeLessThan(piecesOf(whole, 10).length);
  });
});
