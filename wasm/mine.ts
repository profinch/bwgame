/**
 * The whole search, inside one WebAssembly module.
 *
 * This is AssemblyScript, not TypeScript: it compiles to `src/mine.wasm`, and
 * the worker calls into it. Nothing crosses the boundary per attempt — the
 * preimage sits in this module's memory, the counter is written into it here,
 * the hash is taken here, the address is read off here and measured against
 * the target here. JavaScript hears back once a batch, with the best so far.
 *
 * Why it has to be this way: a search is nothing but one keccak per attempt,
 * and a keccak is fast. Handing each attempt across to a library — write the
 * input, init, update, digest, read the output back — cost three times what
 * the hash itself did. Measured on the same machine, one thread went from two
 * million attempts a second to seven.
 *
 * Memory layout:
 *     0 ..  85   the CREATE2 preimage: 0xff, factory, salt, code hash
 *    96 .. 116   the address of the best attempt so far
 *   128 .. 328   the keccak state, twenty-five lanes
 *
 * The salt is bytes 21..53 of the preimage. Its first twenty bytes are the
 * owner's address, put there by the caller; its last eight (45..53) are the
 * attempt counter, big-endian.
 *
 * Rebuild with `npm run wasm`.
 */

const PREIMAGE: usize = 0;
const BEST_ADDRESS: usize = 96;
const STATE: usize = 128;

const ROUND_CONSTANTS: StaticArray<u64> = [
  0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000,
  0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
  0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
  0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
  0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
  0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
];

// @ts-ignore: decorator
@inline function lane(i: i32): u64 {
  return load<u64>(STATE + (<usize>i << 3));
}

// @ts-ignore: decorator
@inline function setLane(i: i32, v: u64): void {
  store<u64>(STATE + (<usize>i << 3), v);
}

/** keccak-f[1600] over the state: the twenty-four rounds, lanes held in locals. */
function permute(): void {
  let a00 = lane(0), a01 = lane(1), a02 = lane(2), a03 = lane(3), a04 = lane(4);
  let a05 = lane(5), a06 = lane(6), a07 = lane(7), a08 = lane(8), a09 = lane(9);
  let a10 = lane(10), a11 = lane(11), a12 = lane(12), a13 = lane(13), a14 = lane(14);
  let a15 = lane(15), a16 = lane(16), a17 = lane(17), a18 = lane(18), a19 = lane(19);
  let a20 = lane(20), a21 = lane(21), a22 = lane(22), a23 = lane(23), a24 = lane(24);

  for (let round = 0; round < 24; round++) {
    // theta: every lane takes the parity of two neighbouring columns
    const c0 = a00 ^ a05 ^ a10 ^ a15 ^ a20;
    const c1 = a01 ^ a06 ^ a11 ^ a16 ^ a21;
    const c2 = a02 ^ a07 ^ a12 ^ a17 ^ a22;
    const c3 = a03 ^ a08 ^ a13 ^ a18 ^ a23;
    const c4 = a04 ^ a09 ^ a14 ^ a19 ^ a24;
    const d0 = c4 ^ rotl<u64>(c1, 1);
    const d1 = c0 ^ rotl<u64>(c2, 1);
    const d2 = c1 ^ rotl<u64>(c3, 1);
    const d3 = c2 ^ rotl<u64>(c4, 1);
    const d4 = c3 ^ rotl<u64>(c0, 1);
    a00 ^= d0; a05 ^= d0; a10 ^= d0; a15 ^= d0; a20 ^= d0;
    a01 ^= d1; a06 ^= d1; a11 ^= d1; a16 ^= d1; a21 ^= d1;
    a02 ^= d2; a07 ^= d2; a12 ^= d2; a17 ^= d2; a22 ^= d2;
    a03 ^= d3; a08 ^= d3; a13 ^= d3; a18 ^= d3; a23 ^= d3;
    a04 ^= d4; a09 ^= d4; a14 ^= d4; a19 ^= d4; a24 ^= d4;

    // rho and pi: rotate each lane by its own amount and move it to (y, 2x+3y)
    const b00 = a00;
    const b10 = rotl<u64>(a01, 1);
    const b20 = rotl<u64>(a02, 62);
    const b05 = rotl<u64>(a03, 28);
    const b15 = rotl<u64>(a04, 27);
    const b16 = rotl<u64>(a05, 36);
    const b01 = rotl<u64>(a06, 44);
    const b11 = rotl<u64>(a07, 6);
    const b21 = rotl<u64>(a08, 55);
    const b06 = rotl<u64>(a09, 20);
    const b07 = rotl<u64>(a10, 3);
    const b17 = rotl<u64>(a11, 10);
    const b02 = rotl<u64>(a12, 43);
    const b12 = rotl<u64>(a13, 25);
    const b22 = rotl<u64>(a14, 39);
    const b23 = rotl<u64>(a15, 41);
    const b08 = rotl<u64>(a16, 45);
    const b18 = rotl<u64>(a17, 15);
    const b03 = rotl<u64>(a18, 21);
    const b13 = rotl<u64>(a19, 8);
    const b14 = rotl<u64>(a20, 18);
    const b24 = rotl<u64>(a21, 2);
    const b09 = rotl<u64>(a22, 61);
    const b19 = rotl<u64>(a23, 56);
    const b04 = rotl<u64>(a24, 14);

    // chi: the one non-linear step, along each row
    a00 = b00 ^ (~b01 & b02); a01 = b01 ^ (~b02 & b03); a02 = b02 ^ (~b03 & b04);
    a03 = b03 ^ (~b04 & b00); a04 = b04 ^ (~b00 & b01);
    a05 = b05 ^ (~b06 & b07); a06 = b06 ^ (~b07 & b08); a07 = b07 ^ (~b08 & b09);
    a08 = b08 ^ (~b09 & b05); a09 = b09 ^ (~b05 & b06);
    a10 = b10 ^ (~b11 & b12); a11 = b11 ^ (~b12 & b13); a12 = b12 ^ (~b13 & b14);
    a13 = b13 ^ (~b14 & b10); a14 = b14 ^ (~b10 & b11);
    a15 = b15 ^ (~b16 & b17); a16 = b16 ^ (~b17 & b18); a17 = b17 ^ (~b18 & b19);
    a18 = b18 ^ (~b19 & b15); a19 = b19 ^ (~b15 & b16);
    a20 = b20 ^ (~b21 & b22); a21 = b21 ^ (~b22 & b23); a22 = b22 ^ (~b23 & b24);
    a23 = b23 ^ (~b24 & b20); a24 = b24 ^ (~b20 & b21);

    // iota
    a00 ^= unchecked(ROUND_CONSTANTS[round]);
  }

  setLane(0, a00); setLane(1, a01); setLane(2, a02); setLane(3, a03); setLane(4, a04);
  setLane(5, a05); setLane(6, a06); setLane(7, a07); setLane(8, a08); setLane(9, a09);
  setLane(10, a10); setLane(11, a11); setLane(12, a12); setLane(13, a13); setLane(14, a14);
  setLane(15, a15); setLane(16, a16); setLane(17, a17); setLane(18, a18); setLane(19, a19);
  setLane(20, a20); setLane(21, a21); setLane(22, a22); setLane(23, a23); setLane(24, a24);
}

