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
  section(which: 'map' | 'panels' | 'blockchain' | null): void;
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
  /** The claim panel's buttons as they are while digging, or after a find: "stop" or "dig here", "claim it" shown or not. */
  claimButtons(digging: boolean, found: boolean): void;
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
    says: 'this is a blockchain as a place. every address is a spot on this ground, and what stands here is what the chain says stands here — nothing is invented.',
    async play(d, wait) {
      // a look to one side and the other, over open ground: the start faces away from what stands near
      d.look(0.35, 0);
      await wait(2800);
      d.look(-0.35, 0);
      await wait(4200);
      d.look(0.35, 0.12);
      await wait(1400);
      d.stop();
    },
  },
  {
    scene: 'open',
    says: 'you walk it: w a s d, shift to run, space to jump. on a phone, the stick. dragging the picture looks round.',
    async play(d, wait) {
      d.walk(1, 0, false);
      await wait(2500);
      d.walk(1, 0, true);
      await wait(2000);
      d.jump();
      await wait(1300);
      d.walk(0, 1, false);
      d.look(-0.4, 0);
      await wait(1800);
      d.stop();
    },
  },
  {
    scene: 'open',
    says: 'here is where you stand: the chain, the depth, the address under your feet, what is near — and the block passing overhead. its transactions are the ribbons in the sky, each from its sender toward its receiver; one that failed shakes, stops short, and is drawn back.',
    async play(d, wait) {
      // the metrics turned over while they are the subject, then back as they are
      d.mark('.hud.bottom');
      await wait(3000);
      d.mark(null);
      // then the sky: the ribbons run a few hundred metres up and out toward
      // the horizon, so the eyes go well up and pan slowly while they cross
      d.look(0.12, 0.3);
      await wait(2500);
      d.look(0.12, 0);
      // and a couple that failed, so the shake and the drawing back are seen
      d.failedTraffic(3);
      await wait(6000);
      d.look(0, -0.3);
      await wait(2500);
      d.stop();
    },
  },
  {
    scene: 'open',
    says: 'an address or a name takes you anywhere. this goes to first.groundstate.eth — the first plot of this ground, named under groundstate.eth. here a building of the tour\'s own stands for it.',
    async play(d, wait) {
      d.mark('.hud.jump');
      await d.type('first.groundstate.eth', wait);
      await wait(700);
      d.mark(null);
      await d.go();
      await wait(7500);
    },
  },
  {
    scene: 'contract',
    says: 'a contract stands as a building, its size from its code, its shape from the code\'s hash, the words written into it cut into its wall. a dashed outline is a plot not yet written into; boulders and gates are plots of the earlier grounds.',
    async play(d, wait) {
      // back off from the building, then run the eyes up it to the roof and back down to its foot
      d.walk(-1, 0, false);
      await wait(2200);
      d.walk(0, 0, false);
      d.look(0, 0.2);
      await wait(2800);
      d.look(0, -0.2);
      await wait(2800);
      d.stop();
    },
  },
  {
    scene: 'wallet',
    says: 'a wallet lies as a plate on levelled ground, a post for each token it holds — the post as tall as the share of the token\'s whole supply, its name and the amount cut into it. and other people are here too: standing, walking, digging. a claim anyone makes stands up for everyone within seconds. this plate, and this person, are the tour\'s own.',
    async play(d, wait) {
      // the plate first; then somebody comes in from the right, ahead of you
      // and clear of the plate, stops a few steps ahead to the left, digs, and
      // walks off to the left — in view the whole way, and staying
      await wait(3000);
      d.peer(9, 11, false, true);
      await wait(400);
      d.peer(-3, 6, false);
      await wait(9000);
      d.peer(-3, 6, true);
      await wait(4500);
      d.peer(-3, 6, false);
      await wait(600);
      d.peer(-9, 11, false);
    },
  },
  {
    scene: 'contract',
    says: 'empty ground is not bought but dug for. dig here searches for a salt whose contract would land at your feet — every attempt is a place, the closest is kept, and the longer you dig the closer it gets. this is what it looks like.',
    async play(d, wait) {
      d.mark('.hud.claim');
      d.claimSays('nobody has claimed this ground. dig here to take it: the longer you dig, the closer the plot', '');
      // how much of the machine: the slider goes up, and the rate with it
      for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) {
        d.cores(n, 16);
        await wait(220);
      }
      await wait(600);
      d.press('.hud.claim .dig');
      await wait(400);
      d.claimButtons(true, false);
      d.claimSays('digging for a place beside you. every attempt is a place; the closest is kept. stop whenever you like', '');
      d.dig(true, 1.4e7);
      const path = [412, 388, 301, 296, 212, 187, 187, 154, 131, 119, 96, 96, 88, 74];
      for (let i = 0; i < path.length; i++) {
        d.claimSays(
          'digging for a place beside you. every attempt is a place; the closest is kept. stop whenever you like',
          `best so far: ${path[i]} m from here · ${(0.7 * (i + 1)).toFixed(1)} M attempts · 14.2 M/s on 12 cores`,
        );
        await wait(650);
      }
      d.press('.hud.claim .dig');
      await wait(400);
      d.dig(false, 0);
      d.claimButtons(false, true);
      d.claimSays('stopped. the closest place found is 74 m from here', 'best so far: 74 m from here · 9.8 M attempts');
      await wait(2000);
    },
  },
  {
    scene: 'contract',
    says: 'one transaction makes the closest place found your contract, for good — a plot: yours to write into, build on, name, hand on. it stands up out of the ground as a drawing of the building it will be.',
    async play(d, wait) {
      d.mark('.hud.claim');
      d.claimButtons(false, true);
      d.claimSays('stopped. the closest place found is 74 m from here', 'best so far: 74 m from here · 9.8 M attempts');
      await wait(1200);
      d.press('.hud.claim .take');
      await wait(400);
      d.claimButtons(false, false);
      d.claimSays('claiming 74 m from here — sign in the wallet', '');
      await wait(1800);
      d.claimSays('sent. waiting for a block', '');
      await wait(1800);
      d.claimSays('claimed: yours, 74 m from here. walk over — it is going up', '');
      mocked = d.mockClaim();
      d.mark(null);
      // the head turns to where it is going up, ahead and to the right, and lifts a little
      d.look(-0.75, 0.06);
      await wait(1500);
      d.look(0, 0);
      await wait(8000);
    },
  },
  {
    scene: 'claimed',
    says: 'on your own plot the owner\'s panel is yours to act with. write into it — one transaction — and the words are cut into the wall as the drawing becomes a building.',
    async play(d, wait) {
      // the head turns to the plot, ahead and to the right, and lifts a little
      d.look(-0.75, 0.06);
      await wait(1500);
      d.look(0, 0);
      d.mark('.hud.own');
      d.ownSays('yours: 0x3095c19c…d3a0', 'nothing written into it yet\npoints at no code: a drawing until something is written into it');
      await wait(1200);
      await d.typeInto('.own-write input', 'hello, world', wait);
      await wait(600);
      d.press('.own-write button');
      await wait(400);
      d.clearField('.own-write input');
      d.ownSays('writing into it — sign in the wallet', 'nothing written into it yet\npoints at no code: a drawing until something is written into it');
      await wait(1500);
      d.ownSays('sent. waiting for a block', 'nothing written into it yet\npoints at no code: a drawing until something is written into it');
      await wait(1500);
      d.ownSays('written', 'says: hello, world\npoints at no code');
      // the tour's plot is the newest mock standing: written into now
      d.mockWrite(lastMock(), 'hello, world');
      await wait(9000);
    },
  },
  {
    scene: 'written',
    says: 'point the plot at a contract of yours and that code runs at this address — a shop, a game, a gallery live here, and other contracts calling this place find it.',
    async play(d, wait) {
      // the head turns to the plot, ahead and to the right, and lifts a little
      d.look(-0.75, 0.06);
      await wait(1500);
      d.look(0, 0);
      d.mark('.hud.own');
      d.ownSays('written', 'says: hello, world\npoints at no code');
      await wait(900);
      await d.typeInto('.own-code input', '0xC0DE…5EED', wait);
      await wait(500);
      d.press('.own-code button');
      await wait(400);
      d.clearField('.own-code input');
      d.ownSays('pointing it at code — sign in the wallet', 'says: hello, world\npoints at no code');
      await wait(1400);
      d.ownSays('sent. waiting for a block', 'says: hello, world\npoints at no code');
      await wait(1400);
      d.ownSays('pointed at code', 'says: hello, world\npoints at 0xC0DE…5EED');
      await wait(2500);
    },
  },
  {
    scene: 'written',
    says: 'name it under groundstate.eth and people come by name: demo.groundstate.eth resolves to this plot, in any wallet that knows ENS. a name belongs to the place and goes with it.',
    async play(d, wait) {
      // the head turns to the plot, ahead and to the right, and lifts a little
      d.look(-0.75, 0.06);
      await wait(1500);
      d.look(0, 0);
      d.mark('.hud.own');
      d.ownSays('yours: 0x3095c19c…d3a0', 'says: hello, world\npoints at 0xC0DE…5EED');
      await wait(900);
      await d.typeInto('.own-name input', 'demo', wait);
      await wait(500);
      d.press('.own-name button');
      await wait(400);
      d.clearField('.own-name input');
      d.ownSays('naming it demo.groundstate.eth — sign in the wallet', 'says: hello, world\npoints at 0xC0DE…5EED');
      await wait(1400);
      d.ownSays('sent. waiting for a block', 'says: hello, world\npoints at 0xC0DE…5EED');
      await wait(1400);
      d.ownSays('yours: demo.groundstate.eth', 'says: hello, world\npoints at 0xC0DE…5EED');
      await wait(2500);
    },
  },
  {
    scene: 'written',
    says: 'seal the code and it can never change — not by you, not by anyone. whoever deals with this place knows it stays what it is. writing and naming stay possible; there is no unsealing.',
    async play(d, wait) {
      // the head turns to the plot, ahead and to the right, and lifts a little
      d.look(-0.75, 0.06);
      await wait(1500);
      d.look(0, 0);
      d.mark('.hud.own');
      d.ownSays('yours: demo.groundstate.eth', 'says: hello, world\npoints at 0xC0DE…5EED');
      await wait(1200);
      d.press('.own-do .seal');
      await wait(400);
      d.ownSays('sealing the code for good — sign in the wallet', 'says: hello, world\npoints at 0xC0DE…5EED');
      await wait(1400);
      d.ownSays('sent. waiting for a block', 'says: hello, world\npoints at 0xC0DE…5EED');
      await wait(1400);
      d.ownSays('sealed: the code is fixed for good', 'says: hello, world\npoints at 0xC0DE…5EED, sealed');
      await wait(2500);
    },
  },
  {
    says: 'the menu. panels puts away what you do not need, and brings it back.',
    async play(d, wait) {
      d.section('panels');
      await wait(1800);
      // the owner's panel and the claim panel put away, then brought back
      d.togglePanel('owner');
      await wait(1400);
      d.togglePanel('claim');
      await wait(1800);
      d.togglePanel('claim');
      await wait(1000);
      d.togglePanel('owner');
      await wait(1400);
      d.section(null);
      await wait(600);
    },
  },
  {
    says: 'blockchain is which world this is: sepolia to take ground on, ethereum to walk.',
    async play(d, wait) {
      d.section('blockchain');
      await wait(1500);
      d.unfoldWorlds();
      await wait(3000);
      d.section(null);
      await wait(600);
    },
  },
  {
    says: 'map is the whole address space at once — every place there is a link into the world.',
    async play(d, wait) {
      d.section('map');
      await wait(6000);
      d.section(null);
      await wait(1000);
    },
  },
  {
    says: 'the stones turn the page over, the world included.',
    async play(d, wait) {
      d.flipTheme();
      await wait(2600);
      d.flipTheme();
      await wait(1800);
      d.mark(null);
    },
  },
  {
    says: 'that is all of it. everything shown here was for show — nothing was sent, nothing is yours yet. h brings you back to where you first came down. go and stand in it.',
    async play(d, wait) {
      d.look(0.3, 0);
      await wait(5000);
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

  private end(watched = false): void {
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
