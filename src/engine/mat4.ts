/**
 * Just enough matrix arithmetic for one camera and one light.
 *
 * Column-major, the order WebGL wants, so nothing has to be transposed on the
 * way to the GPU.
 */
export type Mat4 = Float32Array;

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4, out = new Float32Array(16)): Mat4 {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/** A box-shaped view, which is what a sun casting parallel light needs. */
export function orthographic(
  half: number,
  near: number,
  far: number,
): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1 / half;
  m[5] = 1 / half;
  m[10] = -2 / (far - near);
  m[14] = -(far + near) / (far - near);
  m[15] = 1;
  return m;
}

function normalise(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function lookAt(
  eye: [number, number, number],
  at: [number, number, number],
  up: [number, number, number] = [0, 1, 0],
): Mat4 {
  const forward = normalise([at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]]);
  const right = normalise(cross(forward, up));
  const trueUp = cross(right, forward);
  const m = new Float32Array(16);
  m[0] = right[0];  m[4] = right[1];  m[8] = right[2];
  m[1] = trueUp[0]; m[5] = trueUp[1]; m[9] = trueUp[2];
  m[2] = -forward[0]; m[6] = -forward[1]; m[10] = -forward[2];
  m[12] = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
  m[13] = -(trueUp[0] * eye[0] + trueUp[1] * eye[1] + trueUp[2] * eye[2]);
  m[14] = forward[0] * eye[0] + forward[1] * eye[1] + forward[2] * eye[2];
  m[15] = 1;
  return m;
}
