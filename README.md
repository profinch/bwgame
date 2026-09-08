# Ground State

**Every Ethereum address is a place. The world is dark until someone stands there.**

Ground State is a black-and-white world you walk through, in the browser, with other people.
It has no level designer and no map file. The map *is* the Ethereum address space — all
2<sup>160</sup> of it — and the things standing in it are real accounts and contracts on
a real chain.

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

## Prior work

Disclosed per ETHGlobal rules: the concept and written plan predate the event — they were
written for the hackathon application. All code in this repository is written during the event.
The monochrome palette and the eclipse mark are reused from [bwtoken.io](https://bwtoken.io)
by the same author.

## License

[MIT](LICENSE)
