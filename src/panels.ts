/**
 * Which panels are on the screen: a filter under the left end of the header,
 * in the sub-bar of bwtoken.io. Closed it says "panels"; the arrow unfolds a
 * row a panel, bright when it is shown, dim when it is not. The choice is kept
 * in this browser.
 *
 * A panel put away is hidden by a class on the body. The other players and the
 * block overhead are not panels and are never put away: they are the world.
 */
export const PANELS: readonly { key: string }[] = [
  // where you stand, what is near, the block overhead, the field to go by
  { key: 'readings' },
  // digging where you stand, and the one transaction that makes it yours
  { key: 'claim' },
  // your own plot, when you stand on it: write, point at code, name, seal
  { key: 'owner' },
];

const KEPT_AS = 'gs-panels-off';

export class Panels {
  private readonly off = new Set<string>();

  constructor(private readonly list: HTMLElement) {
    try {
      const kept = JSON.parse(localStorage.getItem(KEPT_AS) ?? '[]') as unknown;
      if (Array.isArray(kept)) for (const key of kept) if (typeof key === 'string') this.off.add(key);
    } catch {
      // then everything is shown
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
    this.apply();
  }

  /** How many rows the list has, for whoever sizes the bar. */
  get count(): number {
    return PANELS.length;
  }

  shown(key: string): boolean {
    return !this.off.has(key);
  }

  private toggle(key: string): void {
    if (this.off.has(key)) this.off.delete(key);
    else this.off.add(key);
    this.apply();
    try {
      localStorage.setItem(KEPT_AS, JSON.stringify([...this.off]));
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
