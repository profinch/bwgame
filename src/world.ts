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
import { HOME, addressUnder, levelOff, offsetOf, rawHeightAt } from './engine/land';
import { box, figure, groundUnder, terrain } from './engine/shapes';
import { Traffic, pollBlocks } from './engine/traffic';
import { chain } from './chains';
import { type Account, accountAt, holdingsOf } from './chain';
import { normalizeAddress } from './coord';
import { looksLikeName, resolveName } from './ens';
import { type Structure, instancesOf, standingOn, stands, structureOf } from './places';
import type { Obstacle } from './obstacles';
import { mark } from './logo';


const canvas = document.querySelector<HTMLCanvasElement>('#view');
const stat = document.querySelector<HTMLElement>('.stat');
const place = document.querySelector<HTMLElement>('.place');
const badge = document.querySelector<HTMLElement>('.mark');
const going = document.querySelector<HTMLFormElement>('.go');
if (!canvas || !stat || !place || !badge || !going) throw new Error('the page is missing its parts');
badge.innerHTML = mark({ size: 20, rows: 7 });

const GROUND = 1700;

/**
 * The middle of the patch, in metres from home.
 *
 * The world is sixty-seven thousand kilometres across and a card draws in
 * single precision, which has about a metre and a half of resolution out at
 * seventeen million. So the world's coordinates are kept here, and everything
 * drawn — ground, structures, traffic, the walker — is placed relative to this
 * point. Positions in the rest of this file are the patch's, not the world's;
 * only addresses are worked out from the sum of the two.
 */
const origin = { x: 0, z: 0 };

let ground = terrain(GROUND, 340, origin);
const renderer = new Renderer(canvas);
const floor = renderer.add(ground.geometry, once(0.34, 1));

/**
 * What stands in the world, and nothing else does.
 *
 * There is no scenery. Every structure is an account, read off the chain, so an
 * empty stretch of ground is genuinely empty — which is what nearly all of the
 * address space is. What fills it later is people: ground somebody mined a place
 * for and put a contract on.
 */
const structures: Structure[] = [];
const obstacles: Obstacle[] = [];
// everything is boxes: buildings, the plates people are written on, and the
// raised squares that spell an address out across them
const built = renderer.add(box(), new Float32Array(0), true);

/** Where a structure's floor sits: the lowest ground its footprint covers. */
function baseOf(structure: Structure): number {
  const x = structure.x - origin.x;
  const z = structure.z - origin.z;
  const reach = Math.max(structure.wide, structure.deep) / 2;
  if (structure.kind === 'written') {
    // a plate is wide and thin, so it is set above the highest ground it
    // covers rather than the lowest: a hill coming up through the writing
    // would be the ground showing through a stone. What it has to reach down
    // to meet is the drop across it, and no more, or a stone on a slope turns
    // into a wall.
    const hill = reliefUnder(structure);
    structure.sink = hill.high - hill.low + 0.1;
    return hill.high + 0.02;
  }
  return groundUnder(ground.surfaceAt, x, z, reach, structure.turn) - structure.tall * 0.04;
}

/** The highest and lowest ground a plate covers. */
function reliefUnder(structure: Structure): { high: number; low: number } {
  const x = structure.x - origin.x;
  const z = structure.z - origin.z;
  let high = -Infinity;
  let low = Infinity;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      const at = ground.surfaceAt(x + (ix * structure.wide) / 2, z + (iz * structure.deep) / 2);
      high = Math.max(high, at);
      low = Math.min(low, at);
    }
  }
  return { high, low };
}

/**
 * What an account leaves on the ground, asked for in full.
 *
 * A wallet's stone says what it holds, and what it holds takes one call a
 * token, so a stone costs a few more reads than a building does.
 */
async function standing(account: Account): Promise<Structure> {
  const holdings = account.codeSize === 0 ? await holdingsOf(account.address) : [];
  return structureOf(account, holdings, chain.coin);
}

