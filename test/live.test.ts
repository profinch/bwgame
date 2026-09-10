import { describe, expect, it } from 'vitest';
import { peersIn } from '../src/live';

describe('what the live server says', () => {
  it('reads the people out of a peers message, and nothing out of anything else', () => {
    expect(
      peersIn({ t: 'peers', peers: [{ id: 3, x: 1.5, z: -2, yaw: 0.4, dig: true }, { id: 'no' }, { id: 4, x: 0, z: 0 }] }),
    ).toEqual([
      { id: 3, x: 1.5, z: -2, yaw: 0.4, dig: true },
      { id: 4, x: 0, z: 0, yaw: 0, dig: false },
    ]);
    expect(peersIn({ t: 'changed', plots: [] })).toBeNull();
    expect(peersIn(null)).toBeNull();
    expect(peersIn('peers')).toBeNull();
  });
});
