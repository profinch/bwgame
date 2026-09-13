/**
 * The onboarding: the world shown, not explained. For a couple of minutes the
 * page plays itself — looks round, walks, runs and jumps, types a name and
 * goes there, opens every panel and every part of the menu, turns the page
 * over, comes back — with a card at the foot of the screen saying what is
 * happening, and the controls locked. Each step plays itself out and waits;
 * the person says when to go on, or leaves, and can start it again from the
 * menu whenever they like. Digging, claiming, writing, pointing, naming and
 * sealing are shown on plots of the tour's own: nothing touches the chain.
 *
 * The world lends the tour a driver: what the keys and the pointer would do,
 * as calls. The tour holds no state of the world's; when it ends, the driver
 * puts everything back where it was.
 */
export interface Driver {
  /** Turn at these rates, radians a second, until told otherwise. */
  look(yawRate: number, pitchRate: number): void;
  /** Walk, or run, with this forward and side, until told otherwise. */
  walk(forward: number, side: number, run: boolean): void;
  jump(): void;
  /** Stand still and look straight. */
  stop(): void;
  /** Type into the field that takes you places, a sign at a time. */
  type(text: string, wait: (ms: number) => Promise<void>): Promise<void>;
  /** Go where the field says — to the tour's own contract, with the arrival's descent. */
  go(): Promise<void>;
  /** Open a part of the menu, or close it. */
  /** A section of the menu down, or a page open under it: 'map' is the info section with the map open. */
  section(which: 'map' | 'info' | 'panels' | 'blockchain' | null): void;
  /** An unhurried turn of the head to the tour's plot, wherever the walker stands. */
  faceMock(): void;
  /** Speak through the person panel: a stranger with the offer, or a real person with the day. */
  personSays(said: string, note: string, who: 'stranger' | 'person'): void;
  /** Unfold the worlds in the blockchain bar. */
  unfoldWorlds(): void;
  /** Put a panel away, or bring it back. */
  togglePanel(key: string): void;
  /** Turn the page over. */
  flipTheme(): void;
  /** Through the walker's own eyes, or over their shoulder. */
  view(firstPerson: boolean): void;
  /** A few transactions that failed, crossing the sky and falling back — for show, not from a block. */
  failedTraffic(count: number): void;
  /** Ring a thing on the screen, or nothing. */
  mark(selector: string | null): void;

  // --- shown, not done: none of this touches the chain -----------------------
  /** The auger in the ground and the earth coming up, at this rate of attempts a second — for show. */
  dig(on: boolean, rate: number): void;
  /** Speak through the claim panel. */
  claimSays(said: string, count: string, earlier?: string): void;
  /** Move the cores slider, for show. */
  cores(n: number, of: number): void;
  /** Press a button, for show: it is turned over for a moment. */
  press(selector: string): void;
  /** The claim panel's buttons as they are while digging, or after a find: "stop" or "dig here", "claim it" shown or not, and pressed while a claim is under way. */
  claimButtons(digging: boolean, found: boolean, busy?: boolean): void;
  /** A plot of the tour's own goes up a few steps ahead, a drawing; its address comes back. */
  mockClaim(): string;
  /** The tour's plot is written into: the drawing becomes a building and the words come up. */
  mockWrite(address: string, note: string): void;
  /** Speak through the owner's panel, with its forms showing. */
  ownSays(said: string, note: string): void;
  /** Type into a field, a sign at a time. */
  typeInto(selector: string, text: string, wait: (ms: number) => Promise<void>): Promise<void>;
  clearField(selector: string): void;
  /**
   * Somebody else, walking to a spot this far from you — `right` metres to
   * your right and `ahead` metres in front, in the way you face; negative is
   * left, or behind — at a walking pace, or put there at once, to begin;
   * digging there or not.
   */
  peer(right: number, ahead: number, dig: boolean, atOnce?: boolean): void;
  peerGone(): void;
  /**
   * Back to square one: nothing moving, nothing marked, no bar down, the map
   * away, the page the way round it was, the panels speaking for themselves,
   * the fields empty, the tour's plots and player gone. Every step begins so,
   * whichever way it was come to.
   */
  reset(): void;
  /** Everything the tour put up comes down, for good. */
  clean(): void;
  /**
   * Set the scene a step needs before it plays — on open ground by home, at
   * the tour's contract, at its wallet, with its plot claimed, or written into — at once, whether the step was reached in order, skipped to, or gone
   * back to, and the same wherever the tour was begun, since every spot is a
   * fixed one by a fixed address. A step opens on its picture: no drop from
   * the sky, no turn of the head. The tour's plot's address comes back, if
   * there is one.
   */
  scene(which: Scene, wait: (ms: number) => Promise<void>): Promise<string | null>;
}

