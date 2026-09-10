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
import { connected, landed, onOurChain, send } from './signer';

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

export function ownGround(
  panel: HTMLElement,
  /** The plot of the given owner's that is within reach, if any. */
  plotOf: (owner: string) => Structure | null,
  onChanged: (plot: string) => void,
): Owning {
  const said = panel.querySelector<HTMLElement>('.own-said')!;
  const noteLine = panel.querySelector<HTMLElement>('.own-note')!;
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

  const look = async () => {
    if (busy) return;
    owner = (await connected().catch(() => null))?.toLowerCase() ?? null;
    plot = owner ? plotOf(owner) : null;
    if (!plot) {
      panel.hidden = true;
      sticky = '';
      return;
    }
    panel.hidden = false;
    const what = plot.plot!;
    said.textContent = sticky || (what.name && chain.ens ? `yours: ${what.name}.${chain.ens.parent}` : `yours: ${plot.address.slice(0, 10)}…`);
    noteLine.textContent =
      (what.note ? `says: ${what.note}` : 'nothing written into it yet') +
      (what.implementation ? `\npoints at ${what.implementation.slice(0, 10)}…` : '\npoints at no code: a drawing until it does');
    // naming needs the salt the plot was made with, which the indexer knows
    naming.hidden = !chain.ens;
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
