// What a plot is called: its owner named it under groundstate.eth, or took the name back.
import { Named, Unnamed } from '../generated/Names/Names';
import { Plot } from '../generated/schema';

export function handleNamed(event: Named): void {
  const plot = Plot.load(event.params.plot);
  if (plot == null) return;
  plot.name = event.params.label;
  plot.updatedIn = event.block.number;
  plot.save();
}

export function handleUnnamed(event: Unnamed): void {
  const plot = Plot.load(event.params.plot);
  if (plot == null) return;
  plot.name = null;
  plot.updatedIn = event.block.number;
  plot.save();
}
