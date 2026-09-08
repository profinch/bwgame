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
import { offsetOf } from './engine/land';

/**
 * What kind of thing stands here.
 *
 * A contract is a thing: it has code, behaviour, bulk, and a building is the
 * right shape for it. A wallet is not a thing but a key — no code, no
 * behaviour, nothing to stand up. So it is not built but written: a plate set
 * into the ground with its own address cut into it.
 *
 * Things are built upward; people are written into the earth.
 *
 * An address nobody has ever touched gets neither, because there is nothing
 * there. Almost all of them are like that.
 */
export type Kind = 'built' | 'written';

export interface Structure {
  kind: Kind;
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

/**
 * Forty hex digits laid out as cells, four bits to a cell.
 *
 * No alphabet had to be invented: the address is already written in sixteen
 * signs, and sixteen is two by two raised or flat. So the marks on a plate are
 * the address itself, in binary, and anybody can walk up and read it off the
 * ground.
 */
const COLUMNS = 8;
const ROWS = 5;

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
  const held = Number(account.balance / 10n ** 15n) / 1000; // in ether, roughly

  if (account.codeSize === 0) {
    // A plate, and it is not turned: this is writing, and writing has a way up.
    // How much it holds sets how big it is, how much it has sent how deeply the
    // marks are cut.
    const weight = Math.log10(1 + held) / 3;
    const worn = Math.min(1, Math.log10(1 + account.nonce) / 4);
    const across = 9 + weight * 26;
    return {
      kind: 'written',
      address: account.address,
      x: at.x,
      z: at.z,
      wide: across,
      deep: (across / COLUMNS) * ROWS,
      tall: 0.2 + worn * 1.1,
      turn: 0,
      albedo: 0.55 - worn * 0.2,
      roughness: 0.75,
    };
  }

  // code size runs from a few hundred bytes to about twenty five thousand
  const bulk = Math.log2(Math.max(64, account.codeSize)) / Math.log2(24576);

  return {
    kind: 'built',
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

/**
 * The pieces a structure is made of, as the renderer wants them.
 *
 * A building is one block. A plate is the slab plus up to a hundred and sixty
 * small raised squares — each of them the same box the buildings are made of,
 * so writing an address into the ground costs nothing but instances.
 */
export function piecesOf(structure: Structure, base: number, origin = { x: 0, z: 0 }): Float32Array {
  const first = instanceOf(structure, base, origin);
  if (structure.kind !== 'written') return first;

  const digits = structure.address.replace(/^0x/, '').toLowerCase();
  const cell = structure.wide / COLUMNS;
  const sub = cell / 2;
  const mark = sub * 0.74;
  const top = base + structure.tall;

  const marks: number[] = [];
  for (let i = 0; i < digits.length && i < COLUMNS * ROWS; i++) {
    const value = parseInt(digits[i]!, 16);
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    for (let bit = 0; bit < 4; bit++) {
      if ((value & (1 << (3 - bit))) === 0) continue;
      const sx = bit % 2;
      const sz = bit < 2 ? 0 : 1;
      marks.push(
        structure.x - origin.x - structure.wide / 2 + col * cell + (sx + 0.5) * sub,
        top,
        structure.z - origin.z - structure.deep / 2 + row * cell + (sz + 0.5) * sub,
        mark,
        structure.tall * 0.85,
        mark,
        0,
        Math.max(0.06, structure.albedo - 0.2),
        structure.roughness,
      );
    }
  }

  const out = new Float32Array(first.length + marks.length);
  out.set(first, 0);
  out.set(marks, first.length);
  return out;
}

/** Whether an account leaves anything on the ground at all. */
export function stands(account: Account): boolean {
  return account.codeSize > 0 || account.balance > 0n || account.nonce > 0;
}


export function instancesOf(
  structures: readonly Structure[],
  baseOf: (s: Structure) => number,
  origin = { x: 0, z: 0 },
): Float32Array {
  const parts = structures.map((structure) => piecesOf(structure, baseOf(structure), origin));
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

