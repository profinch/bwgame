# Ground State

**Every Ethereum address is a place. The world is dark until someone stands there.**

Ground State is a black-and-white world you walk through, in the browser, with other people.
It has no level designer and no map file. The map *is* the Ethereum address space — all
2<sup>160</sup> of it — and the things standing in it are real accounts and contracts on
a real chain.

## How to play

1. Open **[gs.bwtoken.io/world.html?chain=sepolia](https://gs.bwtoken.io/world.html?chain=sepolia)**. You
   come down onto the ground from above. `WASD` walks, `Shift` runs, `Space` jumps, drag to look,
   `V` changes the view; on a phone, the stick on the right walks. The ground is dark where nobody
   has stood.
2. Type an address or a name into the field at the bottom — `first.groundstate.eth`, or a wallet
   you know — and you are taken there. Contracts stand as buildings; wallets lie as stones with a
   post for every token, the name and amount cut into it in signs you can learn to read. The line
   under the address says what plots are near.
3. To take ground you need a wallet with a little Sepolia ETH (any faucet). Stand where you want
   to be and press **dig here**: every core of your machine mines salts, and the closest attempt so
   far is shown. Stop whenever you like and press **claim it** — one transaction, and the plot is
   drawn where it landed, a few hundred metres off. Walk to it.
4. At a plot of your own a panel appears: **inscribe** writes a line into it and the drawing
   becomes a building; **name it** gives it a name under `groundstate.eth`; **point at code** makes
   it run a contract you deployed — a game, a gallery, anything — at this very address; **seal**
   fixes that code for good.
5. Other people are here as white figures. What they claim goes up while you watch.

## The map is the address space

An address is forty hexadecimal digits. Each digit splits the world into a 4×4 grid and picks
one cell, so an address reads left to right as a route: the first digit chooses a quarter of
the world, the second a quarter of that, and so on, forty times over.

Every address therefore has exactly one location, and every location can be read back as an
address. Two addresses that share a prefix are neighbours — six shared digits put you in the
same cell, one four-thousandth of the world across. Addresses that begin with zeros — the
precompiles, the burn addresses, `0x0` itself — collect in one corner of the map on their own.
Nothing about this had to be designed. It falls out of how Ethereum names things.

## Places reveal themselves, and a crowd reveals them faster

The world starts dark. A place appears when somebody goes there — pastes an address, follows a
link, or mines one of their own.

Standing near something makes it load. The client asks the chain one question at a time — is
there a balance, is there code, how much code, what is its hash, is it a token, what does it
hold — and each answer adds another layer of detail to what you are looking at. Walk away and
it stops. Come back and it continues.

The more people stand in the same place, the faster it resolves, because the questions are
shared out between everyone's clients. Small things you can uncover alone. The large contracts
of Ethereum — the ones everybody has heard of — take a crowd. Sharing a link isn't a button
here; it is how you get to see anything big.

## Ground you can take

An empty address is flat ground, and there is a lot of it.

You claim a spot by mining for it: `CREATE2` fixes a contract's address before the contract
exists, so grinding a salt is grinding for a location. A rough neighbourhood costs nothing;
an exact spot next to something famous costs real work. Then one cheap transaction on an L2
turns the claim into something permanent that everybody else can walk up to.

There is no land registry and no ownership token, because there doesn't need to be one. The
plot *is* the contract's address, and two addresses cannot collide.

Digging is done where you stand: every thread the machine has, hashing salts, and the closest
attempt so far is yours to claim whenever you like — there is no threshold, the work simply *is*
the distance. The hashing runs in a WebAssembly module of our own, about seven million attempts
a second a thread, and what it finds is kept in the browser, so a reload loses nothing. While
you dig you cannot walk: the walker turns into an auger, half sunk, with the ground coming up
round it.

A plot just claimed is not yet a building. It is the drawing of one — dashed edges and panes of
smoked glass, drawn stroke by stroke where the digging got you — because the address has fixed
where it stands and how large it is, and the walls are what the owner has not said yet. Writing
into the plot (`inscribe`) turns the drawing into the building. A plot can be handed to somebody
else (`transfer`): ground is given, sold and inherited.

Every plot the factory has made is indexed by a subgraph, so a client arriving anywhere asks one
question and gets everything standing near it — the address, who holds it, what is written into
it, and the address read as coordinates, down to the tile it falls in.

## Made of nothing

No textures, no models, no asset pipeline. Geometry is generated from what an account already
is: the address places it, the code hash shapes it, the balance sizes it. Clones deployed from
the same factory look identical, because they are.

There is no colour, so everything has to be said with light — one low sun, a sky and a ground
bouncing back different amounts, a narrow highlight to separate hard from soft, and distance
thinning into the air. The picture is tone mapped like film rather than clipped, because clipped
white loses exactly the top end this world lives in. Ordered dithering is still here, not
standing in for light but keeping smooth greys from banding: there are few enough shades between
black and white that a gradient shows its steps without it.

---

## Status

Started at **ETHOnline 2026** (September 4–13, 2026) and continued after it. The hackathon is
where this begins, not what it is for. Work in progress, in the open.

Live at **[gs.bwtoken.io](https://gs.bwtoken.io)** — the world, on Sepolia, where ground is
taken — and **[gs.bwtoken.io/map.html](https://gs.bwtoken.io/map.html)** — the map. A place is a
link: `?at=0x…` or `?at=name.eth`; `?chain=mainnet` walks the mainnet instead.

## On the chain

| | |
|---|---|
| plot factory (Sepolia) | [`0xcEa322619d375B381bff95e53a02Ef92Ea81B5Df`](https://eth-sepolia.blockscout.com/address/0xcEa322619d375B381bff95e53a02Ef92Ea81B5Df), deployed in block 11674690 |
| source, verified | [Sourcify](https://repo.sourcify.dev/11155111/0xcEa322619d375B381bff95e53a02Ef92Ea81B5Df) · `contracts/src/Plot.sol` |
| subgraph | [`ground-state`](https://thegraph.com/studio/subgraph/ground-state) on Subgraph Studio — [query](https://api.studio.thegraph.com/query/1760017/ground-state/version/latest), source in `subgraph/` |
| live server | `wss://gs.bwtoken.io/live` — who else is here, and word of a claim as the indexer has it; source in `live/` |
| names (ENSv2, Sepolia) | `groundstate.eth` on the ENSv2 beta → registry [`0xbef600d2b4b19918ed7543bfecf61f412d8e210c`](https://eth-sepolia.blockscout.com/address/0xbef600d2b4b19918ed7543bfecf61f412d8e210c) (a `UserRegistry` via the VerifiableFactory), resolver and registrar [`Names` `0x2E32A8CE61f46c7276Bc3786e0a7AE32da2E29ED`](https://eth-sepolia.blockscout.com/address/0x2E32A8CE61f46c7276Bc3786e0a7AE32da2E29ED) — `contracts/src/Names.sol` |
| first named plot | `first.groundstate.eth` → [`0x3095c27de366b76074b604d83c7440d22fa33aad`](https://eth-sepolia.blockscout.com/address/0x3095c27de366b76074b604d83c7440d22fa33aad) |

`Plots.claim(bytes32 salt)` deploys a `Plot` with CREATE2. The first twenty bytes of the salt must
be the caller's address, so a salt seen in the mempool is worthless to anyone else. `predict(salt)`
says where a salt would land; `plotCodeHash()` is what a miner needs.

A `Plot` is a proxy. It has an `owner`, a `note` (`inscribe`), and it can change hands
(`transfer`). Its owner can point it at any contract they have deployed (`setCode`), and from then
on every call the plot does not answer itself runs as that code — with the plot's own address,
balance and storage. A casino, a gallery, a game lives *here*, at this place; the world draws the
plot as the code it is pointed at. `seal()` fixes the code for good, which is the promise a
casino's players want to see. The plot keeps its own state in EIP-1967 and namespaced slots, so an
implementation is written like any ordinary contract.

## Names for places

An address is nowhere anybody can be told to go, so a plot's owner can name it under
`groundstate.eth` — `well.groundstate.eth` — and the name is how the place is shared. This is
ENSv2 on Sepolia, on its own terms:

- `groundstate.eth` is registered on the ENSv2 beta and points its **subregistry** at a
  `PermissionedRegistry` of ours, deployed through the VerifiableFactory. The hierarchy of
  registries is the same shape as the map: a name under a name, a place under a place.
- `Names` is the **registrar** for that registry — the only holder of `ROLE_REGISTRAR` and
  `ROLE_UNREGISTER` on it. A plot's owner calls `name(salt, label)`; the label is registered with
  a role bitmap of zero, so the token **cannot be transferred on its own**: the name belongs to the
  place. Renaming gives the old label back. Names never expire.
- `Names` is also the **wildcard resolver** for the whole subtree (ENSIP-10): `groundstate.eth`
  names it as resolver, so `anything.groundstate.eth` is answered here — `addr` is the plot,
  `text(description)` is what the owner wrote into the plot, `text(url)` opens the world there.
- The world resolves names through `UniversalResolverV2` and lets you travel by them: type
  `first.groundstate.eth` into the world's address field. The panel at a plot of your own has a
  field to name it.

Two earlier factories stand in the history: `0x9f76BcE99c0b997af2442FfD65A48fB58f1cA088`
(08.09.2026, owner written into the code, no `transfer`) and
`0x4bbfaE0A0BEe0F49F3ecbCCcC638a0235359eb73` (09.09.2026, `transfer` but no code). What they made
stands in the world as relics: foundation stones of the first ground, marker stones of the second.

## Run it

```bash
npm install
npm run dev          # the map at /, the world at /world.html
npm test             # vitest
npm run build        # tsc --noEmit + vite build
npm run wasm         # rebuild src/mine.wasm from wasm/mine.ts (AssemblyScript)
forge test           # the contracts (Foundry; forge install foundry-rs/forge-std ensdomains/contracts-v2 first)
```

The subgraph has its own `package.json` in `subgraph/`; see the README there.

## Left to settle

- **Where a wallet's own address is written.** A wallet's plate is plain stone: the runes are on
  the posts, one to a token, because that is what a post is for. The address itself is therefore
  nowhere on the ground yet — only in the readout. A narrow band cut along the edge of the plate
  is the likely home for it, but it has not been tried.
- **Ground under a plot.** A plate is set above the highest ground it covers and reaches down to
  the lowest, which on a slope shows as a thick edge. Flattening the terrain under a claimed
  address would be the honest fix, and that means the terrain generator has to know about plots.

- **What a transaction was in.** A streak comes down onto the plate — the address — and not onto
  the post of the token that moved. Aiming at the post was tried and put back: it is a finer
  claim than a block can support, since a block says which contract was called and not which
  token moved inside it, and the sky should not be more specific than the data.

- **Tokens that are not amounts.** A post stands for a share of a supply, which is what a
  fungible holding is. An NFT is not that: one of nine thousand is not a millionth of anything
  you can stand a stone to. Wallets hold them, the indexer already returns them, and they get
  nothing on the plate for now — they need a shape of their own, decided rather than borrowed.

- **Two plots in one metre.** The walkable world is thirteen hex digits deep: a metre of ground is
  one cell, and two addresses that share thirteen digits stand in the same place. Random addresses
  never do; mined ones could, if somebody dug all the way into a taken cell. The factory does not
  forbid it and the world does not yet say what happens. Refusing at the factory, offsetting within
  the cell by the digits that remain, or leaving it to the map — which is continuous to the fortieth
  digit — are the three honest answers.

- **What is found lives in one browser.** A salt mined here is kept in this browser's storage, filed
  by chain, factory and owner. It is not shared between devices and not backed up; clearing site
  data loses it. It could be written to the plot itself at claim time, or kept with the presence
  server when there is one.

- **The size of a written plot.** A plot pointed at code is sized and shaped by that code, as any
  contract is. A plot merely written into, with no code, is sized by the plot's own code, which is
  the same for every plot — so every such plot is the same building. What it should be sized by
  instead (the note? what the plot holds?) is open.

## Prior work

Disclosed per ETHGlobal rules: the concept and written plan predate the event — they were
written for the hackathon application. All code in this repository is written during the event.
The monochrome palette and the eclipse mark are reused from [bwtoken.io](https://bwtoken.io)
by the same author.

## License

[MIT](LICENSE)
