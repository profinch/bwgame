/**
 * One draw call per kind of thing.
 *
 * Instances are packed into a buffer once and never touched again, so a
 * thousand boulders cost about what one does. Nothing here knows what any of
 * them mean — that is the scene's business.
 */
import { Coverage } from './coverage';
import { context, program, resize, uniforms } from './gl';
import {
  DEPTH_FRAGMENT,
  DEPTH_VERTEX,
  FRAGMENT,
  STREAK_FRAGMENT,
  STREAK_VERTEX,
  VERTEX,
} from './shaders';
import type { Geometry } from './shapes';
import type { Mat4 } from './mat4';

/** offset xyz, scale xyz, turn, albedo, roughness, pattern (0 plain, 1 windows) */
export const INSTANCE_FLOATS = 10;

export interface Sky {
  /** direction toward the sun */
  sun: [number, number, number];
  exposure: number;
  fogDensity: number;
}



interface Batch {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  /** The shape's own buffers, kept so the ground can be rebuilt elsewhere. */
  shape?: { positions: WebGLBuffer; normals: WebGLBuffer; elements: WebGLBuffer };
  /** Floats the instance buffer has room for, which may be more than are used. */
  room: number;
  count: number;
  instances: number;
}

/** A single instance, standing still, unturned, for things that are one of a kind. */
export function once(albedo: number, roughness: number): Float32Array {
  return new Float32Array([0, 0, 0, 1, 1, 1, 0, albedo, roughness, 0]);
}

