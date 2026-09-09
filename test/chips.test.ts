import { describe, expect, it } from 'vitest';
import { Chips } from '../src/chips';
import { INSTANCE_FLOATS } from '../src/engine/renderer';

const hole = { x: 3, y: 10, z: -4 };

describe('ground thrown up by the auger', () => {
  it('throws nothing while nothing is dug, or while the threads stand still', () => {
    const chips = new Chips();
    for (let i = 0; i < 60; i++) chips.step(1 / 60, null, 5e6, 21);
    expect(chips.flying).toBe(0);
    for (let i = 0; i < 60; i++) chips.step(1 / 60, hole, 0, 21);
    expect(chips.flying).toBe(0);
  });

  it('throws more the faster the work goes, and every chip comes back down and goes', () => {
    const slow = new Chips();
    const fast = new Chips();
    for (let i = 0; i < 30; i++) {
      slow.step(1 / 60, hole, 1e6, 21);
      fast.step(1 / 60, hole, 4e7, 21);
    }
    expect(fast.flying).toBeGreaterThan(slow.flying);
    expect(fast.flying).toBeGreaterThan(0);
    // stop digging: within a few seconds everything has landed
    for (let i = 0; i < 300; i++) fast.step(1 / 60, null, 0, 21);
    expect(fast.flying).toBe(0);
  });

  it('starts every chip at the rim of the hole, above the ground it will land on', () => {
    const chips = new Chips();
    chips.step(1 / 8, hole, 4e7, 21);
    expect(chips.flying).toBeGreaterThan(0);
    for (let i = 0; i < chips.flying; i++) {
      const at = i * INSTANCE_FLOATS;
      const [x, y, z, size] = [chips.instances[at]!, chips.instances[at + 1]!, chips.instances[at + 2]!, chips.instances[at + 3]!];
      expect(Math.hypot(x - hole.x, z - hole.z)).toBeLessThan(0.6);
      expect(y).toBeGreaterThan(hole.y);
      expect(size).toBeGreaterThan(0);
    }
    // and the slots past the last chip are empty, so nothing stray is drawn
    const after = chips.flying * INSTANCE_FLOATS;
    expect(chips.instances.slice(after).every((v) => v === 0)).toBe(true);
  });
});
