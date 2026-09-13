import { describe, expect, it } from 'vitest';
import { hexOf, whySaid } from '../src/human';

describe('standing here as a person', () => {
  it('says why a check did not go through, in the panel\'s words, and names a code it does not know', () => {
    expect(whySaid('user_rejected')).toMatch(/declined/);
    expect(whySaid('timeout')).toMatch(/in time/);
    expect(whySaid('credential_unavailable')).toMatch(/selfie check/);
    expect(whySaid('something_else')).toContain('something_else');
  });

  it("turns the panel's colour into the six hex digits the QR drawer wants", () => {
    expect(hexOf('rgb(42, 42, 40)')).toBe('#2a2a28');
    expect(hexOf('rgba(241, 239, 233, 0.9)')).toBe('#f1efe9');
    expect(hexOf('#0a0a0a')).toBe('#0a0a0a');
    expect(hexOf('currentcolor')).toBe('#2a2a28');
  });
});