/** How wide the depth map is. Bigger is sharper and slower, in that order. */
const SHADOW_SIZE = 4096;

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly where: Map<string, WebGLUniformLocation>;
  private readonly depthProgram: WebGLProgram;
  private readonly depthWhere: Map<string, WebGLUniformLocation>;
  private readonly shadowMap: WebGLTexture;
  /** A texture for the coverage sampler to hold while the veil is off. */
  private readonly blank: WebGLTexture;
  private readonly shadowBuffer: WebGLFramebuffer;
  private readonly batches: Batch[] = [];

  /** Traffic is rebuilt every frame, so it gets a buffer rather than a batch. */
  private readonly streakProgram: WebGLProgram;
  private readonly streakWhere: Map<string, WebGLUniformLocation>;
  private readonly streakVao: WebGLVertexArrayObject;
  private readonly streakBuffer: WebGLBuffer;
  private streakRoom = 0;
  private streakCount = 0;
  /**
   * How many device pixels a CSS pixel may cost, at most. Two is plenty for a
   * screen; a phone reports three, and three times the pixels for a picture of
   * grey ground is a warm phone and a slow one.
   */
  pixelRatio = 2;

  constructor(canvas: HTMLCanvasElement) {
    const gl = context(canvas);
    this.gl = gl;
    this.program = program(gl, VERTEX, FRAGMENT);
    this.where = uniforms(gl, this.program);
    this.depthProgram = program(gl, DEPTH_VERTEX, DEPTH_FRAGMENT);
    this.depthWhere = uniforms(gl, this.depthProgram);

    // a depth texture the shader compares against rather than reads
    const texture = gl.createTexture();
    const buffer = gl.createFramebuffer();
    if (!texture || !buffer) throw new Error('no room for a shadow map');
    this.shadowMap = texture;

    // Two samplers of different types may not share a texture unit, and a
    // sampler that is never pointed anywhere sits on unit zero with the shadow
    // map. So the coverage sampler always has a texture of its own type to
    // hold: this one, a single texel, while the veil is off.
    const blank = gl.createTexture();
    if (!blank) throw new Error('no blank texture');
    gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.blank = blank;
    this.shadowBuffer = buffer;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, SHADOW_SIZE, SHADOW_SIZE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('the shadow map would not attach');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.9, 0.9, 0.9, 1);

    this.streakProgram = program(gl, STREAK_VERTEX, STREAK_FRAGMENT);
    this.streakWhere = uniforms(gl, this.streakProgram);
    const streakVao = gl.createVertexArray();
    const streakBuffer = gl.createBuffer();
    if (!streakVao || !streakBuffer) throw new Error('no room for traffic');
    this.streakVao = streakVao;
    this.streakBuffer = streakBuffer;
    gl.bindVertexArray(streakVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, streakBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
  }

  /** Hand over this frame's ribbons: position and alpha, four floats a vertex. */
  traffic(vertices: Float32Array, count: number): void {
    const gl = this.gl;
    this.streakCount = count;
    if (count === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.streakBuffer);
    if (vertices.length > this.streakRoom) {
      // grow in steps, so a busy block does not reallocate every frame after
      this.streakRoom = Math.max(vertices.length * 2, 1 << 14);
      gl.bufferData(gl.ARRAY_BUFFER, this.streakRoom * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
  }

  /** Adds a batch and returns its number, for the ones that move. */
  add(geometry: Geometry, instances: Float32Array, moving = false): number {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('no vertex array');
    gl.bindVertexArray(vao);

    const attribute = (index: number, data: Float32Array, size: number) => {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('no attribute buffer');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0);
      return buffer;
    };
    const positions = attribute(0, geometry.positions, 3);
    const normals = attribute(1, geometry.normals, 3);

    const perInstance = gl.createBuffer();
    if (!perInstance) throw new Error('no instance buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, perInstance);
    gl.bufferData(gl.ARRAY_BUFFER, instances, moving ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const stride = INSTANCE_FLOATS * 4;
    const slot = (index: number, size: number, offset: number) => {
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(index, 1);
    };
    slot(2, 3, 0); // offset
    slot(3, 3, 12); // scale
    slot(4, 4, 24); // turn, albedo, roughness, pattern

    const elements = gl.createBuffer();
    if (!elements) throw new Error('no element buffer');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.batches.push({
      vao,
      buffer: perInstance,
      shape: { positions, normals, elements },
      room: instances.length,
      count: geometry.indices.length,
      instances: instances.length / INSTANCE_FLOATS,
    });
    return this.batches.length - 1;
  }

  /**
   * Rewrite a batch's shape — for the ground, which is only ever the piece you
   * are standing on and has to be built again when you go somewhere else.
   */
  reshape(batch: number, geometry: Geometry): void {
    const gl = this.gl;
    const found = this.batches[batch];
    if (!found?.shape) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, found.shape.positions);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, found.shape.normals);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, found.shape.elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    found.count = geometry.indices.length;
  }

  /**
   * Rewrite a batch's instances — for the walker, who is somewhere new every
   * frame, and for the structures, which arrive as the chain answers.
   *
   * The buffer is grown when it has to be. Writing into one that was allocated
   * empty writes nowhere at all, silently, which looks exactly like a building
   * that was read from the chain and then failed to appear.
   */
  update(batch: number, instances: Float32Array): void {
    const gl = this.gl;
    const found = this.batches[batch];
    if (!found) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, found.buffer);
    if (instances.length > found.room) {
      found.room = Math.max(instances.length * 2, INSTANCE_FLOATS * 8);
      gl.bufferData(gl.ARRAY_BUFFER, found.room * 4, gl.DYNAMIC_DRAW);
    }
    if (instances.length > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, instances);
    found.instances = instances.length / INSTANCE_FLOATS;
  }

  private drawBatches(): void {
    const gl = this.gl;
    for (const batch of this.batches) {
      gl.bindVertexArray(batch.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, batch.count, gl.UNSIGNED_INT, 0, batch.instances);
    }
    gl.bindVertexArray(null);
  }

  draw(
    viewProjection: Mat4,
    eye: [number, number, number],
    sky: Sky,
    lightViewProjection: Mat4,
    /** How much ground the sun's view covers and how deep it is, in metres; off when absent. */
    lightSpan: { metres: number; range: number } | null,
    /** The map of what has been uncovered, or null while the veil is off. */
    coverage: Coverage | null = null,
    /** The middle of the patch, in world metres; everything drawn is relative to it. */
    origin: { x: number; z: number } = { x: 0, z: 0 },
  ): void {
    const gl = this.gl;

    // one clock for both passes, so a wall and its shadow bend together
    const now = (performance.now() / 1000) % 3600;
    // what the sun can see, written down once per frame
    if (lightSpan) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowBuffer);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.depthProgram);
      gl.uniformMatrix4fv(this.depthWhere.get('lightViewProjection')!, false, lightViewProjection);
      gl.uniform1f(this.depthWhere.get('time')!, now);
      // draw the far sides instead of the near ones: the bias then has less to fix
      gl.cullFace(gl.FRONT);
      this.drawBatches();
      gl.cullFace(gl.BACK);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    resize(gl, this.pixelRatio);
    // the shadow pass left the viewport at the size of the depth map, and
    // resize() only touches it when the canvas itself changed
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const set = this.where;
    gl.uniformMatrix4fv(set.get('viewProjection')!, false, viewProjection);
    gl.uniformMatrix4fv(set.get('lightViewProjection')!, false, lightViewProjection);
    gl.uniform3fv(set.get('eye')!, eye);
    gl.uniform3fv(set.get('sun')!, sky.sun);
    gl.uniform1f(set.get('exposure')!, sky.exposure);
    gl.uniform1f(set.get('fogDensity')!, sky.fogDensity);
    gl.uniform1f(set.get('time')!, now);
    gl.uniform1i(set.get('shadowsOn')!, lightSpan ? 1 : 0);
    gl.uniform1f(set.get('shadowTexel')!, 1 / SHADOW_SIZE);
    gl.uniform1f(set.get('shadowMetres')!, lightSpan?.metres ?? 1);
    gl.uniform1f(set.get('shadowRange')!, lightSpan?.range ?? 1);

    gl.uniform1i(set.get('veiled')!, coverage ? 1 : 0);
    // the coverage sampler is on unit one either way: the map, or the blank
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, coverage ? coverage.texture : this.blank);
    gl.uniform1i(set.get('coverage')!, 1);
    if (coverage) {
      coverage.upload();
      // the coverage map is kept in the world's coordinates and sampled in the
      // patch's, so its corner has to be brought across
      gl.uniform2f(
        set.get('coverageOrigin')!,
        coverage.origin.x - origin.x,
        coverage.origin.z - origin.z,
      );
      gl.uniform1f(set.get('coverageSpan')!, coverage.span);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowMap);
    gl.uniform1i(set.get('shadowMap')!, 0);

    this.drawBatches();

    // traffic last: it is see-through, so it reads what is already there and
    // does not write depth of its own
    if (this.streakCount > 0) {
      gl.useProgram(this.streakProgram);
      gl.uniformMatrix4fv(this.streakWhere.get('viewProjection')!, false, viewProjection);
      gl.uniform3fv(this.streakWhere.get('eye')!, eye);
      gl.uniform1f(this.streakWhere.get('fogDensity')!, sky.fogDensity);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.streakVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.streakCount);
      gl.bindVertexArray(null);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }
}
