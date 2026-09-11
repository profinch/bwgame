# Decisions

What was decided, and why. What was refused, and why. Dated where the date matters.

## Decided

- **The map is the address space.** Each hex digit's top two bits step x and bottom two step y;
  forty digits, forty steps. Reversible; all of 2<sup>160</sup> covered. Neighbourhood is a shared
  prefix.
- **Depth 13.** One metre of ground is one cell at the thirteenth digit; the world is 67 109 km
  across. Deeper is unminable, shallower is cheaper to mine into; thirteen makes an hour of digging
  worth a few hundred metres.
- **Nothing invented.** The world shows what the chain answered. No scenery, no mocks, no demo
  modes (removed 08.09.2026 at the owner's insistence). A mock, if ever, only behind a flag and
  labelled on screen.
- **Grey light, not two colours.** One low sun, a sky and a ground bouncing back, a narrow
  highlight, distance thinning into air; filmic tone mapping; ordered dithering only against
  banding.
- **The work is the distance.** No threshold in mining: whatever is closest when you stop is yours
  to claim.
- **A plot is a proxy** (third generation, 10.09.2026). Owner in the EIP-1967 admin slot,
  implementation in the EIP-1967 implementation slot, note and seal in a namespaced slot; anything
  an owner deploys can run at the plot's address; `seal()` fixes it for good. Refused instead: a
  shared upgradeable implementation controlled by us.
- **A plot with nothing in it is drawn, not built.** A blueprint in ink — dashed edges, smoked
  glass — at seven tenths of the building's size, drawn stroke by stroke.
- **Earlier generations are relics**, not hidden and not pretending: boulders with runes for the
  first ground, gates for the second.
- **Names belong to places.** A label under `groundstate.eth` is registered with a zero role
  bitmap so its token cannot be transferred on its own; `Names` keeps which place, and the new owner
  of a place renames it.
- **Home is the factory** on Sepolia (11.09.2026): where everything is born. Not the zero address,
  not a person's address. On mainnet, USDC.
- **Ethereum and Sepolia only** for the hackathon (11.09.2026); BNB Chain later.
- **The veil is off** until the uncovered ground is shared between people; otherwise it is one
  person's diary and reads as a bug.
- **The edge of the world is a wall.** Past 0x000… or 0xfff… there is no place.
- **Buildings stand on foundations, the ground is not flattened** (11.09.2026): a structure is
  set on the highest ground under it and reaches down to the lowest, so hills can be as steep as
  they like without breaking what stands on them.
- **The header is bwtoken.io's nav to the pixel**, so a tab switch between the two moves nothing;
  the chain and the map hang under it in the site's sub-bar. The line by the mark: *the chain, on
  foot*.
- **English in code, comments, commits and UI, lowercase in UI.** One contributor in the history.

## Refused

Boulders as placeholder scenery (as relics: accepted) · a plate with the address in bits · a
separate colour for signs · convex signs · runes on the plate itself (posts only) · plates of
different sizes per wallet · posts sorted by height · aiming a transaction at a token's post
(the plate, not the post: a block says which contract was called, not which token moved) ·
towers and skyscrapers as a metaphor · rock layers and time as depth · a landscape of every
contract on the chain (cannot be enumerated, and need not be) · mechanics carried over from the
BW arena · a plaque on the boulder (runes straight into the stone) · a blueprint on graph paper
(the ghost with glass instead) · hiding one panel behind another · cutting the camera to a new
plot (a slow turn of the head instead) · reading the old factories as plots (relics only) ·
the zero address or a person's address as the entry point.

## Left to settle

**The mesh of bwtoken.io on the walls of buildings, and walls that bend** — built 12.09.2026,
switched off the same day (`MESHED_WALLS` in places.ts), fate undecided · where a wallet's own
address is written · which token a transaction moved (needs logs) · a shape for NFTs · two plots in one metre ·
the size of a written plot · reverse names for plots · a new figure for the walker.
