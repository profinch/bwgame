/**
 * Talking to whichever chain this world is, kept to what a map needs: a couple
 * of reads.
 *
 * Public gateways, no key, no signup, CORS open. Enough for a handful of
 * lookups and nowhere near enough for a crowd — that is what an indexer is for.
 */
import { chain } from './chains';
import type { Holding } from './places';

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

/**
 * What an account holds.
 *
 * From the chain's indexer if it has one, which knows every token that ever
 * moved; otherwise one `balanceOf` and one `totalSupply` a token off the
 * chain's short list, which knows the few that most balances are in. The
 * supply is asked for either way, because a number of tokens on its own says
 * nothing: a million is a fortune or a rounding error depending on how many
 * were ever minted.
 *
 * Whatever cannot be found is not guessed at. A stone says what was answered.
 */
export async function holdingsOf(address: string): Promise<Holding[]> {
  const indexed = chain.indexer ? await fromIndexer(address) : null;
  return indexed ?? (await fromTokenList(address));
}

/** How many tokens one wallet is asked about at once. */
const AT_MOST = 600;

/** What an indexer says a wallet holds: every token, not a chosen few. */
async function fromIndexer(address: string): Promise<Holding[] | null> {
  try {
    const response = await fetch(
      `${chain.indexer}/api/v2/addresses/${address}/token-balances`,
      { headers: { accept: 'application/json' } },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as {
      value?: string;
      token?: { type?: string; symbol?: string; decimals?: string; total_supply?: string };
    }[];
    if (!Array.isArray(rows)) return null;

    const held: Holding[] = [];
    for (const row of rows.slice(0, AT_MOST)) {
      const token = row.token;
      // only what a post can stand for: a fungible amount of something
      if (!token || token.type !== 'ERC-20' || !token.symbol || !row.value) continue;
      const amount = BigInt(row.value);
      if (amount <= 0n) continue;
      held.push({
        symbol: token.symbol,
        amount,
        decimals: Number(token.decimals ?? 18),
        supply: token.total_supply ? BigInt(token.total_supply) : undefined,
      });
    }
    return held;
  } catch {
    // no indexer answering: the short list, then
    return null;
  }
}

/** The few tokens the chain keeps a list of, asked one at a time. */
async function fromTokenList(address: string): Promise<Holding[]> {
  const tokens = chain.tokens ?? [];
  const word = address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const answers = await Promise.all(
    tokens.flatMap((token) => [call(token.at, `0x70a08231${word}`), call(token.at, '0x18160ddd')]),
  );
  const held: Holding[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const amount = readNumber(answers[i * 2]);
    if (amount === null || amount === 0n) continue;
    const supply = readNumber(answers[i * 2 + 1]);
    held.push({
      symbol: tokens[i]!.symbol,
      amount,
      decimals: tokens[i]!.decimals,
      supply: supply ?? undefined,
    });
  }
  return held;
}

/** A returned word as a number, or null if nothing came back. */
export function readNumber(result: string | null | undefined): bigint | null {
  if (!result || result.length < 66) return null;
  try {
    return BigInt(result.slice(0, 66));
  } catch {
    return null;
  }
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