/**
 * keccak256 of the eighty-five bytes of preimage. The digest is left in the
 * first four lanes of the state; the address is its last twenty bytes.
 *
 * Eighty-five bytes fit in one block of the sponge (the rate is 136), so this
 * is exactly one permutation: ten whole lanes, five bytes of an eleventh, the
 * 0x01 that keccak (as against SHA-3) pads with, and the 0x80 that closes the
 * block.
 */
// @ts-ignore: decorator
@inline function hashPreimage(): void {
  for (let i = 0; i < 10; i++) setLane(i, load<u64>(PREIMAGE + (<usize>i << 3)));
  setLane(10, (load<u64>(PREIMAGE + 80) & 0x000000ffffffffff) | (<u64>0x01 << 40));
  for (let i = 11; i < 16; i++) setLane(i, 0);
  setLane(16, 0x8000000000000000);
  for (let i = 17; i < 25; i++) setLane(i, 0);
  permute();
}

/**
 * Where the hashed address sits on the walkable grid: its first thirteen hex
 * digits, the top two bits of each stepping x and the bottom two stepping z.
 * The same reading as `placeOf` in mine.ts, which is the point — the search
 * measures with the ruler the world is drawn with.
 */
let placeX: i32 = 0;
let placeZ: i32 = 0;

// @ts-ignore: decorator
@inline function placeHashed(): void {
  let x: i32 = 0;
  let z: i32 = 0;
  for (let i = 0; i < 13; i++) {
    const byte = load<u8>(STATE + 12 + (i >> 1));
    const digit: i32 = (i & 1) == 0 ? byte >> 4 : byte & 15;
    x = (x << 2) | (digit >> 2);
    z = (z << 2) | (digit & 3);
  }
  placeX = x;
  placeZ = z;
}

// --- the search ------------------------------------------------------------

let bestSquared: f64 = Infinity;
let bestAt: u64 = 0;

/** Forget what was found. Called once the preimage is in place, before searching. */
export function reset(): void {
  bestSquared = Infinity;
  bestAt = 0;
}

/**
 * Make `count` attempts, counter starting at `from` and stepping by `step`,
 * aiming at the grid cell (targetX, targetZ). Keeps whichever comes closest.
 * Returns the counter the next call should start from.
 */
export function search(from: u64, step: u64, count: i32, targetX: i32, targetZ: i32): u64 {
  let counter = from;
  let best = bestSquared;
  let at = bestAt;

  for (let i = 0; i < count; i++) {
    store<u64>(PREIMAGE + 45, bswap<u64>(counter));
    hashPreimage();
    placeHashed();
    const dx = <f64>(placeX - targetX);
    const dz = <f64>(placeZ - targetZ);
    const squared = dx * dx + dz * dz;
    if (squared < best) {
      best = squared;
      at = counter;
      for (let b: usize = 0; b < 20; b++) {
        store<u8>(BEST_ADDRESS + b, load<u8>(STATE + 12 + b));
      }
    }
    counter += step;
  }

  bestSquared = best;
  bestAt = at;
  return counter;
}

/** Squared distance, in grid cells, of the best attempt. Infinity if none yet. */
export function bestDistance(): f64 {
  return bestSquared;
}

/** The counter the best attempt was made with. */
export function bestCounter(): u64 {
  return bestAt;
}

/** Hash whatever is in the preimage once, for checking this module from outside. */
export function hashOnce(): void {
  hashPreimage();
}