/** What has to be so before a step plays. */
export type Scene = 'any' | 'open' | 'contract' | 'wallet' | 'claimed' | 'written';

type Wait = (ms: number) => Promise<void>;

export interface Step {
  says: string;
  /** What has to be so before it plays; 'any' when it does not matter. */
  scene?: Scene;
  play: (d: Driver, wait: Wait) => Promise<void>;
}

export const STEPS: readonly Step[] = [
  {
    scene: 'open',
    says: 'a blockchain as a place. every address is a spot on this ground; what stands here is what the chain says stands here, nothing is invented. the block passes overhead, each ribbon a transaction. w a s d walks, shift runs, space jumps, dragging looks round.',
    async play(d, wait) {
      // a look to one side and the other over open ground, the metrics turned over for a moment
      d.look(0.35, 0);
      await wait(2600);
      d.mark('.hud.bottom');
      d.look(-0.35, 0);
      await wait(2600);
      d.mark(null);
      // then the sky: up, a couple of failed ones shaking and drawn back while
      // the eyes pan slowly, and down again by exactly as much
      d.look(0.1, 0.3);
      await wait(2500);
      d.look(0.1, 0);
      d.failedTraffic(3);
      await wait(4000);
      d.look(0, -0.3);
      await wait(2500);
      d.look(0, 0);
      // and a few steps, level, to say how: a walk, a run, then standing still a jump, so the ground it throws up is seen
      d.walk(1, 0, false);
      await wait(1800);
      d.walk(1, 0, true);
      await wait(1200);
      d.walk(0, 0, false);
      await wait(500);
      d.jump();
      await wait(2000);
      d.stop();
    },
  },
  {
    scene: 'open',
    says: 'an address or a name takes you anywhere. first.groundstate.eth is the first plot of this ground, named under groundstate.eth; a building of the tour\'s own stands for it here.',
    async play(d, wait) {
      d.mark('.hud.jump');
      await d.type('first.groundstate.eth', wait);
      await wait(700);
      d.mark(null);
      await d.go();
      await wait(6500);
    },
  },
  {
    scene: 'contract',
    says: 'a contract is a building: its size from its code, its shape from the code\'s hash, what was written into it standing out of its wall. a dashed outline is a plot nothing is written into yet.',
    async play(d, wait) {
      // back off from the building, then the eyes up it to the roof and down to the words
      d.walk(-1, 0, false);
      await wait(2000);
      d.walk(0, 0, false);
      d.look(0, 0.2);
      await wait(2600);
      d.look(0, -0.2);
      await wait(2600);
      d.stop();
    },
  },
  {
    scene: 'wallet',
    says: 'a wallet is a plate, a post for each token it holds, coming up one by one as the chain is read: as tall as the share of the token\'s whole supply, its name and the amount cut into it in runes. this plate is the tour\'s own.',
    async play(_d, wait) {
      // the eyes stay on the plate while its posts come up
      await wait(9000);
    },
  },
  {
    scene: 'contract',
    says: 'empty ground is not bought but dug for: every attempt is a place, the closest is kept, and the longer you dig the closer it gets. more cores, more attempts.',
    async play(d, wait) {
      d.mark('.hud.claim');
      d.claimSays('nobody has claimed this ground. dig here to take it: the longer you dig, the closer the plot', '');
      for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) {
        d.cores(n, 16);
        await wait(200);
      }
      await wait(500);
      d.press('.hud.claim .dig');
      await wait(400);
      d.claimButtons(true, false);
      d.claimSays('digging for a place beside you. every attempt is a place; the closest is kept. stop whenever you like', '');
      d.dig(true, 1.4e7);
      const path = [412, 388, 301, 296, 212, 187, 187, 154, 131, 119, 96, 96, 88, 74];
      for (let i = 0; i < path.length; i++) {
        // the counts as the panel writes them; and once there is a find, "claim it" stands beside "stop"
        const tries = 0.7 * (i + 1);
        d.claimSays(
          'digging for a place beside you. every attempt is a place; the closest is kept. stop whenever you like',
          `${tries < 1 ? `${(tries * 1000).toFixed(1)}k` : `${tries.toFixed(2)}m`} tries · 14.20m/s\nclosest so far: ${path[i]} m from here`,
        );
        d.claimButtons(true, true);
        await wait(600);
      }
      d.press('.hud.claim .dig');
      await wait(400);
      d.dig(false, 0);
      d.claimButtons(false, true);
      d.claimSays('stopped. claim what you found — 74 m from here — or dig on to get closer', '');
      await wait(2000);
    },
  },
  {
    scene: 'contract',
    says: 'one transaction makes the closest place found your contract, for good: a plot, yours to write into, build on, name, hand on. it stands up out of the ground as a drawing of the building it will be.',
    async play(d, wait) {
      // a few steps back first, so the drawing going up is seen whole
      d.walk(-1, 0, false);
      await wait(1200);
      d.walk(0, 0, false);
      d.mark('.hud.claim');
      d.claimButtons(false, true);
      d.claimSays('stopped. claim what you found — 74 m from here — or dig on to get closer', '');
      await wait(1000);
      d.press('.hud.claim .take');
      await wait(400);
      d.claimButtons(false, true, true);
      d.claimSays('claiming 74 m from here — sign in the wallet', '');
      await wait(1600);
      d.claimSays('sent. waiting for a block', '');
      await wait(1600);
      mocked = d.mockClaim();
      // landed: the find is off the shelf, the buttons as after any stop, and the panel's own words
      d.claimButtons(false, false);
      d.claimSays(`yours: ${mocked.slice(0, 10)}…, 74 m from here. walk to it — then write into it, name it, or point it at code of your own`, '');
      d.mark(null);
      // the head turns to where it is going up, on its own, as it does in the game
      d.faceMock();
      await wait(8500);
    },
  },
  {
    scene: 'claimed',
    says: 'on your own plot the owner\'s panel acts for you, a transaction each: write into it and the words stand on the wall; point it at a contract of yours and that code runs here; name it under groundstate.eth; seal the code and it can never change.',
    async play(d, wait) {
      const plot = lastMock();
      const short = `${plot.slice(0, 10)}…${plot.slice(-4)}`;
      d.mark('.hud.own');
      // written into: the drawing becomes a building and the words come up
      d.ownSays(`yours: ${short}`, 'nothing written into it yet\npoints at no code: a drawing until something is written into it');
      await wait(800);
      await d.typeInto('.own-write input', 'hello, world', wait);
      d.press('.own-write button');
      await wait(300);
      d.clearField('.own-write input');
      d.ownSays('writing into it — sign in the wallet', 'nothing written into it yet\npoints at no code: a drawing until something is written into it');
      await wait(1000);
      d.ownSays('sent. waiting for a block', 'nothing written into it yet\npoints at no code: a drawing until something is written into it');
      await wait(1000);
      d.ownSays('written', 'says: hello, world\npoints at no code');
      // the drawing becomes the building, and the words come up: watched through
      d.mockWrite(plot, 'hello, world');
      await wait(9500);
      // pointed at code
      await d.typeInto('.own-code input', '0xC0DE000000000000000000000000000000005EED', wait);
      d.press('.own-code button');
      await wait(300);
      d.clearField('.own-code input');
      d.ownSays('pointing it at that code — sign in the wallet', 'says: hello, world\npoints at no code');
      await wait(1000);
      d.ownSays('sent. waiting for a block', 'says: hello, world\npoints at no code');
      await wait(1000);
      d.ownSays('pointed at it: this place is that code now', 'says: hello, world\npoints at 0xC0DE0000…5EED');
      await wait(1600);
      // named
      await d.typeInto('.own-name input', 'demo', wait);
      d.press('.own-name button');
      await wait(300);
      d.clearField('.own-name input');
      d.ownSays('naming it demo.groundstate.eth — sign in the wallet', 'says: hello, world\npoints at 0xC0DE0000…5EED');
      await wait(1000);
      d.ownSays('sent. waiting for a block', 'says: hello, world\npoints at 0xC0DE0000…5EED');
      await wait(1000);
      d.ownSays('named: demo.groundstate.eth', 'says: hello, world\npoints at 0xC0DE0000…5EED');
      await wait(1600);
      // sealed
      d.press('.own-do .seal');
      await wait(300);
      d.ownSays('sealing the code for good — sign in the wallet', 'says: hello, world\npoints at 0xC0DE0000…5EED');
      await wait(1000);
      d.ownSays('sent. waiting for a block', 'says: hello, world\npoints at 0xC0DE0000…5EED');
      await wait(1000);
      d.ownSays('sealed. the code here will never change', 'says: hello, world\npoints at 0xC0DE0000…5EED, sealed');
      await wait(2500);
      d.mark(null);
    },
  },
  {
    scene: 'written',
    says: 'other people are here too, and what one finds is kept for all. a selfie check with World says one real person is behind the screen: a person\'s finds are kept at once, a stranger\'s once five strangers agree. a person stands in your grey.',
    async play(d, wait) {
      // somebody comes in from the right, ahead, stops a few steps off to the left and digs
      d.peer(9, 11, false, true);
      await wait(400);
      d.peer(-3, 6, false);
      await wait(5000);
      d.peer(-3, 6, true);
      // meanwhile the person panel: a stranger, the check, a real person
      d.mark('.hud.person');
      d.personSays('stranger', "a selfie check with World says one real person is behind this screen. a person's finds are kept for everybody at once; a stranger's only once five strangers agree.", 'stranger');
      await wait(3000);
      d.press('.hud.person .prove');
      await wait(1200);
      d.personSays('real person', 'checked with World ID until 11.12.2026. what you find is kept in the game for everybody at once: your finds need no confirmation from the community', 'person');
      await wait(3500);
      d.mark(null);
      d.peer(-3, 6, false);
      await wait(500);
      d.peer(-9, 11, false);
      await wait(1500);
    },
  },
  {
    scene: 'written',
    says: 'the menu. view puts the panels away and brings them back, a cross in a corner does the same; info holds the map, the whitepaper and the roadmap; blockchain is which world this is: sepolia to take ground on, ethereum to walk. the stones turn the page over.',
    async play(d, wait) {
      d.section('panels');
      await wait(1200);
      d.togglePanel('owner');
      await wait(1000);
      d.togglePanel('owner');
      await wait(900);
      d.section('info');
      await wait(1200);
      d.section('map');
      await wait(4000);
      d.section('blockchain');
      await wait(1200);
      d.unfoldWorlds();
      await wait(2200);
      d.section(null);
      await wait(600);
      d.flipTheme();
      await wait(2500);
      d.flipTheme();
      await wait(1000);
    },
  },
  {
    scene: 'written',
    says: 'that is all of it, and all of it was for show: nothing was sent, nothing is yours yet. h brings you home; any word of the menu leaves the tour. go and stand in it.',
    async play(d, wait) {
      // turned away from the contracts, to the open horizon, level
      d.look(0.6, -0.05);
      await wait(5200);
      d.stop();
    },
  },
];

