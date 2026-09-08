/**
 * What has been uncovered, kept in tiles.
 *
 * The dark gives way where somebody has stood, at one rate, and never closes
 * again — so this is a field that only grows, and merging two copies of it is
 * a per-texel maximum. That is worth saying out loud because it is what makes
 * sharing it cheap later: maximum does not care about order, about how many
 * people write at once, or about the same update arriving twice.
 *
 * The world is endless, so the field cannot be one picture. It is filed by tile,
 * and a tile is an address prefix — the same tree the map is built on. Tiles are
 * how it is *stored*; what gets drawn is a single window texture that slides
 * along with whoever is looking, with tiles laid into it as they come into
 * reach. The shader never sees a tile.
 *
 * Tiles outlive the tab in browser storage. A server, when there is one, stores
 * exactly the same tiles under exactly the same names.
 */
import { TILE_METRES, TILE_TEXELS, tileIndex, tileName, tileOrigin } from './land';

/** Tiles across the window. Eleven is about 2.8 km, further than the fog shows. */
const WINDOW_TILES = 11;
const WINDOW_TEXELS = WINDOW_TILES * TILE_TEXELS;
const WINDOW_METRES = WINDOW_TILES * TILE_METRES;

/** Where tiles live between visits, and how often they are written there. */
const STORE_PREFIX = 'gs:cover:';
const SAVE_EVERY = 4;

interface Tile {
  /** The address prefix it is filed under. */
  name: string;
  /** What the card is shown. */
  bytes: Uint8Array;
  /**
   * And what is actually counted. A frame adds a fraction of a byte, and a
   * fraction written into a byte is a nought — so the running total is kept
   * apart from the copy that gets sent.
   */
  level: Float32Array;
  dirty: boolean;
  /** Whether anything has ever been painted here, so empty tiles are not stored. */
  touched: boolean;
}

