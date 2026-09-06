/**
 * Engine prototype, from the ground.
 *
 * You stand in it rather than look at it, and you can only see what has been
 * uncovered: the world is dark until somebody stands in it. Standing still
 * widens the clearing you are in — the longer you stay, the more of the place
 * comes back — and walking leaves a chain of them behind you.
 */
import './style.css';

// while the prototype is being built, a failure should say so on the page
// rather than leave a black rectangle and no explanation
window.addEventListener('error', (event) => {
  const bar = document.querySelector('.stat');
  if (bar) bar.textContent = `broken: ${event.message}`;
});
import { lookAt, multiply, orthographic, perspective, type Mat4 } from './engine/mat4';
import { loop } from './engine/loop';
import { Coverage } from './engine/coverage';
import { Renderer, once, type Sky } from './engine/renderer';
import { HOME, addressUnder } from './engine/land';
import { box, figure, terrain } from './engine/shapes';
import { mark } from './logo';
import { massCount, patch } from './scene';

const canvas = document.querySelector<HTMLCanvasElement>('#view');
const stat = document.querySelector<HTMLElement>('.stat');
const place = document.querySelector<HTMLElement>('.place');
const badge = document.querySelector<HTMLElement>('.mark');
if (!canvas || !stat || !place || !badge) throw new Error('the page is missing its parts');
badge.innerHTML = mark({ size: 20, rows: 7 });

const GROUND = 1700;
const ground = terrain(GROUND, 340);
const world = patch(ground.surfaceAt, GROUND / 5);
const renderer = new Renderer(canvas);
renderer.add(ground.geometry, once(0.34, 1));
// blocks for now: what stands here should be worked out from what an account is
for (let shape = 0; shape < world.shapes; shape++) {
  renderer.add(box(), world.masses[shape]!);
}

// the address this patch is built around, standing at its own coordinates
const HOME_SIZE = 22;
renderer.add(
  box(),
  new Float32Array([
    0,
    ground.surfaceAt(0, 0) - 1.5,
    0,
    HOME_SIZE,
    HOME_SIZE * 2.6,
    HOME_SIZE,
    0,
    0.78,
    0.35,
  ]),
);
world.obstacles.push({
  x: 0,
  z: 0,
  halfWide: HOME_SIZE / 2,
  halfDeep: HOME_SIZE / 2,
  turn: 0,
  top: ground.surfaceAt(0, 0) - 1.5 + HOME_SIZE * 2.6,
});

const walker = renderer.add(figure(), new Float32Array(9), true);
/** Feet in world height, not height above the ground: you can be on a roof. */
const player = { x: 0, z: 150, y: 0, yaw: 0, pitch: -0.03, rise: 0 };

const coverage = new Coverage(renderer.gl, { x: player.x, z: player.z });

const sky: Sky = {
  // low and to the side: long shading is where the shape of a thing shows
  sun: [0.62, 0.36, 0.28],
  exposure: 1.05,
  fogDensity: 0.0011,
};

const EYE = 1.75;
const WALK = 16;
const RUN = 42;

// you start on the edge of the field, looking into it

/** Metres a second, and what pulls it back down. About a metre and a half up. */
const JUMP = 7.4;
const GRAVITY = 21;

/** A ledge no higher than this is walked onto rather than bumped into. */
const STEP_UP = 0.65;

/** Whether the eye sits in the walker's head or behind their shoulder. */
let overShoulder = false;

function feet(): number {
  return player.y;
}

function head(): [number, number, number] {
  return [player.x, player.y + EYE, player.z];
}

/** Whether a point is over a block's footprint, in that block's own frame. */
function over(block: (typeof world.obstacles)[number], x: number, z: number, margin = 0): boolean {
  const c = Math.cos(block.turn);
  const s = Math.sin(block.turn);
  const dx = x - block.x;
  const dz = z - block.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= block.halfWide + margin && Math.abs(lz) <= block.halfDeep + margin;
}

/** The highest thing underfoot: the ground, or the roof of whatever you are on. */
function supportAt(x: number, z: number, from: number): number {
  let floor = ground.surfaceAt(x, z);
  for (const block of world.obstacles) {
    if (block.top <= floor || block.top > from + STEP_UP) continue;
    if (over(block, x, z)) floor = Math.max(floor, block.top);
  }
  return floor;
}

