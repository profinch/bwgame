import './style.css';
import { DEPTH, SIDE, addressToPoint, normalizeAddress } from './coord';
import {
  type Camera,
  MIN_SPAN,
  centrePrefix,
  clampSpan,
  clampToWorld,
  fit,
  focus,
  gridDepth,
  pan,
  wholeWorld,
  worldFraction,
  zoomAt,
} from './camera';
import { looksLikeName, lookupName, resolveName } from './ens';
import { mark } from './logo';
import {
  type Cluster,
  addMark,
  createWorld,
  draw,
  drawOverview,
  hit,
  removeMark,
  renameMark,
} from './map';
import { balanceOf, formatEther, generate } from './wallet';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('no #app');

// inside the world's page the map has the world's header over it, not its own
if (new URLSearchParams(location.search).has('embedded')) document.body.classList.add('embedded');

app.innerHTML = `
  <header class="bar">
    <h1><span class="mark">${mark({ size: 24, rows: 7 })}</span>ground state</h1>
    <p class="hint">the ethereum address space — drag to move, wheel to zoom</p>
    <a class="walk" href="/?chain=sepolia">walk in the world</a>
  </header>

  <section class="stage">
    <div class="frame">
      <canvas class="map"></canvas>
      <div class="card" hidden></div>
      <div class="zoom">
        <button type="button" data-zoom="in" title="closer (+)">+</button>
        <button type="button" data-zoom="out" title="further out (−)">−</button>
        <button type="button" data-zoom="world" title="the whole world (esc)">⤢</button>
      </div>
    </div>
  </section>

  <footer class="bar">
    <canvas class="overview" title="the whole world"></canvas>
    <p class="where"><span class="prefix"></span><span class="rest"></span></p>
    <p class="scale"></p>
    <form class="jump">
      <input name="address" placeholder="0x… or a name.eth" spellcheck="false" autocomplete="off" />
      <button type="button" class="key">generate a key</button>
    </form>
  </footer>

  <aside class="drawer" hidden></aside>
`;

const canvas = app.querySelector<HTMLCanvasElement>('.map')!;
const frame = app.querySelector<HTMLElement>('.frame')!;
const card = app.querySelector<HTMLElement>('.card')!;
const overview = app.querySelector<HTMLCanvasElement>('.overview')!;
const prefixOut = app.querySelector<HTMLElement>('.prefix')!;
const restOut = app.querySelector<HTMLElement>('.rest')!;
const scaleOut = app.querySelector<HTMLElement>('.scale')!;
const jump = app.querySelector<HTMLFormElement>('.jump')!;
const field = jump.querySelector<HTMLInputElement>('input')!;
const keyButton = app.querySelector<HTMLButtonElement>('.key')!;
const drawer = app.querySelector<HTMLElement>('.drawer')!;

const world = createWorld();
let camera: Camera = wholeWorld();
let groups: Cluster[] = [];
let hovered: Cluster | null = null;

const short = (address: string) => `0x${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * Where you are lives in the URL, so a place can be sent to someone. Sharing a
 * link is not a courtesy here — it is how anything big is meant to get seen.
 */
function writeHash(): void {
  const hash = `#0x${centrePrefix(camera, gridDepth(camera.span))}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function readHash(): void {
  const hex = location.hash.slice(1).replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{1,40}$/.test(hex)) return;
  camera = focus(hex.padEnd(DEPTH, '0'), Number(SIDE) / 4 ** Math.max(0, hex.length - 2));
}

function render(): void {
  groups = draw(canvas, world, camera, hovered);
  drawOverview(overview, world, camera);

  const here = centrePrefix(camera, gridDepth(camera.span));
  prefixOut.textContent = `0x${here}`;
  restOut.textContent = '·'.repeat(Math.max(0, Math.min(24, DEPTH - here.length)));

  const across = worldFraction(camera.span);
  scaleOut.textContent =
    across < 2
      ? 'the whole world'
      : `1/${Math.round(across).toLocaleString('en')} of the world across`;
}

// --- what is this place -------------------------------------------------

