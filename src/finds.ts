/**
 * What has been dug up and not yet claimed.
 *
 * A find is a salt and the address it makes. It is the whole result of the
 * work — hours of it, sometimes — and it used to live in one variable of one
 * panel, gone with a reload. So it is kept in the browser's storage, filed by
 * chain, factory and owner, since a salt is only good for the owner it was
 * mined with, the factory it was mined against, and the chain that factory
 * stands on.
 *
 * Nothing about where you were standing is kept. A find is a point in the
 * world; how far it is from you is worked out afresh from wherever you are,
 * so coming back "to the same place" needs no precision at all — stand near,
 * and the nearest find is offered with its distance from here.
 */
import { type Ground, bytesOf, groundOf } from './mine';

export interface Find {
  salt: string;
  address: string;
}

/** The little of `Storage` that is needed, so a test can hand in a Map. */
export interface Shelf {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = 'gs:finds:';

/** How many finds are kept per key. Older ones fall off the end. */
const MOST = 24;

export function keyOf(chain: string, factory: string, owner: string): string {
  return `${PREFIX}${chain}:${factory.toLowerCase()}:${owner.toLowerCase()}`;
}

/** Everything found under a key, oldest first. Nothing if storage is unavailable. */
export function recall(shelf: Shelf, key: string): Find[] {
  try {
    const raw = shelf.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Find =>
        typeof item === 'object' && item !== null &&
        typeof (item as Find).salt === 'string' && typeof (item as Find).address === 'string',
    );
  } catch {
    return [];
  }
}

/** Add a find, newest last. The same address is not kept twice. */
export function keep(shelf: Shelf, key: string, find: Find): Find[] {
  const kept = recall(shelf, key).filter((had) => had.address.toLowerCase() !== find.address.toLowerCase());
  kept.push(find);
  const trimmed = kept.slice(-MOST);
  try {
    shelf.setItem(key, JSON.stringify(trimmed));
  } catch {
    // storage full or forbidden: the find still stands for this session
  }
  return trimmed;
}

/** Take a find off the shelf — because it has been claimed, and is a plot now. */
export function drop(shelf: Shelf, key: string, address: string): Find[] {
  const left = recall(shelf, key).filter((had) => had.address.toLowerCase() !== address.toLowerCase());
  try {
    shelf.setItem(key, JSON.stringify(left));
  } catch {
    // nothing to be done
  }
  return left;
}

export interface Near {
  find: Find;
  /** Where it is, in metres from home. */
  ground: Ground;
  /** How far from the point asked about. */
  away: number;
}

/**
 * Of these finds, the one closest to a point. `home` is where the world is
 * measured from, in grid cells; `at` is metres from that home.
 */
export function nearest(finds: Find[], home: { x: number; z: number }, at: Ground): Near | null {
  let best: Near | null = null;
  for (const find of finds) {
    const ground = groundOf(bytesOf(find.address), home);
    const away = Math.hypot(ground.x - at.x, ground.z - at.z);
    if (best === null || away < best.away) best = { find, ground, away };
  }
  return best;
}