function raise(structure: Structure): void {
  if (structures.some((standing) => standing.address === structure.address)) return;
  structures.push(structure);
  // a stone is laid on levelled ground, so it does not stand on a wall of its
  // own foundation on the low side — which is what stopped you walking up to it
  if (structure.kind === 'written' && level(structure)) rebuild();
  settle();
}

/**
 * Level the ground under a stone, if it is not level already.
 *
 * The pad is the mean of the hill under the plate, which is the level that
 * moves the least earth. Nothing is levelled under a building: a contract is
 * a thing dropped on the land, and the land keeps its shape.
 */
function level(structure: Structure): boolean {
  const at = { x: structure.x, z: structure.z };
  let sum = 0;
  let taken = 0;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      sum += rawHeightAt(at.x + (ix * structure.wide) / 2, at.z + (iz * structure.deep) / 2);
      taken++;
    }
  }
  levelOff({
    x: at.x,
    z: at.z,
    halfWide: structure.wide / 2 + 0.6,
    halfDeep: structure.deep / 2 + 0.6,
    level: sum / taken,
  });
  return true;
}

/** Build the ground again, after the shape of it changed. */
function rebuild(): void {
  ground = terrain(GROUND, 340, origin);
  renderer.reshape(floor, ground.geometry);
  player.y = Math.max(player.y, ground.surfaceAt(player.x, player.z));
}

/** Sit everything on the ground as it is here, and let a walker feel it. */
function settle(): void {
  obstacles.length = 0;
  for (const structure of structures) {
    const base = baseOf(structure);
    obstacles.push({
      x: structure.x - origin.x,
      z: structure.z - origin.z,
      halfWide: structure.wide / 2,
      halfDeep: structure.deep / 2,
      turn: structure.turn,
      top: base + structure.tall,
    });
    // and its posts, which are stones you can walk into and a transaction can
    // come down onto
    for (const post of standingOn(structure, base, origin)) obstacles.push(post);
  }
  renderer.update(built, instancesOf(structures, baseOf, origin));
}

/**
 * Go to an address.
 *
 * The mesh underfoot is a couple of kilometres of a world sixty-seven thousand
 * kilometres wide, so arriving somewhere means building the ground there. Which
 * is cheap: the hills come out of hashed prefixes, and the same prefixes are
 * asked for over and over, so most of the work is a cache lookup.
 */
/** How far off an address you are set down, so you can see what is on it. */
const ALIGHT = 14;

function arriveAt(x: number, z: number): void {
  origin.x = x;
  origin.z = z;
  // beside the address rather than on it: arriving dead on one puts you inside
  // whatever stands there, and the inside of a building is not drawn
  player.x = 0;
  player.z = ALIGHT;
  player.yaw = 0;
  player.pitch = -0.2;
  ground = terrain(GROUND, 340, origin);
  renderer.reshape(floor, ground.geometry);
  player.y = ground.surfaceAt(player.x, player.z);
  player.rise = 0;
  settle();
  coverage.recentreOn(x, z);
  coverage.paint(x, z, OPENS_WITHIN, 1, OPENS_IN);
}

/** Where the walker is in the world, rather than in this patch. */
function afoot(): { x: number; z: number } {
  return { x: origin.x + player.x, z: origin.z + player.z };
}

/** And go to whatever an address holds, raising it if it is a thing. */
async function travelTo(address: string): Promise<Structure | null> {
  const at = offsetOf(address);
  arriveAt(at.x, at.z);
  const account = await accountAt(address);
  if (!account) return null;
  const structure = await standing(account);
  if (stands(account)) raise(structure);
  // a stone with forty posts on it is ten metres across, so stand off far
  // enough to see the whole of it rather than inside the first row
  player.z = Math.max(ALIGHT, structure.deep / 2 + ALIGHT * 0.8);
  player.y = ground.surfaceAt(player.x, player.z);
  settle();
  return structure;
}

const walker = renderer.add(figure(), new Float32Array(9), true);
/** Feet in world height, not height above the ground: you can be on a roof. */
const player = { x: 0, z: 150, y: 0, yaw: 0, pitch: -0.03, rise: 0 };

const coverage = new Coverage(renderer.gl, { x: player.x, z: player.z });

