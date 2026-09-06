/**
 * What has been uncovered, kept as a map rather than a list of circles.
 *
 * A handful of clearings pop into being as you cross their edges, which reads
 * as patches switching on. Painting into a field instead means the dark gives
 * way exactly where somebody has been, at one rate, with no edges of its own —
 * walking leaves a trail that is only half open, and standing fills it in.
 *
 * It is a single channel of bytes, uploaded a window at a time: only what
 * changed goes to the card.
 */
export class Coverage {
  readonly texture: WebGLTexture;
  private readonly gl: WebGL2RenderingContext;
  /**
   * Two copies on purpose: the card wants bytes, but a frame adds a fraction of
   * one, and a fraction written into a byte is a nought. The float is the truth
   * and the byte is what gets sent.
   */
  private readonly level: Float32Array;
  private readonly data: Uint8Array;

  /** Bounds of the dirty window, in texels, since the last upload. */
  private low = { x: Infinity, y: Infinity };
  private high = { x: -Infinity, y: -Infinity };

  constructor(
    gl: WebGL2RenderingContext,
    /** How much ground the map covers, side to side, in metres. */
    readonly metres: number,
    readonly resolution = 1024,
  ) {
    this.gl = gl;
    this.level = new Float32Array(resolution * resolution);
    this.data = new Uint8Array(resolution * resolution);

    const texture = gl.createTexture();
    if (!texture) throw new Error('no room for a coverage map');
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, resolution, resolution);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, resolution, resolution, gl.RED, gl.UNSIGNED_BYTE, this.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private texelsPerMetre(): number {
    return this.resolution / this.metres;
  }

  /**
   * Open the ground around a point a little further.
   *
   * The amount is the same everywhere and does not depend on how fast anyone is
   * moving: run through and you leave a faint trail, stand still and the place
   * comes all the way back.
   */
  paint(x: number, z: number, radius: number, perSecond: number, seconds: number): void {
    const scale = this.texelsPerMetre();
    const cx = (x / this.metres + 0.5) * this.resolution;
    const cz = (z / this.metres + 0.5) * this.resolution;
    const reach = radius * scale;
    const step = perSecond * seconds * 255;
    if (step <= 0) return;

    const fromX = Math.max(0, Math.floor(cx - reach));
    const toX = Math.min(this.resolution - 1, Math.ceil(cx + reach));
    const fromY = Math.max(0, Math.floor(cz - reach));
    const toY = Math.min(this.resolution - 1, Math.ceil(cz + reach));

    for (let y = fromY; y <= toY; y++) {
      for (let x2 = fromX; x2 <= toX; x2++) {
        const away = Math.hypot(x2 + 0.5 - cx, y + 0.5 - cz) / reach;
        if (away >= 1) continue;
        const falloff = (1 - away) * (1 - away);
        const index = y * this.resolution + x2;
        const value = Math.min(255, this.level[index]! + step * falloff);
        this.level[index] = value;
        this.data[index] = value;
      }
    }

    this.low.x = Math.min(this.low.x, fromX);
    this.low.y = Math.min(this.low.y, fromY);
    this.high.x = Math.max(this.high.x, toX);
    this.high.y = Math.max(this.high.y, toY);
  }

  /** Send whatever changed since last time, and nothing else. */
  upload(): void {
    if (this.high.x < this.low.x) return;
    const gl = this.gl;
    const width = this.high.x - this.low.x + 1;
    const height = this.high.y - this.low.y + 1;

    const window = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = (this.low.y + y) * this.resolution + this.low.x;
      window.set(this.data.subarray(row, row + width), y * width);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, this.low.x, this.low.y, width, height, gl.RED, gl.UNSIGNED_BYTE, window);

    this.low = { x: Infinity, y: Infinity };
    this.high = { x: -Infinity, y: -Infinity };
  }
}
