/**
 * Which panels are on the screen: "view" in the menu, and under it, in the
 * sub-bar of bwtoken.io, a row a panel — bright when it is shown, dim when it
 * is not. The choice is kept in this browser.
 *
 * A panel put away is hidden by a class on the body. The other players and the
 * block overhead are not panels and are never put away: they are the world.
 */
export const PANELS: readonly { key: string; at: string; cross?: false; shown?: false }[] = [
  // where you stand, what is near, the block overhead: no box, so no cross — the row in the filter puts it away
  { key: 'metrics', at: '.hud.bottom', cross: false },
  // an address or a name, and you are there
  { key: 'jump', at: '.hud.jump' },
  // digging where you stand, and the one transaction that makes it yours
  { key: 'claim', at: '.hud.claim' },
  // your own plot, when you stand on it: write, point at code, name, seal
  { key: 'owner', at: '.hud.own' },
  // standing here as a person: the selfie check, and what it earns — put away until asked for
  { key: 'person', at: '.hud.person', shown: false },
];

/** The choice, a panel at a time: `{ "claim": false }` says the claim panel is put away. */
const KEPT_AS = 'gs-panels';
/** The choice as it was kept before 13.09.2026: the list of panels put away. Read once, then kept the new way. */
const KEPT_AS_BEFORE = 'gs-panels-off';

export class Panels {
  private readonly off = new Set<string>();

  constructor(private readonly list: HTMLElement) {
    // a panel not chosen either way stands as its default; one chosen, as chosen
    for (const panel of PANELS) if (panel.shown === false) this.off.add(panel.key);
    try {
      const kept = JSON.parse(localStorage.getItem(KEPT_AS) ?? 'null') as unknown;
      if (kept && typeof kept === 'object') {
        for (const [key, shown] of Object.entries(kept as Record<string, unknown>)) {
          if (typeof shown !== 'boolean') continue;
          if (shown) this.off.delete(key);
          else this.off.add(key);
        }
      } else {
        const before = JSON.parse(localStorage.getItem(KEPT_AS_BEFORE) ?? '[]') as unknown;
        if (Array.isArray(before)) for (const key of before) if (typeof key === 'string') this.off.add(key);
      }
    } catch {
      // then every panel stands as its default
    }
    const rows: HTMLElement[] = [];
    for (const panel of PANELS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'wopt';
      row.textContent = panel.key;
      row.addEventListener('click', () => this.toggle(panel.key));
      rows.push(row);
    }
    list.replaceChildren(...rows);
    // a cross in the corner of every panel: the same putting away as the row
    // in the filter, through the same one place, so the two never disagree
    for (const panel of PANELS) {
      const at = panel.cross === false ? null : document.querySelector<HTMLElement>(panel.at);
      if (!at) continue;
      at.classList.add('closable');
      const cross = document.createElement('button');
      cross.type = 'button';
      cross.className = 'panel-x';
      cross.setAttribute('aria-label', `put the ${panel.key} panel away`);
      cross.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!this.off.has(panel.key)) this.toggle(panel.key);
      });
      at.append(cross);
    }
    this.apply();
  }

  /** How many rows the list has, for whoever sizes the bar. */
  get count(): number {
    return PANELS.length;
  }

  shown(key: string): boolean {
    return !this.off.has(key);
  }

  /** Every panel on the screen for the while — the onboarding shows them all — the choice kept. */
  suspend(): void {
    for (const panel of PANELS) document.body.classList.remove(`off-${panel.key}`);
  }

  /** The choice back on the screen. */
  restore(): void {
    this.apply();
  }

  private toggle(key: string): void {
    if (this.off.has(key)) this.off.delete(key);
    else this.off.add(key);
    this.apply();
    try {
      const choice: Record<string, boolean> = {};
      for (const panel of PANELS) choice[panel.key] = !this.off.has(panel.key);
      localStorage.setItem(KEPT_AS, JSON.stringify(choice));
      localStorage.removeItem(KEPT_AS_BEFORE);
    } catch {
      // then it is forgotten with the page
    }
  }

  private apply(): void {
    const rows = this.list.children;
    PANELS.forEach((panel, i) => {
      rows[i]?.classList.toggle('on', !this.off.has(panel.key));
      document.body.classList.toggle(`off-${panel.key}`, this.off.has(panel.key));
    });
  }
}
