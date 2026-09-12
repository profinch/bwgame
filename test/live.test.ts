import { describe, expect, it } from 'vitest';
import { peersIn } from '../src/live';

describe('what the live server says', () => {
  it('reads the people out of a peers message, and nothing out of anything else', () => {
    expect(
      peersIn({ t: 'peers', peers: [{ id: 3, x: 1.5, z: -2, yaw: 0.4, dig: true }, { id: 'no' }, { id: 4, x: 0, z: 0 }] }),
    ).toEqual([
      { id: 3, x: 1.5, z: -2, yaw: 0.4, dig: true, human: false },
      { id: 4, x: 0, z: 0, yaw: 0, dig: false, human: false },
    ]);
    expect(peersIn({ t: 'changed', plots: [] })).toBeNull();
    expect(peersIn(null)).toBeNull();
    expect(peersIn('peers')).toBeNull();
  });

  it('reads who stands as a person, and takes nobody for one unless the server said so', () => {
    const [person, stranger] = peersIn({ t: 'peers', peers: [{ id: 1, x: 0, z: 0, human: true }, { id: 2, x: 0, z: 0, human: 'yes' }] })!;
    expect(person!.human).toBe(true);
    // anything but the word itself is a stranger: a truthy string is not a verdict
    expect(stranger!.human).toBe(false);
  });
});
