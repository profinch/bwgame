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
it watches) in the environment. It keeps nothing: presence in memory, claims from the subgraph
every four seconds. Rebuild the image and recreate the container to update.

## The subgraph

```bash
cd subgraph && npm install
npm run codegen && npm run build
npx graph auth <deploy key>                       # once
npx graph deploy ground-state --version-label vX.Y.Z --node https://api.studio.thegraph.com/deploy/
```

Clients and the live server query `version/latest`, so a new version needs no change elsewhere.
When the factory or `Names` is redeployed, change the addresses and start blocks in
`subgraph/subgraph.yaml` and deploy a new version.

## Contracts

```bash
forge create --rpc-url <sepolia rpc> --private-key <key> --broadcast contracts/src/Plot.sol:Plots
forge verify-contract --chain-id 11155111 --verifier sourcify <address> contracts/src/Plot.sol:Plots
```

Put `--constructor-args` last: it takes every argument after it. After a new factory: update
`plots` and `plotsSince` in `src/chains.ts`, add the old factory to `former`, update the code
hashes and the fixture in the client, and redeploy the subgraph.

## Naming

`groundstate.eth` on the ENSv2 Sepolia beta: `ETHRegistrar.commit` then, sixty seconds later,
`register` paid in the beta's mock USDC (mintable). The name's owner sets
`ETHRegistry.setSubregistry(labelId, registry)` and `setResolver(labelId, names)`; the registry's
root grants `Names` `ROLE_REGISTRAR | ROLE_UNREGISTER` (`0x1001`).
