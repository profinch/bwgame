/**
 * Working on ground of your own, from inside the world.
 *
 * Stand at a plot that is yours and a panel offers what a plot can do: be
 * written into, be pointed at code of yours, be sealed. Each is one
 * transaction, shown as exactly what it is. When the block comes back the world
 * is told, and the plot is taken down and put up again as what it now is — a
 * drawing becomes a building the moment there is something in it.
 *
 * Nothing here decides which plot is yours: the world says, from who holds it
 * on the chain and which wallet is in the browser.
 */
import type { Structure } from './places';
import { type Claimed, claimedPlots } from './plot';
import { connect, connected, landed, onOurChain, send } from './signer';

import { chain } from './chains';

/** `inscribe(string)`, `setCode(address)` and `seal()` on a plot; `name(bytes32,string)` on Names. */
const INSCRIBE = '0x911a6512';
const SET_CODE = '0x3b1ca3b5';
const SEAL = '0x3fb27b85';
const NAME = '0x91ba33aa';

/** A bytes32 and a string, ABI-encoded as the two arguments of a call. */
export function encodeSaltAndString(salt: string, text: string): string {
  return salt.replace(/^0x/, '').toLowerCase().padStart(64, '0') + '40'.padStart(64, '0') + encodeString(text).slice(64);
}

/** A string, ABI-encoded as the one argument of a call. */
export function encodeString(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
  // where the string starts (the word after this one), how long it is, the bytes
  return '20'.padStart(64, '0') + bytes.length.toString(16).padStart(64, '0') + padded;
}