function showCard(group: Cluster): void {
  const rows =
    group.marks.length === 1
      ? `<p class="name">${group.marks[0]!.name}</p>
         <p class="addr">0x${normalizeAddress(group.marks[0]!.address)}</p>
         <p class="go">click to come closer</p>`
      : `<p class="name">${group.marks.length} places, too close to tell apart</p>
         <ul>${group.marks
           .slice(0, 8)
           .map((mark) => `<li>${mark.name}<span>${short(normalizeAddress(mark.address))}</span></li>`)
           .join('')}</ul>
         ${group.marks.length > 8 ? `<p class="go">and ${group.marks.length - 8} more</p>` : ''}
         <p class="go">click to zoom in until they separate</p>`;
  card.innerHTML = rows;
  card.hidden = false;

  const box = frame.getBoundingClientRect();
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  card.style.left = `${Math.min(Math.max(group.x + 14, 8), box.width - width - 8)}px`;
  card.style.top = `${Math.min(Math.max(group.y - height / 2, 8), box.height - height - 8)}px`;
}

function setHovered(next: Cluster | null): void {
  if (next === hovered) return;
  hovered = next;
  canvas.style.cursor = next ? 'pointer' : dragging ? 'grabbing' : 'grab';
  card.hidden = true;
  render();
  if (next) showCard(next);
}

// --- moving around ------------------------------------------------------

let dragging: { x: number; y: number; moved: boolean } | null = null;

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  dragging = { x: event.clientX, y: event.clientY, moved: false };
});

canvas.addEventListener('pointermove', (event) => {
  const box = canvas.getBoundingClientRect();
  if (!dragging) {
    setHovered(hit(groups, event.clientX - box.left, event.clientY - box.top));
    return;
  }
  const dx = event.clientX - dragging.x;
  const dy = event.clientY - dragging.y;
  if (Math.abs(dx) + Math.abs(dy) < 2) return;
  dragging = { x: event.clientX, y: event.clientY, moved: true };
  setHovered(null);
  camera = pan(camera, dx, dy, box.width);
  writeHash();
  render();
});

canvas.addEventListener('pointerleave', () => setHovered(null));

function endDrag(event: PointerEvent): void {
  const wasDrag = dragging?.moved ?? false;
  if (dragging && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  dragging = null;
  if (wasDrag) return;

  const box = canvas.getBoundingClientRect();
  const group = hit(groups, event.clientX - box.left, event.clientY - box.top);
  if (!group) return;
  const closer =
    group.marks.length === 1
      ? focus(group.marks[0]!.address, MIN_SPAN * 256)
      : // open a crowd exactly wide enough that every one of them is on screen
        fit(group.marks.map((mark) => addressToPoint(mark.address)));
  card.hidden = true;
  hovered = null;
  glide(closer);
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => {
  dragging = null;
});

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const box = canvas.getBoundingClientRect();
    setHovered(null);
    camera = zoomAt(camera, event.clientX - box.left, event.clientY - box.top, Math.exp(event.deltaY * 0.0015), box.width);
    writeHash();
    render();
  },
  { passive: false },
);

/** Fly rather than jump, so it stays obvious where you ended up. */
const FLIGHT_MS = 460;
let flying: number | undefined;

function glide(target: Camera): void {
  if (flying !== undefined) cancelAnimationFrame(flying);
  const from = camera;
  const started = performance.now();

  const step = (now: number) => {
    const t = Math.min(1, (now - started) / FLIGHT_MS);
    const eased = 1 - (1 - t) ** 3;
    const share = BigInt(Math.round(eased * 1e6));
    camera = clampToWorld({
      x: from.x + ((target.x - from.x) * share) / 1_000_000n,
      y: from.y + ((target.y - from.y) * share) / 1_000_000n,
      // zoom moves geometrically; interpolating it linearly reads as a lurch
      span: clampSpan(from.span * (target.span / from.span) ** eased),
    });
    writeHash();
    render();
    flying = t < 1 ? requestAnimationFrame(step) : undefined;
  };
  flying = requestAnimationFrame(step);
}

function nudgeZoom(factor: number): void {
  const size = canvas.clientWidth;
  glide(zoomAt(camera, size / 2, size / 2, factor, size));
}

app.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((button) => {
  button.addEventListener('click', () => {
    const what = button.dataset.zoom;
    if (what === 'world') glide(wholeWorld());
    else nudgeZoom(what === 'in' ? 1 / 4 : 4);
  });
});

