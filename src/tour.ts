/**
 * The onboarding: a walk through the world in nine short steps, one card at
 * a time at the foot of the screen, the thing each step is about marked.
 *
 * A step about doing something — looking, walking, going somewhere — moves on
 * by itself the moment it is done; the rest wait for "next". It can be left at
 * any step and started again from the menu. Whether it has been walked once is
 * kept in this browser, so the welcome offers it the first time only.
 */
export interface Step {
  /** What to say. */
  says: string;
  /** A selector for what the step is about, marked while the step is up. */
  marks?: string;
  /** The deed that moves the step on by itself, if any. */
  until?: 'looked' | 'walked' | 'travelled';
}

export const STEPS: readonly Step[] = [
  {
    says: 'drag to look around. this is a blockchain as a place: every address is a spot on this ground, and what stands here is what the chain says stands here.',
    until: 'looked',
  },
  {
    says: 'walk with w a s d — shift to run, space to jump. on a phone, the stick. h brings you back to where you first came down.',
    until: 'walked',
  },
  {
    says: 'here is where you stand: the chain, the depth, the address under your feet, what is near, and the block passing overhead — its transactions are the ribbons in the sky, each from its sender toward its receiver.',
    marks: '.hud.bottom',
  },
  {
    says: 'an address or a name takes you there. try first.groundstate.eth — the first plot of this ground, with words cut into its wall.',
    marks: '.hud.jump',
    until: 'travelled',
  },
  {
    says: 'a contract stands as a building, its size from its code. a wallet lies as a plate with a post for each token it holds. a dashed outline is a plot claimed but not yet written into. relics — boulders, gates — are plots of the earlier grounds.',
  },
  {
    says: 'empty ground is not bought but dug for. dig here searches for a salt whose contract would land at your feet; the longer you dig, the closer it gets. one transaction then makes that place your contract, for good.',
    marks: '.hud.claim',
  },
  {
    says: 'on your own plot you can write into it — the words are cut into the wall — point it at code of yours, name it under groundstate.eth, and seal the code so it can never change. off your plots, this panel is the way to them.',
    marks: '.hud.own',
  },
  {
    says: 'the menu: map is the whole address space, panels puts away what you do not need, blockchain is which world this is. the stones turn the page over.',
    marks: '.navlinks',
  },
  {
    says: 'that is all of it. nothing here is invented: the world is what the chain says. go and stand in it.',
  },
];

const WALKED_AS = 'gs-tour-walked';

export class Tour {
  private at = -1;
  private marked: HTMLElement | null = null;

  constructor(
    private readonly card: HTMLElement,
    private readonly onEnd: () => void,
  ) {
    card.querySelector<HTMLButtonElement>('.tour-next')!.addEventListener('click', () => this.step(this.at + 1));
    card.querySelector<HTMLButtonElement>('.tour-skip')!.addEventListener('click', () => this.end());
  }

  /** Whether it has been walked through to the end once, in this browser. */
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
    this.step(0);
  }

  /** Something was done; the step waiting for it moves on. */
  saw(deed: Step['until']): void {
    if (!this.running || STEPS[this.at]?.until !== deed) return;
    this.step(this.at + 1);
  }

  private step(to: number): void {
    if (to >= STEPS.length) return this.end(true);
    this.at = to;
    const step = STEPS[to]!;
    this.card.hidden = false;
    this.card.querySelector<HTMLElement>('.tour-count')!.textContent = `${to + 1} / ${STEPS.length}`;
    this.card.querySelector<HTMLElement>('.tour-says')!.textContent = step.says;
    this.card.querySelector<HTMLButtonElement>('.tour-next')!.textContent = to === STEPS.length - 1 ? 'done' : 'next';
    this.mark(step.marks ? document.querySelector<HTMLElement>(step.marks) : null);
  }

  private mark(el: HTMLElement | null): void {
    this.marked?.classList.remove('tour-marked');
    this.marked = el;
    el?.classList.add('tour-marked');
  }

  private end(walked = false): void {
    this.at = -1;
    this.card.hidden = true;
    this.mark(null);
    if (walked) {
      try {
        localStorage.setItem(WALKED_AS, 'yes');
      } catch {
        // then it is offered again
      }
    }
    this.onEnd();
  }
}
