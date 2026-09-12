/**
 * The onboarding: the world shown, not explained. For a couple of minutes the
 * page plays itself — looks round, walks, runs and jumps, types a name and
 * goes there, opens every panel and every part of the menu, turns the page
 * over, comes back — with a card at the foot of the screen saying what is
 * happening, and the controls locked. The one thing left to the person is to
 * leave, and to start it again from the menu whenever they like.
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
  /** Go where the field says. */
  go(): Promise<void>;
  /** Open a part of the menu, or close it. */
  section(which: 'map' | 'panels' | 'blockchain' | null): void;
  /** Unfold the worlds in the blockchain bar. */
  unfoldWorlds(): void;
  /** Put a panel away, or bring it back. */
  togglePanel(key: string): void;
  /** Turn the page over. */
  flipTheme(): void;
  /** Ring a thing on the screen, or nothing. */
  mark(selector: string | null): void;
}

type Wait = (ms: number) => Promise<void>;

export interface Step {
  says: string;
  play: (d: Driver, wait: Wait) => Promise<void>;
}

export const STEPS: readonly Step[] = [
  {
    says: 'this is a blockchain as a place. every address is a spot on this ground, and what stands here is what the chain says stands here — nothing is invented.',
    async play(d, wait) {
      d.look(0.55, 0);
      await wait(6500);
      d.look(0, 0.15);
      await wait(1500);
      d.stop();
    },
  },
  {
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
    says: 'here is where you stand: the chain, the depth, the address under your feet, what is near — and the block passing overhead. its transactions are the ribbons in the sky, each from its sender toward its receiver.',
    async play(d, wait) {
      d.mark('.hud.bottom');
      d.look(0, 0.25);
      await wait(2500);
      d.look(0, 0);
      await wait(5000);
      d.stop();
      d.mark(null);
    },
  },
  {
    says: 'an address or a name takes you anywhere. this goes to first.groundstate.eth — the first plot of this ground, named under groundstate.eth.',
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
    says: 'a contract stands as a building, its size from its code, the words written into it cut into its wall. a wallet lies as a plate with a post for each token. a dashed outline is a plot not yet written into; boulders and gates are plots of the earlier grounds.',
    async play(d, wait) {
      d.walk(1, 0, false);
      await wait(2500);
      d.stop();
      d.look(0.3, 0);
      await wait(3000);
      d.look(-0.3, 0);
      await wait(3000);
      d.stop();
    },
  },
  {
    says: 'empty ground is not bought but dug for. dig here searches for a salt whose contract would land at your feet — the longer you dig, the closer it gets — and one transaction makes that place your contract, for good.',
    async play(d, wait) {
      d.mark('.hud.claim');
      await wait(8500);
      d.mark(null);
    },
  },
  {
    says: 'on your own plot you write into it, point it at code of yours, name it under groundstate.eth, and seal the code so it can never change. off your plots, this panel is the way to them.',
    async play(d, wait) {
      d.mark('.hud.own');
      await wait(8500);
      d.mark(null);
    },
  },
  {
    says: 'the menu. panels puts away what you do not need, and brings it back.',
    async play(d, wait) {
      d.mark('.navlinks');
      d.section('panels');
      await wait(1800);
      d.togglePanel('metrics');
      await wait(1500);
      d.togglePanel('metrics');
      await wait(1200);
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
    says: 'that is all of it. h brings you back to where you first came down. go and stand in it.',
    async play(d, wait) {
      d.look(0.3, 0);
      await wait(5000);
      d.stop();
    },
  },
];

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
    // a wait that never comes back once the tour has been left or moved on
    const wait: Wait = (ms) =>
      new Promise((resolve) => {
        setTimeout(() => {
          if (this.run === run) resolve();
        }, ms);
      });
    await step.play(this.driver, wait);
    if (this.run === run) void this.play(index + 1, run);
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
