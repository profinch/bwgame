# Deployments

## Sepolia (chain id 11155111)

| what | address | since |
|---|---|---|
| **plot factory, third generation (current)** | `0xcEa322619d375B381bff95e53a02Ef92Ea81B5Df` | block 11674690, 10.09.2026 |
| plot factory, second generation (relics: gates) | `0x4bbfaE0A0BEe0F49F3ecbCCcC638a0235359eb73` | block 11669423, 09.09.2026 |
| plot factory, first generation (relics: boulders) | `0x9f76BcE99c0b997af2442FfD65A48fB58f1cA088` | block 11661029, 08.09.2026 |
| first plot of the third generation, `first.groundstate.eth` | `0x3095c27de366b76074b604d83c7440d22fa33aad` | block 11675074 |
| our ENSv2 registry (`UserRegistry` proxy via VerifiableFactory) | `0xbef600d2b4b19918ed7543bfecf61f412d8e210c` | 10.09.2026 |
| `Names` (registrar for that registry, wildcard resolver) | `0x2E32A8CE61f46c7276Bc3786e0a7AE32da2E29ED` | block 11675060 |

Labels reserved under `groundstate.eth` (12.09.2026): about three hundred, registered straight into our
registry by the deployer wallet with `Names` as resolver and no plot behind them — `casino`, `bank`,
coins, chains, exchanges, brands, places, people, the world's own words (`plot`, `dig`, `relic`…).
A reserved label resolves to nothing and cannot be taken by `Names.name`; to hand one to a plot the
deployer unregisters it and the plot's owner names the plot. The full list is what the registry
holds: `getResolver(label)` is `Names` for a reserved one.

`groundstate.eth` is registered on the ENSv2 Sepolia beta (one year from 10.09.2026); its
subregistry is our registry and its resolver is `Names`. The same name is also held on mainnet
ENS v1 by the same wallet, unused for now.

ENSv2 beta contracts used: `ETHRegistry` `0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2`,
`UniversalResolverV2` `0x4a1817d13e9cf196f471725176355c1234b63c70`, `ETHRegistrar`
`0xa88553f454b77203b0d036a05c894d555eaaa2cc`, `VerifiableFactory`
`0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef`, `UserRegistryImpl`
`0x624a25d67b59d587752ebec8dded8827dae52050`.

All our contracts are verified on Sourcify (exact match) and on Blockscout.

Code hashes the client recognises plots by: third generation runtime `0x3289e6f9…ef31` (2271
bytes); second `0x8a2b9203…e635` (1263 bytes); first, with the owner's two words blanked at byte
offsets 102 and 331, `0xb0dc3338…33ef` (1068 bytes). The third generation's runtime code as
deployed is pinned in `test/fixtures/plot-v3.hex`.

## Ethereum mainnet

Read only. Home of the world there is USDC, `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, the
busiest place on the chain.

## Off-chain

| what | where |
|---|---|
| the world | https://gs.bwtoken.io (root: the world on Sepolia; `/map.html`: the map; `/world.html` redirects to the root) |
| subgraph | Subgraph Studio `ground-state`, v0.5.0 (all three factories) — https://api.studio.thegraph.com/query/1760017/ground-state/v0.5.0 |
| live server | `wss://gs.bwtoken.io/live`; the plots feed at `https://gs.bwtoken.io/live/plots` |
| source | https://github.com/profinch/bwgame |
