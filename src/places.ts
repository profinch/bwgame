/**
 * What stands in the world.
 *
 * Nothing here is invented any more. A structure is an account, and its size
 * and colour come from what that account actually is: how much code it carries,
 * what that code hashes to, how much it holds. An address with nothing at it
 * has nothing standing on it, which is the case for very nearly all of them.
 *
 * The world is therefore mostly empty, and that is not a gap to be filled with
 * scenery — it is what the address space is like. What fills it is people:
 * ground somebody mined a place for and put a contract on.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import type { Account } from './chain';
import { INSTANCE_FLOATS } from './engine/renderer';
import { offsetOf } from './engine/land';

export interface Structure {
  address: string;
  /** Where it stands, in metres from home. */
  x: number;
  z: number;
  wide: number;
  deep: number;
  tall: number;
  turn: number;
  albedo: number;
  roughness: number;
}

const encoder = new TextEncoder();

/** Bytes of the code hash, or of the address for something with no code. */
function seedOf(account: Account): Uint8Array {
  const text = account.codeSize > 0 ? account.code : account.address.toLowerCase();
  return keccak_256(encoder.encode(text));
}

/**
 * An account, as a thing standing on the ground.
 *
 * Code makes it big: a contract carrying twelve kilobytes is a large building
 * and one carrying two hundred bytes is a hut. The shape and the turn come from
 * the hash of that code, so two contracts deployed from the same factory are
 * identical — which they are. What it holds darkens it.
 */
export function structureOf(account: Account): Structure {
  const at = offsetOf(account.address);
  const seed = seedOf(account);
  const byte = (i: number) => seed[i % 32]! / 255;

  // code size runs from a few hundred bytes to about twenty five thousand
  const bulk = Math.log2(Math.max(64, account.codeSize)) / Math.log2(24576);
  const held = Number(account.balance / 10n ** 15n) / 1000; // in ether, roughly

  return {
    address: account.address,
    x: at.x,
    z: at.z,
    wide: 6 + bulk * 26 * (0.7 + byte(0) * 0.6),
    deep: 6 + bulk * 26 * (0.7 + byte(1) * 0.6),
    tall: 8 + bulk * 90 * (0.6 + byte(2) * 0.8),
    turn: byte(3) * Math.PI * 2,
    // what it holds makes it heavier to look at, on a scale where a hundred
    // ether is already dark; nothing at all leaves it pale
    albedo: 0.72 - Math.min(0.55, Math.log10(1 + held) / 4),
    roughness: 0.35 + byte(4) * 0.5,
  };
}

/**
 * One structure as the renderer wants it, in the patch's own coordinates.
 *
 * Never in the world's: a float loses whole metres out at seventeen million,
 * and anything drawn there comes out torn.
 */
export function instanceOf(structure: Structure, base: number, origin = { x: 0, z: 0 }): Float32Array {
  return new Float32Array([
    structure.x - origin.x,
    base,
    structure.z - origin.z,
    structure.wide,
    structure.tall,
    structure.deep,
    structure.turn,
    structure.albedo,
    structure.roughness,
  ]);
}

export function instancesOf(
  structures: readonly Structure[],
  baseOf: (s: Structure) => number,
  origin = { x: 0, z: 0 },
): Float32Array {
  const out = new Float32Array(structures.length * INSTANCE_FLOATS);
  structures.forEach((structure, index) => {
    out.set(instanceOf(structure, baseOf(structure), origin), index * INSTANCE_FLOATS);
  });
  return out;
}
