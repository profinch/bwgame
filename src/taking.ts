/**
 * Taking the ground you are standing on, from inside the world.
 *
 * The whole mechanic in one panel: aim at where you stand, set every thread on
 * it, watch the closest attempt get closer, and stop whenever you like. There
 * is no threshold and no waiting — the work *is* the distance, so an hour buys
 * a plot in sight of here and a night buys one you could walk to. Then one
 * transaction, which deploys a contract whose address is the place itself.
 *
 * What is found is kept (see finds.ts), so a reload or a walk elsewhere loses
 * nothing: come back near a find and it is offered again, measured from where
 * you stand now, and digging on from here starts from it rather than from zero.
 */
import { call } from './chain';
import { CHAINS, chain } from './chains';
import { type Progress, type Search, chooseThreads, coresAvailable, mindTheBattery, search, threadsChosen } from './claim';
import { HOME } from './engine/land';
import { drop, keep, keyOf, nearest, recall } from './finds';
import { type Dig, type Found, bytesOf, placeOf } from './mine';
import { connect, connected, landed, onOurChain, send, wallet } from './signer';

/** `claim(bytes32)` and `plotCodeHash()`, as the chain hears them. */
const CLAIM = '0xbd66528a';
const CODE_HASH = '0x73f355c3';

export interface Taking {
  /** Stop everything: leaving the patch, walking away, going somewhere else. */
  stop(): void;
  /** Whether the threads are at work — in which case the walker is, too. */
  readonly digging: boolean;
  /** Attempts a second while digging, for anything that wants to show effort. */
  readonly rate: number;
  /** Hold the panel still — the onboarding speaks through it — or let it speak again. */
  pause(on: boolean): void;
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
  const earlier = panel.querySelector<HTMLElement>('.claim-earlier')!;
  const digButton = panel.querySelector<HTMLButtonElement>('.dig')!;
  const takeButton = panel.querySelector<HTMLButtonElement>('.take')!;
  const coresSlider = panel.querySelector<HTMLInputElement>('.cores')!;
  const coresSaid = panel.querySelector<HTMLElement>('.cores-said')!;

  let digging: Search | null = null;
  let best: Found | null = null;
  let owner: string | null = null;

  panel.hidden = false;

  /**
   * Ground is claimed on the chain that has a factory, and nowhere else.
   *
   * Which is most of them, so the panel says where it can be done and offers to
   * take you there rather than quietly not being on the page — a control that
   * hides itself is indistinguishable from one that is broken.
   */
  if (!chain.plots) {
    const somewhere = Object.values(CHAINS).find((other) => other.plots);
    said.textContent = somewhere
      ? `ground is taken on ${somewhere.name}, which is where the factory stands`
      : 'no factory on any chain yet';
    digButton.textContent = somewhere ? `go to ${somewhere.name}` : 'nowhere to dig';
    digButton.disabled = !somewhere;
    digButton.addEventListener('click', () => {
      if (!somewhere) return;
      const to = new URL(location.href);
      to.searchParams.set('chain', somewhere.key);
      location.href = to.toString();
    });
    return { stop: () => {}, digging: false, rate: 0, pause: () => {} };
  }
  const factory = chain.plots;
  const home = placeOf(bytesOf(HOME));
  said.textContent = 'nobody has claimed this ground. dig here to take it: the longer you dig, the closer the plot';

  // --- what was found before ------------------------------------------------

  const shelfKey = () => (owner ? keyOf(chain.key, factory, owner) : null);

  /**
   * How far off a find can be and still be offered from here.
   *
   * The ground underfoot is built seventeen hundred metres across, and that is
   * about as far as you can see; anything beyond it is not near you but
   * somewhere else, and somewhere else is reached by address, not on foot. So
   * a find within this is offered with its distance, and the rest are counted.
   */
  const NEARBY = 2000;

  /**
   * Offer the nearest earlier find, measured from where the walker is now.
   *
   * Runs every second while idle. A find is a point in the world, so how far it
   * is depends on where you stand, and the line keeps up as you walk. Digging
   * takes the panel over and this stays quiet until it stops.
   */
  /** Held: somebody else — the onboarding — is speaking through this panel. */
  let held = false;
  const showEarlier = () => {
    if (digging || held) return;
    const key = shelfKey();
    const finds = key ? recall(localStorage, key) : [];
    const near = nearest(finds, home, where());
    const elsewhere = near && near.away <= NEARBY ? finds.length - 1 : finds.length;
    const others = elsewhere > 0 ? `${elsewhere} more elsewhere` : '';

    if (!near || near.away > NEARBY) {
      best = null;
      takeButton.hidden = true;
      earlier.hidden = !others;
      earlier.textContent = others ? `found earlier: ${others}` : '';
      return;
    }
    best = { salt: near.find.salt, address: near.find.address, ground: near.ground, away: near.away };
    earlier.hidden = false;
    earlier.textContent = `found earlier: ${far(near.away)} from here${others ? ` · ${others}` : ''}`;
    takeButton.hidden = false;
    takeButton.disabled = false;
  };

  // an account already granted is enough to know whose finds to look for
  void connected().then((had) => {
    owner = had ? had.toLowerCase() : null;
    showEarlier();
  });
  setInterval(showEarlier, 1000);

  // --- how much of the machine ------------------------------------------------

