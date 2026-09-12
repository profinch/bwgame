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
import { INSTANCE_FLOATS, Renderer, once, type Sky } from './engine/renderer';
import { addressUnder, DEPTH, HOME, levelOff, offsetOf, rawHeightAt, withinWorld } from './engine/land';
import { boulder, box, facade, figure, groundUnder, terrain } from './engine/shapes';
import { Traffic, pollBlocks } from './engine/traffic';
import { CHAINS, chain } from './chains';
import { type Account, accountAt, holdingsOf } from './chain';
import { normalizeAddress } from './coord';
import { looksLikeName, resolveName } from './ens';
import { DRESSED_AT, type Structure, blocksOf, bouldersOf, instancesOf, stands, structureOf } from './places';
import { POINT, auger } from './auger';
import { type Stroke, glassOf, inkOf, strokesOf } from './blueprint';
import { Chips } from './chips';
import { claimAt, claimedPlots, formerPlots, implementationOf, isPlot, knownPlots, noteOf, ownerOf, plotNameOf, relicOf } from './plot';
import { ownGround } from './owning';
import { Panels } from './panels';
import { type Driver, Tour } from './tour';
import { Live } from './live';
import { bytesOf, placeOf } from './mine';
import { Stick, coarse } from './stick';
import { takeGround } from './taking';
import type { Obstacle } from './obstacles';
import { mark } from './logo';


const canvas = document.querySelector<HTMLCanvasElement>('#view');
const stat = document.querySelector<HTMLElement>('.stat');
const place = document.querySelector<HTMLElement>('.place');
const badge = document.querySelector<HTMLElement>('.mark');
const going = document.querySelector<HTMLFormElement>('.go');
const claiming = document.querySelector<HTMLElement>('.claim');
const owning = document.querySelector<HTMLElement>('.own');
const near = document.querySelector<HTMLElement>('.near');
if (!canvas || !stat || !place || !badge || !going || !claiming || !owning || !near)
  throw new Error('the page is missing its parts');
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
// contracts' buildings are drawn from a box cut fine enough for its walls to bend
const buildings = renderer.add(facade(), new Float32Array(0), true);
// except the relics of the first ground, which are stones and not boxes
const boulders = renderer.add(boulder(2, 1, 0.34, DRESSED_AT), new Float32Array(0), true);

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
  // a boulder sits in the ground, not on it
  if (structure.kind === 'relic' && structure.relic === 1) {
    return groundUnder(ground.surfaceAt, x, z, reach, structure.turn) - structure.tall * 0.18;
  }
  // a building stands on the highest ground under it and reaches down to the
  // lowest with a foundation, so a hill never comes up through its floor and
  // it never hangs over the slope — the land keeps its shape, the building
  // keeps its footing
  const hill = reliefUnder(structure);
  structure.sink = Math.max(0, hill.high - hill.low) + 0.1;
  return hill.high + 0.02;
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
 *
 * `vouched` is for a caller that watched the factory make this plot itself — a
 * claim of its own, whose receipt came back. The rule that the code says what
 * a thing is and the factory says that it is holds either way; this is only
 * about who heard the factory. Asking an indexer instead means waiting for it
 * to catch up, and a plot asked for in that gap comes back looking like an
 * ordinary contract: built, and so never drawn.
 */
async function standing(account: Account, vouched = false): Promise<Structure> {
  const holdings = account.codeSize === 0 ? await holdingsOf(account.address) : [];
  // a plot of an earlier ground is a relic, whatever else it is
  const relic = relicOf(account.code);
  if (relic) return structureOf(account, holdings, chain.coin, null, relic);
  // a plot is known by its code and vouched for by its factory, and stands as
  // a drawing until something is written into it or it is pointed at code —
  // in which case that code is what stands here
  const coded = isPlot(account.code);
  const claimed = coded && !vouched ? await claimAt(account.address) : null;
  if (!coded || !(vouched || claimed)) return structureOf(account, holdings, chain.coin);
  const note = claimed?.note ?? (await noteOf(account.address));
  const pointedAt =
    claimed?.implementation !== undefined ? claimed.implementation : await implementationOf(account.address);
  const code = pointedAt ? await accountAt(pointedAt) : null;
  const owner = claimed?.owner ?? (await ownerOf(account.address));
  const named = claimed?.name ?? (await plotNameOf(account.address));
  return structureOf(account, holdings, chain.coin, {
    note,
    code: code && code.codeSize > 0 ? code : null,
    owner,
    salt: claimed?.salt ?? null,
    name: named,
  });
}

/**
 * A plot that has just been changed by its owner — written into, pointed at
 * code, sealed — is taken down and put up again as what it now is. Vouched,
 * because the receipt is in hand and the indexer may not have heard yet.
 */
async function refresh(address: string): Promise<void> {
  const wanted = address.toLowerCase();
  const at = structures.findIndex((standing) => standing.address.toLowerCase() === wanted);
  const before = at >= 0 ? structures[at]! : null;
  if (at >= 0) structures.splice(at, 1);
  // the receipt is in hand, but the gateway asked may be a block behind it:
  // asked again a few times until it says something new, then taken as it is
  let now: Structure | null = null;
  for (let tries = 0; tries < 6; tries++) {
    const account = await accountAt(address);
    if (!account || !stands(account)) return settle();
    now = await standing(account, true);
    if (!before || !sameWords(before, now)) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!now) return settle();
  // a drawing that has become a building goes up out of the ground; a
  // building written into anew shows the writing coming up; anything else is
  // simply itself again
  if (before?.kind === 'framed' && now.kind !== 'framed') startRising(now);
  else if (before && before.plot?.note !== now.plot?.note) startInking(now);
  else raise(now);
}

/** Whether two standings of one plot say the same: owner, note, code, name. */
function sameWords(a: Structure, b: Structure): boolean {
  return (
    a.kind === b.kind &&
    a.plot?.owner?.toLowerCase() === b.plot?.owner?.toLowerCase() &&
    a.plot?.note === b.plot?.note &&
    (a.plot?.implementation ?? null) === (b.plot?.implementation ?? null) &&
    (a.plot?.name ?? null) === (b.plot?.name ?? null)
  );
}

/** Put a thing up where it stands. False if it was standing there already. */
function raise(structure: Structure): boolean {
  if (standingAt(structure.address)) return false;
  structures.push(structure);
  // a stone is laid on levelled ground, so it does not stand on a wall of its
  // own foundation on the low side — which is what stopped you walking up to it
  if (structure.kind === 'written' && level(structure)) rebuild();
  settle();
  return true;
}

function standingAt(address: string): boolean {
  const wanted = address.toLowerCase();
  return structures.some((standing) => standing.address.toLowerCase() === wanted);
}

