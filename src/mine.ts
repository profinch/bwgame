/**
 * Mining a place.
 *
 * The map is the address space, so a contract's address is its coordinates. And
 * CREATE2 fixes that address before the contract exists: it is the hash of the
 * factory, the salt and the code. With the factory and the code fixed, the salt
 * is the only thing that moves it — so searching salts is searching the map.
 *
 * The price of ground is therefore work, and the price of precision is steep:
 * landing within a tenth of the distance costs a hundred times the attempts.
 * Nobody buys the good spots; they are computed.
 *
 * The first twenty bytes of a salt must be the owner's own address, which the
 * factory checks. That makes a found salt useless to anybody watching the
 * mempool, and it keeps the search to one hash per attempt.
 */
import { DEPTH, HOME } from './engine/land';

export type Keccak = (input: Uint8Array) => Uint8Array;

/** Where an address sits, in metres, on the walkable world's grid. */
export function placeOf(address: Uint8Array): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (let i = 0; i < DEPTH; i++) {
    const byte = address[i >> 1]!;
    const digit = i % 2 === 0 ? byte >> 4 : byte & 15;
    x = x * 4 + (digit >> 2);
    z = z * 4 + (digit & 3);
  }
  return { x, z };
}

function bytesOf(hex: string): Uint8Array {
  const body = hex.replace(/^0x/, '');
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function hexOf(bytes: Uint8Array): string {
  return `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Where home sits on that same grid, so offsets can be worked out from it. */
export const HOME_PLACE = placeOf(bytesOf(HOME));

export interface Ground {
  /** How far from home, in metres. */
  x: number;
  z: number;
}

/** A place, relative to home rather than to the corner of the world. */
export function groundOf(address: Uint8Array): Ground {
  const at = placeOf(address);
  return { x: at.x - HOME_PLACE.x, z: at.z - HOME_PLACE.z };
}

export interface Dig {
  factory: string;
  owner: string;
  /** keccak of the plot's creation code, which the factory will tell you. */
  codeHash: string;
  /** Where you want to stand, in metres from home. */
  target: Ground;
  /** How near is near enough. */
  within: number;
  /** Attempts before handing control back, so a worker can be told to stop. */
  batch?: number;
}

export interface Found {
  salt: string;
  address: string;
  ground: Ground;
  away: number;
  tries: number;
}

/**
 * Grind salts until one lands close enough.
 *
 * The work buffer is laid out once and only its last twelve bytes change, so
 * the loop does nothing but hash: 0xff, the factory, the salt, the code hash.
 */
export function dig(
  keccak: Keccak,
  spec: Dig,
  /** Where to start counting from, so several workers can share the search. */
  from = 0n,
  step = 1n,
): { found: Found | null; tries: number; next: bigint } {
  const factory = bytesOf(spec.factory);
  const owner = bytesOf(spec.owner);
  const codeHash = bytesOf(spec.codeHash);

  const work = new Uint8Array(85);
  work[0] = 0xff;
  work.set(factory, 1);
  work.set(owner, 21); // the salt begins with the owner's address
  work.set(codeHash, 53);

  const tail = new DataView(work.buffer, 41, 12); // the twelve bytes we vary
  const batch = spec.batch ?? 200_000;
  let counter = from;

  for (let i = 0; i < batch; i++) {
    tail.setUint32(4, Number(counter >> 32n) >>> 0);
    tail.setUint32(8, Number(counter & 0xffffffffn) >>> 0);

    const digest = keccak(work);
    const address = digest.subarray(12);
    const ground = groundOf(address);
    const away = Math.hypot(ground.x - spec.target.x, ground.z - spec.target.z);

    if (away <= spec.within) {
      return {
        found: {
          salt: hexOf(work.subarray(21, 53)),
          address: hexOf(address),
          ground,
          away,
          tries: i + 1,
        },
        tries: i + 1,
        next: counter + step,
      };
    }
    counter += step;
  }

  return { found: null, tries: batch, next: counter };
}
