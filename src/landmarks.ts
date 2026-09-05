/**
 * Addresses worth having on the map while there is nothing else on it.
 *
 * Hand-entered from mainnet and checked against their EIP-55 checksums, which a
 * mistyped digit would almost certainly break.
 */
export interface Landmark {
  name: string;
  address: string;
}

export const LANDMARKS: readonly Landmark[] = [
  // the corner every address that starts with zeros falls into
  { name: 'null', address: '0x0000000000000000000000000000000000000000' },
  { name: 'ecrecover', address: '0x0000000000000000000000000000000000000001' },
  { name: 'sha256', address: '0x0000000000000000000000000000000000000002' },
  { name: 'identity', address: '0x0000000000000000000000000000000000000004' },
  { name: 'burn', address: '0x000000000000000000000000000000000000dEaD' },
  { name: 'beacon deposit', address: '0x00000000219ab540356cBB839Cbe05303d7705Fa' },
  { name: 'ens registry', address: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' },

  // the loudest ground on the chain
  { name: 'weth', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  { name: 'usdc', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { name: 'usdt', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  { name: 'dai', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
  { name: 'wbtc', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
  { name: 'steth', address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' },
  { name: 'uni', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' },
  { name: 'uniswap v2 router', address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' },
  { name: 'uniswap v3 factory', address: '0x1F98431c8aD98523631AE4a59f267346ea31F984' },
  { name: 'aave v3 pool', address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' },
  { name: 'cryptopunks', address: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB' },
  { name: 'bayc', address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' },

  // someone who lives here rather than something that runs here
  { name: 'vitalik.eth', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
];