/**
 * The plots round about, raised.
 *
 * The world is dark until somebody goes somewhere, and a place appears when it
 * is named. A plot is the one kind of thing the world can know about without
 * being told, because the factory that made it says so — so on arriving
 * anywhere, every plot within the ground underfoot is asked for and put up.
 * Abandoned if you have gone somewhere else before the answers are in.
 *
 * Asked again while you stand there, because a claim made on somebody else's
 * machine is not sent to yours — there is nothing here to send it — and a page
 * left open would otherwise show the world as it was when it loaded. What a
 * later ask turns up is `growing`: it goes up while you watch, the way your own
 * claim does, because that is when this world learned of it.
 */
async function raiseNearby(growing = false): Promise<void> {
  asking = true;
  try {
    const here = { x: origin.x, z: origin.z };
    // this factory's plots, and behind them the contracts the factories before
    // it made — which stand as the contracts they are, and nothing more
    const plots = [...(await claimedPlots()), ...(await formerPlots())];
    for (const { plot, note, implementation, name, owner } of plots) {
      if (origin.x !== here.x || origin.z !== here.z) return;
      const at = offsetOf(plot);
      if (Math.abs(at.x - here.x) > GROUND / 2 || Math.abs(at.z - here.z) > GROUND / 2) continue;
      // a drawing that has since been written into or pointed at code is taken
      // down and put up again as the building it now is; anything else standing
      // is left alone
      const already = structures.find((standing) => standing.address.toLowerCase() === plot.toLowerCase());
      if (already) {
        // standing already, and the index says the same: left alone. Said
        // differently — written into, pointed at code, named, handed on — it
        // is taken down and put up again as what it now is
        const changed =
          (already.plot?.note ?? '') !== (note ?? already.plot?.note ?? '') ||
          (implementation !== undefined && (already.plot?.implementation ?? null) !== (implementation ?? null)) ||
          (name !== undefined && (already.plot?.name ?? null) !== (name || null)) ||
          (owner !== undefined && already.plot?.owner?.toLowerCase() !== owner.toLowerCase());
        if (!changed) continue;
        structures.splice(structures.indexOf(already), 1);
      }
      const account = await accountAt(plot);
      if (!account || !stands(account)) continue;
      if (origin.x !== here.x || origin.z !== here.z) return;
      const structure = await standing(account);
      // new to this world, or a drawing become a building: it goes up while
      // you watch; written into anew: the writing comes up
      if (growing || (already?.kind === 'framed' && structure.kind !== 'framed')) startRising(structure);
      else if (already && (already.plot?.note ?? '') !== (structure.plot?.note ?? '')) startInking(structure);
      else raise(structure);
    }
  } finally {
    // however it ended — the answers in, the walker gone, a gateway refusing —
    // the next ask has to be able to go out
    asking = false;
  }
}

/** How often the world asks again what has been claimed near here. */
const ASKS_AGAIN_IN = 20_000;
/** Whether an ask is already out: two at once would ask the same question twice. */
let asking = false;

/**
 * Ask again, unless an ask is already out or nobody is looking.
 *
 * A tab out of sight asks nothing at all — a page in the background should cost
 * the machine and the gateways nothing — and asks once on coming back, so what
 * you return to is current rather than however old the last answer was.
 */
function askAgain(): void {
  if (asking || document.hidden) return;
  void raiseNearby(true);
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
    for (const block of blocksOf(structure, baseOf(structure), origin)) obstacles.push(block);
  }
  placeStones();
  renderer.update(boulders, bouldersOf(structures, baseOf, origin));
}

