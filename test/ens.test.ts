import { describe, expect, it } from 'vitest';
import { dnsEncode, namehash } from '../src/ens';

describe('names on the wire', () => {
  it('encodes a name the way DNS does: lengths, labels, a zero', () => {
    expect(dnsEncode('well.groundstate.eth')).toBe('0x0477656c6c0b67726f756e64737461746503657468' + '00');
    expect(dnsEncode('eth')).toBe('0x0365746800');
  });

  it('hashes a name as the registry does', () => {
    expect(namehash('eth')).toBe('0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae');
  });
});
