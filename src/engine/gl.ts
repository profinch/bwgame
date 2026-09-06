/**
 * The thin layer between the renderer and WebGL2: a context, a canvas that
 * keeps up with its element, and shaders that report where they broke.
 */
export function context(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) throw new Error('this browser has no WebGL2');
  return gl;
}

/** Size the drawing buffer to the element, capped so a 4K screen stays cheap. */
export function resize(gl: WebGL2RenderingContext, maxRatio = 2): boolean {
  const canvas = gl.canvas as HTMLCanvasElement;
  const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  return true;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('could not make a shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'no reason given';
    gl.deleteShader(shader);
    throw new Error(`shader did not compile: ${log}`);
  }
  return shader;
}

export function program(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const handle = gl.createProgram();
  if (!handle) throw new Error('could not make a program');
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(handle, vs);
  gl.attachShader(handle, fs);
  gl.linkProgram(handle);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(handle) ?? 'no reason given';
    gl.deleteProgram(handle);
    throw new Error(`program did not link: ${log}`);
  }
  return handle;
}

/** Every uniform the program declares, looked up once. */
export function uniforms(gl: WebGL2RenderingContext, handle: WebGLProgram): Map<string, WebGLUniformLocation> {
  const found = new Map<string, WebGLUniformLocation>();
  const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(handle, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    const location = gl.getUniformLocation(handle, name);
    if (location) found.set(name, location);
  }
  return found;
}