/**
 * The address this patch is named after, built from what it is: how much code
 * it carries, what that code hashes to, what it holds. It arrives a moment
 * after the page does, because it has to be asked for.
 */
void accountAt(HOME).then(async (account) => {
  if (account && stands(account)) raise(await standing(account));
});

/**
 * The chain overhead. The source is behind an interface on purpose: polling a
 * gateway is right for one player and wrong for a hundred, since the head of the
 * chain is the same for everybody. Swapping it for a socket changes nothing here.
 */
const traffic = new Traffic();

if (!location.search.includes('traffic=off')) {
  pollBlocks(chain.rpcs).start((block) => traffic.arrive(block));
}

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
let overShoulder = true;

/** What you last travelled to, for the line along the bottom. */
let arrived = '';

function feet(): number {
  return player.y;
}

function head(): [number, number, number] {
  return [player.x, player.y + EYE, player.z];
}

/** Whether a point is over a block's footprint, in that block's own frame. */
function over(block: (typeof obstacles)[number], x: number, z: number, margin = 0): boolean {
  const c = Math.cos(block.turn);
  const s = Math.sin(block.turn);
  const dx = x - block.x;
  const dz = z - block.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= block.halfWide + margin && Math.abs(lz) <= block.halfDeep + margin;
}

/**
 * The top of whatever stands at a point, for traffic to come down onto.
 * Nothing there means the ground itself.
 */
function landingAt(x: number, z: number): number {
  for (const block of obstacles) {
    if (over(block, x, z)) return block.top;
  }
  return ground.surfaceAt(x, z);
}

/** The highest thing underfoot: the ground, or the roof of whatever you are on. */
function supportAt(x: number, z: number, from: number): number {
  let floor = ground.surfaceAt(x, z);
  for (const block of obstacles) {
    if (block.top <= floor || block.top > from + STEP_UP) continue;
    if (over(block, x, z)) floor = Math.max(floor, block.top);
  }
  return floor;
}

/**
 * How far the camera is riding above where it would otherwise sit.
 *
 * Dragging the look down swings the camera into the hill behind you, and from
 * under the ground the world is inside out — it is a one-sided sheet, so it
 * vanishes and you see the backs of everything through it. The ground carries
 * the camera instead.
 */
let lift = 0;

/** How far behind the walker the camera sits, and how far clear of the ground. */
const BEHIND = 5.2;
const CLEAR = 0.6;

/**
 * Carry the camera over the ground behind the walker.
 *
 * Worked out along the whole boom rather than at its end, or a ridge halfway
 * along cuts through the view. It is one number, it moves continuously with the
 * land, and it is eased rather than applied — the ground under a boom is
 * triangles, and following them exactly makes the view judder over every seam.
 */
