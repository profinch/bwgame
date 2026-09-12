# Ground State: A Blockchain as a Place

*Draft, September 2026*

**Abstract.** A blockchain is the first shared, verifiable world state: every account, contract,
pool and transfer is an object with a definite identity, and the whole of it can be read by anyone.
It is nevertheless presented as tables. We propose to present it as a place. The address space of
an EVM chain is read as a map — each of the forty hexadecimal digits of an address selecting a cell
of a 4×4 grid, so that every address has one location and every location is one address — and the
chain's state is rendered on it: contracts as buildings whose form follows their code, accounts as
plates carrying their holdings, the current block as traffic overhead. Ground is claimed by
computation: a plot is a contract deployed with CREATE2, whose address, and therefore whose
location, is fixed by a salt the claimant searches for. No party sells land, and precision costs
work quadratically. A plot is a proxy its owner can point at any contract, so that anything built
in the chain can be given a place. Names are given under a hierarchical ENS registry, and an index
of plots is kept by a subgraph. Nothing in the world is authored: what the chain says is what
stands.

## 1. Introduction

Explorers show a chain as rows. Rows are exact and complete, and they convey no sense of *where*
anything is or how much of it there is. A person who has held tokens for years has never seen them
stand anywhere; a contract with a million users has no skyline.

We take the position that a chain already contains a geometry, and that the geometry only needs
to be read out. An address is 160 bits. Interpreted as coordinates it is a point; interpreted
digit by digit it is a route, from the whole to a quarter of the whole and so on down. The
structure that results is not a design decision: it is how the chain names things, and it has two
properties we want. It is total — every address is somewhere — and it is a tree, so that
neighbourhood is a shared prefix and the cost of choosing a location precisely grows with the
number of digits chosen.

Everything else follows from insisting that the world show nothing the chain does not say.

## 2. The map

Let an address be the hex digits `d₀ d₁ … d₃₉`. Each digit is four bits; the top two are read
as a step in *x* and the bottom two as a step in *y*:

    x = Σ (dᵢ >> 2) · 4^(39−i)        y = Σ (dᵢ & 3) · 4^(39−i)

Both coordinates are 80-bit integers on [0, 4⁴⁰). The map is reversible: a point gives back its
address by reading the two base-4 expansions in step. A prefix of *k* digits is a square cell of
side 4^(40−k) in this unit. Addresses sharing a prefix are neighbours; addresses beginning with
zeros — the precompiles, the burn addresses, the zero address — collect in one corner.

For walking, a depth is fixed. At depth 13 one metre of ground is one cell of the thirteenth digit;
the world is 4¹³ ≈ 6.7·10⁷ metres across, and under each metre lie 16²⁷ addresses. The depth is a
single constant: shallower worlds are cheaper to mine into and coarser; deeper ones finer and
unminable.

The ground itself is the address space hashed. Terrain is ordinarily built from octaves of noise
at successive scales. The address space is already a stack of scales — each digit is one — so the
octaves are taken from the tree: the height of a cell at a given depth is the Keccak hash of its
prefix, shaped by a power so that most cells sit low and few stand high, and the octaves are summed
with amplitudes falling with depth. No height is stored; anyone can compute the height of a hill
from the address beneath it.

## 3. What stands

An account is rendered from what the chain returns for it, and nothing else.

A **contract** is a building. Its footprint and height grow with the length of its code on a
logarithmic scale; its proportions and its turn come from the hash of that code, so contracts
deployed from one factory stand identical, as they are; its darkness grows with the ether it holds.
Its walls carry a grid of windows that breathes slowly.

An **externally owned account** is a plate laid on levelled ground, with a post for every token it
holds. The height of a post is the holding's share of the token's total supply on a logarithmic
scale over twelve orders of magnitude — a million of one token and a million of another stand
differently, and equal shares stand alike. The token's symbol and the amount are cut into the post
in a small alphabet of strokes. The plate's wear follows the account's nonce.

The **current block** crosses the sky. Each transaction is a ribbon from its sender toward its
receiver. The bearing is exact; the distance is folded to the horizon, because two random
addresses are 2⁸⁰ metres apart and a literal line would pass nobody. Where an endpoint lies within
the visible ground, the ribbon comes down on that address. Reverted transactions reach the point of
failure, pause, and withdraw as a wave.

An **untouched address** is level ground, and nearly all addresses are untouched. There is no
scenery.

## 4. Revealing

The address space cannot be enumerated: no node answers "which contracts are near here". A place
therefore appears when it is named — by a link, by an address typed in, by a claim — and once
named remains. Standing near a place, a client asks the chain one question at a time about it:
balance, code, code hash, holdings, records. With several people near the same place the questions
are shared among their clients, so a place resolves faster the more people stand in it. This is not
a rule imposed on the world but the arithmetic of it: four browsers make four times the requests.

