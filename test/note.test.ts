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
  it('is cut into the front wall as runes', () => {
    const pieces = piecesOf(noted('profinch was here'), 10);
    const count = pieces.length / INSTANCE_FLOATS;
    expect(count).toBeGreaterThan(20);
    // the cut is 1.6 cells deep, a cell being a thirtieth of the wall: the body
    // is pulled in by it, and every sign stands out to the front face
    const cutIn = 1.6 * (6 / 30);
    expect(pieces[5]).toBeCloseTo(5 - cutIn, 5);
    for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) expect(pieces[i + 2]).toBeCloseTo(2.5 - cutIn / 2, 5);
  });
  it('a plain building is one box', () => {
    expect(piecesOf(noted(''), 10).length / INSTANCE_FLOATS).toBe(1);
  });
  it('going up, the wall shows the signs its height has reached', () => {
    const low = piecesOf(noted('profinch was here', 0.2), 10).length;
    const half = piecesOf(noted('profinch was here', 0.6), 10).length;
    const whole = piecesOf(noted('profinch was here', 1), 10).length;
    expect(low).toBeLessThan(half);
    expect(half).toBeLessThan(whole);
    expect(piecesOf(noted('profinch was here', 0.2), 10)[4]).toBeCloseTo(9 * 0.2, 5);
  });
});
