/**
 * The walker, digging.
 *
 * While the threads work, the person is not a person: they have gone into the
 * work, and what stands where they stood is an auger — a square post the
 * height of a person whose lower third is drawn to a point and twisted, so its
 * edges run down to the tip as a screw, and which the world turns as long as
 * the digging goes on. Nothing else here spins, so the one thing that does is
 * the one thing being done, and turning, it goes in.
 *
 * Down every long face, just above the point, the word `digging` is cut in the
 * same signs the stones are written in, and cut the same way: the body stops a
 * groove short of each face and the face is laid back on in the pieces of stone
 * the strokes leave, so the word is what is missing. Turning, it reads from
 * every side in turn — and it is where the work is, at the end that goes in.
 */
import { type Geometry, addBox, addScrew } from './engine/shapes';
import { CELLS_ACROSS, carve } from './places';

/** A person's height, and a person's width or thereabouts. */
const TALL = 1.8;
const WIDE = 0.32;
/** Where the screw ends and the body begins. */
export const POINT = 0.5;
/** How many times the screw's edges go round on the way down, in how many slices. */
export const TURNS = 1;
export const SLICES = 24;
/** The collar near the top, so the turning reads from a distance. */
const COLLAR = { from: 1.42, to: 1.56, half: 0.32 };

const WORD = 'digging';

export function auger(): Geometry {
  const parts = { positions: [] as number[], normals: [] as number[], indices: [] as number[] };
  const half = WIDE / 2;

  addScrew(parts, half, POINT, TURNS, SLICES);
  addBox(parts, [-COLLAR.half, COLLAR.from, -COLLAR.half], [COLLAR.half, COLLAR.to, COLLAR.half]);
  // above the collar the post is plain and full width
  addBox(parts, [-half, COLLAR.to, -half], [half, TALL, half]);

  // the writing, once: the same cut is laid on each of the four faces, on the
  // stretch of post between the point and the collar, standing on the point
  const body = COLLAR.from - POINT;
  const { across, down, patches } = carve([WORD], body, WIDE, true);
  const cutIn = Math.max(across * 1.6, 0.003);
  const inner = half - cutIn;
  addBox(parts, [-inner, POINT, -inner], [inner, COLLAR.from, inner]);

  /**
   * Each face has a reader standing in front of it, and the word has to run
   * left to right for that reader — so the along-the-face axis flips with the
   * side. `along` is the reader's rightward direction in the post's own frame.
   */
  const faces: { along: [number, number]; outward: [number, number] }[] = [
    { along: [1, 0], outward: [0, 1] }, // +z face, read from +z
    { along: [-1, 0], outward: [0, -1] }, // -z face, read from -z
    { along: [0, -1], outward: [1, 0] }, // +x face, read from +x
    { along: [0, 1], outward: [-1, 0] }, // -x face, read from -x
  ];

  for (const { along, outward } of faces) {
    for (const { col, row, cols, rows } of patches) {
      const a0 = (col - CELLS_ACROSS / 2) * across;
      const a1 = (col + cols - CELLS_ACROSS / 2) * across;
      const y1 = COLLAR.from - row * down;
      const y0 = COLLAR.from - (row + rows) * down;
      // the piece spans [a0, a1] along the face and [inner, half] outward
      const xs = [a0 * along[0] + inner * outward[0], a1 * along[0] + half * outward[0]];
      const zs = [a0 * along[1] + inner * outward[1], a1 * along[1] + half * outward[1]];
      addBox(
        parts,
        [Math.min(...xs), y0, Math.min(...zs)],
        [Math.max(...xs), y1, Math.max(...zs)],
      );
    }
  }

  return {
    positions: new Float32Array(parts.positions),
    normals: new Float32Array(parts.normals),
    indices: new Uint32Array(parts.indices),
  };
}
