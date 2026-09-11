# Entities

Every kind of thing a chain has, how the world draws it today, the honest shape it could have,
and what that would take. "Honest" means: derived from what the chain says, reproducible by
anyone, nothing authored.

| entity | today | honest shape | needs |
|---|---|---|---|
| **externally owned account (wallet)** | a plate with a post per token; wear from the nonce | its ENS name along the plate's edge; age from its first transaction | an indexer for age |
| **contract** | a building: size from code length, shape and turn from the code hash, darkness from balance | kinds by interface — token, NFT collection, proxy, multisig, factory, AMM pool — each with a form of its own; a verified contract wears its name | ERC-165 and probe calls, Sourcify |
| **bytecode** | shape | clones from one factory stand identical — already so | — |
| **storage** | — | interiors, where the layout is known (our own plots) | our contracts |
| **balance** | a building's darkness; an `eth` post on a plate | — | — |
| **ERC-20 token** | a post with name and share of supply | the token's own building: holders as windows, supply as height | an indexer |
| **NFT (ERC-721 / 1155)** | not drawn (decided, not borrowed: a post is a share of a supply, and one of nine thousand is not) | a form of its own: a gallery, a row of niches | an indexer |
| **transactions of the block** | ribbons in the sky from sender to receiver, true bearing, distance folded to the horizon; reverted ones waver and withdraw | which token moved, from `Transfer` logs | The Graph |
| **logs and events** | only the factory's and the plots', through the subgraph | any contract's event as a flash on its building | The Graph |
| **internal calls** | — | a ribbon branching between buildings | traces |
| **block** | its number in the status line | the world's pulse: light in step with blocks, a heavy block heavier | the chain head, already read |
| **mempool** | — | ribbons not yet landed, faint | a pending subscription |
| **gas and its price** | — | the sky's density: the weather of the world | one number from the head |
| **blobs (EIP-4844)** | — | cargo over the block, gone in eighteen days | the chain head |
| **contract creation** | a plot going up where it was claimed | a building born in view — already so for plots | — |
| **CREATE2 and the salt** | the whole mechanic of ground | — | — |
| **precompiles 0x01–0x0a, the zero address** | stand in the corner of the world when visited | landmarks | a landmark list |
| **ENS** | arrive by name; plots named under groundstate.eth; wallets' reverse names | names on buildings and plates; reverse names for plots | ENSv2 reverse |
| **proxies (EIP-1967)** | our plots are proxies; drawn as the code they point at | other people's proxies: a shell with the implementation's shape | one storage slot |
| **signatures, approvals** | the wallet signs a claim | — | — |
| **validators, staking, consensus** | — | outside the address space; no honest shape yet | — |
| **L2s and bridges** | — | another world, entered through a bridge contract | other chains |
| **time** | refused as a dimension | deploy date and age as facts about a place, not as a layer | an indexer |

## How the ground is made

The ground is the address space, hashed. Ordinary terrain stacks octaves of noise: broad shapes
first, finer ones on top. The address space is built that way already — the first digit cuts the
world in quarters, the second cuts those in quarters, forty times over — so the octaves are not
invented: they are depths of the tree. Five depths are used, with cells of 4096, 1024, 256, 64
and 16 metres. The height of a cell is the keccak of its address prefix, the first three bytes as
a number in [0, 1), times the octave's amplitude (58, 27, 12, 5, 2 metres), smoothed between
corners. Nothing is stored and nothing is authored: anybody can compute the height of a hill from
the address under it, and it comes out the same everywhere. Ground under stones and plots is
levelled, as real ground is before building.

Measured: within one walkable patch (1.7 km) the ground rises and falls by about 30 metres, at most
60; over 200 km the height stays within ±45 metres. Hills, not mountains. Mountains are a matter
of amplitude and profile, not of the method (see roadmap).

## How a plot is drawn

| state | drawing |
|---|---|
| claimed, nothing written, no code | a **blueprint**: dashed edges and panes of smoked glass in ink, drawn stroke by stroke; seven tenths of the building's size |
| written into (`inscribe`) | a building, sized by the plot's own code |
| pointed at code (`setCode`) | a building sized and shaped by **that** code, at the plot's address |
| a plot of an earlier factory | a **relic**: a boulder with `ancient relic-1` cut into a dressed face (first ground); a gate with `ancient relic-2` on its piers (second ground) |

## How an owner will shape a building

The principle is the same everywhere: **the look is code.**

1. The note (`inscribe`) — the label; also the ENS `description`.
2. The implementation (`setCode`) — the shape follows the code the plot points at.
3. Planned: an optional interface, `IGroundStateBuilding`, that an implementation may support
   (ERC-165). If it does, the world calls it and gets height, width, turn, tone, the words on the
   walls, the windows. Kept in the owner's own contract or its storage, changed by its own
   function, nothing off-chain and nothing on our servers; the look travels with the plot. A
   template implementation with `setLook(...)` for those who do not write contracts.
