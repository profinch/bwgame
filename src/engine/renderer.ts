/**
 * One draw call per kind of thing.
 *
 * Instances are packed into a buffer once and never touched again, so a
 * thousand boulders cost about what one does. Nothing here knows what any of
 * them mean — that is the scene's business.
 */
import { Coverage } from './coverage';
import { context, program, resize, uniforms } from './gl';
import { DEPTH_FRAGMENT, DEPTH_VERTEX, FRAGMENT, VERTEX } from './shaders';
import type { Geometry } from './shapes';
import type { Mat4 } from './mat4';

/** offset xyz, scale xyz, turn, albedo, roughness */
export const INSTANCE_FLOATS = 9;

export interface Sky {
  /** direction toward the sun */
  sun: [number, number, number];
  exposure: number;
  fogDensity: number;
}



interface Batch {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
  instances: number;
}

/** A single instance, standing still, unturned, for things that are one of a kind. */
export function once(albedo: number, roughness: number): Float32Array {
  return new Float32Array([0, 0, 0, 1, 1, 1, 0, albedo, roughness]);
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
  private readonly shadowBuffer: WebGLFramebuffer;
  private readonly batches: Batch[] = [];

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
  }

  /** Adds a batch and returns its number, for the ones that move. */
  add(geometry: Geometry, instances: Float32Array, moving = false): number {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('no vertex array');
    gl.bindVertexArray(vao);

    const attribute = (index: number, data: Float32Array, size: number) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0);
    };
    attribute(0, geometry.positions, 3);
    attribute(1, geometry.normals, 3);

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
    slot(4, 3, 24); // turn, albedo, roughness

    const elements = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.batches.push({
      vao,
      buffer: perInstance,
      count: geometry.indices.length,
      instances: instances.length / INSTANCE_FLOATS,
    });
    return this.batches.length - 1;
  }

  /** Rewrite a batch's instances — for the walker, which is somewhere new every frame. */
  update(batch: number, instances: Float32Array): void {
    const gl = this.gl;
    const found = this.batches[batch];
    if (!found) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, found.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instances);
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
  ): void {
    const gl = this.gl;

    // what the sun can see, written down once per frame
    if (lightSpan) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowBuffer);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.depthProgram);
      gl.uniformMatrix4fv(this.depthWhere.get('lightViewProjection')!, false, lightViewProjection);
      // draw the far sides instead of the near ones: the bias then has less to fix
      gl.cullFace(gl.FRONT);
      this.drawBatches();
      gl.cullFace(gl.BACK);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    resize(gl);
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
    gl.uniform1i(set.get('shadowsOn')!, lightSpan ? 1 : 0);
    gl.uniform1f(set.get('shadowTexel')!, 1 / SHADOW_SIZE);
    gl.uniform1f(set.get('shadowMetres')!, lightSpan?.metres ?? 1);
    gl.uniform1f(set.get('shadowRange')!, lightSpan?.range ?? 1);

    gl.uniform1i(set.get('veiled')!, coverage ? 1 : 0);
    if (coverage) {
      coverage.upload();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, coverage.texture);
      gl.uniform1i(set.get('coverage')!, 1);
      gl.uniform1f(set.get('coverageMetres')!, coverage.metres);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowMap);
    gl.uniform1i(set.get('shadowMap')!, 0);

    this.drawBatches();
  }
}
