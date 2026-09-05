/**
 * The mark, generated like everything else here.
 *
 * A halftone ramp: dots on a square lattice, largest at the top left and
 * thinning to nothing at the bottom right. It is the renderer's own trick —
 * shade made of dots, because there are only two colours to shade with — so the
 * logo is a small piece of the thing it stands for rather than a picture of it.
 *
 * There is no file: the mark is a string, drawn at whatever size is asked for.
 */

/**
 * Rows for a given size. Seven is the mark as drawn; below about forty pixels
 * the dots close up into grey, so the raster gets coarser rather than smaller.
 */
function rowsFor(size: number): number {
  return size >= 64 ? 7 : size >= 40 ? 6 : 5;
}

export interface MarkOptions {
  size?: number;
  rows?: number;
  /** Fill colour; `currentColor` follows the text around it. */
  colour?: string;
}

export function mark({ size = 64, rows, colour = 'currentColor' }: MarkOptions = {}): string {
  const n = rows ?? rowsFor(size);
  const step = 60 / n;
  const smallest = 0.4;
  const dots: string[] = [];

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const shade = (row + col) / (2 * (n - 1));
      const radius = smallest + (1 - shade) * (step / 2 - smallest);
      const x = 2 + step * (col + 0.5);
      const y = 2 + step * (row + 0.5);
      dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}"/>`);
    }
  }

  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="${colour}" aria-hidden="true">${dots.join('')}</svg>`;
}

/** The same mark as a favicon, coarse enough to read in a browser tab. */
export function favicon(colour = '#0a0a0a'): string {
  const svg = mark({ size: 32, rows: 5, colour }).replace(' aria-hidden="true"', '');
  return `data:image/svg+xml,${encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?>${svg}`)}`;
}
