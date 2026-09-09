import { readFileSync } from 'node:fs';
import { keccak_256 } from '@noble/hashes/sha3';
import { describe, expect, it } from 'vitest';
import {
  BEST_ADDRESS,
  type Dig,
  type MineExports,
  STATE,
  bytesOf,
  groundOf,
  hexOf,
  miner,
  placeOf,
} from '../src/mine';

/** The module as the worker gets it, straight off the disk here. */
async function load(): Promise<MineExports> {
  const { instance } = await WebAssembly.instantiate(readFileSync('src/mine.wasm'), {});
  return instance.exports as unknown as MineExports;
}

const spec: Dig = {
  factory: '0x9f76BcE99c0b997af2442FfD65A48fB58f1cA088',
  owner: '0x9d25B864a22e36Ca8fE285237B1a22b33cefbCc5',
  home: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  codeHash: '0x70ef926e49f7184dbb0648f82dd425901784f67bdfdfb64879e650ce43321124',
  target: { x: -33_715_502, z: 14_810_353 },
  batch: 20_000,
};

const home = placeOf(bytesOf('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'));

/** CREATE2 as the chain does it, and as `predict()` on the factory does it. */
function create2(salt: Uint8Array): Uint8Array {
  const preimage = new Uint8Array(85);
  preimage[0] = 0xff;
  preimage.set(bytesOf(spec.factory), 1);
  preimage.set(salt, 21);
  preimage.set(bytesOf(spec.codeHash), 53);
  return keccak_256(preimage).subarray(12);
}

describe('the keccak inside mine.wasm', () => {
  it('hashes the preimage the way the chain will', async () => {
    const exports = await load();
    const memory = new Uint8Array(exports.memory.buffer);
    const preimage = new Uint8Array(85);
    for (let i = 0; i < 85; i++) preimage[i] = (i * 37 + 11) & 255;
    memory.set(preimage, 0);
    exports.hashOnce();
    expect(hexOf(memory.slice(STATE, STATE + 32))).toBe(hexOf(keccak_256(preimage)));
  });
});

describe('the search', () => {
  it('finds salts that begin with the owner and land where CREATE2 puts them', async () => {
    const mine = miner(await load(), spec);
    const round = mine.run(0n, 1n);
    expect(round.tries).toBe(20_000);
    const found = round.best!;
    expect(found.salt.slice(0, 42).toLowerCase()).toBe(spec.owner.toLowerCase());
    expect(found.address).toBe(hexOf(create2(bytesOf(found.salt))));
    expect(found.ground).toEqual(groundOf(bytesOf(found.address), home));
  });

  it('keeps exactly the closest attempt, as a slow search in plain JavaScript would', async () => {
    const mine = miner(await load(), spec);
    const round = mine.run(1_000n, 1n);

    let closest = Infinity;
    const salt = new Uint8Array(32);
    salt.set(bytesOf(spec.owner), 0);
    for (let counter = 1_000; counter < 21_000; counter++) {
      new DataView(salt.buffer).setBigUint64(24, BigInt(counter));
      const ground = groundOf(create2(salt), home);
      closest = Math.min(closest, Math.hypot(ground.x - spec.target.x, ground.z - spec.target.z));
    }
    expect(round.best!.away).toBe(closest);
  });

  it('remembers the best across batches and lanes, and counts on from where it left off', async () => {
    const exports = await load();
    const mine = miner(exports, { ...spec, batch: 5_000 });
    const first = mine.run(7n, 3n);
    expect(first.next).toBe(7n + 3n * 5_000n);
    const second = mine.run(first.next, 3n);
    expect(second.best!.away).toBeLessThanOrEqual(first.best!.away);
    // the address kept is the one for the counter kept
    const memory = new Uint8Array(exports.memory.buffer);
    expect(hexOf(memory.slice(BEST_ADDRESS, BEST_ADDRESS + 20))).toBe(second.best!.address);
  });

  it('measures from the home it is told, not from a home of its own', async () => {
    // the same target in metres means a different place under a different home,
    // so a search that read home for itself would aim somewhere else entirely
    const elsewhere = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
    const mine = miner(await load(), { ...spec, home: elsewhere, target: { x: 100, z: -250 } });
    const found = mine.run(0n, 1n).best!;
    const at = placeOf(bytesOf(found.address));
    const aimed = placeOf(bytesOf(elsewhere));
    expect(found.away).toBe(Math.hypot(at.x - (aimed.x + 100), at.z - (aimed.z - 250)));
    expect(found.away).toBeLessThan(4 ** 13 / 100);
  });

  it('says when it is near enough, and not before', async () => {
    const near = miner(await load(), { ...spec, within: 1e9 });
    expect(near.run(0n, 1n).close).toBe(true);
    const exact = miner(await load(), { ...spec, within: 0 });
    expect(exact.run(0n, 1n).close).toBe(false);
  });
});
