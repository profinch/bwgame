# Roadmap

Two columns: what was built inside **ETHOnline 2026** (4–13 September 2026, everything written
after the start), and what comes after. The hackathon is where this begins, not what it is for.

## The hackathon, by its criteria

What ETHOnline 2026 asks of an entry, and where Ground State stands against it on 13.09.2026.
Everything here was written after the start, 4 September, and is open source under MIT.

| track | what qualifies | where we stand |
| --- | --- | --- |
| **ETHOnline, main** | a working project built within the dates, open source, a demo that judges can open, a video, a README; judged on technicality, originality, practicality, usability and the wow of it | live at [gs.bwtoken.io](https://gs.bwtoken.io); source, docs and this roadmap in the repository; the video is the last thing left |
| **The Graph** | two products of The Graph composed, with live data, in a working app | a subgraph over the three factories, published to The Graph Network and read through the gateway, and the Token API for what a wallet holds on mainnet — both through the live server; the world takes its plots and its posts from them |
| **ENS** | a meaningful use of ENS in the app | ENSv2 on Sepolia: `groundstate.eth` pointing at a registry of ours, `Names` as registrar and wildcard resolver, non-transferable names that belong to the place, travel by name, 290 labels reserved |
| **World, Selfie Check** | a meaningful Selfie Check integration that treats the credential as a signal of risk, eligibility or fairness; a working app; a feedback document; tested end to end | the credential weighs a person's word over a stranger's in the shared memory of revealed places; the first live check passed 13.09; [feedback](world-id-feedback.md) written |

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
- **The Graph, two products composed:** a subgraph over the three factories with every plot as a
  dynamic data source — owner, note, every inscription, implementation, sealed, name, salt, the
  address decoded into coordinates and tiles; and the **Token API** for what a wallet holds on
  mainnet — every token and its supply — which is what the posts on a wallet's plate stand for.
  Both through the live server, one asker for everybody; Blockscout and the factory's logs as
  fallbacks.
- **ENSv2 on Sepolia:** `groundstate.eth` pointing its subregistry at a registry of ours; `Names`
  as its only registrar and its ENSIP-10 wildcard resolver; non-transferable names that belong to
  the place; travel by name.
- Multiplayer: a live server for presence (other players, their digging) and for pushing new
  claims to everyone within seconds.
- **Shared memory of revealed places** (12.09.2026): every address anybody goes to and finds
  standing — a wallet, a contract — is remembered by the live server, on disk, and put up for
  everybody on that ground; a place seen by one is seen by all, at once in the room and on every
  later visit. Rate-limited per person, capped at twenty thousand places.
- **World ID, Selfie Check** (13.09.2026): who here is a person. IDKit in the page, the RP
  signature and the verification on the live server, a token for ninety days. A person's word
  about a place is kept for everybody at once; a stranger's is heard by the room and kept once
  three strangers agree; a person stands in your grey, a stranger in white. Live on production:
  the first check passed 13.09.2026 ([world-id-feedback.md](world-id-feedback.md)).
- Onboarding: a welcome, an arrival descent, a guiding panel, a "what's near" line, how to play,
  and a walk round in nine steps — offered the first time, in the menu after.
- Mobile: a thumb stick, on-screen buttons, a one-column layout, battery-aware defaults.
- Black or white: the whole page and the world turned over, kept in the browser.
- Hills: six octaves of the address tree with a peaked profile on the coarse ones; buildings on
  foundations. A whitepaper ([whitepaper.md](whitepaper.md)).

## In scope for the hackathon, not yet done

- Nothing left on the tracks. Later for World ID: naming weighed the same way, so a name
  belongs to a person.

## After the hackathon

In roughly the order it matters:

1. **Shared memory of the uncovered ground** — the coverage tiles, merged by maximum, so the veil can
   come back. (The revealed *places* are shared already: see above.)
2. **Ground that loads as you walk.** Today the walkable patch is 1.7 km and has an edge you can
   reach; terrain should stream.
3. **A depth switch.** The world is thirteen digits deep: a metre of ground is one cell of the
   thirteenth digit. The address is a tree, so the same chain can be walked at any level — a level
   up and a whole district fits in a metre, a level down and it opens into streets — and the depth
   should be the walker's to choose. Every level down makes the world four times larger and standing
   as close to anything sixteen times the work, so ground dug beside something today is worth more
   with every level the world goes down: the digits shared with a neighbour stay shared. The index
   must hold at any depth first (item 6). Recorded 13.09.2026.
4. **Arrive at your own plot** when a wallet is connected; the factory otherwise.
5. **From the map into the world at a point.** The map already turns a place into a link; a
   click on the map inside the world should take the walker to that ground without leaving the
   page or losing what the world holds — the panels, the live room, the tour. Recorded 12.09.2026.
6. **A subgraph with no depth in it.** The `cell` and `tile` fields cut an address at a fixed
   number of digits — the metre and the 256-metre tile of the walkable world — so the index knows
   the depth, and a change of depth leaves it saying the wrong digits until it is republished —
   which is why depth 14, tried on 12.09.2026, was taken back to 13 for the hackathon. Nobody reads
   the fields: the pages take every plot over the socket. Drop them
   with the next version; "everything near here" is a range on `x` and `y`, which are the address
   as 80-bit coordinates and hold at any depth. Then fix the whitepaper's line about it (§8).
   Decided 12.09.2026; the subgraph is not to be touched before the hackathon ends.
7. **Reverse names for plots** (ENSv2): a plot's address answering `first.groundstate.eth`.
8. **A top-level name of our own.** Every name today is under `groundstate.eth`. Next, a name of the
   world's own at the top of the tree — `well.ground`, or whatever the label turns out to be — so a
   place is said in two words. ENSv2 makes this the same shape as what stands already: the root is
   a registry like ours, a top-level name is a label in it with its subregistry pointed at our
   registry, and `Names` goes on being the registrar and the wildcard resolver underneath. The same
   door lets anyone bring a name they already hold: point its subregistry at us, and their plots are
   named under it. What a top-level name costs is not code but the ENS root's consent, which is
   asked for, not taken. Recorded 13.09.2026.
9. **Buildings shaped by their owners:** the `IGroundStateBuilding` interface and a template
   implementation.
10. **Kinds of contracts by interface:** tokens, NFT collections, pools, multisigs, proxies, each
   with a form; verified names from Sourcify.
11. **Mountains:** a larger amplitude on the largest cells, so some of the ground rises by
   hundreds of metres within view; hills are there already.
12. **GPU digging** (WebGPU): a hundred times the attempts, a tenth of the distance.
13. **Plots on an L2 and on mainnet;** other chains as other worlds; bridges as passages.
14. **Economy around plots:** selling, renting, lending a place — as contracts, not as our rules.
15. **A new figure** for the walker.
16. Beacons, a first-discoverer record, a feed of active addresses to go and see.

## Never

Scenery. Time as a dimension. Mock data. Content we author. Selling land.