/** An address, ABI-encoded as the one argument of a call. */
export function encodeAddress(address: string): string {
  return address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

export interface Owning {
  stop(): void;
}

/** How often the indexer is asked which ground is yours, while you are not standing on any. */
const LISTS_EVERY = 15_000;
/** How many unnamed plots the list shows, newest first; named ones are all shown. */
const LISTS_UNNAMED = 5;

/** An address with its head and its tail: `0x3095c19c…5423`. */
function shortOf(address: string): string {
  return `${address.slice(0, 10)}…${address.slice(-4)}`;
}

export function ownGround(
  panel: HTMLElement,
  /** The plot of the given owner's that is within reach, if any. */
  plotOf: (owner: string) => Structure | null,
  onChanged: (plot: string) => void,
  /** The way to a plot of yours that is somewhere else. */
  goTo: (plot: string) => void,
): Owning {
  const said = panel.querySelector<HTMLElement>('.own-said')!;
  const noteLine = panel.querySelector<HTMLElement>('.own-note')!;
  const connecting = panel.querySelector<HTMLElement>('.own-connect')!;
  const listing = panel.querySelector<HTMLElement>('.own-list')!;
  const writing = panel.querySelector<HTMLFormElement>('.own-write')!;
  const noteInput = writing.querySelector<HTMLInputElement>('input')!;
  const coding = panel.querySelector<HTMLFormElement>('.own-code')!;
  const codeInput = coding.querySelector<HTMLInputElement>('input')!;
  const sealButton = panel.querySelector<HTMLButtonElement>('.seal')!;
  const naming = panel.querySelector<HTMLFormElement>('.own-name')!;
  const nameInput = naming.querySelector<HTMLInputElement>('input')!;

  let owner: string | null = null;
  let plot: Structure | null = null;
  let busy = false;
  /** What the panel last said on its own; a transaction's word stays until the next look. */
  let sticky = '';
  /** Your ground on this chain, as the indexer last listed it, and when. */
  let mine: Claimed[] = [];
  let listedFor: string | null = null;
  let listedAt = 0;

  const forms = [writing, coding, naming, panel.querySelector<HTMLElement>('.own-do')!];
  /** The panel in one of its states: the forms are for standing on your own ground, the rest for not. */
  const state = (of: 'connect' | 'list' | 'here') => {
    connecting.hidden = of !== 'connect';
    listing.hidden = of !== 'list';
    for (const form of forms) form.hidden = of !== 'here';
  };

  /**
   * The panel is always there while it is wanted; what it holds depends on
   * where you stand. Off your ground it is the way to it: no wallet, the way
   * to connect one; a wallet, every plot of yours listed, each a button that
   * takes you there; none, the word that digging is where ground comes from.
   */
  const look = async () => {
    if (busy) return;
    owner = (await connected().catch(() => null))?.toLowerCase() ?? null;
    plot = owner ? plotOf(owner) : null;
    if (!owner) {
      state('connect');
      sticky = '';
      said.textContent = 'your ground';
      noteLine.textContent = 'connect the wallet to see what is yours here, and to work on it';
      return;
    }
    if (!plot) {
      state('list');
      sticky = '';
      if (listedFor !== owner || performance.now() - listedAt > LISTS_EVERY) {
        listedFor = owner;
        listedAt = performance.now();
        const wanted = owner;
        mine = (await claimedPlots()).filter((it) => it.owner.toLowerCase() === wanted);
        // every named plot, then the last few unnamed: a name is how a plot
        // keeps its place in the list, and the rest are counted
        const named = mine.filter((it) => it.name);
        const unnamed = mine.filter((it) => !it.name).sort((a, b) => (b.updatedIn ?? 0) - (a.updatedIn ?? 0));
        const shown = [...named, ...unnamed.slice(0, LISTS_UNNAMED)];
        const rows: HTMLElement[] = shown.map((it) => {
          const go = document.createElement('button');
          go.type = 'button';
          go.className = 'own-go';
          const name = it.name && chain.ens ? `${it.name}.${chain.ens.parent}` : shortOf(it.plot);
          go.innerHTML = `${name} <span>go there</span>`;
          go.addEventListener('click', () => goTo(it.plot));
          return go;
        });
        if (unnamed.length > LISTS_UNNAMED) {
          const rest = document.createElement('p');
          rest.className = 'own-rest';
          rest.textContent = `and ${unnamed.length - LISTS_UNNAMED} more unnamed — a named plot is always listed`;
          rows.push(rest);
        }
        listing.replaceChildren(...rows);
      }
      said.textContent = mine.length ? `your ground: ${mine.length} ${mine.length === 1 ? 'plot' : 'plots'} on this chain` : 'your ground';
      noteLine.textContent = mine.length
        ? 'stand on one to write into it, point it at code, name it, seal it'
        : 'nothing here is yours yet: ground is not bought but dug for — dig where you stand';
      return;
    }
    state('here');
    const what = plot.plot!;
    said.textContent = sticky || (what.name && chain.ens ? `yours: ${what.name}.${chain.ens.parent}` : `yours: ${shortOf(plot.address)}`);
    noteLine.textContent =
      (what.note ? `says: ${what.note}` : 'nothing written into it yet') +
      (what.implementation ? `\npoints at ${what.implementation.slice(0, 10)}…` : '\npoints at no code: a drawing until it does');
    // naming needs the salt the plot was made with, which the indexer knows;
    // a plot named once is named: the form is not offered again
    naming.hidden = !chain.ens || Boolean(what.name);
    nameInput.disabled = !what.salt;
    nameInput.placeholder = what.salt ? `a name under ${chain.ens?.parent ?? ''}` : 'a name, once the indexer has this plot';
  };
  void look();
  const looking = setInterval(look, 1000);

  /** One transaction to the plot: the wallet's chain, the wallet's signature, the block. */
  const act = async (data: string, doing: string, done: string, to?: string) => {
    if (!plot || !owner || busy) return;
    const at = plot.address;
    const wrong = await onOurChain();
    if (wrong) {
      said.textContent = wrong;
      return;
    }
    busy = true;
    panel.querySelectorAll('button').forEach((b) => (b.disabled = true));
    said.textContent = `${doing} — sign in the wallet`;
    try {
      const hash = await send(owner, to ?? at, data);
      said.textContent = 'sent. waiting for a block';
      const ok = await landed(hash);
      sticky = ok ? done : 'it did not go through';
      said.textContent = sticky;
      if (ok) onChanged(at);
    } catch (error) {
      said.textContent = (error as { message?: string }).message ?? 'the wallet said no';
    } finally {
      busy = false;
      panel.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  };

  connecting.querySelector('button')!.addEventListener('click', () => {
    said.textContent = 'asking the wallet';
    void connect()
      .then(() => look())
      .catch(() => {
        said.textContent = 'the wallet said no';
      });
  });

  writing.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = noteInput.value.trim();
    if (!text) return;
    noteInput.value = '';
    void act(INSCRIBE + encodeString(text), 'writing into it', 'written');
  });

  coding.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = codeInput.value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(code)) {
      codeInput.setCustomValidity('an address: 0x and forty hex digits');
      codeInput.reportValidity();
      return;
    }
    codeInput.setCustomValidity('');
    codeInput.value = '';
    void act(SET_CODE + encodeAddress(code), 'pointing it at that code', 'pointed at it: this place is that code now');
  });

  naming.addEventListener('submit', (event) => {
    event.preventDefault();
    const label = nameInput.value.trim().toLowerCase();
    const salt = plot?.plot?.salt;
    if (!chain.ens || !salt) return;
    if (!/^[a-z0-9-]{1,32}$/.test(label)) {
      nameInput.setCustomValidity('lowercase letters, digits and hyphens, up to thirty-two');
      nameInput.reportValidity();
      return;
    }
    nameInput.setCustomValidity('');
    nameInput.value = '';
    void act(NAME + encodeSaltAndString(salt, label), `naming it ${label}.${chain.ens.parent}`, `named: ${label}.${chain.ens.parent}`, chain.ens.names);
  });

  sealButton.addEventListener('click', () => {
    void act(SEAL, 'sealing the code for good', 'sealed. the code here will never change');
  });

  return {
    stop() {
      clearInterval(looking);
    },
  };
}