The one class of places the world can know without being told is its own plots, because the
factory that makes them announces each one with an event.

## 5. Ground

A plot is a contract. Its address is its place. CREATE2 fixes a contract's address before the
contract exists:

    address = keccak256(0xff ‖ factory ‖ salt ‖ keccak256(code))[12:]

With the factory and the code fixed, only the salt moves the address. Searching salts is
therefore searching the map. A claimant aims at the point where they stand and hashes salts; the
salt whose address falls nearest is the best so far, and whatever is best when they stop is what
they may claim. There is no threshold. The expected distance to the nearest of *n* attempts falls
as 1/√*n*: ten times closer costs a hundred times the work. An hour on a laptop buys a plot within
sight; a night buys one within a minute's walk. Nobody sells the good places. They are computed.

The salt must begin with the claimant's address, which the factory checks. A salt seen in the
mempool is thereby worthless to anyone else, and the check costs the search nothing: one hash per
attempt rather than two.

The search runs in a WebAssembly module written for it, on as many threads as the machine offers
and the claimant allows. The module holds the preimage, writes the counter, hashes, reads the
address, measures, and keeps the best; it reports once per batch. Measured on a recent laptop, one
thread makes about seven million attempts a second.

## 6. Plots

A plot has an owner, a note, and an implementation. The owner may write into it, give it a name,
hand it to another, and point it at any contract they have deployed. From then on every call the
plot does not answer itself is executed as that contract's code with the plot's own address,
balance and storage — a casino, a gallery, a game lives at that place, and other contracts calling
back find it there. The owner may point it elsewhere later, or seal it, after which its code can
never change: the promise a user of that code wants. The plot's own state lives in reserved storage
slots, so an implementation is written as any contract is.

The world draws a plot as what it contains. A plot with nothing in it is drawn as a blueprint — the
edges of the building it will be, in ink, at seven tenths of the size — and becomes a building the
moment something is written into it, or the code it points at when it points at code.

Plots of earlier generations of the factory are not hidden and do not pretend: they stand as
relics, with the signs of their age cut into them.

## 7. Names

An address is nowhere anyone can be told to go. A plot may be named under a name the project holds
in ENS. The name points its subregistry at a registry of the project's own, in which a single
contract holds the right to register and to revoke labels. That contract is also the resolver for
the whole subtree: a registered label resolves to its plot, an unregistered one to nothing, and the
plot's note and a link into the world are served as text records. Labels are registered without
transfer rights, so a name cannot leave its place; when the place changes hands, the new owner
names it. The registries form the same tree the map does: a name under a name, a place under a
place.

## 8. Index and presence

The factory's events, and the plots' own, are indexed by a subgraph: owner, note, implementation,
seal, name, and the address decoded into coordinates and into the cells and tiles of the map, so
that "everything near here" is one query. Clients ask for what has changed since the block their
last answer was current at, and fall back to the factory's logs when no index answers.

A small server passes the present moment between clients: who stands where, and word of a claim as
soon as the index has it. It stores nothing. The world works without it.

## 9. Considerations

*Honesty.* The world's one rule is that it shows what the chain says. This forbids scenery,
placeholders, mock data and authored content, and it decides most design questions by itself: a
transaction lands on the contract that was called, not on the token that moved, because a block
says the former and not the latter.

*Front-running.* Binding the salt to the claimant's address removes the incentive to watch the
mempool for salts.

*Collision.* Two addresses sharing thirteen digits stand in one metre. Random addresses never do;
mined ones could, if someone dug into a taken cell. The factory does not forbid this and the world
does not yet decide it.

*Sybil.* A place resolves faster with more people present, which invites one person with many tabs.
A proof of personhood lets a verified human count as a unit and others as a fraction.

*Enumeration.* The world cannot list a chain. It is discovered. A shared memory of what has been
revealed, so that a place seen by one is seen by all, is the next thing to build.

*Cost.* Public gateways will not scan logs; an indexer is not an optimisation here but a
necessity, and the index is the only copy of the chain the project keeps.

## 10. Conclusion

A chain's state is already a world. We have described a way of standing in it that adds nothing
to it: a reading of addresses as places, of code as form, of holdings as height, of blocks as
weather; a way of taking ground that costs work and nothing else; a way of building on it that is
building on the chain itself; and a way of naming it that follows the chain's own tree. What is on
the chain is what stands. Everything else is people.

---

*Ground State is open source under the MIT licence: github.com/profinch/bwgame. It was begun at
ETHOnline 2026.*
