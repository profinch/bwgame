import './style.css';
import { DEPTH, GRID } from './coord';
import { normalizePrefix } from './coord';
import { ascend, cellAt, createMap, descend, draw, goTo, prefixLabel, visible } from './map';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('no #app');

app.innerHTML = `
  <header class="bar">
    <h1>ground state</h1>
    <p class="hint">debug map — click a cell to descend, backspace to come back up</p>
  </header>
  <section class="stage"><div class="frame"></div></section>
  <footer class="bar">
    <p class="route"><span class="shown"></span><span class="rest"></span></p>
    <p class="scale"></p>
    <form class="jump">
      <input name="address" placeholder="0x… go to an address" spellcheck="false" autocomplete="off" />
    </form>
  </footer>
`;

const frame = app.querySelector<HTMLElement>('.frame')!;
const shown = app.querySelector<HTMLElement>('.shown')!;
const rest = app.querySelector<HTMLElement>('.rest')!;
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

function render(): void {
  writeHash();
  draw(view);
  const label = prefixLabel(view.prefix);
  shown.textContent = label.shown;
  rest.textContent = label.rest;

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
  try {
    goTo(view, field.value);
    field.value = '';
    field.setCustomValidity('');
  } catch {
    field.setCustomValidity('that is not an address');
    field.reportValidity();
  }
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
