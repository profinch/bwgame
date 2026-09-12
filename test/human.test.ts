import { describe, expect, it } from 'vitest';
import { whySaid } from '../src/human';

describe('standing here as a person', () => {
  it('says why a check did not go through, in the panel\'s words, and names a code it does not know', () => {
    expect(whySaid('user_rejected')).toMatch(/declined/);
    expect(whySaid('timeout')).toMatch(/in time/);
    expect(whySaid('credential_unavailable')).toMatch(/selfie check/);
    expect(whySaid('something_else')).toContain('something_else');
  });
});
