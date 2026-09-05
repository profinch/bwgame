import './style.css';
import { DEPTH, GRID, isWithin, normalizeAddress, normalizePrefix } from './coord';
import {
  addMark,
  ascend,
  cellAt,
  createMap,
  descend,
  draw,
  drawOverview,
  prefixLabel,
  visible,
} from './map';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('no #app');

app.innerHTML = `
  <header class="bar">
    <h1>ground state</h1>
    <p class="hint">debug map — click a cell to descend, backspace to come back up</p>
  </header>
  <section class="stage"><div class="frame"></div></section>
  <footer class="bar">
    <canvas class="overview" title="the whole world"></canvas>
    <nav class="route"></nav>
    <p class="scale"></p>
    <form class="jump">
      <input name="address" placeholder="0x… put an address on the map" spellcheck="false" autocomplete="off" />
    </form>
  </footer>
`;

const frame = app.querySelector<HTMLElement>('.frame')!;
const overview = app.querySelector<HTMLCanvasElement>('.overview')!;
const route = app.querySelector<HTMLElement>('.route')!;
const scale = app.querySelector<HTMLElement>('.scale')!;
const jump = app.querySelector<HTMLFormElement>('.jump')!;
const field = jump.querySelector<HTMLInputElement>('input')!;

const view = createMap(frame);

/**
 * The cell being shown lives in the URL, so a place can be sent to someone.
 * Sharing a link is not a courtesy here — it is how anything big gets seen.
 */
function readHash(): string {
  try {
    return normalizePrefix(decodeURIComponent(location.hash.slice(1)));
  } catch {
    return '';
  }
}

function writeHash(): void {
  const hash = view.prefix ? `#0x${view.prefix}` : '#';
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

/** The route so far, every step of it clickable, so you can back out anywhere. */
function drawRoute(): void {
  const label = prefixLabel(view.prefix);
  route.replaceChildren();

  const world = document.createElement('button');
  world.type = 'button';
  world.className = 'step world';
  world.textContent = '0x';
  world.title = 'back to the whole world';
  world.addEventListener('click', () => {
    view.prefix = '';
    render();
  });
  route.append(world);

  [...view.prefix].forEach((digit, index) => {
    const step = document.createElement('button');
    step.type = 'button';
    step.className = 'step';
    step.textContent = digit;
    step.title = `back to depth ${index + 1}`;
    step.addEventListener('click', () => {
      view.prefix = view.prefix.slice(0, index + 1);
      render();
    });
    route.append(step);
  });

  const rest = document.createElement('span');
  rest.className = 'rest';
  rest.textContent = label.rest;
  route.append(rest);
}

function render(): void {
  writeHash();
  draw(view);
  drawOverview(overview, view);
  drawRoute();

  const depth = view.prefix.length;
  const here = visible(view).length;
  const places = `${here} ${here === 1 ? 'place' : 'places'}`;
  scale.textContent =
    depth === 0
      ? `the whole world · ${places}`
      : `depth ${depth}/${DEPTH} · 1/${(GRID ** depth).toLocaleString('en')} of the world across · ${places}`;
}

view.canvas.addEventListener('click', (event) => {
  const cell = cellAt(view, event.offsetX, event.offsetY);
  descend(view, cell.x, cell.y);
  render();
});

view.canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  ascend(view);
  render();
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Backspace' || document.activeElement === field) return;
  event.preventDefault();
  ascend(view);
  render();
});

jump.addEventListener('submit', (event) => {
  event.preventDefault();
  let address: string;
  try {
    address = normalizeAddress(field.value);
  } catch {
    field.setCustomValidity('that is not an address');
    field.reportValidity();
    return;
  }

  addMark(view, address);
  field.value = '';
  field.setCustomValidity('');

  // stay where you are if the address is already in sight; otherwise pull back
  // far enough to show it standing among everything else, rather than alone
  if (!isWithin(view.prefix, address)) view.prefix = '';
  render();
});

field.addEventListener('input', () => field.setCustomValidity(''));
window.addEventListener('resize', render);
window.addEventListener('hashchange', () => {
  view.prefix = readHash();
  render();
});

view.prefix = readHash();
render();