function fall(seconds: number): void {
  const standing = player.rise === 0;
  const floor = supportAt(player.x, player.z, player.y + (standing ? STEP_UP : 0));

  if (held.has('Space') && standing && player.y <= floor + 0.01) {
    player.rise = JUMP;
  }

  player.rise -= GRAVITY * seconds;
  player.y += player.rise * seconds;

  if (player.y <= floor) {
    player.y = floor;
    player.rise = 0;
  }
}

// --- what has been uncovered ---------------------------------------------

/**
 * The dark, behind a switch. Passing no coverage map means nothing is hidden,
 * so turning it off is one word rather than a pile of dead code.
 */
const VEILED = !location.search.includes('veil=off');

/**
 * Cast shadows, behind their own switch. They are correct now — the bias is
 * measured in metres rather than guessed in depth units, which is what had the
 * shadow starting a stride away from the feet — but with the veil on there is
 * little lit ground for them to fall across, and they read as noise. Worth
 * turning back on the day the world is bright.
 */
const SHADOWED = location.search.includes('shadows=on');

/** How far around you the dark gives way, and how many seconds it takes. */
const OPENS_WITHIN = 34;
const OPENS_IN = 6;

function uncover(seconds: number): void {
  if (!VEILED) return;
  // one rate, always: running through leaves a faint trail, standing fills it
  coverage.paint(player.x, player.z, OPENS_WITHIN, 1 / OPENS_IN, seconds);
  coverage.follow(player.x, player.z, seconds);
}

// you arrive somewhere you have already been: the spot you start on is open
coverage.paint(player.x, player.z, OPENS_WITHIN, 1, OPENS_IN);
player.y = ground.surfaceAt(player.x, player.z);

// --- looking and walking --------------------------------------------------

/**
 * Keys are read by where they sit, not by the letter they print. On a Russian
 * layout `key` for the W key is "ц", and walking quietly stops working the
 * moment somebody switches layout.
 */
const held = new Set<string>();
const WALKING = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyV' && !event.repeat) overShoulder = !overShoulder;
  held.add(event.code);
  if (event.shiftKey) held.add('Shift');
  if (WALKING.has(event.code)) event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  held.delete(event.code);
  if (!event.shiftKey) held.delete('Shift');
});
window.addEventListener('blur', () => held.clear());

// whatever was uncovered should still be uncovered tomorrow
window.addEventListener('pagehide', () => coverage.save());

let looking: { x: number; y: number } | null = null;

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  looking = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener('pointermove', (event) => {
  if (!looking) return;
  player.yaw -= (event.clientX - looking.x) * 0.004;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - (event.clientY - looking.y) * 0.003));
  looking = { x: event.clientX, y: event.clientY };
});