/** Every box of every structure into its batch: plain stone, or a building whose walls move. */
function placeStones(): void {
  const { plain, patterned } = instancesOf(structures, baseOf, origin);
  renderer.update(built, plain);
  renderer.update(buildings, patterned);
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

/**
 * Arriving is a descent.
 *
 * You are not set down on the ground; you come down onto it from far above,
 * over a few seconds, looking down at where you will stand. On the way the
 * rule of the map is in view — the dark ground, the small lit clearing you are
 * about to be in — and the landing says where you are. Any look of your own
 * ends it.
 */
const DESCENT_FROM = 380;
/** The first arrival is the page opening; it waits while the welcome is read. */
let descent = DESCENT_FROM;
let holdDescent = false;

/**
 * Which side of the address you come down on: a different one each time, so
 * two people following the same link do not land inside each other. Facing
 * the address, whichever side it is.
 */
let alightAngle = 0;

/**
 * A side of a point, `off` metres from it, that is inside the world: random,
 * tried a few times, and failing that the side that faces the middle of the
 * world. Home on Sepolia stands twelve metres from the world's edge.
 */
function sideInside(atX: number, atZ: number, off: number): number {
  for (let tries = 0; tries < 24; tries++) {
    const angle = Math.random() * 2 * Math.PI;
    const x = atX + Math.sin(angle) * off;
    const z = atZ + Math.cos(angle) * off;
    // within a hair: the clamp goes through world coordinates in the tens of
    // millions of metres, and the last bits do not survive the round trip
    const kept = withinWorld(x, z);
    if (Math.abs(kept.x - x) < 1e-3 && Math.abs(kept.z - z) < 1e-3) return angle;
  }
  const middle = withinWorld(-1e12, -1e12); // the far corner, so the middle is half way to it
  return Math.atan2(middle.x / 2 - atX, middle.z / 2 - atZ);
}

function arriveAt(x: number, z: number, off = ALIGHT): void {
  origin.x = x;
  origin.z = z;
  descent = DESCENT_FROM;
  // beside the address rather than on it: arriving dead on one puts you inside
  // whatever stands there, and the inside of a building is not drawn
  alightAngle = sideInside(x, z, off);
  player.x = Math.sin(alightAngle) * off;
  player.z = Math.cos(alightAngle) * off;
  // forward is -z at yaw zero; facing the address means facing back along the radius
  player.yaw = Math.atan2(player.x, player.z);
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

/**
 * Taking the ground you are standing on.
 *
 * Aimed wherever the walker is when the digging starts, and stopped whenever
 * the walker leaves — a search aimed at a place you are no longer standing in
 * is work spent on somebody else's view.
 */
const taking = takeGround(claiming, afoot, (plot) => {
  void raiseClaimed(plot);
});

/**
 * How near you have to stand to a plot of yours to work on it: within sight
 * of it, so a step back to look at it does not take the panel away.
 */
const WITHIN_REACH = 80;

/**
 * The plot of yours you are standing at, if any: the nearest plot within reach
 * whose owner is the wallet in the browser.
 */
function ownPlotHere(owner: string): Structure | null {
  const here = afoot();
  const wanted = owner.toLowerCase();
  let nearest: Structure | null = null;
  let best = Infinity;
  for (const structure of structures) {
    if (!structure.plot || structure.plot.owner?.toLowerCase() !== wanted) continue;
    const away = Math.hypot(structure.x - here.x, structure.z - here.z) - Math.max(structure.wide, structure.deep) / 2;
    if (away < WITHIN_REACH && away < best) {
      best = away;
      nearest = structure;
    }
  }
  if (nearest) return nearest;
  // not standing yet — just arrived, the chain not yet asked — but the index
  // already says whose ground this is: the panel need not wait for the walls
  for (const claimed of knownPlots()) {
    if (claimed.owner.toLowerCase() !== wanted) continue;
    const at = offsetOf(claimed.plot);
    const away = Math.hypot(at.x - origin.x - here.x, at.z - origin.z - here.z);
    if (away < WITHIN_REACH && away < best) {
      best = away;
      nearest = {
        kind: 'framed',
        address: claimed.plot,
        x: at.x - origin.x,
        z: at.z - origin.z,
        wide: 1,
        tall: 1,
        deep: 1,
        turn: 0,
        albedo: 0.5,
        roughness: 0.6,
        plot: {
          owner: claimed.owner,
          note: claimed.note ?? '',
          implementation: claimed.implementation ?? null,
          salt: claimed.salt ?? null,
          name: claimed.name ?? null,
        },
      } as Structure;
    }
  }
  return nearest;
}

const ownPanel = ownGround(owning, ownPlotHere, (plot) => void refresh(plot), (plot) => void travelTo(plot));

/** How long a plot just claimed takes to be drawn, in seconds. */
const BUILDS_IN = 10;
/** Plots on their way up. */
const rising: Structure[] = [];
/** How long a note just written takes to come up on the wall, in seconds, and the walls it is coming up on. */
const INKS_IN = 4;
const inking: Structure[] = [];

/** Put a building up with its writing still to come, sign by sign. */
function startInking(structure: Structure): void {
  if (!raise(structure)) return;
  structure.inked = 0;
  inking.push(structure);
}

/**
 * Put a plot up and let it be seen going up.
 *
 * Only what actually went up rises. A plot already standing is left exactly as
 * it is: a second copy of it drawn from nothing would be a building inside a
 * building, and the one already there — drawn whole — would go on being drawn
 * whole while the copy grew invisibly beside it.
 */
function startRising(structure: Structure): void {
  if (!raise(structure)) return;
  structure.grown = 0;
  rising.push(structure);
}

/**
 * A plot just claimed goes up where it is, not under your feet.
 *
 * You are not carried to it: it is over there, however far the digging got
 * you, and it stands up out of the ground while you watch — you are turned to
 * face it, so you see where. Walking over is yours to do.
 */
async function raiseClaimed(address: string): Promise<void> {
  // the gateway that saw the receipt can be a moment behind on the code
  let account: Account | null = null;
  for (let tries = 0; tries < 10 && !(account && account.codeSize > 0); tries++) {
    if (tries) await new Promise((wake) => setTimeout(wake, 1500));
    account = await accountAt(address);
  }
  if (!account || !stands(account)) return;
  // vouched for by the receipt: this factory made this plot a moment ago, so
  // the drawing does not wait on an indexer hearing about it
  const structure = await standing(account, true);
  startRising(structure);
  // and turn, unhurried, to where it is going up — to the middle of its
  // height, so a tall one is not looked at from under. Forward is -z at yaw
  // zero, and yaw turns the way you face.
  const here = afoot();
  const dx = structure.x - here.x;
  const dz = structure.z - here.z;
  const up = baseOf(structure) + structure.tall / 2 - (player.y + EYE);
  turning = {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.max(-1.2, Math.min(1.2, Math.atan2(up, Math.hypot(dx, dz)))),
  };
}

/**
 * Where the look is being carried to, if it is being carried anywhere.
 *
 * Only ever set by the world, and only to show something happening — a plot
 * going up — and dropped the moment the person looks for themselves. It is
 * a turn of the head, not a cut: the eye is eased there over a couple of
 * seconds, arriving well before the drawing has got past its plan.
 */
let turning: { yaw: number; pitch: number } | null = null;
/** How much of the remaining turn is taken each second. */
const TURNS_AT = 3.2;

function turn(seconds: number): void {
  // coming down: fast at first, gently at the end, done in about six seconds
  if (descent > 0 && !holdDescent) {
    descent *= Math.exp(-1.1 * seconds);
    descent -= 1.5 * seconds;
    if (descent < 0.05) descent = 0;
  }
  if (!turning) return;
  // the short way round, whichever side it is
  let dyaw = turning.yaw - player.yaw;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const dpitch = turning.pitch - player.pitch;
  const share = 1 - Math.exp(-TURNS_AT * seconds);
  player.yaw += dyaw * share;
  player.pitch += dpitch * share;
  if (Math.abs(dyaw) < 0.003 && Math.abs(dpitch) < 0.003) {
    player.yaw = turning.yaw;
    player.pitch = turning.pitch;
    turning = null;
  }
}

/** And go to whatever an address holds, raising it if it is a thing. */
async function travelTo(address: string): Promise<Structure | null> {
  taking.stop();
  const at = offsetOf(address);
  arriveAt(at.x, at.z);
  void raiseNearby();
  const account = await accountAt(address);
  if (!account) return null;
  const structure = await standing(account);
  if (stands(account)) raise(structure);
  // a stone with forty posts on it is ten metres across, so stand off far
  // enough to see the whole of it rather than inside the first row — on the
  // same side you came down on
  const off = Math.max(ALIGHT, Math.max(structure.wide, structure.deep) / 2 + ALIGHT * 0.8);
  player.x = Math.sin(alightAngle) * off;
  player.z = Math.cos(alightAngle) * off;
  player.y = ground.surfaceAt(player.x, player.z);
  settle();
  return structure;
}

const walker = renderer.add(figure(), new Float32Array(INSTANCE_FLOATS), true);
/** Everybody else here, as the same figure in white — or the auger, if they are digging. */
const others = renderer.add(figure(), new Float32Array(0), true);
const othersDigging = renderer.add(auger(), new Float32Array(0), true);
/** The corner of the world is where positions are measured from on the wire. */
const homeCell = placeOf(bytesOf(HOME));
/**
 * The live server, if this chain has one: who else is here, and word of a
 * claim the moment the indexer has it — which goes up while you watch, the
 * way your own does. The world works the same with nobody on the other end.
 */
const live = chain.live ? new Live(chain.live, chain.key, () => askAgain()) : null;
/** What the walker turns into while digging. Only one of the two is ever drawn. */
const drill = renderer.add(auger(), new Float32Array(INSTANCE_FLOATS), true);
/** How far the auger has turned. */
let spin = 0;
/** The ground it throws up. */
const chips = new Chips();
const spray = renderer.add(box(), new Float32Array(chips.instances.length), true);
/**
 * Feet in world height, not height above the ground: you can be on a roof.
 * The first stand is somewhere on a ring round home, a different somewhere
 * each time, so two people opening the page do not open it inside each other.
 */
const FIRST_RING = 150;
const firstAngle = sideInside(0, 0, FIRST_RING);
const player = {
  x: Math.sin(firstAngle) * FIRST_RING,
  z: Math.cos(firstAngle) * FIRST_RING,
  y: 0,
  yaw: Math.atan2(Math.sin(firstAngle) * FIRST_RING, Math.cos(firstAngle) * FIRST_RING),
  pitch: -0.03,
  rise: 0,
};

/**
 * Where you were when you left is where you come back to: the ground and the
 * spot on it, kept in this browser, a chain each. A link with a place in it
 * still wins, and the first time in is home.
 */
const LAST_STAND = `gs-last-${chain.key}`;
const cameBack = (() => {
  if (new URLSearchParams(location.search).has('at')) return false;
  try {
    const kept = JSON.parse(localStorage.getItem(LAST_STAND) ?? 'null') as
      | { ox: number; oz: number; x: number; z: number; yaw: number }
      | null;
    if (!kept || ![kept.ox, kept.oz, kept.x, kept.z, kept.yaw].every(Number.isFinite)) return false;
    const inside = withinWorld(kept.ox + kept.x, kept.oz + kept.z);
    if (Math.abs(inside.x - kept.ox - kept.x) > 1e-3 || Math.abs(inside.z - kept.oz - kept.z) > 1e-3) return false;
    origin.x = kept.ox;
    origin.z = kept.oz;
    player.x = kept.x;
    player.z = kept.z;
    player.yaw = kept.yaw;
    ground = terrain(GROUND, 340, origin);
    renderer.reshape(floor, ground.geometry);
    player.y = ground.surfaceAt(player.x, player.z);
    return true;
  } catch {
    return false;
  }
})();

const coverage = new Coverage(renderer.gl, { x: player.x, z: player.z });
if (cameBack) coverage.recentreOn(origin.x, origin.z);

/**
 * The address this patch is named after, built from what it is: how much code
 * it carries, what that code hashes to, what it holds. It arrives a moment
 * after the page does, because it has to be asked for.
 */
void accountAt(HOME).then(async (account) => {
  if (account && stands(account)) raise(await standing(account));
});
void raiseNearby();
setInterval(askAgain, ASKS_AGAIN_IN);
document.addEventListener('visibilitychange', askAgain);

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

  const asked = tour?.running ? takeDemoJump() : held.has('Space') || stick.takeJump();
  if (asked && standing && player.y <= floor + 0.01 && !diggingNow()) {
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
 *
 * Off for now, by the owner's decision of 11.09.2026: until the uncovered
 * ground is shared between people (a server that keeps the tiles), the dark
 * is one person's diary and reads as a bug to a newcomer. It comes back with
 * that server. `?veil=on` shows it meanwhile.
 */
const VEILED = location.search.includes('veil=on');

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

/**
 * Whether the keys are somebody else's right now: a field being typed into,
 * or anything in a panel or a bar holding the focus. The world's keys — walk,
 * jump, view, home — mean nothing then.
 */
function typing(): boolean {
  const on = document.activeElement;
  if (on instanceof HTMLInputElement || on instanceof HTMLTextAreaElement || on instanceof HTMLSelectElement) return true;
  return on instanceof HTMLElement && (on.isContentEditable || on.closest('.hud:not(.top), .subbar') !== null);
}

window.addEventListener('keydown', (event) => {
  if (tour?.running) return;
  // Ctrl+V to paste arrives as KeyV, and used to flip the camera mid-paste
  const busy = typing();
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !busy;
  if (event.code === 'KeyV' && plain && !event.repeat) overShoulder = !overShoulder;
  if (busy) return;
  held.add(event.code);
  if (event.shiftKey) held.add('Shift');
  if (WALKING.has(event.code)) event.preventDefault();
});
// and the same, for a thumb
document.querySelector<HTMLElement>('.touchpad-buttons .view')!.addEventListener('pointerdown', (event) => {
  overShoulder = !overShoulder;
  event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  held.delete(event.code);
  if (!event.shiftKey) held.delete('Shift');
});
window.addEventListener('blur', () => held.clear());

// whatever was uncovered should still be uncovered tomorrow
window.addEventListener('pagehide', () => {
  coverage.save();
  // where you stood, for next time
  try {
    localStorage.setItem(LAST_STAND, JSON.stringify({ ox: origin.x, oz: origin.z, x: player.x, z: player.z, yaw: player.yaw }));
  } catch {
    // then next time starts at home
  }
  // out of the room before the page goes, so nobody is left standing here
  live?.close();
});

let looking: { x: number; y: number } | null = null;

canvas.addEventListener('pointerdown', (event) => {
  if (tour?.running) return;
  canvas.setPointerCapture(event.pointerId);
  looking = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener('pointermove', (event) => {
  if (!looking) return;
  // looking for yourself ends any turn the world was making for you, and any descent
  turning = null;
  descent = 0;
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

/**
 * A thumb on a pad, on devices that have one. The keys still work alongside:
 * nothing here is either/or.
 */
const touch = coarse();
if (touch) {
  document.body.classList.add('touch');
  // a phone draws at up to one and a half device pixels a CSS pixel
  renderer.pixelRatio = 1.5;
}
const stick = new Stick(
  document.querySelector<HTMLElement>('.touchpad')!,
  document.querySelector<HTMLElement>('.touchpad .knob')!,
  document.querySelector<HTMLElement>('.touchpad-buttons .jump')!,
);

function walk(seconds: number): void {
  // digging is aimed at where you stand, so while it runs you stand there
  if (diggingNow()) return;
  const driven = tour?.running ?? false;
  const forward = driven
    ? demo.forward
    : (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) + stick.forward;
  const side = driven
    ? demo.side
    : (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0) + stick.side;
  if (!forward && !side) return;

  // a thumb half way out walks at half pace; a key is all the way
  const push = Math.min(1, Math.hypot(forward, side));
  const running = driven ? demo.run : held.has('Shift') || stick.run;
  const speed = (running ? RUN : WALK) * seconds * push;
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

/**
 * Nobody stands inside anybody else. People are not walls — you can push past
 * — but a walker standing in another is stepped out of them a little each
 * frame, by both clients, so two people who came down on one spot part.
 */
function apart(seconds: number): void {
  if (!live) return;
  for (const peer of live.peers.values()) {
    const dx = player.x - (peer.drawnX - homeCell.x - origin.x);
    const dz = player.z - (peer.drawnZ - homeCell.z - origin.z);
    const away = Math.hypot(dx, dz);
    if (away >= GIRTH * 2 || away < 1e-6) {
      // dead on top of each other: step off to a side — the one the room's
      // numbering gives me, so the other steps the other way and we part
      if (away < 1e-6) player.x += (live.me < peer.id ? 1 : -1) * GIRTH * seconds * 4;
      continue;
    }
    const push = Math.min(1, (GIRTH * 2 - away) * seconds * 6);
    player.x += (dx / away) * push;
    player.z += (dz / away) * push;
  }
}

/**
 * A drawing's strokes, worked out once for where it stands.
 *
 * They depend on the plot and on the ground it sits on, neither of which moves
 * between frames — only the eye does, and the eye is applied when the strokes
 * are laid as ink. So they are kept, and worked out again only when the ground
 * under the plot is built anew and its base comes out different.
 */
const strokesKept = new WeakMap<Structure, { base: number; strokes: Stroke[] }>();

function strokesFor(structure: Structure, base: number): Stroke[] {
  const kept = strokesKept.get(structure);
  if (kept && kept.base === base) return kept.strokes;
  const strokes = strokesOf(structure, base, origin);
  strokesKept.set(structure, { base, strokes });
  return strokes;
}

/**
 * Black or white. The whole page turns over — the world included, since the
 * sky and the ground are drawn in tones and a tone has an opposite — and the
 * choice is kept in this browser, under the same key as on bwtoken.io.
 */
{
  const tg = document.querySelector<HTMLElement>('#tg');
  const pair = document.querySelector<HTMLElement>('#pair');
  if (tg && pair) {
    const root = document.documentElement;
    let rot = root.dataset.t === 'dark' ? 180 : 0;
    pair.style.transform = `rotate(${rot}deg)`;
    tg.setAttribute('aria-checked', String(root.dataset.t === 'dark'));
    tg.addEventListener('click', () => {
      rot += 180;
      pair.style.transform = `rotate(${rot}deg)`;
      root.dataset.t = root.dataset.t === 'dark' ? 'light' : 'dark';
      tg.setAttribute('aria-checked', String(root.dataset.t === 'dark'));
      try {
        localStorage.setItem('bw-theme', root.dataset.t);
      } catch {
        // then it is white again next time
      }
    });
  }
}

/** The onboarding, started from the welcome or the menu; the menu's corners follow it. */
let tour: Tour | null = null;
let startTour: () => void = () => {};
/** What the tour is doing with the keys and the pointer while it drives. */
const demo = { forward: 0, side: 0, run: false, jump: false, yawRate: 0, pitchRate: 0, dig: false, rate: 0, claimHeld: false };
/** The one other player the tour brings along, who is nobody. */
const MOCK_PEER = -1;

/** A plot of the tour's own, at an address, with a note or without: never from the chain. */
function mockPlot(address: string, note: string): Structure {
  const account: Account = { address, codeSize: 2271, code: `0x${'a5'.repeat(2271)}`, balance: 0n, nonce: 1 };
  const structure = structureOf(account, [], chain.coin, { note, code: null, owner: '0x000000000000000000000000000000000000d3a0', salt: null, name: undefined });
  structure.mock = true;
  return structure;
}
/** Whether the auger is in the ground: for real, or for show. */
const diggingNow = () => taking.digging || demo.dig;
/** Where the person stood when the tour began, to be put back there after. */
let beforeTour: { ox: number; oz: number; x: number; z: number; yaw: number; pitch: number } | null = null;

function takeDemoJump(): boolean {
  const asked = demo.jump;
  demo.jump = false;
  return asked;
}

/**
 * The menu, as on bwtoken.io. The corners frame the whole of it until a
 * section is chosen. "map" brings the map up in this page under this header,
 * and frames itself. "panels" frames itself and slides down a row a panel,
 * each put away or brought back with a press. "blockchain" frames itself and slides the sub-bar down
 * with the worlds listed, this one bright, the one to take ground on first;
 * choosing another world is walking out of this one — the page reloads,
 * nothing carries over, as nothing should — and a click elsewhere or on this
 * world sends the bar back up and the corners back round the whole menu.
 */
{
  const header = document.querySelector<HTMLElement>('.hud.top');
  const menu = document.querySelector<HTMLElement>('.navlinks');
  const frame = document.querySelector<HTMLElement>('.navlinks .frame');
  const tourLink = document.querySelector<HTMLAnchorElement>('#onboarding');
  const mapLink = document.querySelector<HTMLAnchorElement>('#map');
  const panelsLink = document.querySelector<HTMLAnchorElement>('#panels');
  const chainLink = document.querySelector<HTMLAnchorElement>('#blockchain');
  const clip = document.querySelector<HTMLElement>('#subclip');
  const bar = document.querySelector<HTMLElement>('#subbar');
  const sel = document.querySelector<HTMLElement>('#wsel');
  const cur = document.querySelector<HTMLElement>('#wcur');
  const list = document.querySelector<HTMLElement>('#wlist');
  const mapView = document.querySelector<HTMLIFrameElement>('#mapview');
  const panelBar = document.querySelector<HTMLElement>('#panelbar');
  const panelList = document.querySelector<HTMLElement>('#plist');
  const tourCard = document.querySelector<HTMLElement>('.hud.tour');
  if (header && menu && frame && tourLink && mapLink && panelsLink && chainLink && clip && bar && sel && cur && list && mapView
    && panelBar && panelList && tourCard) {
    cur.textContent = chain.name;
    // sepolia first: the world where ground is taken
    const worlds = [CHAINS.sepolia, CHAINS.mainnet].filter((it) => it !== undefined);
    const rows: HTMLElement[] = [];
    for (const other of worlds) {
      const row = document.createElement(other.key === chain.key ? 'button' : 'a');
      row.className = other.key === chain.key ? 'wopt on' : 'wopt';
      row.textContent = other.name;
      if (row instanceof HTMLAnchorElement) {
        const to = new URL(location.href);
        to.search = `?chain=${other.key}`;
        to.hash = '';
        row.href = to.toString();
      } else {
        row.setAttribute('type', 'button');
      }
      rows.push(row);
    }
    list.replaceChildren(...rows);
    // closed, one row: this world; unfolded, a row a world
    const ROW = 28;
    const PAD = 4;
    const unfold = (open: boolean) => {
      document.body.classList.toggle('listopen', open);
      sel.setAttribute('aria-expanded', String(open));
      bar.style.height = `${PAD + (open ? rows.length : 1) * ROW}px`;
    };
    // the shadow reaches 24px to the sides and about 20px down
    const ROOM = 24;
    clip.style.height = `${PAD + rows.length * ROW + ROOM}px`;

    // the corners round a link, or round the whole menu; and the bar under
    // the whole menu: measured, as on the site, so they follow the text
    const place = (target: HTMLElement | 'group') => {
      const at = menu.getBoundingClientRect();
      const links = menu.querySelectorAll('a');
      const first = links[0]!.getBoundingClientRect();
      const last = links[links.length - 1]!.getBoundingClientRect();
      const box =
        target === 'group'
          ? { l: first.left - at.left - 2, t: first.top - at.top - 1, w: last.right - first.left + 4, h: first.height + 2 }
          : (() => {
              const r = target.getBoundingClientRect();
              return { l: r.left - at.left - 2, t: r.top - at.top - 1, w: r.width + 4, h: r.height + 2 };
            })();
      frame.style.left = `${box.l}px`;
      frame.style.top = `${box.t}px`;
      frame.style.width = `${box.w}px`;
      frame.style.height = `${box.h}px`;
      clip.style.left = `${Math.round(first.left) - ROOM}px`;
      clip.style.width = `${Math.round(last.right - first.left) + 2 * ROOM}px`;
      const under = Math.round(header.getBoundingClientRect().bottom);
      clip.style.top = `${under}px`;
    };

    // the panels: down with the menu's "panels", a row a panel, the arrow takes it away
    const panels = new Panels(panelList);
    panelBar.style.height = `${PAD + panels.count * ROW}px`;
    clip.style.height = `${PAD + Math.max(rows.length, panels.count) * ROW + ROOM}px`;

    let section: 'onboarding' | 'map' | 'panels' | 'blockchain' | null = null;
    const show = (next: typeof section) => {
      section = next;
      unfold(false);
      document.body.classList.toggle('subopen', next === 'blockchain');
      document.body.classList.toggle('panelsopen', next === 'panels');
      tourLink.classList.toggle('active', next === 'onboarding');
      mapLink.classList.toggle('active', next === 'map');
      panelsLink.classList.toggle('active', next === 'panels');
      chainLink.classList.toggle('active', next === 'blockchain');
      panelsLink.setAttribute('aria-expanded', String(next === 'panels'));
      chainLink.setAttribute('aria-expanded', String(next === 'blockchain'));
      document.body.classList.toggle('onmap', next === 'map');
      // back from a page opened on the map, the world shows and fades run as usual
      if (next !== 'map') document.documentElement.classList.remove('mapfirst');
      // the map fades in as the site's pages do — the first time only once
      // it has loaded, so that what fades in is the map and not a blank page
      if (next === 'map') {
        if (!mapView.src) {
          mapView.src = '/map.html?embedded';
          mapView.addEventListener('load', () => mapView.classList.toggle('on', section === 'map'), { once: true });
        } else {
          mapView.classList.add('on');
        }
      } else {
        mapView.classList.remove('on');
      }
      history.replaceState(null, '', next === 'map' ? '#map' : location.pathname + location.search);
      place(framed());
    };
    const framed = () =>
      section === 'onboarding' ? tourLink : section === 'map' ? mapLink : section === 'panels' ? panelsLink : section === 'blockchain' ? chainLink : 'group';

    // the onboarding drives the world through this; it is the keys and the pointer, as calls
    const driver: Driver = {
      look: (yawRate, pitchRate) => {
        demo.yawRate = yawRate;
        demo.pitchRate = pitchRate;
        turning = null;
        descent = 0;
      },
      walk: (forward, side, run) => {
        demo.forward = forward;
        demo.side = side;
        demo.run = run;
      },
      jump: () => {
        demo.jump = true;
      },
      stop: () => {
        demo.forward = 0;
        demo.side = 0;
        demo.run = false;
        demo.yawRate = 0;
        demo.pitchRate = 0;
      },
      type: async (text, wait) => {
        where.value = '';
        for (const sign of text) {
          where.value += sign;
          await wait(110);
        }
      },
      go: async () => {
        const typed = where.value.trim();
        where.value = '';
        try {
          const address = looksLikeName(typed) ? await resolveName(typed) : normalizeAddress(typed);
          if (address) await travelTo(address);
        } catch {
          // the name did not resolve: the tour goes on where it is
        }
      },
      section: (which) => {
        if (which === null) {
          if (section !== 'onboarding') show('onboarding');
          return;
        }
        show(which);
        tourLink.classList.add('active');
      },
      unfoldWorlds: () => unfold(true),
      togglePanel: (key) => {
        for (const row of panelList.querySelectorAll<HTMLButtonElement>('.wopt')) if (row.textContent === key) row.click();
      },
      flipTheme: () => document.querySelector<HTMLElement>('#tg')?.click(),
      mark: (selector) => {
        for (const el of document.querySelectorAll('.tour-marked')) el.classList.remove('tour-marked');
        if (selector) document.querySelector(selector)?.classList.add('tour-marked');
      },
      // --- the shown, not done: nothing below touches the chain ------------
      dig: (on, rate) => {
        demo.dig = on;
        demo.rate = rate;
        taking.pause(on || demo.claimHeld);
      },
      claimSays: (said, count, earlier) => {
        demo.claimHeld = true;
        taking.pause(true);
        claiming.querySelector<HTMLElement>('.claim-said')!.textContent = said;
        claiming.querySelector<HTMLElement>('.claim-count')!.textContent = count;
        const more = claiming.querySelector<HTMLElement>('.claim-earlier')!;
        more.hidden = !earlier;
        more.textContent = earlier ?? '';
      },
      mockClaim: () => {
        // shown again — the step gone back to — the plot before comes down first
        for (let i = structures.length - 1; i >= 0; i--) if (structures[i]!.mock) structures.splice(i, 1);
        for (let i = rising.length - 1; i >= 0; i--) if (rising[i]!.mock) rising.splice(i, 1);
        for (let i = inking.length - 1; i >= 0; i--) if (inking[i]!.mock) inking.splice(i, 1);
        // a plot of the tour's own, a few steps ahead: the address whose cell that is
        const ahead = { x: player.x - Math.sin(player.yaw) * 6, z: player.z - Math.cos(player.yaw) * 6 };
        const cell = addressUnder(ahead.x, ahead.z);
        let tail = '';
        for (let i = 0; i < 40 - cell.length; i++) tail += '0123456789abcdef'[Math.floor(Math.random() * 16)];
        const address = `0x${cell}${tail}`;
        const structure = mockPlot(address, '');
        startRising(structure);
        return address;
      },
      mockWrite: (address, note) => {
        if (!address) return;
        const at = structures.findIndex((it) => it.address === address);
        if (at >= 0) structures.splice(at, 1);
        for (let i = inking.length - 1; i >= 0; i--) if (inking[i]!.address === address) inking.splice(i, 1);
        startInking(mockPlot(address, note));
      },
      ownSays: (said, note) => {
        ownPanel.pause(true);
        owning.hidden = false;
        owning.querySelector<HTMLElement>('.own-said')!.textContent = said;
        owning.querySelector<HTMLElement>('.own-note')!.textContent = note;
        owning.querySelector<HTMLElement>('.own-connect')!.hidden = true;
        owning.querySelector<HTMLElement>('.own-list')!.hidden = true;
        for (const form of owning.querySelectorAll<HTMLElement>('form, .own-do')) form.hidden = false;
      },
      typeInto: async (selector, text, wait) => {
        const field = document.querySelector<HTMLInputElement>(selector);
        if (!field) return;
        field.value = '';
        for (const sign of text) {
          field.value += sign;
          await wait(110);
        }
      },
      clearField: (selector) => {
        const field = document.querySelector<HTMLInputElement>(selector);
        if (field) field.value = '';
      },
      peer: (dx, dz, dig) => {
        if (!live) return;
        const x = homeCell.x + origin.x + player.x + dx;
        const z = homeCell.z + origin.z + player.z + dz;
        const had = live.peers.get(MOCK_PEER);
        const yaw = Math.atan2(-(dx - (had ? had.x - homeCell.x - origin.x - player.x : dx)), -(dz - (had ? had.z - homeCell.z - origin.z - player.z : dz)));
        if (had) {
          had.x = x;
          had.z = z;
          had.dig = dig;
          had.yaw = yaw;
        } else {
          live.peers.set(MOCK_PEER, { id: MOCK_PEER, x, z, yaw, dig, drawnX: x, drawnZ: z, drawnYaw: yaw });
        }
      },
      peerGone: () => {
        live?.peers.delete(MOCK_PEER);
      },
      clean: () => {
        // everything the tour put up comes down, and the panels speak for themselves again
        demo.dig = false;
        demo.claimHeld = false;
        for (let i = structures.length - 1; i >= 0; i--) if (structures[i]!.mock) structures.splice(i, 1);
        for (let i = rising.length - 1; i >= 0; i--) if (rising[i]!.mock) rising.splice(i, 1);
        for (let i = inking.length - 1; i >= 0; i--) if (inking[i]!.mock) inking.splice(i, 1);
        settle();
        live?.peers.delete(MOCK_PEER);
        taking.pause(false);
        ownPanel.pause(false);
      },
    };
    // the onboarding: the corners on its word while it runs; when it ends,
    // whoever watched it is put back where they stood before it began
    tour = new Tour(tourCard, driver, () => {
      driver.clean();
      if (beforeTour) {
        if (origin.x !== beforeTour.ox || origin.z !== beforeTour.oz) arriveAt(beforeTour.ox, beforeTour.oz);
        player.x = beforeTour.x;
        player.z = beforeTour.z;
        player.yaw = beforeTour.yaw;
        player.pitch = beforeTour.pitch;
        player.y = ground.surfaceAt(player.x, player.z);
        descent = 0;
        beforeTour = null;
      }
      show(null);
    });
    startTour = () => {
      if (tour!.running) return;
      beforeTour = { ox: origin.x, oz: origin.z, x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch };
      taking.stop();
      show('onboarding');
      tour!.start();
    };
    tourLink.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      startTour();
    });
    tourCard.addEventListener('click', (event) => event.stopPropagation());

    // the corners' first placing is not a move: no transition until they are placed
    frame.style.transition = 'none';
    show(location.hash === '#map' ? 'map' : null);
    void frame.offsetWidth;
    frame.style.transition = '';
    addEventListener('resize', () => place(framed()));

    mapLink.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      show('map');
    });
    chainLink.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // pressed again: the bar goes back up, and the corners round the menu
      show(section === 'blockchain' ? null : 'blockchain');
    });
    panelsLink.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      show(section === 'panels' ? null : 'panels');
    });
    // a row pressed keeps the bar down: several may be put away in a row
    panelBar.addEventListener('click', (event) => event.stopPropagation());
    // the arrow on the panels' bar is the way back to the game
    panelBar.querySelector<HTMLElement>('.subarrow')!.addEventListener('click', (event) => {
      event.stopPropagation();
      show(null);
    });
    const unfoldOrFold = (event: Event) => {
      event.stopPropagation();
      unfold(!document.body.classList.contains('listopen'));
    };
    sel.addEventListener('click', unfoldOrFold);
    bar.querySelector<HTMLElement>('.subarrow')!.addEventListener('click', unfoldOrFold);
    list.addEventListener('click', (event) => {
      event.stopPropagation();
      // this world chosen again: the list folds, the bar stays
      if (event.target instanceof HTMLButtonElement) unfold(false);
    });
    document.addEventListener('click', () => {
      // while the tour drives, a click is nobody's
      if (tour?.running) return;
      // the worlds' bar folds to this world first and goes up next; the panels'
      // bar, whose open state is the list, goes straight up as it is
      if (document.body.classList.contains('listopen')) unfold(false);
      else if (section === 'blockchain' || section === 'panels') show(null);
    });
  }
}

