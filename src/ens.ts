/**
 * Names for places.
 *
 * An address is forty characters nobody reads out loud. ENS is the layer that
 * gives them names, and it works in both directions: a name points at an
 * address, and an address can name itself back.
 *
 * The calls are built by hand — each one is a selector and a single word, which
 * is less code than a library would be.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { ZERO, call, readAddress, readString } from './chain';

/** The ENS registry has stood at this address since 2019. */
const REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

const RESOLVER_OF = '0x0178b8bf'; // resolver(bytes32)
const ADDRESS_OF = '0x3b3b57de'; // addr(bytes32)
const NAME_OF = '0x691f3431'; // name(bytes32)

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The node of a name: hash each label, folding from the right, so that a name
 * and its parent are related by one more hash rather than by string matching.
 */
export function namehash(name: string): string {
  let node: Uint8Array<ArrayBufferLike> = new Uint8Array(32);
  if (name) {
    for (const label of name.toLowerCase().split('.').reverse()) {
      const labelHash = keccak_256(encoder.encode(label));
      const pair = new Uint8Array(64);
      pair.set(node, 0);
      pair.set(labelHash, 32);
      node = keccak_256(pair);
    }
  }
  return `0x${hex(node)}`;
}

/** Anything with a dot in it is a name rather than an address. */
export function looksLikeName(value: string): boolean {
  return /^[^\s.]+(\.[^\s.]+)+$/.test(value.trim());
}

async function resolverOf(node: string): Promise<string | null> {
  return readAddress(await call(REGISTRY, RESOLVER_OF + node.slice(2)));
}

/** The address a name points at, or null if nobody has set one. */
export async function resolveName(name: string): Promise<string | null> {
  const node = namehash(name.trim().toLowerCase());
  const resolver = await resolverOf(node);
  if (!resolver || resolver === ZERO) return null;
  return readAddress(await call(resolver, ADDRESS_OF + node.slice(2)));
}

/**
 * The name an address calls itself, if its owner has set one. Most people have;
 * almost no contracts have, so a map will always be part names, part hex.
 */
export async function lookupName(address: string): Promise<string | null> {
  const node = namehash(`${address.replace(/^0x/, '').toLowerCase()}.addr.reverse`);
  const resolver = await resolverOf(node);
  if (!resolver || resolver === ZERO) return null;
  return readString(await call(resolver, NAME_OF + node.slice(2)));
}
