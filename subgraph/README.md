# The subgraph

Every plot the factory has made, who holds it, and what is written into it —
indexed once, for everybody, instead of every client scanning the factory's logs
for itself.

The factory is one data source; every plot it deploys becomes a data source of
its own (a template), so a plot is followed from the moment it is claimed: each
`Inscribed` and each `Transferred` lands on it.

## What it answers

| entity | what |
|---|---|
| `Plot` | the address — which is the place — its owner, salt, when and by whom it was claimed, the current `note`, the `implementation` it is pointed at and whether it is `sealed`, and the address read as coordinates: `x`, `y` (80 bits each), `cell` (first 13 hex digits, the metre of ground in the walkable world) and `tile` (first 9, the 256-metre tile the world files things by) |
| `Owner` | who holds ground: how many plots now, how many ever mined |
| `Inscription` | every writing into a plot, in order |
| `Transfer` | every change of hands |

Everything standing near you, in one query:

```graphql
{ plots(where: { tile: "3095c19c9" }) { id owner { id } note x y } }
```

The world itself asks only `{ plots { id owner { id } note } }` and draws the
rest from the chain.

## Build

```bash
cd subgraph
npm install
npm run codegen
npm run build
```

## Deploy (Subgraph Studio)

1. At <https://thegraph.com/studio/> create a subgraph named `ground-state` on
   Sepolia and copy its deploy key.
2. `npx graph auth <deploy key>`
3. `npm run deploy` — it asks for a version label; `v0.1.0`.
4. Put the query URL Studio shows (`https://api.studio.thegraph.com/query/<n>/ground-state/<version>`)
   into `subgraph` for `sepolia` in `src/chains.ts`.

The factory it indexes, and the block it starts from, are in `subgraph.yaml`.
When the factory is redeployed, change both and deploy a new version.
