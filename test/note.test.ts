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
const relief = 1.6 * across;
/** The strokes standing out of the front face, dark, and by word (each word is half a metre of wall). */
const front = (pieces: Float32Array) => {
  const strokes: number[][] = [];
  for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) {
    const piece = [...pieces.subarray(i, i + INSTANCE_FLOATS)];
    if (Math.abs(piece[2]! - (2.5 + relief / 2)) < 1e-4 && Math.abs(piece[7]! - 0.08) < 1e-6) strokes.push(piece);
  }
  // a word is a column of strokes half a metre wide; two words one above the
  // other in the same column are told apart by the gap between rows
  const columns = new Map<number, number[]>();
  for (const p of strokes) {
    const col = Math.floor((p[0]! + 2.75) / 0.5);
    columns.set(col, [...(columns.get(col) ?? []), p[1]!]);
  }
  let words = 0;
  for (const ys of columns.values()) {
    ys.sort((a, b) => a - b);
    words++;
    // letters in a word are five to eight cells apart, rows at least ten: the line is drawn at nine
    for (let i = 1; i < ys.length; i++) if (ys[i]! - ys[i - 1]! > 9 * across) words++;
  }
  return { strokes, words };
};

describe('a note on a building', () => {
  it('stands out of the front wall: the wall one whole box, the strokes dark blocks on its face', () => {
    const pieces = piecesOf(noted('profinch was here'), 10);
    expect(pieces.length / INSTANCE_FLOATS).toBeGreaterThan(20);
    // the body is the whole building, nothing pulled in
    expect(pieces[3]).toBeCloseTo(6, 5);
    expect(pieces[5]).toBeCloseTo(5, 5);
    const { strokes, words } = front(pieces);
    // three words, in small dark pieces about head height, and nothing else on the face
    expect(words).toBe(3);
    expect(strokes.length).toBeGreaterThan(10);
    expect(strokes.every((p) => p[3]! < 0.5 && Math.abs(p[5]! - relief) < 1e-6)).toBe(true);
    const ys = strokes.map((p) => p[1]!);
    expect(Math.min(...ys)).toBeGreaterThan(10 + 1.2);
    expect(Math.max(...ys)).toBeLessThan(10 + 4);
    expect(pieces.length / INSTANCE_FLOATS).toBe(1 + strokes.length);
  });
  it('a plain building is one box', () => {
    expect(piecesOf(noted(''), 10).length / INSTANCE_FLOATS).toBe(1);
  });
  it('every note ever written is on the walls, the latest lowest, the rest climbing', () => {
    const one = front(piecesOf(noted('here', undefined, ['here']), 10));
    const two = front(piecesOf(noted('here', undefined, ['first words', 'here']), 10));
    expect(two.words).toBe(3);
    const lowest = (strokes: number[][]) => Math.min(...strokes.map((p) => p[1]!));
    const highest = (strokes: number[][]) => Math.max(...strokes.map((p) => p[1]! + p[4]!));
    expect(lowest(two.strokes)).toBeCloseTo(lowest(one.strokes), 2);
    expect(highest(two.strokes)).toBeGreaterThan(highest(one.strokes));
  });
  it('when the front is full the writing goes round the building, and the oldest is left off at the end', () => {
    const many = Array.from({ length: 40 }, (_, i) => `note number ${i}`);
    const pieces = piecesOf(noted(many[39]!, undefined, many), 10);
    // more than the front alone can hold: strokes on other walls too
    let onFront = 0;
    let elsewhere = 0;
    for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) {
      if (Math.abs(pieces[i + 7]! - 0.08) > 1e-6) continue;
      if (Math.abs(pieces[i + 2]! - (2.5 + relief / 2)) < 1e-4) onFront++;
      else elsewhere++;
    }
    expect(onFront).toBeGreaterThan(0);
    expect(elsewhere).toBeGreaterThan(0);
    // and not all forty found room: the building was not made bigger
    const walls = new Set<string>();
    for (let i = INSTANCE_FLOATS; i < pieces.length; i += INSTANCE_FLOATS) walls.add(`${pieces[i + 2]!.toFixed(3)}:${pieces[i]!.toFixed(3)}`);
    expect(pieces[3]).toBeCloseTo(6, 5);
  });
  it('going up, the wall rises to its height; being written, the words are cut in one at a time', () => {
    const low = piecesOf(noted('profinch was here', 0.1), 10);
    expect(low[4]).toBeCloseTo(9 * 0.1, 5);
    const none = { ...noted('profinch was here'), inked: 0 } as Structure;
    const half = { ...noted('profinch was here'), inked: 0.5 } as Structure;
    const whole = { ...noted('profinch was here'), inked: 1 } as Structure;
    expect(front(piecesOf(none, 10)).words).toBe(0);
    expect(front(piecesOf(half, 10)).words).toBe(2);
    expect(front(piecesOf(whole, 10)).words).toBe(3);
  });
});