const release = (event: PointerEvent) => {
  if (looking && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  looking = null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

/** How wide the walker is, for the purpose of not being inside things. */
const GIRTH = 0.9;

/** Passes over the whole set: leaving one block can put you inside the next. */
const SETTLE = 4;

/**
 * Push out of anything stood in.
 *
 * Each block is checked in its own turned frame, where it is a plain rectangle:
 * find the nearest point on it, and if that is nearer than the walker is wide,
 * step out the shortest way. Sliding along a wall falls out of this for free,
 * which is what makes it feel like walking rather than sticking.
 *
 * The turn has to be undone exactly as the shader applies it, or a rotated
 * block sits in one place and stops you in another — which reads as walking
 * through some things and catching on nothing.
 */
function clearOf(startX: number, startZ: number): { x: number; z: number } {
  let px = startX;
  let pz = startZ;

  for (let pass = 0; pass < SETTLE; pass++) {
    let moved = false;

    for (const block of world.obstacles) {
      // anything you are level with the top of is a step, not a wall
      if (block.top <= player.y + STEP_UP) continue;
      const c = Math.cos(block.turn);
      const s = Math.sin(block.turn);
      const dx = px - block.x;
      const dz = pz - block.z;
      // world -> block: the inverse of the turn the shader gives it
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;

      const nearX = Math.max(-block.halfWide, Math.min(block.halfWide, lx));
      const nearZ = Math.max(-block.halfDeep, Math.min(block.halfDeep, lz));
      const awayX = lx - nearX;
      const awayZ = lz - nearZ;
      const away = Math.hypot(awayX, awayZ);

      let outX = lx;
      let outZ = lz;
      if (away > 1e-4) {
        if (away >= GIRTH) continue;
        const push = (GIRTH - away) / away;
        outX = lx + awayX * push;
        outZ = lz + awayZ * push;
      } else {
        // dead inside: leave by the nearest wall, whichever that is
        const toX = block.halfWide - Math.abs(lx);
        const toZ = block.halfDeep - Math.abs(lz);
        if (toX < toZ) outX = (lx < 0 ? -1 : 1) * (block.halfWide + GIRTH);
        else outZ = (lz < 0 ? -1 : 1) * (block.halfDeep + GIRTH);
      }

      // block -> world
      px = block.x + outX * c + outZ * s;
      pz = block.z - outX * s + outZ * c;
      moved = true;
    }

    if (!moved) break;
  }

  return { x: px, z: pz };
}

function walk(seconds: number): void {
  const forward =
    (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
  const side =
    (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
  if (!forward && !side) return;

  const speed = (held.has('Shift') ? RUN : WALK) * seconds;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  // yaw turns the way you face; forward is -z when yaw is zero
  const dx = -sin * forward + cos * side;
  const dz = -cos * forward - sin * side;
  const length = Math.hypot(dx, dz) || 1;

  const clear = clearOf(player.x + (dx / length) * speed, player.z + (dz / length) * speed);
  player.x = clear.x;
  player.z = clear.z;
}

// --- the loop -------------------------------------------------------------

let frames = 0;
let since = 0;
const masses = massCount(world);

loop({
  step(seconds) {
    walk(seconds);
    fall(seconds);
    // stepping onto a low roof rather than through it
    player.y = Math.max(player.y, supportAt(player.x, player.z, player.y + STEP_UP));
    uncover(seconds);
    since += seconds;
    if (since >= 0.5) {
      const fps = Math.round(frames / since);
      frames = 0;
      since = 0;
      stat.textContent =
        `${masses} masses · ${fps} fps · ${coverage.known} tiles known · ` +
        `wasd to walk, shift to run, space to jump, ` +
        `v for ${overShoulder ? 'first person' : 'third person'}, drag to look`;
      const away = Math.round(Math.hypot(player.x, player.z));
      place.textContent =
        `0x${addressUnder(player.x, player.z)} · ${away} m from ${HOME.slice(0, 8)}… (uniswap v3 factory)`;
    }
  },
  draw() {
    frames++;

    // the walker stands where you are, facing where you look
    renderer.update(
      walker,
      new Float32Array([player.x, feet(), player.z, 1, 1, 1, player.yaw, 0.2, 0.6]),
    );

    const eyes = head();
    const look: [number, number, number] = [
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch),
    ];

    // over the shoulder: step back along the look and up a little
    const BEHIND = 5.2;
    const at: [number, number, number] = overShoulder
      ? [eyes[0] - look[0] * BEHIND, eyes[1] - look[1] * BEHIND + 1.1, eyes[2] - look[2] * BEHIND]
      : eyes;
    const ahead: [number, number, number] = [at[0] + look[0], at[1] + look[1], at[2] + look[2]];
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const camera: Mat4 = multiply(perspective(1.15, aspect, 0.2, 2600), lookAt(at, ahead));

    // The sun's own view is a box, and only what falls inside it casts. Centred
    // on the walker, half of that box is behind them and shadows stop a couple
    // of hundred metres out; centred ahead of the look, the same box covers
    // most of what is actually in front of the eye.
    const SHADOW_HALF = 340;
    const focus: [number, number, number] = [
      at[0] + (ahead[0] - at[0]) * SHADOW_HALF * 0.55,
      at[1] + (ahead[1] - at[1]) * SHADOW_HALF * 0.55,
      at[2] + (ahead[2] - at[2]) * SHADOW_HALF * 0.55,
    ];
    const reach = 620;
    const from: [number, number, number] = [
      focus[0] + sky.sun[0] * reach,
      focus[1] + sky.sun[1] * reach,
      focus[2] + sky.sun[2] * reach,
    ];
    const near = 1;
    const far = reach * 2.2;
    const light: Mat4 = multiply(orthographic(SHADOW_HALF, near, far), lookAt(from, focus));

    renderer.draw(
      camera,
      at,
      sky,
      light,
      SHADOWED ? { metres: SHADOW_HALF * 2, range: far - near } : null,
      VEILED ? coverage : null,
    );
  },
});
