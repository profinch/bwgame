/**
 * A key, an address, and whatever the chain says about it.
 *
 * Generating a key is the cheapest way to feel how large the address space is:
 * thirty-two random bytes put you somewhere nobody has ever stood, and the
 * balance lookup is the proof — it comes back empty every single time.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { getPublicKey, utils } from '@noble/secp256k1';

/** Public gateways: no key, no signup, CORS open. Tried in order. */
const RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'];

export interface Key {
  privateKey: string;
  address: string;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** An address is the last twenty bytes of the hash of the public key. */
export function addressOf(privateKey: Uint8Array): string {
  const publicKey = getPublicKey(privateKey, false).slice(1);
  return hex(keccak_256(publicKey).slice(-20));
}

export function generate(): Key {
  const privateKey = utils.randomPrivateKey();
  return { privateKey: hex(privateKey), address: addressOf(privateKey) };
}

/** Balance in wei, or null if no gateway answered. */
export async function balanceOf(address: string): Promise<bigint | null> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBalance',
    params: [`0x${address.replace(/^0x/, '')}`, 'latest'],
  });

  for (const rpc of RPCS) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      const answer = (await response.json()) as { result?: string };
      if (answer.result) return BigInt(answer.result);
    } catch {
      // try the next one
    }
  }
  return null;
}

/** Wei as ether, short enough to read at a glance. */
export function formatEther(wei: bigint): string {
  if (wei === 0n) return '0';
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
