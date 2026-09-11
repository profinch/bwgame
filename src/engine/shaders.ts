/**
 * One material, in greyscale.
 *
 * There is no colour to carry information here, so everything has to be said
 * with light: a low sun for long shading, a sky and a ground bouncing different
 * amounts back, a narrow specular to say what is hard and what is soft, and
 * distance thinning into the sky. The result is tone mapped like film rather
 * than clipped, because clipped white loses exactly the top end this world
 * lives in.
 *
 * The last step is dithering. Sixty shades between black and white is nothing,
 * so smooth gradients band visibly; a fraction of a level of ordered noise
 * before quantisation removes the bands and cannot be seen.
 */
/**
 * Space bending round a building: a slow field over the box, rooted at the
 * ground, moving every point of the walls by about a hundredth of the
 * footprint. It is a function of the point alone, so the two faces meeting at
 * an edge move together and the box stays closed. Shared by the colour pass
 * and the shadow pass so a building's shadow bends with it.
 */
const WARP = `
vec3 warp(vec3 position, vec3 size, vec3 offset, float time) {
  float ph = fract(dot(offset, vec3(0.113, 0.071, 0.097))) * 6.2832;
  float y = position.y;
  float amp = 0.012 * min(size.x, size.z);
  vec3 d = vec3(
    sin(y * 5.0 + time * 0.5 + ph) + 0.5 * sin(position.z * 7.0 + time * 0.8 + ph),
    0.4 * sin(position.x * 6.0 - time * 0.6 + ph) * sin(position.z * 6.0 + time * 0.45),
    cos(y * 4.0 - time * 0.42 + ph) + 0.5 * sin(position.x * 7.0 - time * 0.7 + ph));
  return d * amp * smoothstep(0.0, 0.25, y);
}
float phaseOf(vec3 offset) {
  return fract(dot(offset, vec3(0.113, 0.071, 0.097))) * 6.2832;
}`;

export const VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec3 offset;     // where the instance stands
layout(location = 3) in vec3 size;       // how big it is
layout(location = 4) in vec4 material;   // turn, albedo, roughness, pattern

uniform mat4 viewProjection;
uniform float time;

out vec3 vWorld;
out vec3 vNormal;
out vec3 vMaterial;
out vec3 vLocal;   // where on the box this is, before the turn: for what is drawn on its faces
out vec3 vFace;    // which face, in the box's own frame
out float vPhase;  // this instance's own moment in the waves
${WARP}

void main() {
  float turn = material.x;
  float c = cos(turn);
  float s = sin(turn);
  mat2 spin = mat2(c, -s, s, c);

  vec3 scaled = position * size;
  vec3 local = scaled;
  if (material.w > 0.5) scaled += warp(position, size, offset, time);
  scaled.xz = spin * scaled.xz;
  vec3 world = scaled + offset;

  // scaling squashes normals: divide by the scale before turning them
  vec3 n = normal / max(size, vec3(1e-4));
  n.xz = spin * n.xz;

  vWorld = world;
  vNormal = normalize(n);
  vMaterial = material.yzw;
  vLocal = local;
  vFace = normal;
  vPhase = phaseOf(offset);
  gl_Position = viewProjection * vec4(world, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vNormal;
in vec3 vMaterial;
in vec3 vLocal;
in vec3 vFace;
in float vPhase;

uniform float time;
uniform vec3 eye;
uniform vec3 sun;        // direction toward the light
uniform float exposure;
uniform float fogDensity;
uniform mat4 lightViewProjection;
uniform highp sampler2DShadow shadowMap;
uniform float shadowTexel;   // one texel, in the map's own coordinates
uniform float shadowMetres;  // how much ground the map covers, side to side
uniform float shadowRange;   // how deep the sun's view is, near to far
uniform bool shadowsOn;

uniform sampler2D coverage;   // what has been uncovered, one byte a texel
uniform vec2 coverageOrigin;  // the near corner of the window, in world metres
uniform float coverageSpan;   // and how far it reaches
uniform bool veiled;

out vec4 colour;

const float SKY = 0.85;    // light falling from above
const float BOUNCE = 0.10; // and coming back off the ground

// a light with width: the terminator softens instead of cutting
float wrapped(float ndotl, float width) {
  return clamp((ndotl + width) / (1.0 + width), 0.0, 1.0);
}

float ggx(vec3 n, vec3 v, vec3 l, float roughness) {
  vec3 h = normalize(v + l);
  float a = max(roughness * roughness, 1e-3);
  float d = max(dot(n, h), 0.0);
  float k = d * d * (a * a - 1.0) + 1.0;
  float spec = (a * a) / (3.14159265 * k * k);
  float fresnel = pow(1.0 - max(dot(h, v), 0.0), 5.0);
  return spec * mix(0.04, 1.0, fresnel);
}

// filmic curve: rolls into white rather than hitting it
float tonemap(float x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

/**
 * How much of the sun reaches this point.
 *
 * Nine taps in a small cross, averaged — one tap gives a hard, stair-stepped
 * edge, and a shadow with a hard edge is the fastest way to look unreal. The
 * surface is pushed a little along its own normal first, which keeps a slope
 * from shading itself.
 */
float sunlight(vec3 world, vec3 n, float ndotl) {
  if (!shadowsOn) return 1.0;
  // both nudges are in metres and converted, rather than guessed in the depth
  // buffer's own units: a fixed guess is metres wide when the sun's view is
  // kilometres deep, and the shadow then starts a stride away from the feet
  float texel = shadowMetres * shadowTexel;
  vec4 light = lightViewProjection * vec4(world + n * texel * 0.7, 1.0);
  vec3 uv = light.xyz / light.w * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || uv.z > 1.0) return 1.0;

  float slack = 0.05 + 0.45 * (1.0 - ndotl);
  float bias = slack / shadowRange;
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 at = uv.xy + vec2(float(x), float(y)) * shadowTexel;
      sum += texture(shadowMap, vec3(at, uv.z - bias));
    }
  }
  return sum / 9.0;
}