window.addEventListener('keydown', (event) => {
  if (document.activeElement === field) return;
  const step = canvas.clientWidth / 6;
  if (event.key === 'Escape') glide(wholeWorld());
  else if (event.key === '+' || event.key === '=') nudgeZoom(1 / 4);
  else if (event.key === '-') nudgeZoom(4);
  else if (event.key === 'ArrowLeft') camera = pan(camera, step, 0, canvas.clientWidth);
  else if (event.key === 'ArrowRight') camera = pan(camera, -step, 0, canvas.clientWidth);
  else if (event.key === 'ArrowUp') camera = pan(camera, 0, step, canvas.clientWidth);
  else if (event.key === 'ArrowDown') camera = pan(camera, 0, -step, canvas.clientWidth);
  else return;
  event.preventDefault();
  writeHash();
  render();
});

// --- putting things on the map ------------------------------------------

/**
 * Forty hex characters, or a name that stands for them. A name is the only
 * form of an address anybody says out loud, so the field takes both.
 */
jump.addEventListener('submit', async (event) => {
  event.preventDefault();
  const typed = field.value.trim();
  if (!typed) return;

  const complain = (why: string) => {
    field.setCustomValidity(why);
    field.reportValidity();
  };

  let address: string;
  let label: string | undefined;

  if (looksLikeName(typed)) {
    field.disabled = true;
    const resolved = await resolveName(typed);
    field.disabled = false;
    field.focus();
    if (!resolved) {
      complain(`${typed} does not point at an address`);
      return;
    }
    address = normalizeAddress(resolved);
    label = typed.toLowerCase();
  } else {
    try {
      address = normalizeAddress(typed);
    } catch {
      complain('that is neither an address nor a name');
      return;
    }
  }

  // the address goes on the map and stays put; going there is a click away
  addMark(world, address, label);
  field.value = '';
  field.setCustomValidity('');
  render();

  // an address may name itself; if it does, the map should use that name
  if (!label) {
    const found = await lookupName(address);
    if (found) {
      renameMark(world, address, found);
      render();
    }
  }
});

field.addEventListener('input', () => field.setCustomValidity(''));

/**
 * Thirty-two random bytes are an address nobody has ever stood on. The balance
 * that comes back is the point: the space is so large that landing on anything
 * at all is not a thing that happens.
 */
let generated: string | undefined;

keyButton.addEventListener('click', async () => {
  keyButton.disabled = true;

  // only the current key stays on the map; the last one is taken back off
  if (generated) removeMark(world, generated);
  const key = generate();
  generated = key.address;
  addMark(world, key.address, short(key.address));
  render();

  drawer.hidden = false;
  drawer.innerHTML = `
    <p class="name">a key nobody has ever held</p>
    <dl>
      <dt>address</dt><dd class="mono">0x${key.address}</dd>
      <dt>private key</dt><dd><button type="button" class="mono dim copy">0x${key.privateKey}</button></dd>
      <dt>balance</dt><dd class="mono balance dim">checking…</dd>
    </dl>
    <p class="go">throwaway — generated in this tab, never sent anywhere, do not fund it</p>
    <div class="row">
      <button type="button" class="go-there">jump</button>
      <button type="button" class="close">close</button>
    </div>
  `;
  drawer.querySelector('.close')!.addEventListener('click', () => {
    drawer.hidden = true;
  });
  drawer.querySelector('.go-there')!.addEventListener('click', () => {
    glide(focus(key.address, MIN_SPAN * 256));
  });

  const copy = drawer.querySelector<HTMLButtonElement>('.copy')!;
  const shown = `0x${key.privateKey}`;
  let restore: number | undefined;
  copy.title = 'click to copy';
  copy.addEventListener('click', async () => {
    let said = 'copied';
    try {
      await navigator.clipboard.writeText(shown);
    } catch {
      said = 'could not copy';
    }
    // the word stands in for the key, then the key comes back
    copy.textContent = said;
    clearTimeout(restore);
    restore = window.setTimeout(() => {
      copy.textContent = shown;
    }, 1200);
  });

  const wei = await balanceOf(key.address);
  const balance = drawer.querySelector<HTMLElement>('.balance');
  if (balance) {
    balance.classList.toggle('dim', wei === 0n || wei === null);
    balance.textContent =
      wei === null ? 'no answer from the chain' : `${formatEther(wei)} ETH`;
  }
  keyButton.disabled = false;
});

window.addEventListener('resize', render);
window.addEventListener('hashchange', () => {
  readHash();
  render();
});

readHash();
render();
