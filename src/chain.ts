/**
 * Talking to whichever chain this world is, kept to what a map needs: a couple
 * of reads.
 *
 * Public gateways, no key, no signup, CORS open. Enough for a handful of
 * lookups and nowhere near enough for a crowd — that is what an indexer is for.
 */
import { chain } from './chains';

/** A JSON-RPC call against the first gateway that answers, or null. */
export async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

  for (const url of chain.rpcs) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      const answer = (await response.json()) as { result?: T };
      if (answer.result !== undefined) return answer.result;
    } catch {
      // try the next one
    }
  }
  return null;
}

/** `eth_call` with hand-built data — the calls here are one word long. */
export async function call(to: string, data: string): Promise<string | null> {
  return rpc<string>('eth_call', [{ to, data }, 'latest']);
}

export const ZERO = `0x${'0'.repeat(40)}`;

/** What an account is, as far as a couple of reads can say. */
export interface Account {
  address: string;
  /** Bytes of code. Zero means a wallet rather than a contract. */
  codeSize: number;
  /** The code itself, which is what gives a thing its shape. */
  code: string;
  /** In wei. */
  balance: bigint;
  /** For a wallet, how many transactions it has sent: how much it has done. */
  nonce: number;
}

/** Ask the chain what stands at an address. Null if nothing answered. */
export async function accountAt(address: string): Promise<Account | null> {
  const at = `0x${address.replace(/^0x/, '')}`;
  const [code, balance, nonce] = await Promise.all([
    rpc<string>('eth_getCode', [at, 'latest']),
    rpc<string>('eth_getBalance', [at, 'latest']),
    rpc<string>('eth_getTransactionCount', [at, 'latest']),
  ]);
  if (code === null) return null;
  const body = code.replace(/^0x/, '');
  return {
    address: at,
    codeSize: body.length / 2,
    code: body,
    balance: balance ? BigInt(balance) : 0n,
    nonce: nonce ? Number(BigInt(nonce)) : 0,
  };
}

/** The last twenty bytes of a returned word, as an address. */
export function readAddress(result: string | null): string | null {
  if (!result || result.length < 66) return null;
  const address = `0x${result.slice(-40)}`;
  return address === ZERO ? null : address;
}

/** A returned ABI string: offset, length, then the bytes. */
export function readString(result: string | null): string | null {
  if (!result || result.length < 130) return null;
  const body = result.slice(2);
  const length = parseInt(body.slice(64, 128), 16);
  if (!length || body.length < 128 + length * 2) return null;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = parseInt(body.slice(128 + i * 2, 130 + i * 2), 16);
  return new TextDecoder().decode(bytes);
}