/**
 * What there is to go and see: the plots standing on this ground, nearest
 * first, by name where they have one. An empty world gives nobody a reason to
 * walk; this line is the reason.
 */
function whatIsNear(on: { x: number; z: number }): string {
  const plots = structures
    .filter((structure) => structure.plot)
    .map((structure) => ({ structure, away: Math.hypot(structure.x - on.x, structure.z - on.z) }))
    .sort((a, b) => a.away - b.away)
    .slice(0, 3);
  if (plots.length === 0) return 'no plots on this ground yet — it is yours to take';
  const said = plots.map(({ structure, away }) => {
    const label = structure.plot!.name && chain.ens ? `${structure.plot!.name}.${chain.ens.parent}` : `${structure.address.slice(0, 10)}…`;
    const what = structure.kind === 'framed' ? 'drawn' : 'built';
    return `${label} ${away >= 1000 ? `${(away / 1000).toFixed(1)} km` : `${Math.round(away)} m`}, ${what}`;
  });
  return `near: ${said.join(' · ')}`;
}

/**
 * The first time in: what this is, over the world, until they step into it.
 * Once seen, not shown again on this browser; the world itself is the rest of
 * the explanation.
 */
const welcome = document.querySelector<HTMLElement>('.welcome');
if (welcome) {
  let seen = false;
  try {
    seen = localStorage.getItem('gs:welcomed') === 'yes';
  } catch {
    // no storage: shown every time, which is no harm
  }
  // `?welcome` shows it again on purpose: for a recording, or to read it twice
  if (!seen || new URLSearchParams(location.search).has('welcome')) {
    welcome.hidden = false;
    holdDescent = true;
    welcome.querySelector<HTMLElement>('.mark')!.innerHTML = mark({ size: 18, rows: 7 });
    welcome.querySelector<HTMLElement>('.welcome-keys')!.textContent = touch
      ? 'stick to walk · drag to look · type an address or a name to go there'
      : 'wasd to walk · shift to run · drag to look · type an address or a name to go there';
    const leave = () => {
      welcome.hidden = true;
      holdDescent = false;
      try {
        localStorage.setItem('gs:welcomed', 'yes');
      } catch {
        // then it is shown again next time
      }
    };
    welcome.querySelector<HTMLButtonElement>('.welcome-go')!.addEventListener('click', leave);
    // the first time in, the welcome offers the walk round; later it is the menu's
    const showMe = welcome.querySelector<HTMLButtonElement>('.welcome-tour')!;
    showMe.hidden = Tour.walked();
    showMe.addEventListener('click', () => {
      leave();
      startTour();
    });
  }
}

