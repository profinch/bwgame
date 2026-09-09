import { describe, expect, it } from 'vitest';
import { type Shelf, drop, keep, keyOf, nearest, recall } from '../src/finds';
import { bytesOf, placeOf } from '../src/mine';

function shelf(): Shelf & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

const key = keyOf('sepolia', '0x9f76BcE99c0b997af2442FfD65A48fB58f1cA088', '0x9d25B864a22e36Ca8fE285237B1a22b33cefbCc5');
const one = { salt: '0x01', address: '0x3095c19c92551bba70bCFA9AAfa99D145347b5f8' };
const two = { salt: '0x02', address: '0x784379Da6111c8Ff4A5Ea78f22aED9cB1F938df1' };

describe('finds on the shelf', () => {
  it('is empty before anything is found, and after nonsense', () => {
    const store = shelf();
    expect(recall(store, key)).toEqual([]);
    store.setItem(key, '{"not": "a list"}');
    expect(recall(store, key)).toEqual([]);
    store.setItem(key, 'garbage');
    expect(recall(store, key)).toEqual([]);
  });

  it('keeps what is found, newest last, without repeating an address', () => {
    const store = shelf();
    keep(store, key, one);
    keep(store, key, two);
    expect(recall(store, key)).toEqual([one, two]);
    keep(store, key, { ...one, salt: '0x0111' });
    expect(recall(store, key)).toEqual([two, { ...one, salt: '0x0111' }]);
  });

  it('files by chain, factory and owner, however the address is cased', () => {
    expect(keyOf('sepolia', '0xAB', '0xCD')).toBe(keyOf('sepolia', '0xab', '0xcd'));
    expect(keyOf('sepolia', '0xab', '0xcd')).not.toBe(keyOf('mainnet', '0xab', '0xcd'));
  });

  it('lets a claimed find go', () => {
    const store = shelf();
    keep(store, key, one);
    keep(store, key, two);
    expect(drop(store, key, one.address.toLowerCase())).toEqual([two]);
    expect(recall(store, key)).toEqual([two]);
  });

  it('keeps the last two dozen and lets older ones fall off', () => {
    const store = shelf();
    for (let i = 0; i < 30; i++) keep(store, key, { salt: `0x${i}`, address: `0x${i.toString(16).padStart(40, '0')}` });
    const kept = recall(store, key);
    expect(kept).toHaveLength(24);
    expect(kept[0]!.salt).toBe('0x6');
  });

  it('offers the find nearest to wherever you stand now', () => {
    const home = placeOf(bytesOf('0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'));
    const atOne = placeOf(bytesOf(one.address));
    const standing = { x: atOne.x - home.x + 30, z: atOne.z - home.z - 40 };
    const near = nearest([two, one], home, standing)!;
    expect(near.find).toBe(one);
    expect(near.away).toBe(50);
    expect(nearest([], home, standing)).toBeNull();
  });
});
