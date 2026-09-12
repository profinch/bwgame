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
    // the wall is left as it is; the signs, a post's cells in size, stand out
    // of the front face by a finger's breadth, low on the wall
    const across = 0.5 / 30;
    const cutIn = 1.6 * across;
    expect(pieces[5]).toBeCloseTo(5, 5);
    for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) {
      expect(pieces[i + 2]).toBeCloseTo(2.5 + cutIn / 2, 5);
      // the writing ends about head height and reaches up from there
      expect(pieces[i + 1]!).toBeGreaterThanOrEqual(10 + 1.5);
      expect(pieces[i + 1]! + pieces[i + 4]!).toBeLessThan(10 + 4);
      // a stroke is never wider than a sign
      expect(pieces[i + 3]!).toBeLessThanOrEqual(across * 9 + 1e-6);
    }
  });
  it('a plain building is one box', () => {
    expect(piecesOf(noted(''), 10).length / INSTANCE_FLOATS).toBe(1);
  });
  it('going up, the wall shows the signs its height has reached', () => {
    // the writing ends at head height: at a tenth of the height none of it has
    // come up yet, at a third all of it has
    const low = piecesOf(noted('profinch was here', 0.1), 10).length;
    const half = piecesOf(noted('profinch was here', 0.3), 10).length;
    const whole = piecesOf(noted('profinch was here', 1), 10).length;
    expect(low).toBe(INSTANCE_FLOATS);
    expect(half).toBeGreaterThan(low);
    expect(half).toBeLessThan(whole);
    expect(piecesOf(noted('profinch was here', 0.2), 10)[4]).toBeCloseTo(9 * 0.2, 5);
  });
});