/** Run-length: a tile is nearly all one value, so this is most of the saving. */
export function pack(bytes: Uint8Array): string {
  const out: number[] = [];
  let index = 0;
  while (index < bytes.length) {
    const value = bytes[index]!;
    let run = 1;
    while (run < 255 && index + run < bytes.length && bytes[index + run] === value) run++;
    out.push(value, run);
    index += run;
  }
  let binary = '';
  for (const byte of out) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function unpack(text: string, into: Uint8Array): boolean {
  try {
    const binary = atob(text);
    let at = 0;
    for (let i = 0; i + 1 < binary.length; i += 2) {
      const value = binary.charCodeAt(i);
      const run = binary.charCodeAt(i + 1);
      into.fill(value, at, Math.min(into.length, at + run));
      at += run;
    }
    return true;
  } catch {
    return false;
  }
}

export class Coverage {
  readonly texture: WebGLTexture;
  /** The near corner of the window, in world metres, and how far it reaches. */
  origin = { x: 0, z: 0 };
  readonly span = WINDOW_METRES;

  private readonly gl: WebGL2RenderingContext;
  private readonly tiles = new Map<string, Tile>();
  /**
   * The same tiles under their grid position.
   *
   * Naming a tile means walking thirty-six digits of an address prefix in
   * bigints, and painting asks for a tile once a texel — which was ten
   * milliseconds a frame spent working out names already known.
   */
  private readonly byPlace = new Map<string, Tile>();
  private readonly window = new Uint8Array(WINDOW_TEXELS * WINDOW_TEXELS);
  private corner = { tx: 0, tz: 0 };
  /** The part of the window that changed, in window texels. Sending the whole
   *  thing every frame is half a megabyte sixty times a second, which costs
   *  more than everything else on screen put together. */
  private low = { x: Infinity, y: Infinity };
  private high = { x: -Infinity, y: -Infinity };
  private sinceSave = 0;

  constructor(gl: WebGL2RenderingContext, at: { x: number; z: number }) {
    this.gl = gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('no room for a coverage map');
    this.texture = texture;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, WINDOW_TEXELS, WINDOW_TEXELS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.recentre(at.x, at.z);
  }

  /** The tile a point falls in, read back from storage the first time it is asked for. */
  private tileAt(tx: number, tz: number): Tile {
    const place = `${tx},${tz}`;
    const seen = this.byPlace.get(place);
    if (seen) return seen;

    const name = tileName(tx, tz);
    const known = this.tiles.get(name);
    if (known) {
      this.byPlace.set(place, known);
      return known;
    }

    const tile: Tile = {
      name,
      bytes: new Uint8Array(TILE_TEXELS * TILE_TEXELS),
      level: new Float32Array(TILE_TEXELS * TILE_TEXELS),
      dirty: false,
      touched: false,
    };
    try {
      const saved = localStorage.getItem(STORE_PREFIX + name);
      if (saved && unpack(saved, tile.bytes)) {
        tile.level.set(tile.bytes);
        tile.touched = true;
      }
    } catch {
      // no storage, or it is full: the world is simply new again
    }
    this.tiles.set(name, tile);
    this.byPlace.set(place, tile);
    return tile;
  }

  /** Put the window over whoever is looking, and lay the tiles under it. */
  private recentre(x: number, z: number): void {
    const here = tileIndex(x, z);
    const half = Math.floor(WINDOW_TILES / 2);
    this.corner = { tx: here.tx - half, tz: here.tz - half };
    const at = tileOrigin(this.corner.tx, this.corner.tz);
    this.origin = { x: at.x, z: at.z };

    for (let row = 0; row < WINDOW_TILES; row++) {
      for (let col = 0; col < WINDOW_TILES; col++) {
        const tile = this.tileAt(this.corner.tx + col, this.corner.tz + row);
        for (let y = 0; y < TILE_TEXELS; y++) {
          const from = y * TILE_TEXELS;
          const to = (row * TILE_TEXELS + y) * WINDOW_TEXELS + col * TILE_TEXELS;
          this.window.set(tile.bytes.subarray(from, from + TILE_TEXELS), to);
        }
      }
    }
    this.low = { x: 0, y: 0 };
    this.high = { x: WINDOW_TEXELS - 1, y: WINDOW_TEXELS - 1 };
  }

  /**
   * Open the ground around a point a little further.
   *
   * The rate is the same everywhere and does not depend on how fast anyone is
   * moving: run through and you leave a faint trail, stand still and the place
   * comes all the way back.
   */
  paint(x: number, z: number, radius: number, perSecond: number, seconds: number): void {
    const step = perSecond * seconds * 255;
    if (step <= 0) return;

    const perMetre = TILE_TEXELS / TILE_METRES;
    const fromX = Math.floor((x - radius) * perMetre);
    const toX = Math.ceil((x + radius) * perMetre);
    const fromZ = Math.floor((z - radius) * perMetre);
    const toZ = Math.ceil((z + radius) * perMetre);
    const cx = x * perMetre;
    const cz = z * perMetre;
    const reach = radius * perMetre;

    for (let wz = fromZ; wz <= toZ; wz++) {
      for (let wx = fromX; wx <= toX; wx++) {
        const away = Math.hypot(wx + 0.5 - cx, wz + 0.5 - cz) / reach;
        if (away >= 1) continue;
        const falloff = (1 - away) * (1 - away);

        // which tile this texel belongs to, and where inside it
        const tx = Math.floor(wx / TILE_TEXELS);
        const tz = Math.floor(wz / TILE_TEXELS);
        const inX = wx - tx * TILE_TEXELS;
        const inZ = wz - tz * TILE_TEXELS;
        const tile = this.tileAt(tx, tz);
        const index = inZ * TILE_TEXELS + inX;

        const value = Math.min(255, tile.level[index]! + step * falloff);
        if (value === tile.level[index]) continue;
        tile.level[index] = value;
        tile.bytes[index] = value;
        tile.dirty = true;
        tile.touched = true;

        // and the same texel in the window, if the window is over it
        const col = tx - this.corner.tx;
        const row = tz - this.corner.tz;
        if (col < 0 || row < 0 || col >= WINDOW_TILES || row >= WINDOW_TILES) continue;
        const winX = col * TILE_TEXELS + inX;
        const winY = row * TILE_TEXELS + inZ;
        this.window[winY * WINDOW_TEXELS + winX] = value;
        if (winX < this.low.x) this.low.x = winX;
        if (winY < this.low.y) this.low.y = winY;
        if (winX > this.high.x) this.high.x = winX;
        if (winY > this.high.y) this.high.y = winY;
      }
    }
  }

  /** Put the window somewhere else outright, for when somebody travels. */
  recentreOn(x: number, z: number): void {
    this.recentre(x, z);
  }

  /** Follow whoever is looking, and keep what they uncovered. */
  follow(x: number, z: number, seconds: number): void {
    const here = tileIndex(x, z);
    const half = Math.floor(WINDOW_TILES / 2);
    if (Math.abs(here.tx - half - this.corner.tx) > 1 || Math.abs(here.tz - half - this.corner.tz) > 1) {
      this.recentre(x, z);
    }

    this.sinceSave += seconds;
    if (this.sinceSave >= SAVE_EVERY) {
      this.sinceSave = 0;
      this.save();
    }
  }

  /** Write down every tile that changed since the last time. */
  save(): void {
    for (const tile of this.tiles.values()) {
      if (!tile.dirty || !tile.touched) continue;
      tile.dirty = false;
      try {
        localStorage.setItem(STORE_PREFIX + tile.name, pack(tile.bytes));
      } catch {
        // storage full or refused: the world stays, it just will not be there
        // tomorrow. Not worth interrupting anybody over.
        return;
      }
    }
  }

  /** How many tiles have anything in them at all. */
  get known(): number {
    let count = 0;
    for (const tile of this.tiles.values()) if (tile.touched) count++;
    return count;
  }

  /** Send only the part that changed. */
  upload(): void {
    if (this.high.x < this.low.x) return;
    const gl = this.gl;
    const width = this.high.x - this.low.x + 1;
    const height = this.high.y - this.low.y + 1;

    const patch = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const from = (this.low.y + y) * WINDOW_TEXELS + this.low.x;
      patch.set(this.window.subarray(from, from + width), y * width);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, this.low.x, this.low.y, width, height, gl.RED, gl.UNSIGNED_BYTE, patch,
    );

    this.low = { x: Infinity, y: Infinity };
    this.high = { x: -Infinity, y: -Infinity };
  }
}
