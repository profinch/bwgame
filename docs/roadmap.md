# Roadmap

Two columns: what was built inside **ETHOnline 2026** (4–13 September 2026, everything written
after the start), and what comes after. The hackathon is where this begins, not what it is for.

## Built within the hackathon

- The world: a WebGL2 engine of our own, no assets; ground hashed from address prefixes; buildings
  from code, plates and posts with runes from wallets; the block's traffic overhead; a 2D map of
  the whole address space; Ethereum to walk and Sepolia to take ground on.
- Taking ground: CREATE2 mining in a WebAssembly module of our own on every core, no threshold
  (the work is the distance), finds kept, one-transaction claim, the plot drawn as a blueprint
  where it landed.
- The plot contract, third generation: a proxy its owner can write into, name, transfer, point at
  any contract of their own, and seal for good. Verified on Sourcify and Blockscout. Earlier
  generations stand as relics.
- **The Graph:** a subgraph over the factory with every plot as a dynamic data source — owner,
  note, implementation, sealed, name, salt, the address decoded into coordinates and tiles; asked
  incrementally; the factory's logs as fallback.
- **ENSv2 on Sepolia:** `groundstate.eth` pointing its subregistry at a registry of ours; `Names`
  as its only registrar and its ENSIP-10 wildcard resolver; non-transferable names that belong to
  the place; travel by name.
- Multiplayer: a live server for presence (other players, their digging) and for pushing new
  claims to everyone within seconds.
- **Shared memory of revealed places** (12.09.2026): every address anybody goes to and finds
  standing — a wallet, a contract — is remembered by the live server, on disk, and put up for
  everybody on that ground; a place seen by one is seen by all, at once in the room and on every
  later visit. Rate-limited per person, capped at twenty thousand places.
- Onboarding: a welcome, an arrival descent, a guiding panel, a "what's near" line, how to play,
  and a walk round in nine steps — offered the first time, in the menu after.
- Mobile: a thumb stick, on-screen buttons, a one-column layout, battery-aware defaults.
- Black or white: the whole page and the world turned over, kept in the browser.
- Hills: six octaves of the address tree with a peaked profile on the coarse ones; buildings on
  foundations. A whitepaper ([whitepaper.md](whitepaper.md)).

## In scope for the hackathon, not yet done

- **World ID (Selfie Check):** a place resolves faster the more people stand in it, which invites
  fifty tabs; a verified human counts as a whole unit and an unverified one as a fraction. Also
  considered for naming, so a name belongs to a person.

## After the hackathon

In roughly the order it matters:

1. **Shared memory of the uncovered ground** — the coverage tiles, merged by maximum, so the veil can
   come back. (The revealed *places* are shared already: see above.)
2. **Ground that loads as you walk.** Today the walkable patch is 1.7 km and has an edge you can
   reach; terrain should stream.
3. **Arrive at your own plot** when a wallet is connected; the factory otherwise.
4. **From the map into the world at a point.** The map already turns a place into a link; a
   click on the map inside the world should take the walker to that ground without leaving the
   page or losing what the world holds — the panels, the live room, the tour. Recorded 12.09.2026.
5. **Reverse names for plots** (ENSv2): a plot's address answering `first.groundstate.eth`.
6. **Buildings shaped by their owners:** the `IGroundStateBuilding` interface and a template
   implementation.
7. **Kinds of contracts by interface:** tokens, NFT collections, pools, multisigs, proxies, each
   with a form; verified names from Sourcify.
8. **Mountains:** a larger amplitude on the largest cells, so some of the ground rises by
   hundreds of metres within view; hills are there already.
9. **GPU digging** (WebGPU): a hundred times the attempts, a tenth of the distance.
10. **Plots on an L2 and on mainnet;** other chains as other worlds; bridges as passages.
11. **Economy around plots:** selling, renting, lending a place — as contracts, not as our rules.
12. **A new figure** for the walker.
12. Beacons, a first-discoverer record, a feed of active addresses to go and see.

## Never

Scenery. Time as a dimension. Mock data. Content we author. Selling land.
