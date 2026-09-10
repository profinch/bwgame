// What happens to a plot after it is claimed: it is written into, and it changes hands.
import { Address } from '@graphprotocol/graph-ts';
import { CodeSet, Inscribed, SealedForGood, Transferred } from '../generated/templates/Plot/Plot';
import { Inscription, Plot, Transfer } from '../generated/schema';
import { ownerOf } from './plots';

export function handleInscribed(event: Inscribed): void {
  const plot = Plot.load(event.address);
  if (plot == null) return; // not one of ours: the factory never said so

  plot.note = event.params.note;
  plot.inscribedAt = event.block.timestamp;
  plot.updatedIn = event.block.number;
  plot.save();

  const inscription = new Inscription(event.transaction.hash.concatI32(event.logIndex.toI32()));
  inscription.plot = plot.id;
  inscription.note = event.params.note;
  inscription.at = event.block.timestamp;
  inscription.block = event.block.number;
  inscription.tx = event.transaction.hash;
  inscription.save();
}

export function handleTransferred(event: Transferred): void {
  const plot = Plot.load(event.address);
  if (plot == null) return;

  const from = ownerOf(event.params.from);
  from.held -= 1;
  from.save();
  const to = ownerOf(event.params.to);
  to.held += 1;
  to.save();

  plot.owner = to.id;
  plot.updatedIn = event.block.number;
  plot.save();

  const transfer = new Transfer(event.transaction.hash.concatI32(event.logIndex.toI32()));
  transfer.plot = plot.id;
  transfer.from = event.params.from;
  transfer.to = event.params.to;
  transfer.at = event.block.timestamp;
  transfer.block = event.block.number;
  transfer.tx = event.transaction.hash;
  transfer.save();
}

export function handleCodeSet(event: CodeSet): void {
  const plot = Plot.load(event.address);
  if (plot == null) return;
  // address zero takes the plot back to being just a plot
  plot.implementation = event.params.implementation.equals(Address.zero()) ? null : event.params.implementation;
  plot.updatedIn = event.block.number;
  plot.save();
}

export function handleSealed(event: SealedForGood): void {
  const plot = Plot.load(event.address);
  if (plot == null) return;
  plot.sealed = true;
  plot.updatedIn = event.block.number;
  plot.save();
}
