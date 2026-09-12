# Operations

## Build and test

```bash
npm install
npm run dev          # http://localhost:5173/world.html?chain=sepolia ; the map at /
npm test             # vitest, test/**
npm run build        # tsc --noEmit + vite build → dist/
npm run wasm         # rebuild src/mine.wasm from wasm/mine.ts (AssemblyScript)
forge install foundry-rs/forge-std ensdomains/contracts-v2 --no-git   # once, into contracts/lib
forge test           # the contracts
```

Adding remappings to `foundry.toml` changes the metadata the compiler stamps into bytecode, so
the compiled `Plot` no longer equals the deployed one byte for byte. The client's constants come
from the chain; the test uses a fixture read off the chain.

## The site

Static files, served by nginx behind Cloudflare. `deploy/io-bwtoken-gs.conf` is the vhost: it
serves the world at the root (redirecting a bare root to `/?chain=sepolia`), the map at
`/map.html`, redirects `/world.html` to the root with its parameters, and proxies `/live` to the
live server. Deploy by building and shipping `dist/` to the webroot over ssh with tar (rsync is
not on the server). From macOS set `COPYFILE_DISABLE=1` or tar ships `._*` files.

## The live server

`live/server.js`, Node 22, one dependency (`ws`). Runs as a Docker container on the server, on the
same network as nginx, with `SUBGRAPH` (the subgraph query URL) and `ROOM` (the chain whose claims
it watches) in the environment, and a volume at `/data` (`-v gs-live-data:/data`) where it keeps
the revealed places (`revealed.json`), and `TOKEN_API_JWT` — the team's key for The Graph's Token API
(Pinax), which the server asks for what mainnet wallets hold (`/live/holdings?network=mainnet&address=…`,
or with `&stream=1` a line a token as each supply comes in, which is how the pages ask so a stone's
posts stand up one at a time; answers kept five minutes, supplies for good); the key never reaches the browser, and without it the pages fall back to Blockscout. Presence is in memory; the subgraph's rows are re-read on
start. Rebuild the image and recreate the container to update — with the volume, or the revealed
places are forgotten.

## The subgraph

Studio throttles a subgraph as a whole: on 12.09.2026 every version answered 429 to everyone. So
only the live server asks Studio (every 30 s, backing off to 10 min when refused), keeps every row
it has ever been given, and pushes them to every page over the WebSocket — the whole world on
joining, rows as they change, revealed places as they are revealed — so a connected page asks
nothing over HTTP. The feed at `https://gs.bwtoken.io/live/plots?since=<block>` (and
`/live/revealed`) is for a page without a socket; Studio only if the feed is down; the factory's
logs last — and nothing known is ever replaced with less.

```bash
cd subgraph && npm install
npm run codegen && npm run build
npx graph auth <deploy key>                       # once
npx graph deploy ground-state --version-label vX.Y.Z --node https://api.studio.thegraph.com/deploy/
```

The live server queries the published subgraph through the gateway, `SUBGRAPH` in its environment
being `https://gateway.thegraph.com/api/<api key>/subgraphs/id/<subgraph id>`; the key is Studio's
(free: 100 000 queries a month) and never leaves the server. Clients keep Studio's numbered version
in `src/chains.ts` as a fallback for a page without a socket. After a new deploy, publish the new
version in Studio too (a transaction on Arbitrum One); the id, and so the URL, stays.
When the factory or `Names` is redeployed, change the addresses and start blocks in
`subgraph/subgraph.yaml` (an old factory stays as a `Plots*` data source: its plots are relics)
and deploy a new version. Public gateways are not trusted for old logs: publicnode answered an
empty list for the first factory's `Claimed` events three days after they happened.

## Contracts

```bash
forge create --rpc-url <sepolia rpc> --private-key <key> --broadcast contracts/src/Plot.sol:Plots
forge verify-contract --chain-id 11155111 --verifier sourcify <address> contracts/src/Plot.sol:Plots
```

Put `--constructor-args` last: it takes every argument after it. After a new factory: update
`plots` and `plotsSince` in `src/chains.ts`, add the old factory to `former`, update the code
hashes and the fixture in the client, and redeploy the subgraph.

## Naming

Reserving a label without a plot, from the deployer wallet (it holds the registrar and unregister
roles in our registry's root):

```bash
cast send 0xbef600d2b4b19918ed7543bfecf61f412d8e210c \
  "register(string,address,address,address,uint256,uint64)" <label> <deployer> \
  0x0000000000000000000000000000000000000000 0x2E32A8CE61f46c7276Bc3786e0a7AE32da2E29ED 0 18446744073709551615 \
  --rpc-url <sepolia rpc> --private-key <key>
```

Many at once: pass `--async --nonce <n>` and count the nonce up; about 100 000 gas each. Giving a
reserved label to a plot: `unregister(uint256 labelId)` from the deployer, then the plot's owner
names the plot as usual.

`groundstate.eth` on the ENSv2 Sepolia beta: `ETHRegistrar.commit` then, sixty seconds later,
`register` paid in the beta's mock USDC (mintable). The name's owner sets
`ETHRegistry.setSubregistry(labelId, registry)` and `setResolver(labelId, names)`; the registry's
root grants `Names` `ROLE_REGISTRAR | ROLE_UNREGISTER` (`0x1001`).
