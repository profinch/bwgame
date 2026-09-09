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
 * So there is no threshold to reach and nothing to wait for. Every attempt is
 * either better than the best so far or it is not, and whatever the best is
 * when you stop is what you may claim: an hour buys a plot in sight of where
 * you stood, a night buys one you can walk to in a minute. Work is not spent
 * to unlock a place — it *is* the distance.
 *
 * The first twenty bytes of a salt must be the owner's own address, which the
 * factory checks. That makes a found salt useless to anybody watching the
 * mempool, and it keeps the search to one hash per attempt.
 *
 * The attempts themselves are made in WebAssembly (`wasm/mine.ts`, compiled to
 * `mine.wasm`): the preimage, the hash, the reading of the address and the
 * measuring against the target all happen inside it, and this file only lays
 * the preimage out, starts it, and reads the best back once a batch.
 */
import { DEPTH } from './engine/land';

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

export function bytesOf(hex: string): Uint8Array {
  const body = hex.replace(/^0x/, '');
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function hexOf(bytes: Uint8Array): string {
  return `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export interface Ground {
  /** How far from home, in metres. */
  x: number;
  z: number;
}

/** A place, relative to home rather than to the corner of the world. */
export function groundOf(address: Uint8Array, home: { x: number; z: number }): Ground {
  const at = placeOf(address);
  return { x: at.x - home.x, z: at.z - home.z };
}

export interface Dig {
  factory: string;
  owner: string;
  /**
   * The address the world is built around, which `target` is measured from.
   *
   * Passed in rather than read here on purpose. This runs in a worker, and a
   * worker's `location` is its own script's, not the page's — so anything that
   * reads `?chain=` or `?home=` off the URL answers for the wrong world there,
   * and the search aims at a point that may not even be inside this one. The
   * page knows where home is; it says so.
   */
  home: string;
  /** keccak of the plot's creation code, which the factory will tell you. */
  codeHash: string;
  /** Where you want to stand, in metres from home. */
  target: Ground;
  /** Near enough to stop early. Left off, it digs until it is told to stop. */
  within?: number;
  /** Attempts before handing control back, so a worker can be told to stop. */
  batch?: number;
}

export interface Found {
  salt: string;
  address: string;
  ground: Ground;
  away: number;
}

/** What one batch of attempts came to. */
export interface Round {
  /** The closest so far, over every batch since the search began. */
  best: Found | null;
  /** Whether that is within what the caller asked for. */
  close: boolean;
  /** Attempts this batch made. */
  tries: number;
  /** Where the next batch should start counting. */
  next: bigint;
}

/** What `mine.wasm` exports. */
export interface MineExports {
  memory: WebAssembly.Memory;
  reset(): void;
  search(from: bigint, step: bigint, count: number, targetX: number, targetZ: number): bigint;
  bestDistance(): number;
  bestCounter(): bigint;
  hashOnce(): void;
}

/** Where things sit in the module's memory. Mirrors the layout in wasm/mine.ts. */
export const PREIMAGE = 0;
export const BEST_ADDRESS = 96;
export const STATE = 128;
/** The salt's counter: the last eight of its thirty-two bytes. */
const COUNTER = 45;
const SALT = 21;
const SALT_END = 53;

/**
 * Lay out the preimage once, and hand back a way of grinding it.
 *
 * The buffer is 0xff, the factory, the salt, the code hash. Only the salt's
 * last eight bytes ever change, and the module changes them itself.
 */
export function miner(exports: MineExports, spec: Dig): { run(from: bigint, step: bigint): Round } {
  const memory = new Uint8Array(exports.memory.buffer);
  memory.fill(0, PREIMAGE, PREIMAGE + 85);
  memory[PREIMAGE] = 0xff;
  memory.set(bytesOf(spec.factory), PREIMAGE + 1);
  memory.set(bytesOf(spec.owner), SALT); // the salt begins with the owner's address
  memory.set(bytesOf(spec.codeHash), SALT_END);
  exports.reset();

  // the target in the module's terms: whole cells from the corner of the world
  const home = placeOf(bytesOf(spec.home));
  const targetX = Math.round(home.x + spec.target.x);
  const targetZ = Math.round(home.z + spec.target.z);
  const batch = spec.batch ?? 500_000;

  return {
    run(from, step) {
      const next = exports.search(from, step, batch, targetX, targetZ);
      const squared = exports.bestDistance();
      if (!Number.isFinite(squared)) return { best: null, close: false, tries: batch, next };

      // the module keeps the address it found; the salt is the owner plus the
      // counter it was found with, written back the way the module wrote it
      const counter = exports.bestCounter();
      const salt = memory.slice(SALT, SALT_END);
      new DataView(salt.buffer).setBigUint64(COUNTER - SALT, counter);
      const address = memory.slice(BEST_ADDRESS, BEST_ADDRESS + 20);
      const ground = groundOf(address, home);
      const away = Math.hypot(ground.x - spec.target.x, ground.z - spec.target.z);
      const best: Found = { salt: hexOf(salt), address: hexOf(address), ground, away };
      const close = spec.within !== undefined && away <= spec.within;
      return { best, close, tries: batch, next };
    },
  };
}