/** The address of the plot the tour claimed for show, remembered between its steps. */
let mocked = '';
function lastMock(): string {
  return mocked;
}

const WALKED_AS = 'gs-tour-walked';

export class Tour {
  private at = -1;
  private run = 0;

  constructor(
    private readonly card: HTMLElement,
    private readonly driver: Driver,
    private readonly onEnd: () => void,
  ) {
    card.querySelector<HTMLButtonElement>('.tour-skip')!.addEventListener('click', () => this.end());
    card.querySelector<HTMLButtonElement>('.tour-next')!.addEventListener('click', () => this.next());
    card.querySelector<HTMLButtonElement>('.tour-back')!.addEventListener('click', () => this.back());
  }

  /** On to the next step, whatever this one was in the middle of. */
  private next(): void {
    if (!this.running) return;
    this.driver.stop();
    void this.play(this.at + 1, ++this.run);
  }

  /** The step before, played again from its start. */
  private back(): void {
    if (!this.running || this.at === 0) return;
    this.driver.stop();
    this.driver.mark(null);
    void this.play(this.at - 1, ++this.run);
  }

  /** Whether it has been watched through to the end once, in this browser. */
  static walked(): boolean {
    try {
      return localStorage.getItem(WALKED_AS) === 'yes';
    } catch {
      return false;
    }
  }

