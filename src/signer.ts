/**
 * The wallet in the browser, if there is one.
 *
 * Deliberately thin: connect, be on the right chain, send one transaction, wait
 * for it. A game that asks somebody to sign something should show them exactly
 * what it is asking and nothing else, and a library that hides the call data
 * behind three layers is the wrong shape for that.
 */
import { chain } from './chains';
import { rpc } from './chain';

interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
}

/** The wallet the browser offers, or null if the visitor has none. */
export function wallet(): Provider | null {
  const found = (globalThis as { ethereum?: Provider }).ethereum;
  return found ?? null;
}

/** Ask for an account. The wallet decides whether to grant it. */
export async function connect(): Promise<string | null> {
  const provider = wallet();
  if (!provider) return null;
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  return accounts[0] ?? null;
}

/** An account already granted, without asking again. */
export async function connected(): Promise<string | null> {
  const provider = wallet();
  if (!provider) return null;
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Put the wallet on the chain this world is.
 *
 * Ground claimed on one chain exists on that chain and nowhere else, so signing
 * on the wrong one would deploy a plot into a world nobody is standing in.
 */
export async function onOurChain(): Promise<boolean> {
  const provider = wallet();
  if (!provider) return false;
  const want = `0x${chain.id.toString(16)}`;
  const now = (await provider.request({ method: 'eth_chainId' })) as string;
  if (now.toLowerCase() === want) return true;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
    return true;
  } catch (error) {
    // 4902: the wallet has never heard of this chain, so offer it
    if ((error as { code?: number }).code !== 4902) return false;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: want,
          chainName: chain.name,
          rpcUrls: chain.rpcs,
          nativeCurrency: { name: chain.coin.symbol, symbol: chain.coin.symbol, decimals: 18 },
          blockExplorerUrls: [chain.explorer.replace(/address\/$/, '')],
        },
      ],
    });
    return true;
  }
}

/** Send one call and hand back its hash. */
export async function send(from: string, to: string, data: string): Promise<string> {
  const provider = wallet();
  if (!provider) throw new Error('no wallet');
  return (await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to, data }],
  })) as string;
}

/**
 * Wait for a transaction to be in a block, and say whether it did anything.
 *
 * Asked of the same gateways the rest of the world is read from rather than of
 * the wallet, because the wallet's own node is not necessarily the one this
 * world is looking at, and what matters here is when the world can see it.
 */
export async function landed(hash: string, patience = 90_000): Promise<boolean> {
  const until = Date.now() + patience;
  while (Date.now() < until) {
    const receipt = await rpc<{ status?: string } | null>('eth_getTransactionReceipt', [hash]);
    if (receipt) return receipt.status === '0x1';
    await new Promise((wake) => setTimeout(wake, 2000));
  }
  return false;
}
