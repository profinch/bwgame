// The factory said it made a plot: file it, and start listening to it.
import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import { Claimed } from '../generated/Plots/Plots';
import { Owner, Plot } from '../generated/schema';
import { Plot as PlotTemplate } from '../generated/templates';

/** Digits of the walkable world's cell, and of a tile. Match src/engine/land.ts. */
const CELL_DIGITS = 13;
const TILE_DIGITS = 9;

/** The factories, oldest first: the generation of a plot is which of them made it. */
const FACTORIES = [
  '0x9f76bce99c0b997af2442ffd65a48fb58f1ca088',
  '0x4bbfae0a0bee0f49f3ecbcccc638a0235359eb73',
  '0xcea322619d375b381bff95e53a02ef92ea81b5df',
];

function generationOf(factory: Bytes): i32 {
  const hex = factory.toHexString().toLowerCase();
  for (let i = 0; i < FACTORIES.length; i++) if (FACTORIES[i] == hex) return i + 1;
  return 0;
}

export function handleClaimed(event: Claimed): void {
  const owner = ownerOf(event.params.owner);
  owner.held += 1;
  owner.claimed += 1;
  owner.save();

  const plot = new Plot(event.params.plot);
  plot.generation = generationOf(event.address);
  plot.factory = event.address;
  plot.owner = owner.id;
  plot.claimedBy = event.params.owner;
  plot.salt = event.params.salt;
  plot.claimedAt = event.block.timestamp;
  plot.claimedIn = event.block.number;
  plot.claimTx = event.transaction.hash;
  plot.updatedIn = event.block.number;
  plot.note = '';
  plot.sealed = false;

  // the address is the place: each hex digit is one step in x and one in y
  const hex = event.params.plot.toHexString().slice(2);
  let x = BigInt.zero();
  let y = BigInt.zero();
  const four = BigInt.fromI32(4);
  for (let i = 0; i < hex.length; i++) {
    const digit = I32.parseInt(hex.charAt(i), 16);
    x = x.times(four).plus(BigInt.fromI32(digit >> 2));
    y = y.times(four).plus(BigInt.fromI32(digit & 3));
  }
  plot.x = x;
  plot.y = y;
  plot.cell = hex.slice(0, CELL_DIGITS);
  plot.tile = hex.slice(0, TILE_DIGITS);
  plot.save();

  PlotTemplate.create(event.params.plot);
}

export function ownerOf(address: Bytes): Owner {
  let owner = Owner.load(address);
  if (owner == null) {
    owner = new Owner(address);
    owner.held = 0;
    owner.claimed = 0;
  }
  return owner;
}
