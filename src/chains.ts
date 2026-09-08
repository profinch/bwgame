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
  /** What a wallet calls this chain, for asking it to switch. */
  id: number;
  /** Public gateways, tried in order. No keys, CORS open. */
  rpcs: string[];
  /** What the world is built around here, unless `?home=` says otherwise. */
  home: string;
  /** Where a block explorer can be pointed at an address. */
  explorer: string;
  /**
   * The coin the chain itself runs on, and how much of it there is.
   *
   * A holding is cut to its share of a supply, and the one supply you cannot
   * ask a contract for is the native coin's. These are the figures as they
   * stand, and they move by a fraction of a percent a year — well inside the
   * width of a post.
   */
  coin: { symbol: string; supply: bigint };
  /** The plot factory, once there is one. */
  plots?: string;
  /**
   * An indexer that can say what a wallet holds.
   *
   * There is no way to ask a chain this. A token only knows its own ledger, so
   * finding what somebody holds means either asking every token there is or
   * asking something that has already read them all. Public gateways will not
   * scan logs — fifty blocks at a time on the free tiers — so this is the
   * honest source, and where a chain has none the world falls back to the short
   * list below and says only what that covers.
   */
  indexer?: string;

  /**
   * Tokens worth asking a wallet about, when there is no indexer for the chain.
   *
   * There is no way to ask a chain what someone holds — a token only knows its
   * own ledger — so a client either asks an indexer or asks a short list one at
   * a time. This is the short list: the few that most balances are in. What
   * comes back is written on the stone; what is held in anything else is not,
   * and the stone does not pretend otherwise.
   */
  tokens?: { at: string; symbol: string; decimals: number }[];
}

export const CHAINS: Record<string, Chain> = {
  mainnet: {
    key: 'mainnet',
    name: 'ethereum',
    id: 1,
    rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
    // where the traffic actually lands: some forty transactions a block, more
    // than anything else on the chain
    home: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    explorer: 'https://etherscan.io/address/',
    indexer: 'https://eth.blockscout.com',
    coin: { symbol: 'eth', supply: 120_500_000n * 10n ** 18n },
    tokens: [
      { at: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'usdc', decimals: 6 },
      { at: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'usdt', decimals: 6 },
      { at: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'dai', decimals: 18 },
      { at: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'weth', decimals: 18 },
      { at: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'wbtc', decimals: 8 },
      { at: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'link', decimals: 18 },
    ],
  },
  sepolia: {
    key: 'sepolia',
    name: 'sepolia',
    id: 11155111,
    rpcs: [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.gateway.tenderly.co',
      'https://1rpc.io/sepolia',
    ],
    // the ENS registry stands at the same address on every chain, and on this
    // one it is among the few things that stands at all
    home: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    explorer: 'https://sepolia.etherscan.io/address/',
    indexer: 'https://eth-sepolia.blockscout.com',
    coin: { symbol: 'eth', supply: 120_500_000n * 10n ** 18n },
    // deployed 08.09.2026; ground claimed here exists on this chain and nowhere else
    plots: '0x9f76BcE99c0b997af2442FfD65A48fB58f1cA088',
    tokens: [
      { at: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'usdc', decimals: 6 },
      { at: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', symbol: 'weth', decimals: 18 },
      { at: '0x779877A7B0D9E8603169DdbD7836e478b4624789', symbol: 'link', decimals: 18 },
    ],
  },
  bsc: {
    key: 'bsc',
    name: 'bnb chain',
    id: 56,
    rpcs: ['https://bsc-rpc.publicnode.com', 'https://binance.llamarpc.com'],
    // the busiest thing on the chain: the Pancake V2 router, which nearly
    // everything else on it goes through
    home: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    explorer: 'https://bscscan.com/address/',
    coin: { symbol: 'bnb', supply: 139_000_000n * 10n ** 18n },
    tokens: [
      { at: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'wbnb', decimals: 18 },
      { at: '0x55d398326f99059fF775485246999027B3197955', symbol: 'usdt', decimals: 18 },
      { at: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', symbol: 'busd', decimals: 18 },
      { at: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'usdc', decimals: 18 },
      { at: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'cake', decimals: 18 },
      { at: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'eth', decimals: 18 },
      { at: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'btcb', decimals: 18 },
      // the ones this ecosystem is actually made of
      { at: '0x806F024e934332d547fA98232c9310Fd5CE5130f', symbol: 'black', decimals: 18 },
      { at: '0xDd964452D9B2E0E7Bd54D0341E730c423202Fe4C', symbol: 'white', decimals: 18 },
      { at: '0x60322971a672B81BccE5947706D22c19dAeCf6Fb', symbol: 'mdao', decimals: 18 },
    ],
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