// --- the loop -------------------------------------------------------------

let frames = 0;
let since = 0;


loop({
  step(seconds) {
    walk(seconds);
    apart(seconds);
    // the edge of the world is a wall
    {
      const on = afoot();
      const kept = withinWorld(on.x, on.z);
      player.x += kept.x - on.x;
      player.z += kept.z - on.z;
    }
    turn(seconds);
    fall(seconds);
    ride(seconds);
    // whatever is going up, goes up a little more — by the loop's own clock
    // and not the wall's, because a tab out of sight takes no steps: a plot
    // waits where it is rather than being finished while nobody is watching
    // the tour looking round for you
    if (tour?.running) {
      player.yaw += demo.yawRate * seconds;
      player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch + demo.pitchRate * seconds));
    }
    if (rising.length || inking.length) {
      for (let i = rising.length - 1; i >= 0; i--) {
        const structure = rising[i]!;
        structure.grown = Math.min(1, (structure.grown ?? 0) + seconds / BUILDS_IN);
        if (structure.grown >= 1) rising.splice(i, 1);
      }
      for (let i = inking.length - 1; i >= 0; i--) {
        const structure = inking[i]!;
        structure.inked = Math.min(1, (structure.inked ?? 0) + seconds / INKS_IN);
        if (structure.inked >= 1) inking.splice(i, 1);
      }
      placeStones();
    }
    // the auger turns with the work: a little on its own, more as the rate
    // climbs — and the ground comes up round it in proportion
    const rateNow = demo.dig ? demo.rate : taking.rate;
    if (diggingNow()) spin += seconds * 2 * Math.PI * (0.4 + Math.min(1, rateNow / 4e7));
    else if (live && [...live.peers.values()].some((peer) => peer.dig)) spin += seconds * 2 * Math.PI * 0.6;
    chips.step(
      seconds,
      diggingNow() ? { x: player.x, y: feet(), z: player.z } : null,
      rateNow,
      GRAVITY,
    );
    traffic.step(seconds);
    // where you are, for everybody else; and everybody else a little closer to
    // where they were last said to be
    if (live) {
      const on = afoot();
      live.say(homeCell.x + on.x, homeCell.z + on.z, player.yaw, taking.digging);
      live.step(seconds);
    }
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
        `${taking.digging ? 'digging: stop to walk · ' : ''}` +
        `${overShoulder ? 'over the shoulder' : 'first person'}`;
      const on = afoot();
      near.textContent = whatIsNear(on);
      const away = Math.round(Math.hypot(on.x, on.z));
      place.textContent =
        `${chain.name} · depth ${DEPTH} · 0x${addressUnder(on.x, on.z)} · ${away} m from ${HOME.slice(0, 10)}…${HOME.slice(-4)}${HOME === '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' ? ' (usdc)' : ''}`;
    }
  },
  draw() {
    frames++;

    // the walker stands where you are, facing where you look — unless they are
    // digging, in which case the auger stands there and turns, and the walker
    // is scaled away to nothing
    const digging = diggingNow();
    renderer.update(
      walker,
      new Float32Array([player.x, feet(), player.z, digging ? 0 : 1, digging ? 0 : 1, digging ? 0 : 1, player.yaw, 0.2, 0.6, 0]),
    );
    // the screw stands half sunk: the work is in the ground, not on it
    renderer.update(
      drill,
      new Float32Array([player.x, feet() - POINT / 2, player.z, digging ? 1 : 0, digging ? 1 : 0, digging ? 1 : 0, spin, 0.2, 0.6, 0]),
    );
    renderer.update(spray, chips.instances);
    // everybody else, if they are on this patch of ground
    if (live) {
      const standing: number[] = [];
      const digging: number[] = [];
      for (const peer of live.peers.values()) {
        const x = peer.drawnX - homeCell.x - origin.x;
        const z = peer.drawnZ - homeCell.z - origin.z;
        if (Math.abs(x) > GROUND / 2 || Math.abs(z) > GROUND / 2) continue;
        const y = supportAt(x, z, ground.surfaceAt(x, z) + STEP_UP);
        // their auger turns with ours: the rate is theirs, but the turning is a sign, not a measure
        if (peer.dig) digging.push(x, y - POINT / 2, z, 1, 1, 1, spin, 0.92, 0.6, 0);
        else standing.push(x, y, z, 1, 1, 1, peer.drawnYaw, 0.92, 0.6, 0);
      }
      renderer.update(others, new Float32Array(standing));
      renderer.update(othersDigging, new Float32Array(digging));
    }

    const eyes = head();
    const look: [number, number, number] = [
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch),
    ];

    // over the shoulder: step back along the look and up by whatever the
    // ground behind you asked for, which `ride` works out and smooths —
    // unless you are still coming down, in which case the eye is up there,
    // a little behind, looking at where you will stand
    let at: [number, number, number] = overShoulder
      ? [eyes[0] - look[0] * BEHIND, eyes[1] - look[1] * BEHIND + 1.1 + lift, eyes[2] - look[2] * BEHIND]
      : eyes;
    let ahead: [number, number, number] = overShoulder
      ? eyes
      : [at[0] + look[0], at[1] + look[1], at[2] + look[2]];
    if (descent > 0) {
      // high up the eye looks at the feet; over the last stretch the look is
      // carried across to where it will rest, so the landing does not snap
      const feetAt: [number, number, number] = [player.x, feet(), player.z];
      const w = Math.min(1, descent / 40);
      at = [at[0], at[1] + descent, at[2] + descent * 0.35];
      ahead = [
        ahead[0] + (feetAt[0] - ahead[0]) * w,
        ahead[1] + (feetAt[1] - ahead[1]) * w,
        ahead[2] + (feetAt[2] - ahead[2]) * w,
      ];
    }
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
    // the plots not yet written into are drawings, and go down in the same ink
    const drawn: number[] = [];
    for (const structure of structures) {
      if (structure.kind !== 'framed') continue;
      const base = baseOf(structure);
      const grown = structure.grown ?? 1;
      inkOf(strokesFor(structure, base), grown, at, drawn);
      glassOf(structure, base, origin, grown, drawn);
    }
    const inked = ribbons.count * 4;
    const ink = new Float32Array(inked + drawn.length);
    ink.set(ribbons.vertices.subarray(0, inked));
    ink.set(drawn, inked);
    renderer.traffic(ink, ribbons.count + drawn.length / 4);

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
  // h is home: a Mac keyboard has no Home key, and one key is one word to learn.
  // Home is where the first time in begins — somewhere on the ring round the
  // factory, facing it — not the spot beside it a travel ends on
  if (event.code !== 'KeyH' || typing() || tour?.running) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  taking.stop();
  arriveAt(0, 0, FIRST_RING);
  void raiseNearby();
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