function ride(seconds: number): void {
  let wanted = 0;
  if (overShoulder) {
    const eyes = head();
    const look: [number, number, number] = [
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch),
    ];
    const SAMPLES = 6;
    for (let i = 1; i <= SAMPLES; i++) {
      const along = (i / SAMPLES) * BEHIND;
      const x = eyes[0] - look[0] * along;
      const z = eyes[2] - look[2] * along;
      const y = eyes[1] - look[1] * along + 1.1;
      wanted = Math.max(wanted, supportAt(x, z, y) + CLEAR - y);
    }
  }
  // catches up in about a fifth of a second, whatever the frame rate
  lift += (wanted - lift) * (1 - Math.exp(-seconds * 12));
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
  // painted in the world's coordinates, so it is still there when you come back
  const on = afoot();
  coverage.paint(on.x, on.z, OPENS_WITHIN, 1 / OPENS_IN, seconds);
  coverage.follow(on.x, on.z, seconds);
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
  // Ctrl+V to paste arrives as KeyV, and used to flip the camera mid-paste
  const typing = document.activeElement instanceof HTMLInputElement;
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !typing;
  if (event.code === 'KeyV' && plain && !event.repeat) overShoulder = !overShoulder;
  if (typing) return;
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
const GIRTH = 0.45;

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

    for (const block of obstacles) {
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


loop({
  step(seconds) {
    walk(seconds);
    fall(seconds);
    ride(seconds);
    traffic.step(seconds);
    // stepping onto a low roof rather than through it
    player.y = Math.max(player.y, supportAt(player.x, player.z, player.y + STEP_UP));
    uncover(seconds);
    since += seconds;
    if (since >= 0.5) {
      const fps = Math.round(frames / since);
      frames = 0;
      since = 0;
      stat.textContent =
        `${structures.length} standing · ${fps} fps · ${coverage.known} tiles known · ` +
        `block ${traffic.block || '…'}, ` +
        `${traffic.flying} passing, ${traffic.queued} to come · ` +
        `${arrived ? `at ${arrived} · ` : ''}` +
        `wasd to walk, shift to run, space to jump, home to go back, ` +
        `v for ${overShoulder ? 'first person' : 'third person'}, drag to look`;
      const on = afoot();
      const away = Math.round(Math.hypot(on.x, on.z));
      place.textContent =
        `${chain.name} · 0x${addressUnder(on.x, on.z)} · ${away} m from ${HOME.slice(0, 8)}… ${HOME === '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' ? ' (usdc)' : ''}`;
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

    // over the shoulder: step back along the look and up by whatever the
    // ground behind you asked for, which `ride` works out and smooths
    const at: [number, number, number] = overShoulder
      ? [eyes[0] - look[0] * BEHIND, eyes[1] - look[1] * BEHIND + 1.1 + lift, eyes[2] - look[2] * BEHIND]
      : eyes;
    const ahead: [number, number, number] = overShoulder
      ? eyes
      : [at[0] + look[0], at[1] + look[1], at[2] + look[2]];
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

    const ribbons = traffic.build(player.x, player.y, player.z, origin, landingAt);
    renderer.traffic(ribbons.vertices, ribbons.count);

    renderer.draw(
      camera,
      at,
      sky,
      light,
      SHADOWED ? { metres: SHADOW_HALF * 2, range: far - near } : null,
      VEILED ? coverage : null,
      origin,
    );
  },
});


/**
 * Going somewhere.
 *
 * Walking is for the couple of kilometres around you. Everything else is a long
 * way off — the plots mined so far landed thirty thousand kilometres from home
 * — so an address is how you travel, exactly as it is on the map.
 */
const where = going.querySelector<HTMLInputElement>('input')!;

going.addEventListener('submit', async (event) => {
  event.preventDefault();
  const typed = where.value.trim();
  if (!typed) return;

  const complain = (why: string) => {
    where.setCustomValidity(why);
    where.reportValidity();
  };

  let address: string;
  where.disabled = true;
  try {
    if (looksLikeName(typed)) {
      const resolved = await resolveName(typed);
      if (!resolved) {
        complain(`${typed} does not point at an address`);
        return;
      }
      address = resolved;
    } else {
      try {
        address = normalizeAddress(typed);
      } catch {
        complain('that is neither an address nor a name');
        return;
      }
    }
  } finally {
    where.disabled = false;
  }

  where.value = '';
  where.setCustomValidity('');
  where.blur();
  const found = await travelTo(address);
  arrived = found ? `${address.slice(0, 10)}…` : `${address.slice(0, 10)}… (empty ground)`;
});

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Home' || document.activeElement === where) return;
  event.preventDefault();
  void travelTo(HOME);
  arrived = '';
});


/**
 * Arriving by link.
 *
 * A place is a link here as much as on the map — `?at=0x…` puts you on that
 * ground, which is the only way to show anybody a plot thirty thousand
 * kilometres from home.
 */
const asked = new URLSearchParams(location.search).get('at');
if (asked) {
  void (async () => {
    try {
      const address = looksLikeName(asked) ? await resolveName(asked) : normalizeAddress(asked);
      if (!address) return;
      const found = await travelTo(address);
      arrived = found ? `${address.slice(0, 10)}…` : `${address.slice(0, 10)}… (empty ground)`;
    } catch {
      // a link with nonsense in it just leaves you at home
    }
  })();
}