  /**
   * The slider is the number of threads, and it is theirs to set: half the
   * machine by default, kept between visits. Moving it while digging restarts
   * the threads at the new count — a few thousand attempts of the batch in
   * flight are lost, and nothing else, since the best so far is kept here.
   */
  const cores = coresAvailable();
  coresSlider.max = String(cores);
  coresSlider.value = String(threadsChosen());
  let onBattery = false;
  const sayCores = () => {
    coresSaid.textContent = `${coresSlider.value} of ${cores} cores${onBattery ? ' · on battery' : ''}`;
  };
  sayCores();
  // on a battery the default is a quarter, and the slider shows it; a choice already made stands
  void mindTheBattery().then((battery) => {
    onBattery = battery;
    coresSlider.value = String(threadsChosen());
    sayCores();
  });
  coresSlider.addEventListener('input', () => {
    chooseThreads(Number(coresSlider.value));
    sayCores();
    if (digging && spec) {
      digging.stop();
      digging = startDigging(spec);
    }
  });

  // --- digging --------------------------------------------------------------

  const show = (progress: Progress | null) => {
    if (!progress) {
      counted.textContent = '';
      return;
    }
    const lines = [`${count(progress.tries)} tries · ${count(progress.rate)}/s`];
    if (progress.paused) lines.push('paused: the tab is out of sight');
    if (best) lines.push(`closest so far: ${far(best.away)} from here`);
    counted.textContent = lines.join('\n');
  };

  const stop = () => {
    digging?.stop();
    digging = null;
    spec = null;
    rate = 0;
    digButton.textContent = 'dig here';
    showEarlier();
  };

  let rate = 0;
  /** What is being dug for, kept so the threads can be restarted at another count. */
  let spec: Dig | null = null;

  const startDigging = (dig: Dig): Search => {
    const key = keyOf(chain.key, factory, dig.owner);
    return search(
      dig,
      (progress) => {
        rate = progress.paused ? 0 : progress.rate;
        if (progress.best && (!best || progress.best.away < best.away)) {
          best = progress.best;
          keep(localStorage, key, { salt: best.salt, address: best.address });
          takeButton.hidden = false;
        }
        show(progress);
      },
      (trouble) => {
        said.textContent = `the threads cannot work: ${trouble}`;
      },
    );
  };

  digButton.addEventListener('click', async () => {
    if (digging) {
      stop();
      said.textContent = best
        ? `stopped. claim what you found — ${far(best.away)} from here — or dig on to get closer`
        : 'stopped before anything was found. dig on whenever';
      return;
    }

    if (!wallet()) {
      said.textContent =
        'no wallet in this browser: a salt carries the address it is mined for, so digging needs one. ' +
        'on a phone, open this page inside your wallet app\'s browser';
      return;
    }
    said.textContent = 'asking the wallet for an address';
    const granted = await connected().then((had) => had ?? connect()).catch(() => null);
    if (!granted) {
      said.textContent = 'the wallet said no';
      return;
    }
    owner = granted.toLowerCase();

    // asked of the factory rather than guessed: it is part of the address
    const codeHash = await call(factory, CODE_HASH);
    if (!codeHash) {
      said.textContent = 'the factory did not answer';
      return;
    }

    const aim = where();
    const key = shelfKey()!;
    // start from the best of what was found before, measured from this aim:
    // work already done is not done again
    const had = nearest(recall(localStorage, key), home, aim);
    best = had ? { salt: had.find.salt, address: had.find.address, ground: had.ground, away: had.away } : null;
    earlier.hidden = true;
    takeButton.hidden = !best;
    said.textContent = 'digging for a place beside you. every attempt is a place; the closest is kept. stop whenever you like';
    counted.textContent = 'starting the threads…';
    digButton.textContent = 'stop';
    spec = { factory, owner: granted, home: HOME, codeHash: codeHash.slice(0, 66), target: aim };
    digging = startDigging(spec);
  });

  takeButton.addEventListener('click', async () => {
    if (!best) return;
    const granted = (await connected()) ?? (await connect());
    if (!granted) return;
    const wrong = await onOurChain();
    if (wrong) {
      said.textContent = wrong;
      return;
    }

    takeButton.disabled = true;
    const taking = best;
    said.textContent = `claiming ${far(taking.away)} from here — sign in the wallet`;
    try {
      const hash = await send(granted, factory, CLAIM + taking.salt.slice(2));
      said.textContent = 'sent. waiting for a block';
      const ok = await landed(hash);
      if (!ok) {
        said.textContent = 'the claim did not go through';
        takeButton.disabled = false;
        return;
      }
      const key = shelfKey();
      if (key) drop(localStorage, key, taking.address);
      stop();
      said.textContent =
        `yours: ${taking.address.slice(0, 10)}…, ${far(taking.away)} from here. ` +
        'walk to it — then write into it, name it, or point it at code of your own';
      onClaimed(taking.address);
    } catch (error) {
      said.textContent = (error as { message?: string }).message ?? 'the wallet said no';
      takeButton.disabled = false;
    }
  });

  return {
    stop,
    get digging() {
      return digging !== null;
    },
    get rate() {
      return rate;
    },
    /** Hold the panel still, or let it speak again. */
    pause(on: boolean) {
      held = on;
      if (!on) {
        said.textContent = 'nobody has claimed this ground. dig here to take it: the longer you dig, the closer the plot';
        showEarlier();
      }
    },
  };
}
