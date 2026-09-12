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
 *
 * Two chains for now: Ethereum to walk — real geography, no factory — and
 * Sepolia, where everything a plot can do is done. Other chains come after
 * the hackathon; the world is a way of seeing a chain, not one chain.
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
  /** The block it was deployed in: there are no plots to look for before it. */
  plotsSince?: number;
  /**
   * Factories that came before, and the blocks they were deployed in. What they
   * made is not plots of this world any more — a different code, no way to
   * change hands — but it is still contracts standing on the ground, and the
   * ground shows what stands on it. They are read for where those are.
   */
  former?: { plots: string; since: number }[];
  /**
   * The live server, once there is one: who else is standing here, and word of
   * a claim the moment the indexer has it. The world works without it.
   */
  live?: string;
  /**
   * ENSv2 on this chain: the universal resolver that walks the registries, the
   * name our plots are named under, and the contract that names them.
   */
  ens?: { universalResolver: string; parent: string; names: string };
  /**
   * A subgraph over the factory, once there is one: every plot, who holds it,
   * what is written into it. Asked first; the factory's own logs are the
   * fallback, and stop being enough once the history outgrows what a public
   * gateway will search.
   */
  subgraph?: string;
  /** The live server's copy of the subgraph's answer, asked first: one asker for everybody. */
  plotsFeed?: string;
  /** The live server's memory of revealed places: every address anybody went to and found standing. */
  revealedFeed?: string;
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
    // the plot factory: on this chain it is what the world is about, and it
    // stands well inside the world — the ENS registry, which was home before,
    // stands twelve metres from the world's edge, with half the world walled off
    home: '0xcEa322619d375B381bff95e53a02Ef92Ea81B5Df',
    explorer: 'https://sepolia.etherscan.io/address/',
    indexer: 'https://eth-sepolia.blockscout.com',
    coin: { symbol: 'eth', supply: 120_500_000n * 10n ** 18n },
    // deployed 10.09.2026 (the third factory: a plot is a proxy its owner can
    // point at any code, and seal); ground claimed here exists on this chain
    // and nowhere else
    plots: '0xcEa322619d375B381bff95e53a02Ef92Ea81B5Df',
    plotsSince: 11_674_690,
    // the factories before it, 08.09 and 09.09.2026: what they made stands as
    // relics of the first and second ground
    former: [
      { plots: '0x9f76BcE99c0b997af2442FfD65A48fB58f1cA088', since: 11_661_029 },
      { plots: '0x4bbfaE0A0BEe0F49F3ecbCCcC638a0235359eb73', since: 11_669_423 },
    ],
    live: 'wss://gs.bwtoken.io/live',
    // ENSv2 beta on Sepolia: groundstate.eth points its subregistry at a registry
    // of ours and its resolver at Names, which names plots under it
    ens: {
      universalResolver: '0x4a1817d13e9cf196f471725176355c1234b63c70',
      parent: 'groundstate.eth',
      names: '0x2E32A8CE61f46c7276Bc3786e0a7AE32da2E29ED',
    },
    // the subgraph in subgraph/, deployed to Subgraph Studio. A version is
    // pinned: Studio throttles `version/latest` to a trickle (429 for everyone,
    // 12.09.2026), a numbered version it does not. Bump it on every deploy.
    subgraph: 'https://api.studio.thegraph.com/query/1760017/ground-state/v0.5.0',
    // Studio throttles the subgraph as a whole, so pages read the live
    // server's copy of its answer, and only that server asks Studio
    plotsFeed: 'https://gs.bwtoken.io/live/plots',
    revealedFeed: 'https://gs.bwtoken.io/live/revealed',
    tokens: [
      { at: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'usdc', decimals: 6 },
      { at: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', symbol: 'weth', decimals: 18 },
      { at: '0x779877A7B0D9E8603169DdbD7836e478b4624789', symbol: 'link', decimals: 18 },
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
