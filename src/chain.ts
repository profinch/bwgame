/**
 * Talking to Ethereum, kept to what a map actually needs: a couple of reads.
 *
 * Public gateways, no key, no signup, CORS open. They are enough for a handful
 * of lookups and nowhere near enough for a crowd — that is what an indexer will
 * be for.
 */
const RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'];

/** A JSON-RPC call against the first gateway that answers, or null. */
export async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

  for (const url of RPCS) {
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
