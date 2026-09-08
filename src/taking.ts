/**
 * Taking the ground you are standing on, from inside the world.
 *
 * The whole mechanic in one panel: aim at where you stand, set every thread on
 * it, watch the closest attempt get closer, and stop whenever you like. There
 * is no threshold and no waiting — the work *is* the distance, so an hour buys
 * a plot in sight of here and a night buys one you could walk to. Then one
 * transaction, which deploys a contract whose address is the place itself.
 */
import { call } from './chain';
import { chain } from './chains';
import { type Progress, type Search, search } from './claim';
import type { Found } from './mine';
import { connect, connected, landed, onOurChain, send, wallet } from './signer';

/** `claim(bytes32)` and `plotCodeHash()`, as the chain hears them. */
const CLAIM = '0xbd66528a';
const CODE_HASH = '0x73f355c3';

export interface Taking {
  /** Where the digging is aimed, in metres from home. Set before digging. */
  aimAt(target: { x: number; z: number }): void;
  /** Stop everything: leaving the patch, walking away, going somewhere else. */
  stop(): void;
}

function count(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}bn`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function far(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${metres.toFixed(metres < 10 ? 1 : 0)} m`;
}

/**
 * Wire the panel up.
 *
 * `onClaimed` is handed the plot's address once the chain has it, so the world
 * can raise it where it stands — which is the point of the whole exercise: the
 * thing you made is a place, and it is over there.
 */
export function takeGround(
  panel: HTMLElement,
  where: () => { x: number; z: number },
  onClaimed: (plot: string) => void,
): Taking {
  const said = panel.querySelector<HTMLElement>('.claim-said')!;
  const counted = panel.querySelector<HTMLElement>('.claim-count')!;
  const digButton = panel.querySelector<HTMLButtonElement>('.dig')!;
  const takeButton = panel.querySelector<HTMLButtonElement>('.take')!;

  let digging: Search | null = null;
  let best: Found | null = null;
  let aim = { x: 0, z: 0 };

  // ground is claimed on the chain that has a factory, and nowhere else
  if (!chain.plots) {
    panel.hidden = true;
    return { aimAt: () => {}, stop: () => {} };
  }
  panel.hidden = false;

  const show = (progress: Progress | null) => {
    if (!progress) {
      counted.textContent = '';
      return;
    }
    const lines = [
      `${count(progress.tries)} tries · ${count(progress.rate)}/s · ${progress.threads} threads`,
    ];
    if (progress.best) lines.push(`closest so far: ${far(progress.best.away)} from here`);
    counted.textContent = lines.join('\n');
  };

  const stop = () => {
    digging?.stop();
    digging = null;
    digButton.textContent = 'dig here';
  };

  digButton.addEventListener('click', async () => {
    if (digging) {
      stop();
      said.textContent = best
        ? 'stopped. claim what you found, or dig on'
        : 'this ground is unclaimed';
      return;
    }

    const owner = (await connected()) ?? (await connect());
    if (!owner) {
      said.textContent = wallet()
        ? 'the wallet said no'
        : 'no wallet in this browser — ground is claimed by a transaction';
      return;
    }

    // asked of the factory rather than guessed: it is part of the address
    const codeHash = await call(chain.plots!, CODE_HASH);
    if (!codeHash) {
      said.textContent = 'the factory did not answer';
      return;
    }

    aim = where();
    best = null;
    takeButton.hidden = true;
    said.textContent = 'digging for a place beside you. stop whenever you like';
    digButton.textContent = 'stop';
    digging = search(
      { factory: chain.plots!, owner, codeHash: codeHash.slice(0, 66), target: aim },
      (progress) => {
        show(progress);
        if (progress.best && (!best || progress.best.away < best.away)) {
          best = progress.best;
          takeButton.hidden = false;
        }
      },
    );
  });

  takeButton.addEventListener('click', async () => {
    if (!best) return;
    const owner = (await connected()) ?? (await connect());
    if (!owner) return;
    if (!(await onOurChain())) {
      said.textContent = `switch the wallet to ${chain.name} — a plot exists on one chain only`;
      return;
    }

    takeButton.disabled = true;
    const taking = best;
    said.textContent = `claiming ${far(taking.away)} from here — sign in the wallet`;
    try {
      const hash = await send(owner, chain.plots!, CLAIM + taking.salt.slice(2));
      said.textContent = 'sent. waiting for a block';
      const ok = await landed(hash);
      if (!ok) {
        said.textContent = 'the claim did not go through';
        takeButton.disabled = false;
        return;
      }
      stop();
      said.textContent = `yours: ${taking.address.slice(0, 10)}… ${far(taking.away)} from here`;
      takeButton.hidden = true;
      onClaimed(taking.address);
    } catch (error) {
      said.textContent = (error as { message?: string }).message ?? 'the wallet said no';
      takeButton.disabled = false;
    }
  });

  return {
    aimAt(target) {
      aim = target;
    },
    stop,
  };
}