  get running(): boolean {
    return this.at >= 0;
  }

  start(): void {
    if (this.running) return;
    mocked = '';
    document.body.classList.add('touring');
    void this.play(0, ++this.run);
  }

  private async play(index: number, run: number): Promise<void> {
    if (index >= STEPS.length) return this.end(true);
    this.at = index;
    const step = STEPS[index]!;
    this.card.hidden = false;
    this.card.querySelector<HTMLElement>('.tour-count')!.textContent = `${index + 1} / ${STEPS.length}`;
    this.card.querySelector<HTMLElement>('.tour-says')!.textContent = step.says;
    this.card.querySelector<HTMLButtonElement>('.tour-next')!.textContent = index === STEPS.length - 1 ? 'done' : 'next';
    this.card.querySelector<HTMLButtonElement>('.tour-back')!.disabled = index === 0;
    // a wait that never comes back once the tour has been left or moved on
    const wait: Wait = (ms) =>
      new Promise((resolve) => {
        setTimeout(() => {
          if (this.run === run) resolve();
        }, ms);
      });
    // the scene first — skipped to, or gone back to, a step still finds what it
    // is about in place — then the step plays itself out and waits: the person
    // says when to go on
    // while the scene is being set nothing is pressed: the buttons wait too
    const buttons = this.card.querySelectorAll<HTMLButtonElement>('.tour-next, .tour-back');
    for (const button of buttons) button.disabled = true;
    this.driver.reset();
    const plot = await this.driver.scene(step.scene ?? 'any', wait);
    if (this.run !== run) return;
    for (const button of buttons) button.disabled = false;
    this.card.querySelector<HTMLButtonElement>('.tour-back')!.disabled = index === 0;
    if (plot) mocked = plot;
    await step.play(this.driver, wait);
  }

  /** Over, whether watched through or left — by its own button, or by a press on the menu. */
  end(watched = false): void {
    if (!this.running) return;
    this.run++;
    this.at = -1;
    this.card.hidden = true;
    document.body.classList.remove('touring');
    this.driver.stop();
    this.driver.mark(null);
    this.driver.section(null);
    if (watched) {
      try {
        localStorage.setItem(WALKED_AS, 'yes');
      } catch {
        // then it is offered again
      }
    }
    this.onEnd();
  }
}