/**
 * How much of this point has been uncovered.
 *
 * The world is dark until somebody stands in it. Light here is not thrown from
 * a lamp, it is knowledge — and knowledge is read off a map that people paint
 * by being somewhere, so its edges are wherever they walked and nowhere else.
 */
float uncovered(vec3 world) {
  if (!veiled) return 1.0;
  // the window slides with the viewer; beyond its edge nothing is known anyway
  vec2 uv = (world.xz - coverageOrigin) / coverageSpan;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(coverage, uv).r;
}

// ordered noise, one level deep, so gradients stop banding
float dither(vec2 p) {
  const mat4 bayer = mat4(
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0);
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  return (bayer[x][y] / 16.0 - 0.5) / 255.0;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(eye - vWorld);
  vec3 l = normalize(sun);
  float albedo = vMaterial.x;
  float roughness = clamp(vMaterial.y, 0.05, 1.0);

  // sky above, bounce below — the softness comes from here, not from the sun
  float ambient = mix(BOUNCE, SKY, n.y * 0.5 + 0.5);
  float ndotl = dot(n, l);
  float direct = wrapped(ndotl, 0.28) * sunlight(vWorld, n, max(ndotl, 0.0));

  float light = albedo * (ambient * 0.34 + direct * 1.15)
              + ggx(n, v, l, roughness) * direct * 0.5;

  // the mesh from bwtoken.io laid over the walls of a building: a square grid
  // of fine lines with a diagonal in every other cell and a point at every
  // node, its nodes drifting on slow waves so the grid is never quite still
  if (vMaterial.z > 0.5 && abs(vFace.y) < 0.5) {
    float u = abs(vFace.x) > 0.5 ? vLocal.z : vLocal.x;
    vec2 p = vec2(u, vLocal.y);
    float pitch = 1.25;
    p += pitch * 0.16 * vec2(
      sin(p.y * 2.1 - time * 0.5 + vPhase) + 0.5 * sin(p.x * 1.3 + time * 0.35),
      sin(p.x * 2.4 + time * 0.7 + vPhase + p.y * 0.6));
    vec2 g = p / pitch;
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float thin = 0.018 + 0.7 * fwidth(g.x + g.y);
    vec2 toLine = min(f, 1.0 - f);
    float line = 1.0 - smoothstep(thin, thin * 2.2, min(toLine.x, toLine.y));
    float diagonal = 0.0;
    if (mod(cell.x + cell.y, 2.0) < 0.5) {
      diagonal = 1.0 - smoothstep(thin, thin * 2.2, abs(f.x - f.y) * 0.7071);
    }
    float node = 1.0 - smoothstep(0.05, 0.05 + thin * 2.0, length(f - round(f)));
    float ink = max(max(line, diagonal * 0.8), node);
    light *= mix(1.0, 0.6, ink);
  }

  // distance thins into the air, which is what gives depth without colour
  float depth = length(eye - vWorld);
  float fog = 1.0 - exp(-depth * fogDensity);
  light = mix(light, 0.90, fog);

  // and then the dark takes back everything nobody has uncovered — not quite to
  // nothing, so a shape still shows against the sky and gives you a reason to go
  light *= mix(0.05, 1.0, uncovered(vWorld));

  float shade = tonemap(light * exposure) + dither(gl_FragCoord.xy);
  colour = vec4(vec3(shade), 1.0);
}`;

/** Depth-only pass, seen from the sun. Same instancing, nothing else. */
export const DEPTH_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 2) in vec3 offset;
layout(location = 3) in vec3 size;
layout(location = 4) in vec4 material;

uniform mat4 lightViewProjection;
uniform float time;
${WARP}

void main() {
  float c = cos(material.x);
  float s = sin(material.x);
  vec3 scaled = position * size;
  if (material.w > 0.5) scaled += warp(position, size, offset, time);
  scaled.xz = mat2(c, -s, s, c) * scaled.xz;
  gl_Position = lightViewProjection * vec4(scaled + offset, 1.0);
}`;

export const DEPTH_FRAGMENT = `#version 300 es
precision highp float;
void main() {}`;

/**
 * Traffic: flat ribbons laid across the sky, dark against it.
 *
 * The sky here is nearly white and the unlit ground nearly black, so a streak
 * that glowed would vanish upward. Ink reads against both.
 */
export const STREAK_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in float alpha;

uniform mat4 viewProjection;
uniform vec3 eye;
uniform float fogDensity;

out float vAlpha;

void main() {
  // the same air that thins the land thins these, or they would hang in it
  float fog = 1.0 - exp(-length(eye - position) * fogDensity);
  vAlpha = alpha * (1.0 - fog * 0.85);
  gl_Position = viewProjection * vec4(position, 1.0);
}`;

export const STREAK_FRAGMENT = `#version 300 es
precision highp float;

in float vAlpha;
out vec4 colour;

void main() {
  if (vAlpha <= 0.004) discard;
  colour = vec4(vec3(0.06), vAlpha);
}`;
