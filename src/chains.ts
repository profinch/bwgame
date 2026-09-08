/**
 * Which chain this world is.
 *
 * A place here is an address on a chain, so the chain is not a setting buried
 * in a config — it decides what world you are standing in. Mainnet has real
 * geography: contracts with kilobytes of code, three hundred transactions a
 * block, names. Sepolia has almost nothing, and that is not a lesser version of
 * the same place but a different one — an empty country where whatever gets
 * built is the only thing there.
 *
 * `?chain=sepolia` moves everything at once: the sky, the buildings, the plots,
 * the names. Nothing carries over, because nothing should: ground claimed on
 * one chain exists on that chain and nowhere else.
 */
export interface Chain {
  key: string;
  name: string;
  /** Public gateways, tried in order. No keys, CORS open. */
  rpcs: string[];
  /** What the world is built around here, unless `?home=` says otherwise. */
  home: string;
  /** Where a block explorer can be pointed at an address. */
  explorer: string;
  /** The plot factory, once there is one. */
  plots?: string;
}

export const CHAINS: Record<string, Chain> = {
  mainnet: {
    key: 'mainnet',
    name: 'ethereum',
    rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
    // where the traffic actually lands: some forty transactions a block, more
    // than anything else on the chain
    home: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    explorer: 'https://etherscan.io/address/',
  },
  sepolia: {
    key: 'sepolia',
    name: 'sepolia',
    rpcs: [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.gateway.tenderly.co',
      'https://1rpc.io/sepolia',
    ],
    // the ENS registry stands at the same address on every chain, and on this
    // one it is among the few things that stands at all
    home: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    explorer: 'https://sepolia.etherscan.io/address/',
  },
};

function chosen(): Chain {
  try {
    const asked = new URLSearchParams(location.search).get('chain');
    if (asked && CHAINS[asked]) return CHAINS[asked]!;
  } catch {
    // no location: a test, or somewhere without a page
  }
  return CHAINS.mainnet!;
}

export const chain = chosen();
